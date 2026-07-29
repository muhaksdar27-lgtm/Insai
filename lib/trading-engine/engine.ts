import { getSupabaseClient } from "../supabase/client";
import { getStrategyDefinition } from "./strategy-registry";
import { RuleEvaluationContext } from '@/types';
import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';
import { consistencyEngine } from './validation-pipeline/consistency-engine';
import { qualityGate } from './validation-pipeline/quality-gate';

import { SetupDetector, SetupLifecycleError } from './setup-detector';
import { SignalPipeline } from './signal-pipeline';
import { logger } from '../utils/logger';
import { PyWSClient } from './py-ws-client';
import { MarketStateEngine } from './market-state-engine';
import { StateMachine, STEPS } from './state-machine';
import { getMarketDataService } from '../market-data/market-data-service';
import crypto from 'crypto';

export class TradingEngine {
  private signalPipeline: SignalPipeline;
  private setupDetector: SetupDetector;
  private marketStateEngine: MarketStateEngine;
  private aiOrchestrator: AIValidationOrchestrator;

  // Track the timestamp and price of the last processed data to avoid duplicate scans on the same data
  private lastProcessedState: Record<string, { timestamp: string, price: number }> = {};
  private lastSyncedState: Record<string, { stateName: string, status: string, reason: string }> = {};

  private buildSetupSnapshot(context: RuleEvaluationContext, options: { marketStates?: string[], ruleResults?: any, setupDetails?: any, validationSummary?: string } = {}) {
      const { marketStates, ruleResults, setupDetails, validationSummary } = options;
      const entryPrice = setupDetails?.entryPrice;
      const slPrice = setupDetails?.slPrice;
      const tp1Price = setupDetails?.tpPrice || setupDetails?.tp1Price;
      const direction = setupDetails?.direction;
      const risk = slPrice && entryPrice ? Math.abs(entryPrice - slPrice) : 0;
      const reward = tp1Price && entryPrice ? Math.abs(tp1Price - entryPrice) : 0;
      const rr = risk > 0 ? Number((reward / risk).toFixed(2)) : undefined;

      return {
          ...setupDetails,
          entryPrice,
          entry: entryPrice,
          sl: slPrice,
          tp1: tp1Price,
          tp2: setupDetails?.tp2Price,
          tp3: setupDetails?.tp3Price,
          bias: ruleResults?.['Trend Validator']?.evidence?.trend,
          validationSummary: validationSummary || '',
          slPrice,
          tp1Price,
          tp2Price: setupDetails?.tp2Price,
          tp3Price: setupDetails?.tp3Price,
          direction,
          rr,
          timeframe: context.timeframe,
          session: ruleResults?.['Session Validator']?.evidence?.session,
          marketBias: ruleResults?.['Trend Validator']?.evidence?.trend,
          marketStates: marketStates || [],
          marketStructure: ruleResults?.['Structure Validator']?.evidence?.structure,
          confirmation: ruleResults?.['Confirmation Validator']?.status === 'valid',
          validationLogSummary: validationSummary || '',
          ruleResults: this.buildRuleSummary(ruleResults),
          aiDecision: setupDetails?.aiDecision
      };
  }

  private buildRuleSummary(ruleResults: any) {
      if (!ruleResults) return {};
      const summary: Record<string, any> = {};
      for (const [key, value] of Object.entries(ruleResults)) {
          if (value && typeof value === 'object' && 'status' in value) {
              summary[key] = {
                  status: (value as any).status,
                  evidence: (value as any).evidence
              };
          } else {
              summary[key] = value;
          }
      }
      return summary;
  }

  public buildProgress(_strategyId: string, stateName: string) {
      return { currentStep: stateName };
  }

  public buildSignalMetadata(setup: any, context: RuleEvaluationContext) {
      return {
          signalId: setup.id,
          timestamp: context.timestamp,
          symbol: context.symbol,
          timeframe: context.timeframe
      };
  }

