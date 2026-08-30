import { Candle } from '@/types';
import { 
  StrategyMarketContext, 
  TimeframeContext, 
  TimeframeId,
  CANONICAL_STRATEGY_TIMEFRAME_MAP,
  StrategyTimeframeRequirement
} from '@/types/strategy-market-context';
import { getMarketDataService } from '../market-data/market-data-service';
import { SessionEngine } from '../market-data/session-engine';
import { toCanonicalSymbol } from '../market-data/canonical-symbol';
import { LocalTAAnalyzer } from './local-ta-analyzer';

export interface StrategyIsolatedContext {
  strategyId: string;
  marketContext: StrategyMarketContext;
  strategyAnalysis: Record<string, any>;
  primaryCandles: Candle[];
  primaryTimeframe: TimeframeId;
  timeframeRequirements: StrategyTimeframeRequirement;
  hasAllRequiredTimeframes: boolean;
  missingTimeframes: TimeframeId[];
}

export class StrategyContextBuilder {
  /**
   * Builds the comprehensive, explicit StrategyMarketContext for a symbol.
   * Fetches required multi-timeframe candles (D1, H4, H1, M15, M5, M1) with complete provenance.
   */
  public static async buildGlobalMarketContext(
    symbol: string = 'XAUUSD',
    freshnessWindowMs: number = 60000
  ): Promise<StrategyMarketContext> {
    const canonical = toCanonicalSymbol(symbol);
    const mds = getMarketDataService();
    const now = Date.now();
    const currentTimestamp = new Date(now).toISOString();

    // 1. Fetch live price snapshot, news, and calendar
    const [priceSnapshot, newsEvents, calendarEvents] = await Promise.all([
      mds.getLatestPrice(canonical, freshnessWindowMs),
      mds.getLatestNews().catch(() => []),
      mds.getCalendarEvents().catch(() => [])
    ]);

    const currentPrice = priceSnapshot?.price || 0;
    const provider = priceSnapshot?.provider || 'Unknown';
    const dataFreshness = priceSnapshot?.freshness || 'live';

    // 2. Fetch all required canonical timeframes in parallel
    const [d1Candles, h4Candles, h1Candles, m15Candles, m5Candles, m1Candles] = await Promise.all([
      mds.getCandles(canonical, 'D1', 100).catch(() => []),
      mds.getCandles(canonical, 'H4', 100).catch(() => []),
      mds.getCandles(canonical, 'H1', 150).catch(() => []),
      mds.getCandles(canonical, 'M15', 200).catch(() => []),
      mds.getCandles(canonical, 'M5', 200).catch(() => []),
      mds.getCandles(canonical, 'M1', 200).catch(() => [])
    ]);

    const buildTfContext = (tf: TimeframeId, rawCandles: Candle[], minRequired: number): TimeframeContext | undefined => {
      if (!rawCandles || !Array.isArray(rawCandles) || rawCandles.length === 0) {
        return undefined;
      }
      const lastCandle = rawCandles[rawCandles.length - 1];
      const candleTime = new Date(lastCandle.timestamp).getTime();
      const ageMs = Math.max(0, now - candleTime);

      let freshness: 'live' | 'cached' | 'stale' | 'closed' = 'live';
      if (lastCandle.freshness) {
        freshness = lastCandle.freshness as any;
      } else if (ageMs > 4 * 60 * 60 * 1000) {
        freshness = 'stale';
      }

      return {
        timeframe: tf,
        candles: rawCandles,
        timestamp: lastCandle.timestamp,
        ohlc: {
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume ?? 0
        },
        freshness,
        sourceProvider: lastCandle.provider || provider,
        completeness: rawCandles.length >= minRequired,
        candleCount: rawCandles.length,
        ageMs
      };
    };

    const D1 = buildTfContext('D1', d1Candles, 20);
    const H4 = buildTfContext('H4', h4Candles, 20);
    const H1 = buildTfContext('H1', h1Candles, 30);
    const M15 = buildTfContext('M15', m15Candles, 30);
    const M5 = buildTfContext('M5', m5Candles, 30);
    const M1 = buildTfContext('M1', m1Candles, 30);

    const sessionInfo = SessionEngine.getSessionInfo(now);

    // News impact analysis
    const hasHighImpactNewsActive = (newsEvents || []).some(n => n.impact === 'high');

    // Spread information
    const spreadPips = 1.2; // default estimated spread pips for spot gold
    const isSpreadAcceptable = spreadPips <= 2.5;

    return {
      symbol: canonical,
      currentPrice,
      currentTimestamp,
      session: sessionInfo.primarySession,
      D1,
      H4,
      H1,
      M15,
      M5,
      M1,
      spread: {
        spreadPips,
        isAcceptable: isSpreadAcceptable,
        timestamp: currentTimestamp
      },
      news: {
        activeEvents: newsEvents || [],
        calendarEvents: calendarEvents || [],
        hasHighImpactNewsActive,
        minutesToNextHighImpact: null
      },
      provider,
      dataFreshness,
      correlations: {
        cotData: { status: 'not_configured', available: false }
      }
    };
  }

