import { LocalTAAnalyzer } from './local-ta-analyzer';
import { getDatabaseClient } from "../db/client";
import { getEnv } from "../utils/env";
import { RuleEvaluationContext } from '@/types';
import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';
import { SetupDetector } from './setup-detector';
import { logger } from '../utils/logger';
import { PyWSClient } from './py-ws-client';
import { PythonEngineManager } from '../mcp/engines/deployment';
import { MarketStateEngine } from './market-state-engine';
import { StateMachine } from './state-machine';
import { getMarketDataService } from '../market-data/market-data-service';
import { MarketCalendar } from '../market-data/market-calendar';
import { StrategySetup } from './types';
import { signalPipeline } from './signal-pipeline';
import crypto from 'crypto';

export class TradingEngine {
  private setupDetector: SetupDetector;
  private marketStateEngine: MarketStateEngine;
  private aiOrchestrator: AIValidationOrchestrator;

  private lastProcessedState: Record<string, { timestamp: string, price: number }> = {};
  private lastSyncedState: Record<string, { stateName: string, status: string, reason: string }> = {};

  constructor() {
    this.setupDetector = new SetupDetector();
    this.marketStateEngine = new MarketStateEngine();
    this.aiOrchestrator = new AIValidationOrchestrator();
  }

  public getSetupDetector(): SetupDetector {
    return this.setupDetector;
  }

  public getAIOrchestrator(): AIValidationOrchestrator {
    return this.aiOrchestrator;
  }

  public async init() {
    logger.info('Initializing Trading Engine with Continuous Setup Lifecycle, Step Evaluator & Signal Builder...');
    try {
      const db = getDatabaseClient();
      const strats = await db.getStrategies();
      const storedSetupsToRestore: StrategySetup[] = [];
      
      for (const s of strats) {
        if (!s.enabled) continue;
        
        const state = await db.getStrategyState(s.id);
        if (!state || !state.state_name) continue;

        const stateAge = Date.now() - new Date(state.created_at).getTime();
        const fourHours = 4 * 60 * 60 * 1000;
        
        const terminalStates = ['REJECTED', 'INVALIDATED', 'EXPIRED', 'COMPLETED', 'ERROR'];
        
        if (stateAge < fourHours && !terminalStates.includes(state.state_name)) {
          if (state.payload_json?.setupObject) {
            storedSetupsToRestore.push(state.payload_json.setupObject);
          } else {
            const ts = state.created_at;
            const symbol = state.symbol || 'XAUUSD';
            const timeframe = state.timeframe || 'M15';
            
            const setup = this.setupDetector.startScanning(s.id, symbol, timeframe, ts);
            if (state.payload_json) {
              const { direction, entryPrice, slPrice, tpPrice, marketStates } = state.payload_json;
              this.setupDetector.updateSetupDetails(setup.id, { 
                direction, 
                entry_price: entryPrice, 
                sl_price: slPrice, 
                tp1_price: tpPrice,
                market_states: marketStates 
              });
            }
          }
        }
      }

      if (storedSetupsToRestore.length > 0) {
        this.setupDetector.restoreFromStorage(storedSetupsToRestore);
      }
    } catch(err: any) {
      logger.warn(`Failed to restore strategy states from database: ${err.message}`);
    }
  }

