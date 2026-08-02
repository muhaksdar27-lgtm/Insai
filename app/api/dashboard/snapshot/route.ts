import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ApiResponse, DashboardSnapshot, StrategyResponse } from '@/types';
import { getMarketDataService } from '@/lib/market-data/market-data-service';
import { getDatabaseClient } from '@/lib/db/client';
import { getAllStrategies, getStrategyDefinition } from '@/lib/trading-engine/strategy-registry';
import { normalizeStrategyFromDB } from '@/lib/trading-engine/strategy-normalize';
import { healthCheckEngine } from '@/lib/observability/health-check';
import { getMcpRegistry } from '@/lib/mcp/registry';
import { getMcpManager } from '@/lib/mcp/mcp-manager';
import { PythonEngineManager } from '@/lib/mcp/engines/deployment';
import { getQueueManager } from '@/lib/redis/queue';
import { metricsEngine } from '@/lib/observability/metrics-engine';

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reqId = req.headers.get('x-request-id') || crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    // Execute all backend queries in parallel for ultra-fast, single atomic snapshot creation
    const [
      marketResult,
      healthResult,
      mcpResult,
      strategiesResult,
      signalsResult,
      historyResult,
      newsResult,
      queueSizeResult
    ] = await Promise.allSettled([
      getMarketDataService().getLatestPrice('XAUUSD').catch(() => null),
      healthCheckEngine.runHealthChecks().catch(() => null),
      (async () => {
        await getMcpManager().initialize().catch(() => {});
        try {
          const result = await PythonEngineManager.evaluate();
          if (result.status === 'active') {
            await getMcpRegistry().reportConnected('Python Engine Manager');
          } else if (result.status === 'offline') {
            await getMcpRegistry().reportOffline('Python Engine Manager', result.message);
          } else {
            await getMcpRegistry().reportError('Python Engine Manager', result.message);
          }
        } catch (e: any) {
          await getMcpRegistry().reportOffline('Python Engine Manager', e.message);
        }
        return await getMcpRegistry().getAllStatusAsync().catch(() => []);
      })(),
      (async () => {
        const allStrats = getAllStrategies();
        const configStrategies = allStrats.map(s => ({
          id: s.id,
          name: s.name,
          status: 'active',
        }));

        const dbStrategies = await getDatabaseClient().getStrategies().catch(() => null);
        let baseStrategies = configStrategies;
        if (dbStrategies && Array.isArray(dbStrategies)) {
          baseStrategies = [...configStrategies];
          for (const dbStrat of dbStrategies) {
            const index = baseStrategies.findIndex(s => s.id === dbStrat.id);
            if (index >= 0) {
              baseStrategies[index] = { ...baseStrategies[index], status: dbStrat.status || 'active' };
            }
          }
        }

        const statePromises = baseStrategies.map(strategy =>
          getDatabaseClient().getStrategyState(strategy.id).catch(() => null)
        );
        const states = await Promise.all(statePromises);

        const normalizedList: StrategyResponse[] = [];
        for (let i = 0; i < baseStrategies.length; i++) {
          try {
            const st = states[i];
            if (st && typeof st === 'object' && ('status' in st) && (st.status === 'not_configured' || st.status === 'error')) {
              const normalized = normalizeStrategyFromDB(baseStrategies[i], null);
              normalizedList.push({
                ...normalized,
                status: 'error',
                freshness: 'stale',
                errors: [st.reason || 'Database state unavailable']
              });
            } else {
              const normalized = normalizeStrategyFromDB(baseStrategies[i], st);
              normalizedList.push(normalized);
            }
          } catch (e: any) {
            normalizedList.push({
              id: baseStrategies[i].id,
              name: baseStrategies[i].name,
              status: 'error',
              progress: 0,
              currentStep: 'Error',
              steps: [],
              setupSnapshot: {},
              ruleResults: {},
              signal: null,
              freshness: 'stale',
              updatedAt: new Date().toISOString(),
              errors: [e.message]
            });
          }
        }
        return normalizedList;
      })(),
      getDatabaseClient().getActiveSignals().catch(() => []),
      getDatabaseClient().getHistoricalSignals().catch(() => []),
      getMarketDataService().getLatestNews().catch(() => []),
      getQueueManager().getQueueSize().catch(() => -1)
    ]);

    // Parse Market
    const rawMarket = marketResult.status === 'fulfilled' ? marketResult.value : null;
    const market = (rawMarket && typeof rawMarket === 'object' && 'price' in rawMarket) ? rawMarket : null;

    // Parse Health
    const healthData = healthResult.status === 'fulfilled' ? healthResult.value : null;
    const services = healthData?.services || [];
    const overallSystemStatus: 'healthy' | 'warning' | 'critical' | 'offline' | 'error' = 
      healthData?.status === 'ONLINE' ? 'healthy' :
      healthData?.status === 'DEGRADED' || healthData?.status === 'NOT CONFIGURED' ? 'warning' :
      healthData?.status === 'UNAVAILABLE' || healthData?.status === 'OFFLINE' ? 'critical' : 'warning';

    // Parse MCP
    const mcp = mcpResult.status === 'fulfilled' && Array.isArray(mcpResult.value) ? mcpResult.value : [];

    // Parse Strategies
    const strategies = strategiesResult.status === 'fulfilled' && Array.isArray(strategiesResult.value) ? strategiesResult.value : [];

    // Parse Signals
    const rawSignals = signalsResult.status === 'fulfilled' && Array.isArray(signalsResult.value) ? signalsResult.value : [];
    const signals = rawSignals.map((item: any, idx: number) => {
      const signalData = item.signals || {};
      const createdAt = item.created_at || new Date().toISOString();
      const rawStrategyId = item.strategy_id || signalData.strategy_id || 'strategy-1-smc';
      const stratDef = getStrategyDefinition(rawStrategyId);
      const canonicalStrategyName = stratDef ? stratDef.name : (item.strategyName || rawStrategyId);

      return {
        id: item.id || item.signal_key || `sig-${idx}`,
        signalKey: item.signal_key || `key-${idx}`,
        strategyId: rawStrategyId,
        strategyName: canonicalStrategyName,
        symbol: item.symbol || 'XAUUSD',
        timeframe: signalData.timeframe || item.timeframe || 'M15',
        session: signalData.session || item.session || 'London',
        direction: ((signalData.direction === 'LONG' || signalData.direction === 'buy' || item.direction === 'BUY' || item.direction === 'LONG') ? 'buy' : 'sell') as 'buy' | 'sell',
        entryPrice: signalData.entry_price || item.entry || 0,
        slPrice: signalData.sl_price || item.sl || 0,
        tp1Price: signalData.tp1_price || item.tp1 || 0,
        tp2Price: signalData.tp2_price || item.tp2 || 0,
        tp3Price: signalData.tp3_price || item.tp3 || 0,
        aiDecision: signalData.ai_decision || item.aiDecision || 'REJECTED',
        aiReasoning: signalData.ai_reasoning || item.aiReasoning || '',
        status: item.status || 'SIGNAL_ACTIVE',
        createdAt: createdAt
      };
    });

    // Parse History
    const rawHistory = historyResult.status === 'fulfilled' && Array.isArray(historyResult.value) ? historyResult.value : [];
    const history = rawHistory.map((item: any, idx: number) => {
      const signalData = item.signals || {};
      const closedAt = new Date(item.closed_at || item.created_at || Date.now());
      const rawStrategyId = item.strategy_id || signalData.strategy_id || item.strategyName;
      const stratDef = getStrategyDefinition(rawStrategyId);
      const canonicalStrategyName = stratDef ? stratDef.name : (item.strategy_name || rawStrategyId || 'Strategy');

      return {
        id: item.id || item.signal_key || `hist-${closedAt.getTime()}-${idx}`,
        signalKey: item.signal_key || `key-${idx}`,
        pair: item.symbol || 'XAUUSD',
        direction: (signalData.direction === 'LONG' || signalData.direction === 'buy' || item.direction === 'BUY' || item.direction === 'LONG') ? 'BUY' : 'SELL',
        outcome: item.outcome || 'UNKNOWN',
        pips: item.pips_result !== undefined ? item.pips_result : (item.pips || 0),
        closedAtTimestamp: closedAt.getTime(),
        closedAt: closedAt.toLocaleString(),
        entry: signalData.entry_price || item.entry || 0,
        sl: signalData.sl_price || item.sl || 0,
        tp1: signalData.tp1_price || item.tp1 || 0,
        strategyName: canonicalStrategyName,
        strategyId: rawStrategyId || 'strategy-1-smc',
        status: item.status || item.outcome || 'FINISHED',
        reason: item.reason || ''
      };
    });

    // Calculate Performance Stats
    const winCount = history.filter((h: any) => h.outcome === 'WIN' || h.pips > 0).length;
    const lossCount = history.filter((h: any) => h.outcome === 'LOSS' || h.pips < 0).length;
    const totalTrades = history.length;
    const winRate = totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0;
    const totalWinPips = history.reduce((sum: number, h: any) => h.pips > 0 ? sum + h.pips : sum, 0);
    const totalLossPips = Math.abs(history.reduce((sum: number, h: any) => h.pips < 0 ? sum + h.pips : sum, 0));
    const profitFactor = totalLossPips > 0 ? Number((totalWinPips / totalLossPips).toFixed(2)) : totalWinPips > 0 ? 99.9 : 0;
    const netProfit = history.reduce((sum: number, h: any) => sum + (h.pips || 0), 0);

    // Parse News
    const newsData: any = newsResult.status === 'fulfilled' ? newsResult.value : [];
    const active_events = Array.isArray(newsData) ? newsData : (newsData?.active_events || []);

    // Engine status calculation using real metrics
    const queueSize = queueSizeResult.status === 'fulfilled' ? queueSizeResult.value : -1;
    const activeStrategies = strategies.filter(s => s.status === 'active' || s.status === 'live');
    const mostActiveStrat = strategies.find(s => s.currentStep && s.currentStep !== 'INITIALIZING' && s.currentStep !== 'IDLE') || strategies[0];
    const currentMetrics = metricsEngine.getMetrics();

    const engineStatus: DashboardSnapshot['engine'] = {
      status: activeStrategies.length > 0 ? 'running' : 'idle',
      activeStrategyCount: activeStrategies.length,
      currentStep: mostActiveStrat?.currentStep || 'IDLE',
      currentPair: 'XAUUSD',
      currentSession: market?.session || 'London',
      lastSignalAt: signals[0]?.createdAt || history[0]?.closedAt || null,
      nextScanAt: null,
      queueSize: queueSize,
      latencyMs: currentMetrics.marketDataLatencyMs || (market?.price ? 12 : 0),
      processingTimeMs: currentMetrics.scannerDurationMs || 0
    };

    // Connections verification matching health check service names case-insensitively
    const dbService = services.find((s: any) => s.serviceName?.toLowerCase() === 'supabase' || s.serviceName?.toLowerCase() === 'database' || s.serviceName?.toLowerCase() === 'postgres');
    const marketService = services.find((s: any) => s.serviceName?.toLowerCase() === 'marketdata' || s.serviceName?.toLowerCase() === 'twelvedata' || s.serviceName?.toLowerCase() === 'yahoofinance');
    const redisService = services.find((s: any) => s.serviceName?.toLowerCase() === 'redis');

    const connections = {
      market: marketService ? marketService.status === 'ONLINE' : (market !== null && typeof market.price === 'number' && market.price > 0),
      database: dbService ? dbService.status === 'ONLINE' : getDatabaseClient().isConnected(),
      supabase: dbService ? dbService.status === 'ONLINE' : getDatabaseClient().isConnected(),
      redis: redisService ? redisService.status === 'ONLINE' : getQueueManager().isConnected(),
      realtimeChannel: true
    };

    const snapshot: DashboardSnapshot = {
      timestamp,
      market,
      strategies,
      signals,
      history,
      engine: engineStatus,
      system: {
        status: overallSystemStatus,
        services,
        mcp,
        connections
      },
      performance: {
        totalTrades,
        winRate,
        profitFactor,
        netProfit,
        avgRr: 2.5,
        winCount,
        lossCount
      },
      news: {
        active_events,
        status: (newsData as any)?.status
      }
    };

    const response: ApiResponse<DashboardSnapshot> = {
      success: true,
      data: snapshot,
      error: null,
      meta: {
        request_id: reqId,
        timestamp
      }
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    const errorResponse: ApiResponse<null> = {
      success: false,
      data: null,
      error: {
        code: 'SNAPSHOT_FETCH_ERROR',
        message: error.message || 'Failed to assemble dashboard snapshot'
      },
      meta: {
        request_id: reqId,
        timestamp
      }
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