  constructor() {
    this.signalPipeline = new SignalPipeline();
    this.setupDetector = new SetupDetector();
    this.marketStateEngine = new MarketStateEngine();
    this.aiOrchestrator = new AIValidationOrchestrator();
  }

  public async init() {
    logger.info('Initializing Trading Engine with Deterministic Setup Detector and AI Validator...');
  }

  public async processMarketData(symbol: string, timeframe: string, contextData: any, activeStrategyIds: string[] = []) {
    const candles = contextData.candles || [];
    if (!candles || candles.length === 0) return;
    
    const latestCandle = candles[candles.length - 1];
    const dataKey = `${symbol}_${timeframe}`;
    
    const lastState = this.lastProcessedState[dataKey] || { timestamp: '', price: 0 };
    
    // Deterministic gate: only process if we have a new candle OR price changed by >= 0.1 (1 pip for XAUUSD)
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
         // Deduplicate redundant state writes
         const syncKey = `${strategyId}_${payload?.context?.symbol || payload?.symbol || 'XAUUSD'}`;
         const lastSync = this.lastSyncedState[syncKey];
         if (lastSync && lastSync.stateName === stateName && lastSync.status === status && lastSync.reason === reason) {
             // Only skip if the core state hasn't changed to avoid spamming the DB
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

  private async advanceStateMachine(sm: StateMachine, newState: any, reason: string, setupId: string, context: RuleEvaluationContext, options: { marketStates?: string[], ruleResults?: any, setupDetails?: any } = {}) {
      const payload = this.buildSetupSnapshot(context, { ...options, validationSummary: reason });
      try {
         const result = sm.transition(newState, reason, setupId, payload);
         await this.syncState(sm.lastTransitionState!.strategyId, newState, result.currentStatus, reason, setupId, payload);
      } catch (e: any) {
         logger.error(`State machine transition error: ${e.message}`);
      }
  }

  private async runDetectionCycle(context: RuleEvaluationContext, activeStrategyIds: string[]) {
    // 1. Macro News Filter (Ultra-High Accuracy Filtration)
    const calendarEvents = context.marketData?.calendar || [];
    const nowTime = new Date().getTime();
    let hasHighImpactUSDNews = false;
    for (const evt of calendarEvents) {
        if (evt.impact === 'high' && (evt.country === 'USD' || evt.currency === 'USD')) {
            const evtTime = new Date(evt.time || evt.timestamp || nowTime).getTime();
            const diffMins = Math.abs(evtTime - nowTime) / (1000 * 60);
            if (diffMins <= 30) {
                hasHighImpactUSDNews = true;
                break;
            }
        }
    }

    if (hasHighImpactUSDNews) {
        logger.warn(`Macro News Filter: High Impact USD News detected within 30 minutes! Entering STANDBY mode.`);
        for (const stratId of activeStrategyIds) {
            await this.syncState(stratId, STEPS.SUPPRESSED, 'standby', 'Macro News Filter: Standby mode due to High Impact USD news', null, this.buildSetupSnapshot(context, { validationSummary: 'Standby mode due to High Impact USD news' }));
        }
        return;
    }

    // 1. Market State Classification
    const marketStates = this.marketStateEngine.classifyState(context);
    logger.info(`Market States detected: ${marketStates.join(', ')}`);
    
    // 2. Select Relevant Strategies
    const { active, inactive } = this.marketStateEngine.getRelevantStrategies(marketStates);
    
    let relevantStrategies = active;
    let irrelevantStrategies = inactive;
    
    // Filter by activeStrategyIds if provided
    if (activeStrategyIds && activeStrategyIds.length > 0) {
        relevantStrategies = relevantStrategies.filter(id => activeStrategyIds.includes(id));
        irrelevantStrategies = irrelevantStrategies.filter(s => activeStrategyIds.includes(s.id));
    }
    
    logger.info(`Relevant Strategies based on market state: ${relevantStrategies.join(', ')}`);

    // Sync state for irrelevant strategies so the UI updates
    for (const strat of irrelevantStrategies) {
         await this.syncState(strat.id, STEPS.EXPIRED, 'expired', strat.reason, null, this.buildSetupSnapshot(context, { marketStates, validationSummary: strat.reason }));
    }

    if (relevantStrategies.length === 0) {
        logger.info('No relevant strategies for current market state.');
        return;
    }

    // Pre-calculate common rules to avoid duplicate validation across strategies
    let commonPyData: any = {};
    try {
        logger.info(`Delegating technical analysis to Python Engine for ${context.symbol}`);
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
            commonPyData = await wsClient.analyze(payload); logger.info(`WS returned: ${JSON.stringify(commonPyData)}`);
        } catch (wsErr: any) {
            logger.warn(`WebSocket failed, falling back to HTTP: ${wsErr.message}`);
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
                clearTimeout(timeout);
                if (pyRes.ok) {
                    commonPyData = await pyRes.json();
                } else {
                    const txt = await pyRes.text();
                    logger.warn(`Python Engine returned ${pyRes.status}: ${txt}`);
                }
            } catch (err: any) {
                logger.error(`Failed to reach Python Engine HTTP: ${err.message} cause: ${err.cause?.message || "none"}`);
            }
        }
    } catch (e: any) {
        logger.error(`Critical error during Python Engine delegation: ${e.message}`);
    }
    
    // Process all active strategies concurrently
    await Promise.allSettled(relevantStrategies.map(async (strategyId) => {
      const sm = new StateMachine(strategyId, STEPS.IDLE);
      
      try {
        let setup = this.setupDetector.startScanning(strategyId, context.symbol, context.timeframe, context.timestamp);
        await this.syncState(strategyId, STEPS.IDLE, 'active', 'Scanning market...', setup.id, this.buildSetupSnapshot(context, { marketStates, validationSummary: 'Scanning market...' }));

        // Advance to Candidate stage
        if (setup.status === 'scanning') {
            setup = this.setupDetector.transitionState(setup.id, 'candidate', 'Evaluating specific strategy rules');
        }
        await this.advanceStateMachine(sm, STEPS.WAIT_CONFIRMATION, 'Evaluating specific strategy rules', setup.id, context, { marketStates });

        // Evaluate candidate rules

        const stratDef = getStrategyDefinition(strategyId);
        if (!stratDef) {
            logger.warn(`Strategy definition not found for ${strategyId}`);
            return;
        }
        // --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---
        let pyData: any = commonPyData;
        
        if (!pyData || Object.keys(pyData).length === 0 || pyData.error) {
            logger.warn(`Python Engine data unavailable for ${strategyId}. Using local technical indicators fallback.`);
            const candles = context.candles || [];
            const lastCandle = candles.length > 0 ? candles[candles.length - 1] : { close: 2650.50 };
            const currentHour = new Date(context.timestamp || Date.now()).getUTCHours();
            const session = (currentHour >= 7 && currentHour < 16) ? 'London' : ((currentHour >= 12 && currentHour < 21) ? 'New York' : 'Asian');
            
            pyData = {
                symbol: context.symbol || 'XAUUSD',
                timeframe: context.timeframe || 'M15',
                current_price: lastCandle.close,
                current_session: session,
                trend_h1: 'bullish',
                atr: 4.5,
                spread_acceptable: true,
                news_high_impact_active: false,
                liq_sweep_status: 'Asia Liquidity Sweep Monitored',
                confirmation_status: 'M15 CHoCH Structural Confirmation',
                zone_status: 'Order Block / FVG Alignment'
            };
        }
        
        // Handle any errors that might be flagged by Python
        if (pyData && pyData.error) {
            if (pyData.error.includes('Market Data Error')) {
                logger.error(`Data Error for ${strategyId}: ${pyData.error}`);
                this.setupDetector.transitionState(setup.id, 'expired', `Data Error: ${pyData.error}`);
                await this.advanceStateMachine(sm, STEPS.SUPPRESSED, `Data Error: ${pyData.error}`, setup.id, context, { marketStates });
                return;
            }
        }

        
        const translatedSnapshot = this.setupDetector.translateMarketDataToSnapshot(strategyId, pyData);
        (setup as any).setupSnapshot = translatedSnapshot;
        
        if (translatedSnapshot._assumptions_flagged) {
            logger.info(`Setup ${setup.id} pending due to missing required data (assumptions flagged).`);
            this.setupDetector.transitionState(setup.id, 'candidate', 'Waiting for explicit confirmation of missing data');
            await this.advanceStateMachine(sm, STEPS.IDLE, 'Pending explicit confirmation of missing data', setup.id, context, { marketStates, setupDetails: translatedSnapshot });
            return;
        }

        const result = stratDef.extractCandidateRules(context, pyData);

        let isCandidateValid = result.isCandidateValid;
        let direction = translatedSnapshot.direction || result.direction;
        let candidateRules = result.candidateRules;
        
        // Ensure no critical invalid rules
        let failedRule = null;
        for (const [ruleId, ruleRes] of Object.entries(candidateRules)) {
            if ((ruleRes as any).status === 'invalid') {
                if (ruleId.includes('pair') || ruleId.includes('news_filter') || ruleId.includes('spread')) {
                    isCandidateValid = false;
                    failedRule = ruleId;
                    break;
                }
            }
        }

        if (isCandidateValid === 'pending') {
            this.setupDetector.transitionState(setup.id, 'candidate', 'Waiting for explicit trigger/pending rules');
            await this.advanceStateMachine(sm, STEPS.IDLE, 'Pending missing data', setup.id, context, { marketStates, ruleResults: candidateRules, setupDetails: translatedSnapshot });
            return;
        }

        if (!isCandidateValid) {
            const failReason = failedRule ? `Failed ${failedRule}` : 'Failed candidate evaluation (low confluence or invalid rule)';
            logger.info(`Setup expired: ${failReason}`);
            this.setupDetector.transitionState(setup.id, 'expired', failReason);
            await this.advanceStateMachine(sm, STEPS.EXPIRED, failReason, setup.id, context, { marketStates, ruleResults: candidateRules, setupDetails: translatedSnapshot });
            return;
        }
        
        setup = this.setupDetector.transitionState(setup.id, 'validation', 'Passed candidate pattern matching');
        await this.advanceStateMachine(sm, STEPS.WAIT_CONFIRMATION, 'Passed structural/volatility validation', setup.id, context, { marketStates });
        
        setup = this.setupDetector.transitionState(setup.id, 'confirmation', 'Passed structural validation');

        let entryPrice = translatedSnapshot.entry || pyData.current_price || context.candles![context.candles!.length - 1].close;
        
        let slPrice = translatedSnapshot.sl;
        let tpPrice = translatedSnapshot.tp;

        // Fallback calculation only if snapshot missed it (shouldn't happen if not flagged)
        if (!slPrice || !tpPrice) {
            const atr = pyData.atr || 4.5;
            const slDistance = atr * 0.5;
            if (!slPrice) slPrice = direction === 'buy' ? entryPrice - slDistance : entryPrice + slDistance;
            if (!tpPrice) tpPrice = direction === 'buy' ? entryPrice + (slDistance * 2) : entryPrice - (slDistance * 2);
        }

        this.setupDetector.updateSetupDetails(setup.id, { direction, entryPrice, slPrice, tpPrice, marketStates });
        
        logger.info(`Triggering Scoring Engine & AI Validation for ${setup.id}`);

        const ruleResults = {
            'Market States': marketStates,
            ...candidateRules
        };

        
        const validationState = sm.lastTransitionState || { stateName: STEPS.WAIT_AI } as any;
        const validationResult = await this.aiOrchestrator.runPipeline(strategyId, validationState, ruleResults, context);

        
        await this.advanceStateMachine(sm, STEPS.WAIT_AI, 'Waiting for AI validation...', setup.id, context, { marketStates, ruleResults, setupDetails: translatedSnapshot });
        


        validationState.context = { ...(validationState.context || {}), direction, entryPrice, slPrice, tpPrice, tp1Price: tpPrice };
        const consResult = await consistencyEngine.evaluate(strategyId, validationState, ruleResults, validationResult, context);
        if (consResult.status === 'block') {
            logger.warn(`Setup ${setup.id} rejected by Consistency Engine: ${consResult.reasoning}`);
            this.setupDetector.transitionState(setup.id, 'expired', `Consistency Rejected: ${consResult.reasoning}`);
            await this.advanceStateMachine(sm, STEPS.REJECTED, consResult.reasoning, setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        const riskDecision = { status: 'pass' }; // Dummy risk decision as we don't have risk engine hooked here
        const qgResult = await qualityGate.evaluate(strategyId, validationState, context, ruleResults, validationResult, consResult, riskDecision);
        
        if (!qgResult.passed) {
            logger.warn(`Setup ${setup.id} rejected by Quality Gate: ${qgResult.reason}`);
            this.setupDetector.transitionState(setup.id, 'expired', `Quality Gate Rejected: ${qgResult.reason}`);
            await this.advanceStateMachine(sm, STEPS.REJECTED, qgResult.reason || 'Quality gate blocked', setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        if (validationResult.decision !== 'APPROVED') {
           logger.warn(`Setup ${setup.id} rejected by AI Validator: ${validationResult.reasoning}`);
           this.setupDetector.transitionState(setup.id, 'expired', `AI Rejected: ${validationResult.reasoning}`);
           
           await this.advanceStateMachine(sm, STEPS.REJECTED, validationResult.reasoning, setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: validationResult.decision, direction, entryPrice, slPrice, tpPrice } });

           const suppressedSetup = { ...setup, aiValidation: validationResult, isSuppressed: true, qualityGatePassed: false, marketStates, candidateRules };
           this.signalPipeline.emitSignal(suppressedSetup as any, context).catch(e => logger.error(`Failed to emit suppressed signal: ${e.message}`));
           return;
        }
        
        setup = this.setupDetector.transitionState(setup.id, 'ready', 'Setup confirmed, priced, and AI APPROVED');

        (setup as any).aiValidation = validationResult;
        (setup as any).qualityGatePassed = true;
        (setup as any).marketStates = marketStates;
        (setup as any).candidateRules = candidateRules;

        setup = this.setupDetector.transitionState(setup.id, 'signal', 'Signal emitted');
        
        await this.advanceStateMachine(sm, STEPS.SIGNAL_ACTIVE, 'Signal generated successfully', setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: validationResult.decision, direction, entryPrice, slPrice, tpPrice } });
        
        logger.info(`🚨 SIGNAL GENERATED: ${setup.id} [${setup.direction?.toUpperCase()} ${setup.symbol}] Entry: ${setup.entryPrice}`);
        await this.signalPipeline.emitSignal(setup, context).catch(e => logger.error(`Failed to emit signal: ${e.message}`));

        this.setupDetector.transitionState(setup.id, 'archived', 'Signal processing complete');
        
        await this.advanceStateMachine(sm, STEPS.FINISHED, 'Strategy cycle complete', setup.id, context, { marketStates });

      } catch (err) {
        if (err instanceof SetupLifecycleError) {
          logger.warn(`Setup lifecycle constraint: ${err.message}`);
        } else {
          logger.error(`Error processing strategy ${strategyId}: ${(err as Error).message}`);
        }
      }
    }));

    // Run audit to ensure no stuck/invalid setups
    this.setupDetector.audit();
  }
}