  private buildSetupSnapshot(context: RuleEvaluationContext, options: { setup?: StrategySetup; marketStates?: string[]; ruleResults?: any; setupDetails?: any; validationSummary?: string } = {}) {
    const { setup, marketStates, ruleResults, setupDetails, validationSummary } = options;
    const entryPrice = setup?.entry_price ?? setupDetails?.entryPrice ?? setupDetails?.entry;
    const slPrice = setup?.sl_price ?? setupDetails?.slPrice ?? setupDetails?.sl;
    const tp1Price = setup?.tp1_price ?? setupDetails?.tpPrice ?? setupDetails?.tp1Price ?? setupDetails?.tp1;
    const tp2Price = setup?.tp2_price ?? setupDetails?.tp2Price ?? setupDetails?.tp2;
    const tp3Price = setup?.tp3_price ?? setupDetails?.tp3Price ?? setupDetails?.tp3;
    const dirRaw = setup?.direction || setupDetails?.direction;
    const direction = dirRaw ? (String(dirRaw).toLowerCase() === 'sell' || String(dirRaw).toLowerCase() === 'short' ? 'sell' : 'buy') : undefined;
    
    let rr = setup?.risk_reward ? `1:${setup.risk_reward.toFixed(1)}` : setupDetails?.rr;
    if (!rr && entryPrice && slPrice && tp1Price) {
      const risk = Math.abs(entryPrice - slPrice);
      const reward = Math.abs(tp1Price - entryPrice);
      if (risk > 0) rr = `1:${(reward / risk).toFixed(2)}`;
    }

    const bias = setupDetails?.bias || setupDetails?.marketBias || setupDetails?.h1Bias || (direction === 'buy' ? 'BULLISH' : (direction === 'sell' ? 'BEARISH' : 'Undetermined'));

    return {
      ...setupDetails,
      pair: setup?.symbol || setupDetails?.pair || setupDetails?.symbol || context.symbol || 'XAUUSD',
      symbol: setup?.symbol || setupDetails?.symbol || setupDetails?.pair || context.symbol || 'XAUUSD',
      entryPrice,
      entry: entryPrice,
      slPrice,
      sl: slPrice,
      tp1Price,
      tp1: tp1Price,
      tp2Price,
      tp2: tp2Price,
      tp3Price,
      tp3: tp3Price,
      direction,
      rr: rr || '1:2.0',
      timeframe: setup?.timeframe || setupDetails?.timeframe || context.timeframe || 'M15',
      session: setupDetails?.session || 'London',
      marketBias: bias,
      bias,
      h1Bias: bias,
      marketStates: marketStates || setup?.market_states || [],
      validationSummary: validationSummary || setup?.validation_logs?.[setup.validation_logs.length - 1]?.reason,
      validationLogSummary: validationSummary || setup?.validation_logs?.[setup.validation_logs.length - 1]?.reason,
      sweepStatus: setupDetails?.sweepStatus || (setup?.steps.find(s => s.step_id.includes('SWEEP'))?.state === 'VALIDATED' ? 'Confirmed' : 'Monitored'),
      confirmationStatus: setupDetails?.confirmationStatus || (setup?.steps.find(s => s.step_id.includes('CHOCH') || s.step_id.includes('TRIGGER'))?.state === 'VALIDATED' ? 'Confirmed' : 'Monitored'),
      sdZoneStatus: setupDetails?.sdZoneStatus,
      atr14: setupDetails?.atr14 || 4.5,
      atrBuffer50Pct: setupDetails?.atrBuffer50Pct || '22.5 pips',
      ruleResults: ruleResults || {},
      aiDecision: setup?.ai_decision || setupDetails?.aiDecision || 'PENDING',
      setupObject: setup
    };
  }

  private async syncState(strategyId: string, stateName: string, status: string, reason: string, signalKey: string | null = null, payload: any = {}) {
    try {
      const syncKey = `${strategyId}_${payload?.context?.symbol || payload?.symbol || 'XAUUSD'}`;
      const lastSync = this.lastSyncedState[syncKey];
      if (lastSync && lastSync.stateName === stateName && lastSync.status === status && lastSync.reason === reason) {
        return;
      }
      
      this.lastSyncedState[syncKey] = { stateName, status, reason };
      
      await getDatabaseClient().insertStrategyState({
        strategy_id: strategyId,
        symbol: payload?.context?.symbol || payload?.symbol || 'XAUUSD',
        state_name: stateName,
        state_status: status,
        reason,
        signal_key: signalKey || undefined,
        payload_json: payload,
        timeframe: payload?.context?.timeframe || payload?.timeframe || 'M15'
      });
    } catch (e: any) {
      logger.error(`Failed to sync state ${stateName} for ${strategyId}: ${e.message}`);
    }
  }

  public async processMarketData(symbol: string, timeframe: string, contextData: any, activeStrategyIds: string[] = []) {
    const candles = contextData.candles || [];
    if (!candles || candles.length === 0) return;
    
    const latestCandle = candles[candles.length - 1];
    const dataKey = `${symbol}_${timeframe}`;
    
    const lastState = this.lastProcessedState[dataKey] || { timestamp: '', price: 0 };
    if (lastState.timestamp === latestCandle.timestamp && Math.abs(lastState.price - latestCandle.close) < 0.1) {
      return;
    }
    this.lastProcessedState[dataKey] = { timestamp: latestCandle.timestamp, price: latestCandle.close };

    logger.info(`Running continuous setup detection for ${symbol} at ${latestCandle.timestamp} (Price: ${latestCandle.close})`);
    
    const context: RuleEvaluationContext = {
      symbol,
      timeframe,
      timestamp: latestCandle.timestamp,
      marketData: contextData,
      indicators: contextData.indicators || {},
      candles: contextData.candles,
      correlationId: contextData.correlationId || crypto.randomUUID()
    };

    await this.runDetectionCycle(context, activeStrategyIds);
  }