  /**
   * Builds the isolated context tailored strictly for a specific canonical strategy.
   * Enforces timeframe access boundaries per canonical specification.
   */
  public static buildStrategyIsolatedContext(
    strategyId: string,
    globalContext: StrategyMarketContext
  ): StrategyIsolatedContext {
    const requirements = CANONICAL_STRATEGY_TIMEFRAME_MAP[strategyId] || {
      bias: ['H1'],
      context: ['M15'],
      setup: ['M15'],
      trigger: ['M15'],
      execution: ['M15']
    };

    // Determine all required unique timeframes for this strategy
    const allRequired = Array.from(new Set([
      ...requirements.bias,
      ...(requirements.context || []),
      ...requirements.setup,
      ...requirements.trigger,
      ...requirements.execution
    ]));

    const missingTimeframes: TimeframeId[] = [];
    for (const tf of allRequired) {
      const tfData = globalContext[tf];
      if (!tfData || !tfData.candles || tfData.candles.length === 0 || !tfData.completeness) {
        missingTimeframes.push(tf);
      }
    }

    const hasAllRequiredTimeframes = missingTimeframes.length === 0;

    // Filter global context so strategy only sees authorized timeframes
    const filteredContext: StrategyMarketContext = {
      symbol: globalContext.symbol,
      currentPrice: globalContext.currentPrice,
      currentTimestamp: globalContext.currentTimestamp,
      session: globalContext.session,
      spread: globalContext.spread,
      news: globalContext.news,
      provider: globalContext.provider,
      dataFreshness: globalContext.dataFreshness,
      correlationId: globalContext.correlationId,
      correlations: globalContext.correlations
    };

    if (allRequired.includes('D1')) filteredContext.D1 = globalContext.D1;
    if (allRequired.includes('H4')) filteredContext.H4 = globalContext.H4;
    if (allRequired.includes('H1')) filteredContext.H1 = globalContext.H1;
    if (allRequired.includes('M15')) filteredContext.M15 = globalContext.M15;
    if (allRequired.includes('M5')) filteredContext.M5 = globalContext.M5;
    if (allRequired.includes('M1')) filteredContext.M1 = globalContext.M1;

    // Determine primary execution timeframe & candles
    let primaryTimeframe: TimeframeId = requirements.execution[0] || 'M15';
    let primaryCandles: Candle[] = filteredContext[primaryTimeframe]?.candles || [];

    // If primary candles missing, attempt setup timeframe candles, otherwise empty
    if (!primaryCandles || primaryCandles.length === 0) {
      const fallbackTf = requirements.setup[0] || requirements.context?.[0] || 'M15';
      primaryCandles = filteredContext[fallbackTf]?.candles || [];
      primaryTimeframe = fallbackTf;
    }

    // Perform isolated TA analysis strictly on authorized timeframes
    const strategyAnalysis = LocalTAAnalyzer.analyzeStrategyIsolated(strategyId, filteredContext);

    return {
      strategyId,
      marketContext: filteredContext,
      strategyAnalysis,
      primaryCandles,
      primaryTimeframe,
      timeframeRequirements: requirements,
      hasAllRequiredTimeframes,
      missingTimeframes
    };
  }
}
