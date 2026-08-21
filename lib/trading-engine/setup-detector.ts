import crypto from 'crypto';
import { RuleEvaluationContext, SetupStatus } from '@/types';
import { 
  OfficialSetupState, 
  SetupStepRecord, 
  StrategySetup, 
  SetupTransitionAudit, 
  DetectionSourceEvent 
} from './types';
import { instantiateStrategySteps } from './strategy-steps';
import { StepEvaluator, StepEvaluationOutput } from './step-evaluator';
import { logger } from '../utils/logger';

export class SetupLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupLifecycleError';
  }
}

export class SetupDetector {
  // Strategy-isolated setup stores
  private activeSetups: Map<string, StrategySetup> = new Map(); // Key: setup.id
  private strategySetupIndex: Map<string, string> = new Map(); // Key: `${strategyId}_${symbol}` -> setup.id
  private historySetups: Map<string, StrategySetup> = new Map(); // Key: setup.id

  /**
   * Generates a deterministic ID for a setup cycle.
   */
  public generateDeterministicId(strategyId: string, symbol: string, timeframe: string, timestamp: string): string {
    const dateObj = new Date(timestamp);
    // Group into 4-hour cycle buckets to prevent duplicate spam while allowing fresh setups per session cycle
    const cycleBucket = `${dateObj.getUTCFullYear()}-${dateObj.getUTCMonth() + 1}-${dateObj.getUTCDate()}_H${Math.floor(dateObj.getUTCHours() / 4)}`;
    const data = `${strategyId}_${symbol}_${timeframe}_${cycleBucket}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Clears setup strictly for a specific strategy without affecting other parallel strategies.
   */
  public clearStrategySetup(strategyId: string, symbol: string = 'XAUUSD') {
    const key = `${strategyId}_${symbol}`;
    const setupId = this.strategySetupIndex.get(key);
    if (setupId) {
      const setup = this.activeSetups.get(setupId);
      if (setup) {
        if (!['INVALIDATED', 'REJECTED', 'APPROVED', 'SIGNAL_ACTIVE', 'COMPLETED'].includes(setup.state)) {
          setup.state = 'EXPIRED';
        }
        this.historySetups.set(setupId, setup);
      }
      this.activeSetups.delete(setupId);
      this.strategySetupIndex.delete(key);
    }
  }

  public getLockedSetup(strategyId: string, symbol: string = 'XAUUSD'): StrategySetup | undefined {
    const key = `${strategyId}_${symbol}`;
    const setupId = this.strategySetupIndex.get(key);
    if (!setupId) return undefined;
    return this.activeSetups.get(setupId);
  }

  public getSetupById(id: string): StrategySetup | undefined {
    return this.activeSetups.get(id) || this.historySetups.get(id);
  }

  public getAllActiveSetups(): StrategySetup[] {
    return Array.from(this.activeSetups.values());
  }

  public getAllHistorySetups(): StrategySetup[] {
    return Array.from(this.historySetups.values());
  }

  /**
   * Restore setups from persistent database/cache storage upon restart.
   */
  public restoreFromStorage(storedSetups: StrategySetup[]) {
    if (!Array.isArray(storedSetups)) return;
    const now = Date.now();

    for (const setup of storedSetups) {
      if (!setup || !setup.id || !setup.strategy_id) continue;
      
      const expiryTime = new Date(setup.expires_at || setup.created_at).getTime();
      const isTerminal = ['APPROVED', 'SIGNAL_ACTIVE', 'REJECTED', 'INVALIDATED', 'EXPIRED', 'COMPLETED'].includes(setup.state);

      if (!isTerminal && expiryTime > now) {
        // Setup is still active and valid -> Restore into active scanning memory
        this.activeSetups.set(setup.id, setup);
        this.strategySetupIndex.set(`${setup.strategy_id}_${setup.symbol || 'XAUUSD'}`, setup.id);
        logger.info(`[SETUP RESTORED] Strategy ${setup.strategy_id} setup ${setup.id} restored at state ${setup.state} (Step ${setup.current_step_id})`);
      } else {
        this.historySetups.set(setup.id, setup);
      }
    }
  }

  /**
   * Starts or retrieves an active setup for a given strategy and symbol.
   */
  public startScanning(
    strategyId: string, 
    symbol: string = 'XAUUSD', 
    timeframe: string = 'M15', 
    timestamp: string = new Date().toISOString()
  ): StrategySetup {
    const key = `${strategyId}_${symbol}`;
    const existingSetupId = this.strategySetupIndex.get(key);
    const currentEvaluationTime = new Date(timestamp).getTime();

    if (existingSetupId) {
      const existing = this.activeSetups.get(existingSetupId);
      if (existing) {
        const expiryTime = new Date(existing.expires_at).getTime();
        const isTerminal = ['REJECTED', 'INVALIDATED', 'EXPIRED', 'COMPLETED'].includes(existing.state);

        if (!isTerminal && currentEvaluationTime <= expiryTime) {
          // Return active setup preserving all previously validated steps!
          return existing;
        } else {
          // Expire old setup and proceed to create a fresh one
          if (!isTerminal) {
            existing.state = 'EXPIRED';
          }
          this.historySetups.set(existing.id, existing);
          this.activeSetups.delete(existing.id);
          this.strategySetupIndex.delete(key);
        }
      }
    }

    const id = this.generateDeterministicId(strategyId, symbol, timeframe, timestamp);
    
    // Check if ID exists in active setups
    if (this.activeSetups.has(id)) {
      const existing = this.activeSetups.get(id)!;
      this.strategySetupIndex.set(key, id);
      return existing;
    }

    const steps = instantiateStrategySteps(strategyId, timestamp);
    const defaultExpiryMs = 4 * 60 * 60 * 1000; // 4 hours setup lifecycle default

    const newSetup: StrategySetup = {
      id,
      strategy_id: strategyId,
      symbol,
      timeframe,
      state: 'AWAITING',
      current_step_id: steps[0]?.step_id || 'LONDON_FILTER',
      current_step_order: 1,
      steps,
      created_at: timestamp,
      updated_at: timestamp,
      last_evaluated_at: timestamp,
      expires_at: new Date(new Date(timestamp).getTime() + defaultExpiryMs).toISOString(),
      validation_logs: [
        {
          from_state: 'AWAITING',
          to_state: 'AWAITING',
          step_id: steps[0]?.step_id,
          timestamp,
          reason: `Setup initiated in AWAITING state for strategy ${strategyId}`,
          source_event: 'system_init'
        }
      ]
    };

    this.activeSetups.set(id, newSetup);
    this.strategySetupIndex.set(key, id);

    logger.info(`[SETUP INITIATED] Strategy ${strategyId} started on ${symbol} (State: AWAITING, Step: ${newSetup.current_step_id})`);
    return newSetup;
  }

  /**
   * Sequentially evaluates the active setup's steps against fresh market data.
   * Continuous, non-blocking evaluation: AWAITING preserves the setup for future ticks.
   */
  public evaluateSetup(
    strategyId: string,
    context: RuleEvaluationContext,
    analysisData: Record<string, any>,
    sourceEvent: DetectionSourceEvent = 'candle_update'
  ): { setup: StrategySetup; newlyValidatedSteps: SetupStepRecord[]; isStateChanged: boolean } {
    const symbol = context.symbol || 'XAUUSD';
    const timeframe = context.timeframe || 'M15';
    const timestamp = context.timestamp || new Date().toISOString();
    const currentEvaluationTime = new Date(timestamp).getTime();

    const setup = this.startScanning(strategyId, symbol, timeframe, timestamp);
    setup.last_evaluated_at = timestamp;
    setup.updated_at = timestamp;

    let isStateChanged = false;
    const newlyValidatedSteps: SetupStepRecord[] = [];

    // Check expiration against evaluation time
    const expiryTime = new Date(setup.expires_at).getTime();
    if (currentEvaluationTime > expiryTime) {
      this.recordTransition(setup, 'EXPIRED', 'Setup expired: time limit exceeded', sourceEvent);
      this.clearStrategySetup(strategyId, symbol);
      return { setup, newlyValidatedSteps, isStateChanged: true };
    }

    // Step-by-step sequential evaluation loop
    let keepEvaluating = true;
    while (keepEvaluating && setup.current_step_order <= setup.steps.length) {
      const currentStep = setup.steps.find(s => s.step_order === setup.current_step_order);
      if (!currentStep) break;

      const priorSteps = setup.steps.filter(s => s.step_order < setup.current_step_order);
      
      const evalResult: StepEvaluationOutput = StepEvaluator.evaluateStep(
        currentStep,
        context,
        analysisData,
        priorSteps,
        setup.direction
      );

      currentStep.last_evaluated_timestamp = timestamp;
      currentStep.evidence = { ...currentStep.evidence, ...evalResult.evidence };

      if (evalResult.source_candle) {
        currentStep.source_candle = evalResult.source_candle;
      }
      if (evalResult.direction) {
        setup.direction = evalResult.direction;
      }
      if (evalResult.calculatedLevels) {
        setup.entry_price = evalResult.calculatedLevels.entryPrice;
        setup.sl_price = evalResult.calculatedLevels.slPrice;
        setup.tp1_price = evalResult.calculatedLevels.tp1Price;
        setup.tp2_price = evalResult.calculatedLevels.tp2Price;
        setup.tp3_price = evalResult.calculatedLevels.tp3Price;
        setup.risk_reward = evalResult.calculatedLevels.riskReward;
      }

      if (evalResult.status === 'VALIDATED') {
        currentStep.state = 'VALIDATED';
        currentStep.reason = evalResult.reason;
        newlyValidatedSteps.push({ ...currentStep });
        isStateChanged = true;

        logger.info(`[STEP VALIDATED] Strategy ${strategyId} Step ${currentStep.step_order} (${currentStep.step_id}) passed: ${evalResult.reason}`);

        // Advance to next step in sequence
        setup.current_step_order++;
        
        if (setup.current_step_order <= setup.steps.length) {
          const nextStep = setup.steps.find(s => s.step_order === setup.current_step_order)!;
          setup.current_step_id = nextStep.step_id;
          nextStep.state = 'ACTIVE';

          // Update overall setup state sequentially
          if (setup.state === 'AWAITING' && setup.current_step_order >= 2) {
            this.recordTransition(setup, 'DETECTED', `Initial filter/trend validated (${currentStep.step_id})`, sourceEvent, currentStep.step_id);
          } else if (setup.state === 'DETECTED' && setup.current_step_order >= 4) {
            this.recordTransition(setup, 'ACTIVE', `Core structural conditions confirmed through Step ${currentStep.step_order - 1}`, sourceEvent, currentStep.step_id);
          }
          // Continue loop to evaluate next newly active step immediately!
        } else {
          // All technical steps validated -> Move to VALIDATED / AI_PENDING
          this.recordTransition(setup, 'VALIDATED', 'All sequential strategy rules validated', sourceEvent, currentStep.step_id);
          keepEvaluating = false;
        }
      } else if (evalResult.status === 'AWAITING') {
        currentStep.state = 'AWAITING';
        currentStep.reason = evalResult.reason;
        
        // AWAITING preserves the setup and continues scanning on future ticks!
        logger.debug(`[STEP AWAITING] Strategy ${strategyId} Step ${currentStep.step_order} (${currentStep.step_id}) is awaiting: ${evalResult.reason}`);
        keepEvaluating = false;
      } else if (evalResult.status === 'INVALIDATED' || evalResult.status === 'REJECTED') {
        currentStep.state = evalResult.status;
        currentStep.reason = evalResult.reason;
        isStateChanged = true;

        const targetState = evalResult.status === 'INVALIDATED' ? 'INVALIDATED' : 'REJECTED';
        this.recordTransition(setup, targetState, evalResult.reason, sourceEvent, currentStep.step_id);
        this.clearStrategySetup(strategyId, symbol);
        keepEvaluating = false;
      }
    }

    return { setup, newlyValidatedSteps, isStateChanged };
  }

  /**
   * Records a deterministic state transition audit log.
   */
  public recordTransition(
    setup: StrategySetup,
    toState: OfficialSetupState,
    reason: string,
    sourceEvent: DetectionSourceEvent,
    stepId?: string,
    details?: Record<string, any>
  ): SetupTransitionAudit {
    const fromState = setup.state;
    setup.state = toState;
    setup.updated_at = new Date().toISOString();

    const audit: SetupTransitionAudit = {
      from_state: fromState,
      to_state: toState,
      step_id: stepId || setup.current_step_id,
      timestamp: setup.updated_at,
      reason,
      source_event: sourceEvent,
      details
    };

    setup.validation_logs.push(audit);
    logger.info(`[STATE TRANSITION] Setup ${setup.id} (${setup.strategy_id}): ${fromState} -> ${toState} | Reason: ${reason}`);
    return audit;
  }

  /**
   * Invalidate an active setup when market conditions invalidate the premise.
   */
  public invalidateSetup(strategyId: string, symbol: string = 'XAUUSD', reason: string): StrategySetup | undefined {
    const setup = this.getLockedSetup(strategyId, symbol);
    if (setup) {
      this.recordTransition(setup, 'INVALIDATED', reason, 'invalidation');
      this.clearStrategySetup(strategyId, symbol);
      return setup;
    }
    return undefined;
  }

  /**
   * Expire an active setup when timeout occurs.
   */
  public expireSetup(strategyId: string, symbol: string = 'XAUUSD', reason: string): StrategySetup | undefined {
    const setup = this.getLockedSetup(strategyId, symbol);
    if (setup) {
      this.recordTransition(setup, 'EXPIRED', reason, 'expiry');
      this.clearStrategySetup(strategyId, symbol);
      return setup;
    }
    return undefined;
  }

  /**
   * Backward compatibility bridge methods for existing callers.
   */
  public lockStrategySetup(strategyId: string, symbol: string, setup: any) {
    if (setup && setup.id) {
      this.activeSetups.set(setup.id, setup);
      this.strategySetupIndex.set(`${strategyId}_${symbol}`, setup.id);
    }
  }

  public transitionState(id: string, newState: SetupStatus | OfficialSetupState, details: string, _status: 'success' | 'failure' = 'success'): any {
    const setup = this.activeSetups.get(id) || this.historySetups.get(id);
    if (!setup) return { id, status: newState };

    let official: OfficialSetupState = 'ACTIVE';
    if (newState === 'scanning' || newState === 'AWAITING') official = 'AWAITING';
    else if (newState === 'candidate' || newState === 'DETECTED') official = 'DETECTED';
    else if (newState === 'validation' || newState === 'VALIDATED') official = 'VALIDATED';
    else if (newState === 'ready' || newState === 'APPROVED') official = 'APPROVED';
    else if (newState === 'signal' || newState === 'SIGNAL_ACTIVE') official = 'SIGNAL_ACTIVE';
    else if (newState === 'expired' || newState === 'EXPIRED') official = 'EXPIRED';
    else if (newState === 'archived' || newState === 'COMPLETED') official = 'COMPLETED';

    this.recordTransition(setup, official, details, 'candle_update');
    return setup;
  }

  public updateSetupDetails(id: string, details: Partial<StrategySetup>) {
    const setup = this.activeSetups.get(id);
    if (setup) {
      Object.assign(setup, details);
      setup.updated_at = new Date().toISOString();
    }
  }

  public translateMarketDataToSnapshot(strategyId: string, pyData: any, context: RuleEvaluationContext): any {
    const lastCandle = context.candles && context.candles.length > 0 ? context.candles[context.candles.length - 1] : null;
    const currentPrice = pyData.current_price || (lastCandle ? lastCandle.close : 2700);
    const atr = pyData.atr || 4.5;
    const trend = pyData.trend_h1 || pyData.trend || 'BULLISH';
    const direction = pyData.direction || (trend === 'BEARISH' ? 'sell' : 'buy');
    
    const riskDistance = atr * 0.5;
    const entry = pyData.entry || currentPrice;
    const sl = pyData.sl || (direction === 'buy' ? entry - riskDistance : entry + riskDistance);
    const tp = pyData.tp || (direction === 'buy' ? entry + (riskDistance * 2.0) : entry - (riskDistance * 2.0));

    return {
      strategyId,
      symbol: context.symbol || 'XAUUSD',
      timeframe: context.timeframe || 'M15',
      session: pyData.current_session || pyData.session || 'London',
      h1Trend: trend,
      direction,
      entry: +entry.toFixed(2),
      sl: +sl.toFixed(2),
      tp: +tp.toFixed(2),
      tp1: +tp.toFixed(2),
      rr: '1:2.0',
      atr14: atr,
      confirmationStatus: 'Evaluated Live'
    };
  }

  public audit(): Record<string, any> {
    return {
      activeSetupsCount: this.activeSetups.size,
      historySetupsCount: this.historySetups.size,
      activeByStrategy: Array.from(this.activeSetups.values()).map(s => ({
        id: s.id,
        strategy_id: s.strategy_id,
        state: s.state,
        current_step: s.current_step_id,
        step_order: s.current_step_order,
        updated_at: s.updated_at
      }))
    };
  }

  public reset() {
    this.activeSetups.clear();
    this.strategySetupIndex.clear();
    this.historySetups.clear();
  }
}