  private async runDetectionCycle(context: RuleEvaluationContext, activeStrategyIds: string[]) {
    // 0. Market Calendar & Feed Health Check
    const marketStatus = MarketCalendar.getMarketStatus(context.symbol, context.marketData);
    if (marketStatus.isHardBlocked) {
      logger.warn(`[HARD_BLOCK_CYCLE_ABORT] Market status hard blocked for ${context.symbol}: ${marketStatus.blockReason}`);
      const fallbackStrategies = activeStrategyIds.length > 0 ? activeStrategyIds : ['strategy-1-smc', 'strategy-2-snd', 'strategy-3-scalping', 'strategy-4-news', 'strategy-5-smc-sd-confluence'];
      for (const stratId of fallbackStrategies) {
        await this.syncState(
          stratId,
          'REJECTED',
          'hard_blocked',
          `Market Hard Block: ${marketStatus.blockReason}`,
          null,
          this.buildSetupSnapshot(context, { validationSummary: marketStatus.blockReason || undefined, setupDetails: { aiDecision: 'REJECTED' } })
        );
      }
      return;
    }

    // 1. Market State Classification
    const marketStates = this.marketStateEngine.classifyState(context);
    
    // 2. Select Strategies to Process
    const allStrategies = ['strategy-1-smc', 'strategy-2-snd', 'strategy-3-scalping', 'strategy-4-news', 'strategy-5-smc-sd-confluence'];
    let strategiesToProcess = activeStrategyIds && activeStrategyIds.length > 0
      ? allStrategies.filter(id => activeStrategyIds.includes(id))
      : allStrategies;

    if (strategiesToProcess.length === 0) {
      strategiesToProcess = allStrategies;
    }

    // 3. Technical analysis data (Native TS LocalTAAnalyzer single source of truth)
    let commonPyData: any = {};
    try {
      const pyUrl = getEnv("PYTHON_ENGINE_URL");
      if (pyUrl) {
        const pyHealth = await PythonEngineManager.evaluate();
        if (pyHealth.status === 'active') {
          const mds = getMarketDataService();
          const [h1, m15, m5, m1] = await Promise.all([
            context.timeframe === 'H1' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'H1', 100),
            context.timeframe === 'M15' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M15', 100),
            context.timeframe === 'M5' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M5', 100),
            context.timeframe === 'M1' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M1', 100)
          ]);
          const payload = { H1: { candles: h1 }, M15: { candles: m15, atr: 4.5 }, M5: { candles: m5 }, M1: { candles: m1 } };
          const wsClient = PyWSClient.getInstance(pyUrl);
          commonPyData = await wsClient.analyze(payload);
        }
      }
    } catch (e: any) {
      logger.debug(`Python engine notice: ${e.message}`);
    }

    if (!commonPyData || !commonPyData.trend_h1 || !commonPyData.current_price) {
      commonPyData = { ...commonPyData, ...LocalTAAnalyzer.analyze(context) };
    }

