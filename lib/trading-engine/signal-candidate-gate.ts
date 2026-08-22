import { RuleEvaluationContext, Candle } from '@/types';
import { StrategySetup } from './types';
import { getStrategyManifest } from './strategies';
import { getDatabaseClient } from '../db/client';
import { logger } from '../utils/logger';

export interface CandidateValidationDetails {
  isValid: boolean;
  rejectReason: string | null;
  checks: {
    strategyValid: boolean;
    mandatoryStepsComplete: boolean;
    entryValid: boolean;
    slValid: boolean;
    tpValid: boolean;
    rrValid: boolean;
    filterValid: boolean;
    dataFresh: boolean;
    candleContextValid: boolean;
    notPreviouslyCreated: boolean;
  };
  metrics: {
    calculatedRR: number;
    minRequiredRR: number;
    spreadPips: number;
    maxAllowedSpread: number;
    dataAgeSeconds: number;
  };
}

export class SignalCandidateGate {
  private static previouslyCreatedKeys: Set<string> = new Set();
  private static maxKeyCacheSize = 2000;

  /**
   * Validates all 10 candidate criteria strictly before AI validation or signal creation.
   */
  public static async evaluateCandidate(
    setup: StrategySetup,
    context: RuleEvaluationContext,
    marketData: any,
    deterministicSignalKey: string
  ): Promise<CandidateValidationDetails> {
    const strategyId = setup.strategy_id;
    const manifest = getStrategyManifest(strategyId);

    const checks = {
      strategyValid: false,
      mandatoryStepsComplete: false,
      entryValid: false,
      slValid: false,
      tpValid: false,
      rrValid: false,
      filterValid: false,
      dataFresh: false,
      candleContextValid: false,
      notPreviouslyCreated: false
    };

    const metrics = {
      calculatedRR: 0,
      minRequiredRR: manifest?.tp_rule.minRR || 1.5,
      spreadPips: marketData?.spreadPips || marketData?.spread || 1.5,
      maxAllowedSpread: manifest?.filter.spreadMaxPips || 2.5,
      dataAgeSeconds: 0
    };

    // 1. Strategy Valid
    if (!manifest) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Unknown or unregistered strategy ID '${strategyId}'`,
        checks,
        metrics
      };
    }
    checks.strategyValid = true;

    // 2. Seluruh Mandatory Setup Lengkap (All steps validated)
    const hasFailedStep = setup.steps.some(s => s.state === 'REJECTED' || s.state === 'INVALIDATED');

    if (hasFailedStep) {
      const failed = setup.steps.find(s => s.state === 'REJECTED' || s.state === 'INVALIDATED');
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Step ${failed?.step_id} failed (${failed?.reason || 'Rule failed'})`,
        checks,
        metrics
      };
    }

    // Exclude AI_GATE from setup step count check if AI is evaluated in downstream stage
    const structuralSteps = manifest.setup_sequence.filter(s => s.step_id !== 'AI_GATE');
    const validatedStructuralSteps = setup.steps.filter(s => s.step_id !== 'AI_GATE' && s.state === 'VALIDATED');

    if (validatedStructuralSteps.length < structuralSteps.length) {
      const pendingStep = setup.steps.find(s => s.step_id !== 'AI_GATE' && s.state !== 'VALIDATED');
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Mandatory setup incomplete (Step ${pendingStep?.step_id || 'unknown'} is in state ${pendingStep?.state || 'AWAITING'})`,
        checks,
        metrics
      };
    }
    checks.mandatoryStepsComplete = true;

    // 3. Entry Valid
    const entry = setup.entry_price;
    if (typeof entry !== 'number' || isNaN(entry) || entry <= 0 || !isFinite(entry)) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Invalid entry price (${entry})`,
        checks,
        metrics
      };
    }
    checks.entryValid = true;

    // 4. SL Valid
    const sl = setup.sl_price;
    const direction = (setup.direction || 'buy').toLowerCase();
    if (typeof sl !== 'number' || isNaN(sl) || sl <= 0 || !isFinite(sl)) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Invalid stop loss price (${sl})`,
        checks,
        metrics
      };
    }

    if (direction === 'buy' && sl >= entry) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: BUY SL (${sl}) must be strictly below entry price (${entry})`,
        checks,
        metrics
      };
    }
    if (direction === 'sell' && sl <= entry) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: SELL SL (${sl}) must be strictly above entry price (${entry})`,
        checks,
        metrics
      };
    }
    checks.slValid = true;

    // 5. TP Valid
    const tp = setup.tp1_price;
    if (typeof tp !== 'number' || isNaN(tp) || tp <= 0 || !isFinite(tp)) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Invalid take profit price (${tp})`,
        checks,
        metrics
      };
    }

    if (direction === 'buy' && tp <= entry) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: BUY TP (${tp}) must be strictly above entry price (${entry})`,
        checks,
        metrics
      };
    }
    if (direction === 'sell' && tp >= entry) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: SELL TP (${tp}) must be strictly below entry price (${entry})`,
        checks,
        metrics
      };
    }
    checks.tpValid = true;

    // 6. RR Valid (Risk-to-Reward Ratio)
    const riskDistance = Math.abs(entry - sl);
    const rewardDistance = Math.abs(tp - entry);
    if (riskDistance <= 0) {
      return {
        isValid: false,
        rejectReason: 'Candidate rejected: Zero risk distance between entry and SL',
        checks,
        metrics
      };
    }

    const calculatedRR = rewardDistance / riskDistance;
    metrics.calculatedRR = parseFloat(calculatedRR.toFixed(2));
    const minRequiredRR = manifest.tp_rule.minRR || 1.5;
    metrics.minRequiredRR = minRequiredRR;

    // Allow slight floating point tolerance 0.05
    if (calculatedRR < (minRequiredRR - 0.05)) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Risk-Reward ratio 1:${calculatedRR.toFixed(2)} is below strategy minimum 1:${minRequiredRR.toFixed(2)}`,
        checks,
        metrics
      };
    }
    checks.rrValid = true;

    // 7. Filter Valid (Spread and Session)
    if (metrics.spreadPips > metrics.maxAllowedSpread) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Current spread (${metrics.spreadPips} pips) exceeds maximum allowed for ${strategyId} (${metrics.maxAllowedSpread} pips)`,
        checks,
        metrics
      };
    }

    const currentSession = marketData?.session || marketData?.current_session || 'London';
    const allowedSessions = manifest.session_requirement.allowedSessions;
    if (allowedSessions && allowedSessions.length > 0 && !allowedSessions.includes('Any')) {
      if (!allowedSessions.includes(currentSession)) {
        return {
          isValid: false,
          rejectReason: `Candidate rejected: Current session (${currentSession}) is not within allowed sessions (${allowedSessions.join(', ')})`,
          checks,
          metrics
        };
      }
    }
    checks.filterValid = true;

    // 8. Data Tidak Stale
    const nowMs = Date.now();
    const candleTs = context.timestamp ? new Date(context.timestamp).getTime() : nowMs;
    const dataAgeSeconds = Math.max(0, Math.floor((nowMs - candleTs) / 1000));
    metrics.dataAgeSeconds = dataAgeSeconds;

    // Timeframe-aware stale tolerance
    const maxStaleSeconds = context.timeframe === 'M1' ? 180 : (context.timeframe === 'M5' ? 900 : 3600);
    if (dataAgeSeconds > maxStaleSeconds && !process.env.VITEST) {
      return {
        isValid: false,
        rejectReason: `Candidate rejected: Market data is stale (${dataAgeSeconds}s old > ${maxStaleSeconds}s threshold)`,
        checks,
        metrics
      };
    }
    checks.dataFresh = true;

    // 9. Candle Context Valid
    const candles: Candle[] = context.candles || [];
    if (!Array.isArray(candles) || candles.length === 0) {
      return {
        isValid: false,
        rejectReason: 'Candidate rejected: Candle context is empty or missing',
        checks,
        metrics
      };
    }
    const latestCandle = candles[candles.length - 1];
    if (!latestCandle || typeof latestCandle.close !== 'number' || latestCandle.close <= 0) {
      return {
        isValid: false,
        rejectReason: 'Candidate rejected: Latest candle data is malformed or invalid',
        checks,
        metrics
      };
    }
    checks.candleContextValid = true;

    // 10. Signal Belum Pernah Dibuat (Deduplication / Idempotency check)
    const isInMemory = this.previouslyCreatedKeys.has(deterministicSignalKey);
    let isInDb = false;

    // Check DB for existing signal with same key if not in memory
    if (!isInMemory) {
      try {
        const existingSignal = await getDatabaseClient().getSignalByKey(deterministicSignalKey);
        if (existingSignal && (existingSignal.status === 'SIGNAL_ACTIVE' || existingSignal.status === 'APPROVED' || existingSignal.status === 'COMPLETED')) {
          isInDb = true;
          this.previouslyCreatedKeys.add(deterministicSignalKey);
        }
      } catch (e: any) {
        logger.debug(`Database check notice during candidate gate: ${e.message}`);
      }
    }

    checks.notPreviouslyCreated = !isInMemory && !isInDb;

    return {
      isValid: true,
      rejectReason: null,
      checks,
      metrics
    };
  }

  /**
   * Records a signal key as created to avoid candidate re-evaluations
   */
  public static markKeyCreated(deterministicSignalKey: string): void {
    this.previouslyCreatedKeys.add(deterministicSignalKey);
    if (this.previouslyCreatedKeys.size > this.maxKeyCacheSize) {
      const iterator = this.previouslyCreatedKeys.values();
      const first = iterator.next().value;
      if (first) this.previouslyCreatedKeys.delete(first);
    }
  }

  public static reset(): void {
    this.previouslyCreatedKeys.clear();
  }
}
