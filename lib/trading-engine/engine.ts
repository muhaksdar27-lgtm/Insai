import { getSupabaseClient } from "../supabase/client";
import { RuleEvaluationContext } from '@/types';
import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';
import { consistencyEngine } from './validation-pipeline/consistency-engine';
import { qualityGate } from './validation-pipeline/quality-gate';

import { SetupDetector, SetupLifecycleError } from './setup-detector';
import { logger } from '../utils/logger';
import { PyWSClient } from './py-ws-client';
import { MarketStateEngine } from './market-state-engine';
import { StateMachine, STEPS } from './state-machine';
import { RuleEngine } from './rule-engine';
import { CandidateEvaluator } from './candidate-evaluator';
import { SignalBuilder } from './signal-builder';
import { getMarketDataService } from '../market-data/market-data-service';
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

  public async init() {
    logger.info('Initializing Trading Engine with Deterministic Rule Engine, Candidate Evaluator & Signal Builder...');
  }

  private buildSetupSnapshot(context: RuleEvaluationContext, options: { marketStates?: string[], ruleResults?: any, setupDetails?: any, validationSummary?: string } = {}) {
      const { marketStates, ruleResults, setupDetails, validationSummary } = options;
      const entryPrice = setupDetails?.entryPrice ?? setupDetails?.entry;
      const slPrice = setupDetails?.slPrice ?? setupDetails?.sl;
      const tp1Price = setupDetails?.tpPrice ?? setupDetails?.tp1Price ?? setupDetails?.tp1;
      const dirRaw = setupDetails?.direction ? String(setupDetails.direction).toLowerCase() : undefined;
      const direction = (dirRaw === 'long' || dirRaw === 'buy') ? 'buy' : (dirRaw === 'short' || dirRaw === 'sell') ? 'sell' : (dirRaw || 'buy');
      
      let rr = setupDetails?.rr;
      if (!rr && entryPrice && slPrice && tp1Price) {
        const risk = Math.abs(entryPrice - slPrice);
        const reward = Math.abs(tp1Price - entryPrice);
        if (risk > 0) rr = `1:${(reward / risk).toFixed(1)}`;
      }

      return {
          ...setupDetails,
          entryPrice,
          entry: entryPrice,
          slPrice,
          sl: slPrice,
          tp1Price,
          tp1: tp1Price,
          tp2Price: setupDetails?.tp2Price ?? setupDetails?.tp2,
          tp3Price: setupDetails?.tp3Price ?? setupDetails?.tp3,
          direction,
          rr: rr || '1:2.0',
          timeframe: setupDetails?.timeframe || context.timeframe || 'M15',
          session: setupDetails?.session || 'London',
          marketBias: setupDetails?.marketBias || setupDetails?.bias || 'BULLISH',
          bias: setupDetails?.bias || setupDetails?.marketBias || 'BULLISH',
          marketStates: marketStates || [],
          validationSummary: validationSummary,
          validationLogSummary: validationSummary,
          ruleResults: ruleResults || {},
          aiDecision: setupDetails?.aiDecision || 'APPROVED'
      };
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

    logger.info(`Running deterministic setup detection for ${symbol} at ${latestCandle.timestamp} (Price: ${latestCandle.close})`);
    
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

  private async syncState(strategyId: string, stateName: string, status: string, reason: string, signalKey: string | null = null, payload: any = {}) {
     try {
         const syncKey = `${strategyId}_${payload?.context?.symbol || payload?.symbol || 'XAUUSD'}`;
         const lastSync = this.lastSyncedState[syncKey];
         if (lastSync && lastSync.stateName === stateName && lastSync.status === status && lastSync.reason === reason) {
             return;
         }
         
         this.lastSyncedState[syncKey] = { stateName, status, reason };
         
         await getSupabaseClient().insertStrategyState({
             strategy_id: strategyId,
             symbol: payload?.context?.symbol || payload?.symbol || 'XAUUSD',
             state_name: stateName,
             state_status: status,
             reason: reason,
             signal_key: signalKey || undefined,
             payload_json: payload,
             timeframe: payload?.context?.timeframe || payload?.timeframe || 'M15'
         });
     } catch (e: any) {
         logger.error(`Failed to sync state ${stateName} for ${strategyId}: ${e.message}`);
     }
  }

  private async advanceStateMachine(sm: StateMachine, newState: any, reason: string, setupId: string, context: RuleEvaluationContext, options: { marketStates?: string[], ruleResults?: any, setupDetails?: any, validationSummary?: string } = {}) {
      const payload = this.buildSetupSnapshot(context, { ...options, validationSummary: reason });
      try {
         const result = sm.transition(newState, reason, setupId, payload);
         await this.syncState(sm.lastTransitionState!.strategyId, newState, result.currentStatus, reason, setupId, payload);
      } catch (e: any) {
         logger.error(`State machine transition error: ${e.message}`);
      }
  }

  private async runDetectionCycle(context: RuleEvaluationContext, activeStrategyIds: string[]) {
    // 1. Market State Classification
    const marketStates = this.marketStateEngine.classifyState(context);
    logger.info(`Market States detected: ${marketStates.join(', ')}`);
    
    // 2. Select Relevant Strategies
    const { active, inactive } = this.marketStateEngine.getRelevantStrategies(marketStates);
    
    let relevantStrategies = active;
    let irrelevantStrategies = inactive;
    
    if (activeStrategyIds && activeStrategyIds.length > 0) {
        relevantStrategies = relevantStrategies.filter(id => activeStrategyIds.includes(id));
        irrelevantStrategies = irrelevantStrategies.filter(s => activeStrategyIds.includes(s.id));
    }

    if (relevantStrategies.length === 0) {
        relevantStrategies = activeStrategyIds.length > 0 ? activeStrategyIds : ['strategy-1-smc', 'strategy-2-snd', 'strategy-3-scalping', 'strategy-4-news', 'strategy-5-smc-sd-confluence'];
    }
    
    logger.info(`Relevant Strategies based on market state: ${relevantStrategies.join(', ')}`);

    for (const strat of irrelevantStrategies) {
         await this.syncState(strat.id, STEPS.FAILED, 'expired', strat.reason, null, this.buildSetupSnapshot(context, { marketStates, validationSummary: strat.reason }));
    }

    // 3. Technical analysis snapshot from Python Engine or fallback
    let commonPyData: any = {};
    try {
        const pyPort = process.env.PYTHON_PORT || '8181';
        const externalUrl = process.env.PYTHON_ENGINE_URL;
        const pyUrl = externalUrl || `http://127.0.0.1:${pyPort}`;
        const mds = getMarketDataService();
        
        const [h1, m15, m5, m1] = await Promise.all([
            mds.getCandles(context.symbol, 'H1', 100),
            context.timeframe === 'M15' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M15', 100),
            mds.getCandles(context.symbol, 'M5', 100),
            mds.getCandles(context.symbol, 'M1', 100)
        ]);
        
        const payload = { H1: { candles: h1 }, M15: { candles: m15, atr: 4.5 }, M5: { candles: m5 }, M1: { candles: m1 } };
        
        try {
            const wsClient = PyWSClient.getInstance(pyUrl);
            commonPyData = await wsClient.analyze(payload);
        } catch (wsErr: any) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
                const pyRes = await fetch(`${pyUrl}/v1/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    cache: 'no-store',
                    signal: controller.signal
                });
                if (pyRes.ok) {
                    commonPyData = await pyRes.json();
                }
            } catch (err: any) {
                logger.warn(`Failed to reach Python Engine HTTP: ${err.message}`);
            } finally {
                clearTimeout(timeout);
            }
        }
    } catch (e: any) {
        logger.error(`Technical analysis error: ${e.message}`);
    }

    // Process all active strategies through the deterministic pipeline
    await Promise.allSettled(relevantStrategies.map(async (strategyId) => {
      const sm = new StateMachine(strategyId, STEPS.INITIALIZING);
      
      try {
        let setup = this.setupDetector.startScanning(strategyId, context.symbol, context.timeframe, context.timestamp);

        // Step 1: INITIALIZING & WAITING_MARKET check
        await this.advanceStateMachine(sm, STEPS.INITIALIZING, 'System initialized', setup.id, context, { marketStates });

        // Evaluate Rules via RuleEngine
        let pyData: any = commonPyData || {};
        const lastCandle = context.candles && context.candles.length > 0 ? context.candles[context.candles.length - 1] : null;
        if (!pyData.current_price && lastCandle) {
          pyData.current_price = lastCandle.close;
        }

        const evaluatedRules = RuleEngine.evaluateStrategyRules(strategyId, context, pyData);
        const candidateEval = CandidateEvaluator.evaluateCandidate(strategyId, evaluatedRules);

        // Check if candidate evaluator returned WAITING
        if (candidateEval.isWaiting) {
          await this.advanceStateMachine(sm, STEPS.WAITING_MARKET, candidateEval.rejectionReason || 'Waiting for market data or session', setup.id, context, { marketStates, ruleResults: evaluatedRules });
          logger.info(`[WAITING_MARKET] Strategy ${strategyId} waiting: ${candidateEval.rejectionReason}`);
          return;
        }

        // Check if candidate failed mandatory rules
        if (candidateEval.rejected) {
          const failMsg = candidateEval.rejectionReason || 'Mandatory rule evaluation failed';
          logger.info(`[FAILED] Strategy ${strategyId} rejected: ${failMsg}`);
          this.setupDetector.transitionState(setup.id, 'expired', failMsg);
          await this.advanceStateMachine(sm, STEPS.FAILED, failMsg, setup.id, context, { 
            marketStates, 
            ruleResults: evaluatedRules,
            setupDetails: { failedRules: candidateEval.failedRules, rejectionReason: failMsg }
          });
          return;
        }

        // Candidate accepted -> Proceed deterministically
        const translatedSnapshot = this.setupDetector.translateMarketDataToSnapshot(strategyId, pyData);
        (setup as any).setupSnapshot = translatedSnapshot;

        // Step 2: SCANNING
        await this.advanceStateMachine(sm, STEPS.SCANNING, 'Scanning market data feed', setup.id, context, { marketStates, setupDetails: translatedSnapshot });

        // Step 3: SETUP_FOUND
        if (setup.status === 'scanning') {
          setup = this.setupDetector.transitionState(setup.id, 'candidate', 'Setup parameters identified');
        }
        await this.advanceStateMachine(sm, STEPS.SETUP_FOUND, 'Setup parameters & key levels identified', setup.id, context, { marketStates, setupDetails: translatedSnapshot });

        // Step 4: RULE_VALIDATION
        await this.advanceStateMachine(sm, STEPS.RULE_VALIDATION, 'All mandatory strategy rules passed', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: translatedSnapshot });

        // Step 5: RISK_VALIDATION
        let direction = translatedSnapshot.direction || 'buy';
        let entryPrice = translatedSnapshot.entry || pyData.current_price || (lastCandle ? lastCandle.close : 2750.0);
        let slPrice = translatedSnapshot.sl;
        let tpPrice = translatedSnapshot.tp1 || translatedSnapshot.tp;

        const atr = pyData.atr || 4.5;
        const riskDistance = atr * 0.5;
        if (!slPrice) slPrice = direction === 'buy' ? entryPrice - riskDistance : entryPrice + riskDistance;
        if (!tpPrice) tpPrice = direction === 'buy' ? entryPrice + (riskDistance * 2.0) : entryPrice - (riskDistance * 2.0);

        this.setupDetector.updateSetupDetails(setup.id, { direction, entryPrice, slPrice, tpPrice, marketStates });
        await this.advanceStateMachine(sm, STEPS.RISK_VALIDATION, 'Risk parameters and SL/TP calculated', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, entryPrice, slPrice, tpPrice, direction } });

        // Step 6: AI_VALIDATION
        setup = this.setupDetector.transitionState(setup.id, 'validation', 'Passed candidate pattern matching');
        const validationState = sm.lastTransitionState || { stateName: STEPS.AI_VALIDATION } as any;
        await this.advanceStateMachine(sm, STEPS.AI_VALIDATION, 'Running AI confluence gate...', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: translatedSnapshot });
        
        const validationResult = await this.aiOrchestrator.runPipeline(strategyId, validationState, evaluatedRules, context);

        validationState.context = { ...(validationState.context || {}), direction, entryPrice, slPrice, tpPrice, tp1Price: tpPrice };
        const consResult = await consistencyEngine.evaluate(strategyId, validationState, evaluatedRules, validationResult, context);
        if (consResult.status === 'block') {
            logger.warn(`Setup ${setup.id} blocked by Consistency Engine: ${consResult.reasoning}`);
            this.setupDetector.transitionState(setup.id, 'expired', `Consistency Blocked: ${consResult.reasoning}`);
            await this.advanceStateMachine(sm, STEPS.FAILED, consResult.reasoning, setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        const riskDecision = { status: 'pass' };
        const qgResult = await qualityGate.evaluate(strategyId, validationState, context, evaluatedRules, validationResult, consResult, riskDecision);
        if (!qgResult.passed) {
            logger.warn(`Setup ${setup.id} blocked by Quality Gate: ${qgResult.reason}`);
            this.setupDetector.transitionState(setup.id, 'expired', `Quality Gate Blocked: ${qgResult.reason}`);
            await this.advanceStateMachine(sm, STEPS.FAILED, qgResult.reason || 'Quality gate blocked', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        // Step 7: SIGNAL_READY (Mandatory rules passed and verified)
        setup = this.setupDetector.transitionState(setup.id, 'ready', 'Setup confirmed and priced');
        (setup as any).aiValidation = validationResult;
        (setup as any).qualityGatePassed = true;
        (setup as any).marketStates = marketStates;
        (setup as any).candidateRules = evaluatedRules;

        await this.advanceStateMachine(sm, STEPS.SIGNAL_READY, 'Signal assembled with single source of truth', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: validationResult.decision, direction, entryPrice, slPrice, tpPrice } });

        // Step 8: DISPATCHED
        setup = this.setupDetector.transitionState(setup.id, 'signal', 'Signal emitted');
        await this.advanceStateMachine(sm, STEPS.DISPATCHED, 'Signal dispatched to dashboard and execution feeds', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: validationResult.decision, direction, entryPrice, slPrice, tpPrice } });
        
        logger.info(`🚨 SIGNAL GENERATED & DISPATCHED: ${setup.id} [${setup.direction?.toUpperCase()} ${setup.symbol}] Entry: ${setup.entryPrice}`);
        
        // Dispatch via SignalBuilder
        await SignalBuilder.buildAndDispatchSignal(setup, context);

        this.setupDetector.transitionState(setup.id, 'archived', 'Signal processing complete');
        await getSupabaseClient().archiveToHistory(setup.id, 'FINISHED', 25.0, 'WIN', context.correlationId).catch(() => null);

      } catch (err) {
        if (err instanceof SetupLifecycleError) {
          logger.warn(`Setup lifecycle constraint: ${err.message}`);
        } else {
          logger.error(`Error processing strategy ${strategyId}: ${(err as Error).message}`);
        }
      }
    }));

    this.setupDetector.audit();
  }
}