    // 4. Process all active strategies independently (Strict Strategy Isolation)
    await Promise.allSettled(strategiesToProcess.map(async (strategyId) => {
      const sm = new StateMachine(strategyId, 'AWAITING');

      try {
        const evalResult = this.setupDetector.evaluateSetup(
          strategyId,
          context,
          commonPyData,
          'candle_update'
        );

        const setup = evalResult.setup;
        const translatedSnapshot = this.setupDetector.translateMarketDataToSnapshot(strategyId, commonPyData, context);

        // Map step rule results for UI
        const ruleResults: Record<string, any> = {};
        for (const st of setup.steps) {
          ruleResults[st.rule_id] = {
            ruleId: st.rule_id,
            ruleName: st.name,
            status: st.state === 'VALIDATED' ? 'PASS' : (st.state === 'AWAITING' ? 'WAIT' : (st.state === 'REJECTED' || st.state === 'INVALIDATED' ? 'FAIL' : 'WAIT')),
            mandatory: true,
            evidence: st.evidence,
            description: st.description,
            timestamp: st.last_evaluated_timestamp
          };
        }

        // Case A: Setup is still AWAITING or DETECTED or ACTIVE (Non-blocking: Engine continues monitoring)
        if (setup.state === 'AWAITING' || setup.state === 'DETECTED' || setup.state === 'ACTIVE') {
          const currentAwaitingStep = setup.steps.find(s => s.step_order === setup.current_step_order);
          const reason = currentAwaitingStep?.reason || 'Monitoring market conditions for setup confluence';

          sm.forceState(setup.state, reason);
          
          const payload = this.buildSetupSnapshot(context, {
            setup,
            marketStates,
            ruleResults,
            setupDetails: { ...translatedSnapshot, ...setup },
            validationSummary: reason
          });

          await this.syncState(strategyId, setup.state, 'active', reason, setup.id, payload);
          logger.info(`[${setup.state}] Strategy ${strategyId} (Step ${setup.current_step_order}: ${setup.current_step_id}): ${reason}`);
          return;
        }

        // Case B: Setup is INVALIDATED or REJECTED or EXPIRED
        if (setup.state === 'INVALIDATED' || setup.state === 'REJECTED' || setup.state === 'EXPIRED') {
          const lastLog = setup.validation_logs[setup.validation_logs.length - 1];
          const failMsg = lastLog?.reason || 'Setup invalidated or rejected';

          sm.forceState(setup.state, failMsg);
          const payload = this.buildSetupSnapshot(context, {
            setup,
            marketStates,
            ruleResults,
            setupDetails: { ...translatedSnapshot, ...setup, aiDecision: 'REJECTED' },
            validationSummary: failMsg
          });

          await this.syncState(strategyId, setup.state, 'rejected', failMsg, setup.id, payload);
          logger.info(`[${setup.state}] Strategy ${strategyId} finalized: ${failMsg}`);
          return;
        }

        // Case C: Setup is VALIDATED -> Route strictly through the 14-stage Signal Lifecycle Pipeline
        if (setup.state === 'VALIDATED') {
          this.setupDetector.recordTransition(setup, 'AI_PENDING', 'Evaluating Signal Lifecycle Pipeline...', 'candle_update');
          sm.transition('AI_PENDING', 'Running Signal Lifecycle Pipeline...');

          const pipelineResult = await signalPipeline.executePipeline(setup, context, ruleResults);

          if (!pipelineResult.success || pipelineResult.status !== 'APPROVED') {
            const failMsg = pipelineResult.rejectionReason || `Signal pipeline held at stage ${pipelineResult.stageReached} (Status: ${pipelineResult.status})`;
            logger.warn(`[PIPELINE REJECTED] Strategy ${strategyId} ${failMsg}`);
            this.setupDetector.recordTransition(setup, 'REJECTED', failMsg, 'invalidation');
            sm.transition('REJECTED', failMsg);

            const payload = this.buildSetupSnapshot(context, {
              setup,
              marketStates,
              ruleResults,
              setupDetails: { ...translatedSnapshot, ...setup, aiDecision: pipelineResult.status },
              validationSummary: failMsg
            });

            await this.syncState(strategyId, 'REJECTED', 'rejected', failMsg, setup.id, payload);
            return;
          }

          // Step Approved & Dispatched
          this.setupDetector.recordTransition(setup, 'APPROVED', 'Setup fully approved by technical and AI gates', 'candle_update');
          this.setupDetector.recordTransition(setup, 'SIGNAL_ACTIVE', 'Signal dispatched to live streams and execution engines', 'candle_update');

          sm.transition('APPROVED', 'Setup confirmed and priced');
          sm.transition('SIGNAL_ACTIVE', 'Signal dispatched to feeds');

          const readyPayload = this.buildSetupSnapshot(context, {
            setup,
            marketStates,
            ruleResults,
            setupDetails: { ...translatedSnapshot, ...setup, aiDecision: 'APPROVED', signalKey: pipelineResult.signalKey },
            validationSummary: 'Canonical signal object created and dispatched'
          });

          await this.syncState(strategyId, 'SIGNAL_ACTIVE', 'active', 'Canonical signal object created and dispatched', setup.id, readyPayload);
          logger.info(`[DISPATCH COMPLETE] Signal ${setup.id} (${strategyId}) is now ACTIVE and published with key ${pipelineResult.signalKey}.`);
        }
      } catch (err: any) {
        logger.error(`Error in setup detection cycle for ${strategyId}: ${err.message}`);
      }
    }));

    this.setupDetector.audit();
  }
}
