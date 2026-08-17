import { LocalTAAnalyzer } from './local-ta-analyzer';
import { getDatabaseClient } from "../db/client";
import { getEnv } from "../utils/env";
import { RuleEvaluationContext } from '@/types';
import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';
import { consistencyEngine } from './validation-pipeline/consistency-engine';
import { qualityGate } from './validation-pipeline/quality-gate';

import { SetupDetector, SetupLifecycleError } from './setup-detector';
import { logger } from '../utils/logger';
import { PyWSClient } from './py-ws-client';
import { PythonEngineManager } from '../mcp/engines/deployment';
import { MarketStateEngine } from './market-state-engine';
import { StateMachine, STEPS } from './state-machine';
import { RuleEngine } from './rule-engine';
import { CandidateEvaluator } from './candidate-evaluator';
import { SignalBuilder } from './signal-builder';
import { getMarketDataService } from '../market-data/market-data-service';
import { MarketCalendar } from '../market-data/market-calendar';
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
      const direction = dirRaw ? ((dirRaw === 'long' || dirRaw === 'buy') ? 'buy' : (dirRaw === 'short' || dirRaw === 'sell') ? 'sell' : dirRaw) : undefined;
      
      let rr = setupDetails?.rr;
      if (!rr && entryPrice && slPrice && tp1Price) {
        const risk = Math.abs(entryPrice - slPrice);
        const reward = Math.abs(tp1Price - entryPrice);
        if (risk > 0) rr = `1:${(reward / risk).toFixed(2)}`;
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
          rr: rr || undefined,
          timeframe: setupDetails?.timeframe || context.timeframe,
          session: setupDetails?.session || 'Off-Session',
          marketBias: setupDetails?.marketBias || setupDetails?.bias || 'Undetermined',
          bias: setupDetails?.bias || setupDetails?.marketBias || 'Undetermined',
          marketStates: marketStates || [],
          validationSummary: validationSummary,
          validationLogSummary: validationSummary,
          ruleResults: ruleResults || {},
          aiDecision: setupDetails?.aiDecision || 'PENDING'
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
         
         await getDatabaseClient().insertStrategyState({
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
    // 0. Market Calendar & Feed Health Check (Hard Block)
    const marketStatus = MarketCalendar.getMarketStatus(context.symbol, context.marketData);
    if (marketStatus.isHardBlocked) {
      logger.warn(`[HARD_BLOCK_CYCLE_ABORT] Market status hard blocked for ${context.symbol}: ${marketStatus.blockReason}`);
      const fallbackStrategies = activeStrategyIds.length > 0 ? activeStrategyIds : ['strategy-1-smc', 'strategy-2-snd', 'strategy-3-scalping', 'strategy-4-news', 'strategy-5-smc-sd-confluence'];
      for (const stratId of fallbackStrategies) {
        await this.syncState(
          stratId,
          STEPS.FAILED,
          'hard_blocked',
          `Market Hard Block: ${marketStatus.blockReason}`,
          null,
          this.buildSetupSnapshot(context, { validationSummary: marketStatus.blockReason || undefined, setupDetails: { aiDecision: 'REJECTED' } })
        );
      }
      return;
    }

    // 0b. Data Stale Hard Block
    if (context.candles && context.candles.length > 0) {
      const latestCandleTime = new Date(context.candles[context.candles.length - 1].timestamp).getTime();
      const now = Date.now();
      const staleLimitMs = 60 * 60 * 1000; // 60 minutes threshold for fallback REST feeds
      if (now - latestCandleTime > staleLimitMs) {
        logger.warn(`[STALE_DATA_CYCLE_ABORT] Market candles for ${context.symbol} are stale (${context.candles[context.candles.length - 1].timestamp}). Aborting detection cycle.`);
        return;
      }
    }

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
        const pyUrl = getEnv("PYTHON_ENGINE_URL");
        if (!pyUrl) {
            throw new Error('PYTHON_ENGINE_URL environment variable is not set.');
        }

        const pyHealth = await PythonEngineManager.evaluate();
        if (pyHealth.status !== 'active') {
            logger.debug(`Python Engine status is '${pyHealth.status}'. Using Native TS LocalTAAnalyzer.`);
        } else {
            const mds = getMarketDataService();
            
            const [h1, m15, m5, m1] = await Promise.all([
                context.timeframe === 'H1' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'H1', 100),
                context.timeframe === 'M15' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M15', 100),
                context.timeframe === 'M5' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M5', 100),
                context.timeframe === 'M1' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M1', 100)
            ]);
            
            const payload = { H1: { candles: h1 }, M15: { candles: m15, atr: 4.5 }, M5: { candles: m5 }, M1: { candles: m1 } };
            
            try {
                const wsClient = PyWSClient.getInstance(pyUrl);
                commonPyData = await wsClient.analyze(payload);
            } catch (wsErr: any) {
                logger.debug(`WebSocket to Python Engine failed (${wsErr.message}), trying HTTP fallback...`);
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
                    logger.debug(`Failed to reach Python Engine HTTP: ${err.message}`);
                } finally {
                    clearTimeout(timeout);
                }
            }
        }
    } catch (e: any) {
        logger.debug(`Technical analysis remote engine notice: ${e.message}`);
    }

    // Always ensure robust technical analysis data using native TypeScript LocalTAAnalyzer if Python engine is inactive or returned empty
    if (!commonPyData || !commonPyData.trend_h1 || !commonPyData.current_price) {
        logger.info('Running Native TypeScript LocalTAAnalyzer for real-time market structure & indicators...');
        commonPyData = { ...commonPyData, ...LocalTAAnalyzer.analyze(context) };
    }

    // Process all active strategies through the deterministic pipeline
    const approvedCandidates: Array<{
      setup: any;
      sm: StateMachine;
      strategyId: string;
      translatedSnapshot: any;
      validationResult: any;
      evaluatedRules: any;
      score: number;
      confidence: number;
      rrVal: number;
    }> = [];

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
          const reason = candidateEval.rejectionReason || '';
          const isScanning = reason.includes('structure') || reason.includes('sweep') || reason.includes('CHoCH') || reason.includes('OB/FVG') || reason.includes('zone') || reason.includes('engulfing') || reason.includes('double');
          const step = isScanning ? STEPS.SCANNING : STEPS.WAITING_MARKET;
          await this.advanceStateMachine(sm, step, reason || 'Waiting for market data or session', setup.id, context, { marketStates, ruleResults: evaluatedRules });
          logger.info(`[${step}] Strategy ${strategyId} waiting: ${reason}`);
          if (!isScanning) {
            this.setupDetector.clearStrategySetup(strategyId, context.symbol);
          }
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
        const translatedSnapshot = this.setupDetector.translateMarketDataToSnapshot(strategyId, pyData, context);
        (setup as any).setupSnapshot = translatedSnapshot;

        // Step 2: SCANNING
        await this.advanceStateMachine(sm, STEPS.SCANNING, 'Scanning market data feed', setup.id, context, { marketStates, setupDetails: translatedSnapshot });

        // Step 3: SETUP_FOUND
        if (setup.status === 'scanning') {
          setup = this.setupDetector.transitionState(setup.id, 'candidate', 'Setup parameters identified');
        }
        logger.info(`[SETUP FOUND] Strategy ${strategyId} setup detected on ${context.symbol}`);
        await this.advanceStateMachine(sm, STEPS.SETUP_FOUND, 'Setup parameters & key levels identified', setup.id, context, { marketStates, setupDetails: translatedSnapshot });

        // Step 4: RULE_VALIDATION
        logger.info(`[RULE PASS] Strategy ${strategyId} all mandatory candidate rules passed.`);
        await this.advanceStateMachine(sm, STEPS.RULE_VALIDATION, 'All mandatory strategy rules passed', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: translatedSnapshot });

        // Step 5: RISK_VALIDATION
        let direction = translatedSnapshot.direction;
        let entryPrice = translatedSnapshot.entry || pyData.current_price || (lastCandle ? lastCandle.close : undefined);
        let slPrice = translatedSnapshot.sl;
        let tpPrice = translatedSnapshot.tp;

        if (!entryPrice || !direction) {
          const failMsg = 'Missing entry price or signal direction';
          logger.warn(`[FAILED] Strategy ${strategyId} rejected: ${failMsg}`);
          this.setupDetector.transitionState(setup.id, 'expired', failMsg);
          await this.advanceStateMachine(sm, STEPS.FAILED, failMsg, setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: translatedSnapshot });
          return;
        }

        const atr = pyData.atr || 4.5;
        const riskDistance = atr * 0.5;
        if (!slPrice) slPrice = direction === 'buy' ? entryPrice - riskDistance : entryPrice + riskDistance;
        if (!tpPrice) tpPrice = direction === 'buy' ? entryPrice + (riskDistance * 2.0) : entryPrice - (riskDistance * 2.0);

        this.setupDetector.updateSetupDetails(setup.id, { direction, entryPrice, slPrice, tpPrice, marketStates });
        await this.advanceStateMachine(sm, STEPS.RISK_VALIDATION, 'Risk parameters and SL/TP calculated', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, entryPrice, slPrice, tpPrice, direction } });

        // Step 6: AI_VALIDATION
        setup = this.setupDetector.transitionState(setup.id, 'validation', 'Passed candidate pattern matching');
        const validationState = sm.lastTransitionState || { stateName: STEPS.AI_VALIDATION } as any;
        
        logger.info(`[AI START] Strategy ${strategyId} running AI confluence gate...`);
        await this.advanceStateMachine(sm, STEPS.AI_VALIDATION, 'Running AI confluence gate...', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: translatedSnapshot });
        
        const validationResult = await this.aiOrchestrator.runPipeline(strategyId, validationState, evaluatedRules, context);

        if (validationResult.decision !== 'APPROVED') {
          const aiFailMsg = `AI Validation Rejected: ${validationResult.reasoning || 'Confluence threshold not met'}`;
          logger.warn(`[AI REJECTED] Strategy ${strategyId} ${aiFailMsg}`);
          this.setupDetector.transitionState(setup.id, 'expired', aiFailMsg);
          await this.advanceStateMachine(sm, STEPS.FAILED, aiFailMsg, setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
          return;
        }

        const confidenceVal = validationResult.aiReview?.confidenceScore || validationResult.scores?.confidence || 85;
        logger.info(`[AI APPROVED] Strategy ${strategyId} AI confluence gate approved setup (Confidence: ${confidenceVal}%)`);

        validationState.context = { ...(validationState.context || {}), direction, entryPrice, slPrice, tpPrice, tp1Price: tpPrice };
        const consResult = await consistencyEngine.evaluate(strategyId, validationState, evaluatedRules, validationResult, context);
        if (consResult.status === 'block') {
            logger.warn(`[CONSISTENCY BLOCKED] Setup ${setup.id} blocked by Consistency Engine: ${consResult.reasoning}`);
            this.setupDetector.transitionState(setup.id, 'expired', `Consistency Blocked: ${consResult.reasoning}`);
            await this.advanceStateMachine(sm, STEPS.FAILED, consResult.reasoning, setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        const riskDecision = { status: 'pass' };
        const qgResult = await qualityGate.evaluate(strategyId, validationState, context, evaluatedRules, validationResult, consResult, riskDecision);
        if (!qgResult.passed) {
            logger.warn(`[QUALITY GATE BLOCKED] Setup ${setup.id} blocked by Quality Gate: ${qgResult.reason}`);
            this.setupDetector.transitionState(setup.id, 'expired', `Quality Gate Blocked: ${qgResult.reason}`);
            await this.advanceStateMachine(sm, STEPS.FAILED, qgResult.reason || 'Quality gate blocked', setup.id, context, { marketStates, ruleResults: evaluatedRules, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        logger.info(`[QUALITY GATE] Strategy ${strategyId} passed quality gate.`);

        // Calculate RR ratio
        let rrVal = 2.0;
        if (entryPrice && slPrice && tpPrice && Math.abs(entryPrice - slPrice) > 0) {
          rrVal = Math.abs(tpPrice - entryPrice) / Math.abs(entryPrice - slPrice);
        }

        approvedCandidates.push({
          setup,
          sm,
          strategyId,
          translatedSnapshot,
          validationResult,
          evaluatedRules,
          score: candidateEval.score || 80,
          confidence: confidenceVal,
          rrVal
        });

      } catch (err) {
        if (err instanceof SetupLifecycleError) {
          logger.warn(`Setup lifecycle constraint: ${err.message}`);
        } else {
          logger.error(`Error processing strategy ${strategyId}: ${(err as Error).message}`);
        }
      }
    }));

    // Step 7: Cross-Strategy Signal Deduplication & Final Dispatch
    const candidateGroups: Record<string, typeof approvedCandidates> = {};
    for (const cand of approvedCandidates) {
      const groupKey = `${cand.setup.symbol}_${cand.setup.direction}`.toUpperCase();
      if (!candidateGroups[groupKey]) candidateGroups[groupKey] = [];
      candidateGroups[groupKey].push(cand);
    }

    for (const [groupKey, candidates] of Object.entries(candidateGroups)) {
      if (candidates.length === 0) continue;

      // Sort candidates by confidence -> score -> Risk/Reward to pick single best winner
      candidates.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        if (b.score !== a.score) return b.score - a.score;
        return b.rrVal - a.rrVal;
      });

      const winner = candidates[0];

      // Suppress duplicate candidates
      for (let i = 1; i < candidates.length; i++) {
        const dup = candidates[i];
        const suppressReason = `Suppressed: Duplicate strategy signal for same market event (lower confluence score than winner Strategy ${winner.strategyId})`;
        logger.info(`[SUPPRESSED DUPLICATE] Strategy ${dup.strategyId} suppressed in favor of Strategy ${winner.strategyId} for ${groupKey}`);
        this.setupDetector.transitionState(dup.setup.id, 'expired', suppressReason);
        await this.advanceStateMachine(dup.sm, STEPS.FAILED, suppressReason, dup.setup.id, context, {
          marketStates,
          ruleResults: dup.evaluatedRules,
          setupDetails: { ...dup.translatedSnapshot, aiDecision: 'SUPPRESSED' }
        });
      }

      // Process Winner Dispatch
      logger.info(`[SIGNAL CREATED] Strategy ${winner.strategyId} canonical signal object created for ${groupKey}`);

      let winnerSetup = this.setupDetector.transitionState(winner.setup.id, 'ready', 'Setup confirmed and priced');
      (winnerSetup as any).aiValidation = winner.validationResult;
      (winnerSetup as any).qualityGatePassed = true;
      (winnerSetup as any).marketStates = marketStates;
      (winnerSetup as any).candidateRules = winner.evaluatedRules;

      await this.advanceStateMachine(winner.sm, STEPS.SIGNAL_READY, 'Signal assembled with single source of truth', winnerSetup.id, context, {
        marketStates,
        ruleResults: winner.evaluatedRules,
        setupDetails: { ...winner.translatedSnapshot, aiDecision: winner.validationResult.decision, direction: winnerSetup.direction, entryPrice: winnerSetup.entryPrice, slPrice: winnerSetup.slPrice, tpPrice: winnerSetup.tpPrice }
      });

      winnerSetup = this.setupDetector.transitionState(winnerSetup.id, 'signal', 'Signal emitted');
      await this.advanceStateMachine(winner.sm, STEPS.DISPATCHED, 'Signal dispatched to dashboard and execution feeds', winnerSetup.id, context, {
        marketStates,
        ruleResults: winner.evaluatedRules,
        setupDetails: { ...winner.translatedSnapshot, aiDecision: winner.validationResult.decision, direction: winnerSetup.direction, entryPrice: winnerSetup.entryPrice, slPrice: winnerSetup.slPrice, tpPrice: winnerSetup.tpPrice }
      });

      // Dispatch signal (triggers [HISTORY SAVED], [LIVE SENT], and [TELEGRAM SENT])
      await SignalBuilder.buildAndDispatchSignal(winnerSetup, context);
      logger.info(`[DISPATCH COMPLETE] Signal ${winnerSetup.id} is now ACTIVE and published to Live Signals and Telegram.`);
    }

    this.setupDetector.audit();
  }
}
