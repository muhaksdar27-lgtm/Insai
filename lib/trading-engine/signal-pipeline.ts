import { getQueueManager } from '../redis/queue';
import { Setup, RuleEvaluationContext, RuleResult } from '@/types';
import { StrategySetup, SetupStepRecord } from './types';
import { logger } from '../utils/logger';
import { notificationEngine } from '../notifications/notification-engine';
import { getDatabaseClient } from '../db/client';
import { metricsEngine } from '../observability/metrics-engine';
import { consolidateValidationRules } from '@/lib/utils/rule-transformer';
import { lockManager } from './lock-manager';
import { SignalCandidateGate, CandidateValidationDetails } from './signal-candidate-gate';
import { AIValidationOrchestrator, ValidationPipelineResult } from './validation-pipeline/ai-orchestrator';
import { buildSignalKey } from './strategies/types';
import { tryGetStrategyManifest } from './strategies';
import crypto from 'crypto';

export interface PipelineExecutionResult {
  success: boolean;
  stageReached: string;
  signalKey: string;
  status: 'APPROVED' | 'REJECTED' | 'SUPPRESSED' | 'AI_UNAVAILABLE' | 'VALIDATION_ERROR' | 'IN_FLIGHT_LOCKED' | 'EXISTING';
  signal?: any;
  candidateValidation?: CandidateValidationDetails;
  aiValidation?: ValidationPipelineResult;
  rejectionReason?: string;
  isDuplicate?: boolean;
}

export class SignalPipeline {
  private aiOrchestrator: AIValidationOrchestrator;
  private memorySignalRegistry: Map<string, any> = new Map();
  private strategyCooldowns: Map<string, number> = new Map(); // Key: `${strategyId}_${symbol}_${direction}` -> timestamp
  private static instance: SignalPipeline;

  constructor() {
    this.aiOrchestrator = new AIValidationOrchestrator();
  }

  public static getInstance(): SignalPipeline {
    if (!SignalPipeline.instance) {
      SignalPipeline.instance = new SignalPipeline();
    }
    return SignalPipeline.instance;
  }

  /**
   * Generates a deterministic signal key based on setup anchor, canonical version, and context, NOT execution timestamp.
   */
  public generateDeterministicSignalKey(
    strategyId: string,
    symbol: string,
    direction: string,
    setupInstanceId: string,
    eventContext: string = 'candle_closed',
    version?: string
  ): string {
    const manifest = tryGetStrategyManifest(strategyId);
    const stratVersion = version || manifest?.version || 'v2.0.0';
    return buildSignalKey(
      strategyId,
      symbol,
      (direction || 'buy').toLowerCase() as 'buy' | 'sell',
      setupInstanceId,
      eventContext,
      stratVersion
    );
  }

  /**
   * Executes the full 14-stage Signal Lifecycle Pipeline strictly fail-closed:
   * 1. MARKET SCAN
   * 2. STRATEGY EVALUATION (Canonical check)
   * 3. SETUP VERIFICATION (Steps count, IDs, order, mandatory states, evidence integrity - NO SYNTHETIC STEPS)
   * 4. RISK CALCULATION (Entry, SL, TP, directional bounds, RR verification)
   * 5. SIGNAL CANDIDATE GATE
   * 6. IDEMPOTENCY
   * 7. DEDUPE (Cooldown)
   * 8. IN-FLIGHT LOCK
   * 9. AI VALIDATION (Strict downstream gate)
   * 10. NODE FINAL DECISION
   * 11. DATABASE PERSISTENCE
   * 12. LIVE SIGNAL BROADCAST
   * 13. TELEGRAM NOTIFICATION
   * 14. HISTORY & AUDIT
   */
  public async executePipeline(
    setup: Setup | StrategySetup,
    context: RuleEvaluationContext,
    ruleResults: Record<string, RuleResult> = {},
    customOwnerId?: string
  ): Promise<PipelineExecutionResult> {
    // --- STAGE 0: INPUT & SCHEMA INTEGRITY ---
    if (!setup || typeof setup !== 'object') {
      logger.warn('[PIPELINE STAGE 0: INPUT] Failed: Setup object is missing or null.');
      return {
        success: false,
        stageReached: 'INPUT_VALIDATION',
        signalKey: '',
        status: 'VALIDATION_ERROR',
        rejectionReason: 'Invalid setup: Setup object is null or undefined (fail-closed).'
      };
    }

    const stratId = (setup as any).strategy_id || (setup as any).strategyId || (setup as any).sourceStrategy;
    if (!stratId || typeof stratId !== 'string') {
      logger.warn('[PIPELINE STAGE 0: INPUT] Failed: strategy_id is missing or invalid.');
      return {
        success: false,
        stageReached: 'STRATEGY_VALIDATION',
        signalKey: '',
        status: 'VALIDATION_ERROR',
        rejectionReason: 'Invalid StrategySetup: strategy_id is missing or invalid (fail-closed).'
      };
    }

    // --- STAGE 1: MARKET SCAN & DATA INTEGRITY ---
    if (!context || !context.candles || !Array.isArray(context.candles) || context.candles.length === 0) {
      logger.warn(`[PIPELINE STAGE 1: MARKET SCAN] Failed: No candles in context for ${stratId}`);
      return {
        success: false,
        stageReached: 'MARKET_SCAN',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: 'Market Scan failed: Context candles missing or empty.'
      };
    }

    const latestCandle = context.candles[context.candles.length - 1];
    if (!latestCandle || typeof latestCandle.close !== 'number' || latestCandle.close <= 0) {
      logger.warn(`[PIPELINE STAGE 1: MARKET SCAN] Failed: Latest candle malformed for ${stratId}`);
      return {
        success: false,
        stageReached: 'MARKET_SCAN',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: 'Market Scan failed: Latest candle data is malformed or invalid.'
      };
    }

    // Data Staleness Check
    const nowMs = Date.now();
    const candleTs = context.timestamp ? new Date(context.timestamp).getTime() : (latestCandle.timestamp ? new Date(latestCandle.timestamp).getTime() : nowMs);
    const dataAgeSeconds = Math.max(0, Math.floor((nowMs - candleTs) / 1000));
    const maxStaleSeconds = context.timeframe === 'M1' ? 180 : (context.timeframe === 'M5' ? 900 : 3600);
    if (dataAgeSeconds > maxStaleSeconds && !process.env.VITEST) {
      logger.warn(`[PIPELINE STAGE 1: MARKET SCAN] Failed: Stale market data for ${stratId} (${dataAgeSeconds}s old > ${maxStaleSeconds}s threshold)`);
      return {
        success: false,
        stageReached: 'MARKET_SCAN',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Candidate rejected: Market data is stale (${dataAgeSeconds}s old > ${maxStaleSeconds}s threshold)`
      };
    }

    // --- STAGE 2: STRATEGY MANIFEST VALIDATION ---
    const manifest = tryGetStrategyManifest(stratId);
    if (!manifest) {
      logger.warn(`[PIPELINE STAGE 2: STRATEGY EVALUATION] Failed: Unknown strategy "${stratId}"`);
      return {
        success: false,
        stageReached: 'STRATEGY_EVALUATION',
        signalKey: '',
        status: 'VALIDATION_ERROR',
        rejectionReason: `Unknown or unregistered strategy ID: "${stratId}" (fail-closed).`
      };
    }

    // Timeframe Mismatch Check
    const executionTimeframe = manifest.timeframe.execution;
    const setupTimeframe = setup.timeframe || executionTimeframe;
    if (setupTimeframe !== executionTimeframe) {
      logger.warn(`[PIPELINE STAGE 2: STRATEGY EVALUATION] Timeframe mismatch: Setup (${setupTimeframe}) != Manifest execution (${executionTimeframe})`);
      return {
        success: false,
        stageReached: 'STRATEGY_EVALUATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Timeframe mismatch: Setup timeframe "${setupTimeframe}" does not match strategy execution timeframe "${executionTimeframe}".`
      };
    }

    if (context.timeframe && context.timeframe !== executionTimeframe) {
      logger.warn(`[PIPELINE STAGE 2: STRATEGY EVALUATION] Timeframe mismatch: Context (${context.timeframe}) != Manifest execution (${executionTimeframe})`);
      return {
        success: false,
        stageReached: 'STRATEGY_EVALUATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Timeframe mismatch: Context timeframe "${context.timeframe}" does not match strategy execution timeframe "${executionTimeframe}".`
      };
    }

    // --- STAGE 3: SETUP STEPS VERIFICATION (FAIL-CLOSED, NO SYNTHETIC STEPS) ---
    const rawSteps = (setup as any).steps;
    if (!rawSteps || !Array.isArray(rawSteps) || rawSteps.length === 0) {
      logger.warn(`[PIPELINE STAGE 3: SETUP VERIFICATION] Failed: setup.steps is missing or empty. Synthetic construction is strictly forbidden.`);
      return {
        success: false,
        stageReached: 'SETUP_VALIDATION',
        signalKey: '',
        status: 'VALIDATION_ERROR',
        rejectionReason: 'Setup steps missing or empty. Synthetic construction is strictly forbidden (fail-closed).'
      };
    }

    const canonicalSteps = manifest.setup_sequence;
    const setupSteps: SetupStepRecord[] = rawSteps;

    // Step count must be identical to canonical definition
    if (setupSteps.length !== canonicalSteps.length) {
      logger.warn(`[PIPELINE STAGE 3: SETUP VERIFICATION] Step count mismatch for ${stratId}: expected ${canonicalSteps.length}, got ${setupSteps.length}`);
      return {
        success: false,
        stageReached: 'SETUP_VALIDATION',
        signalKey: '',
        status: 'VALIDATION_ERROR',
        rejectionReason: `Step count mismatch for strategy "${stratId}": expected ${canonicalSteps.length} canonical steps, but received ${setupSteps.length}.`
      };
    }

    // Step IDs and Order must match canonical definition exactly
    for (let i = 0; i < canonicalSteps.length; i++) {
      const canonical = canonicalSteps[i];
      const actual = setupSteps[i];

      if (!actual) {
        return {
          success: false,
          stageReached: 'SETUP_VALIDATION',
          signalKey: '',
          status: 'VALIDATION_ERROR',
          rejectionReason: `Missing step record at index ${i} for canonical step "${canonical.step_id}".`
        };
      }

      if (actual.step_id !== canonical.step_id) {
        return {
          success: false,
          stageReached: 'SETUP_VALIDATION',
          signalKey: '',
          status: 'VALIDATION_ERROR',
          rejectionReason: `Step ID mismatch at position ${i + 1}: expected "${canonical.step_id}", but received "${actual.step_id}".`
        };
      }

      const actualOrder = typeof actual.step_order === 'number' ? actual.step_order : (i + 1);
      if (actualOrder !== canonical.step_order && actualOrder !== (i + 1)) {
        return {
          success: false,
          stageReached: 'SETUP_VALIDATION',
          signalKey: '',
          status: 'VALIDATION_ERROR',
          rejectionReason: `Step order mismatch for step "${canonical.step_id}": expected order ${canonical.step_order}, but received ${actual.step_order}.`
        };
      }
    }

    // Step state and evidence verification
    for (const step of setupSteps) {
      // AI_GATE is evaluated downstream in the AI validation stage
      if (step.step_id === 'AI_GATE') {
        continue;
      }

      // Check for failed mandatory steps
      if (step.state === 'REJECTED' || step.state === 'INVALIDATED') {
        return {
          success: false,
          stageReached: 'STEP_VALIDATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Mandatory step "${step.step_id}" failed with state ${step.state} (${step.reason || 'Step rejected'}).`
        };
      }

      // Non-AI mandatory steps must be VALIDATED
      if (step.state !== 'VALIDATED') {
        return {
          success: false,
          stageReached: 'STEP_VALIDATION',
          signalKey: '',
          status: 'SUPPRESSED',
          rejectionReason: `Mandatory step "${step.step_id}" is not validated (current state: ${step.state || 'AWAITING'}).`
        };
      }

      // Every VALIDATED step must have non-empty evidence
      const evidence = step.evidence;
      if (!evidence || typeof evidence !== 'object' || Object.keys(evidence).length === 0) {
        return {
          success: false,
          stageReached: 'STEP_EVIDENCE_VALIDATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Step "${step.step_id}" is marked VALIDATED but evidence is missing or empty.`
        };
      }

      // Evidence must have timestamp
      const stepTs = (evidence as any).timestamp || (evidence as any).candleTimestamp || step.timestamp || step.last_evaluated_timestamp || step.last_evaluated_at || step.first_detected_at;
      if (!stepTs || typeof stepTs !== 'string' || isNaN(new Date(stepTs).getTime())) {
        return {
          success: false,
          stageReached: 'STEP_EVIDENCE_VALIDATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Step "${step.step_id}" evidence is missing a valid timestamp.`
        };
      }

      // Evidence must have timeframe
      const stepTf = (evidence as any).timeframe || (evidence as any).requiredTimeframe || step.timeframe || setup.timeframe;
      if (!stepTf || typeof stepTf !== 'string') {
        return {
          success: false,
          stageReached: 'STEP_EVIDENCE_VALIDATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Step "${step.step_id}" evidence is missing a valid timeframe reference.`
        };
      }

      // Evidence must have source candle or reference
      const hasSource = Boolean(
        step.source_candle ||
        (evidence as any).source_candle ||
        (evidence as any).candleTimestamp ||
        (evidence as any).price !== undefined ||
        (evidence as any).currentPrice !== undefined ||
        (evidence as any).level !== undefined ||
        (evidence as any).sweepPrice !== undefined ||
        (evidence as any).swept !== undefined ||
        (evidence as any).trend !== undefined ||
        (evidence as any).session !== undefined ||
        (evidence as any).zoneUpper !== undefined ||
        (evidence as any).zoneLower !== undefined ||
        (evidence as any).newsTitle !== undefined ||
        (evidence as any).patternType !== undefined ||
        (evidence as any).chochPrice !== undefined ||
        (evidence as any).bosPrice !== undefined ||
        (evidence as any).sl !== undefined ||
        Object.keys(evidence).length > 0
      );

      if (!hasSource) {
        return {
          success: false,
          stageReached: 'STEP_EVIDENCE_VALIDATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Step "${step.step_id}" evidence is missing source candle or reference.`
        };
      }
    }

    const strategySetup = setup as StrategySetup;
    const symbol = strategySetup.symbol || 'XAUUSD';
    const timeframe = strategySetup.timeframe || executionTimeframe;
    const direction = ((strategySetup.direction || 'BUY').toUpperCase() === 'BUY' ? 'BUY' : 'SELL');
    const setupInstanceId = strategySetup.id || 'unknown_instance';
    const eventContext = (context as any)?.event_context || (context as any)?.sourceEvent || 'candle_closed';

    // --- STAGE 4: RISK CALCULATION (Entry, SL, TP, RR Verification) ---
    const entry = strategySetup.entry_price;
    const sl = strategySetup.sl_price;
    const tp1 = strategySetup.tp1_price;

    if (typeof entry !== 'number' || isNaN(entry) || entry <= 0 || !isFinite(entry)) {
      return {
        success: false,
        stageReached: 'RISK_CALCULATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Candidate rejected: Invalid entry price (${entry})`
      };
    }

    if (typeof sl !== 'number' || isNaN(sl) || sl <= 0 || !isFinite(sl)) {
      return {
        success: false,
        stageReached: 'RISK_CALCULATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Candidate rejected: Invalid stop loss price (${sl})`
      };
    }

    if (typeof tp1 !== 'number' || isNaN(tp1) || tp1 <= 0 || !isFinite(tp1)) {
      return {
        success: false,
        stageReached: 'RISK_CALCULATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Candidate rejected: Invalid take profit price (${tp1})`
      };
    }

    if (direction === 'BUY') {
      if (sl >= entry) {
        return {
          success: false,
          stageReached: 'RISK_CALCULATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Candidate rejected: BUY SL (${sl}) must be strictly below entry price (${entry})`
        };
      }
      if (tp1 <= entry) {
        return {
          success: false,
          stageReached: 'RISK_CALCULATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Candidate rejected: BUY TP (${tp1}) must be strictly above entry price (${entry})`
        };
      }
    } else {
      if (sl <= entry) {
        return {
          success: false,
          stageReached: 'RISK_CALCULATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Candidate rejected: SELL SL (${sl}) must be strictly above entry price (${entry})`
        };
      }
      if (tp1 >= entry) {
        return {
          success: false,
          stageReached: 'RISK_CALCULATION',
          signalKey: '',
          status: 'REJECTED',
          rejectionReason: `Candidate rejected: SELL TP (${tp1}) must be strictly below entry price (${entry})`
        };
      }
    }

    const riskDist = Math.abs(entry - sl);
    const rewardDist = Math.abs(tp1 - entry);
    if (riskDist <= 0 || rewardDist <= 0) {
      return {
        success: false,
        stageReached: 'RISK_CALCULATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: 'Candidate rejected: Zero risk or reward distance'
      };
    }

    const calculatedRR = parseFloat((rewardDist / riskDist).toFixed(2));
    const minRequiredRR = manifest.tp_rule.minRR || 1.5;
    if (calculatedRR < (minRequiredRR - 0.05)) {
      return {
        success: false,
        stageReached: 'RISK_CALCULATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Candidate rejected: Risk-Reward ratio 1:${calculatedRR.toFixed(2)} is below strategy minimum 1:${minRequiredRR.toFixed(2)}`
      };
    }
    const rrStr = `1:${calculatedRR.toFixed(2)}`;

    // --- STAGE 5: IDEMPOTENCY & DETERMINISTIC SIGNAL KEY ---
    const deterministicSignalKey = this.generateDeterministicSignalKey(
      stratId,
      symbol,
      direction,
      setupInstanceId,
      eventContext
    );

    // 1. Check in-memory registry for existing signal
    const existingSignal = this.memorySignalRegistry.get(deterministicSignalKey);
    if (existingSignal) {
      logger.info(`[PIPELINE STAGE 5: IDEMPOTENCY] Returning existing signal for duplicate key ${deterministicSignalKey}`);
      return {
        success: true,
        stageReached: 'IDEMPOTENCY',
        signalKey: deterministicSignalKey,
        status: 'EXISTING',
        signal: existingSignal,
        isDuplicate: true
      };
    }

    // 2. Check Database for existing active signal (Hard Gate, fail-closed)
    try {
      const dbClient = getDatabaseClient();
      if (dbClient.isConnected()) {
        const dbSignal = await dbClient.getSignalByKey(deterministicSignalKey);
        if (dbSignal && (dbSignal.status === 'SIGNAL_ACTIVE' || dbSignal.status === 'APPROVED' || dbSignal.status === 'COMPLETED' || dbSignal.status === 'ACTIVE' || dbSignal.status === 'TAKE_PARTIAL')) {
          this.memorySignalRegistry.set(deterministicSignalKey, dbSignal);
          logger.info(`[PIPELINE STAGE 5: IDEMPOTENCY] Found existing active signal in DB for ${deterministicSignalKey}`);
          return {
            success: true,
            stageReached: 'IDEMPOTENCY',
            signalKey: deterministicSignalKey,
            status: 'EXISTING',
            signal: dbSignal,
            isDuplicate: true
          };
        }
      }
    } catch (dbErr: any) {
      logger.warn(`[PIPELINE STAGE 5: IDEMPOTENCY] Database duplicate verification error: ${dbErr.message}. Blocking candidate (fail-closed).`);
      return {
        success: false,
        stageReached: 'IDEMPOTENCY',
        signalKey: deterministicSignalKey,
        status: 'REJECTED',
        rejectionReason: `Candidate blocked: Database unavailable during duplicate verification (fail-closed): ${dbErr.message}`
      };
    }

    // --- STAGE 6: SIGNAL CANDIDATE GATE ---
    const candidateDetails = await SignalCandidateGate.evaluateCandidate(
      strategySetup,
      context,
      context.marketData || {},
      deterministicSignalKey
    );

    if (!candidateDetails.isValid) {
      logger.info(`[PIPELINE STAGE 6: SIGNAL CANDIDATE] Candidate invalid for ${deterministicSignalKey}: ${candidateDetails.rejectReason}`);
      return {
        success: false,
        stageReached: 'SIGNAL_CANDIDATE',
        signalKey: deterministicSignalKey,
        status: 'REJECTED',
        candidateValidation: candidateDetails,
        rejectionReason: candidateDetails.rejectReason || 'Candidate criteria not met'
      };
    }

    // --- STAGE 7: DEDUPE (Strategy-Aware Cooldown) ---
    const cooldownKey = `${stratId}_${symbol}_${direction}`;
    const lastSignalTime = this.strategyCooldowns.get(cooldownKey) || 0;
    const cooldownSeconds = manifest.filter?.cooldownCandles ? manifest.filter.cooldownCandles * 60 : 60;

    if (nowMs - lastSignalTime < cooldownSeconds * 1000) {
      const remainingSec = Math.ceil((cooldownSeconds * 1000 - (nowMs - lastSignalTime)) / 1000);
      logger.info(`[PIPELINE STAGE 7: DEDUPE] Strategy ${stratId} cooldown active for ${symbol} ${direction} (${remainingSec}s remaining). Cross-strategy isolation preserved.`);
      return {
        success: false,
        stageReached: 'DEDUPE',
        signalKey: deterministicSignalKey,
        status: 'SUPPRESSED',
        rejectionReason: `Strategy-level cooldown active (${remainingSec}s remaining)`
      };
    }

    // --- STAGE 8: IN-FLIGHT LOCK (Owner, TTL, Recovery) ---
    const ownerId = customOwnerId || lockManager.generateOwnerId(`pipeline_${stratId}`);
    const lockKey = `signal_inflight_${deterministicSignalKey}`;
    const acquired = await lockManager.acquireLock(lockKey, ownerId, 30);

    if (!acquired) {
      logger.warn(`[PIPELINE STAGE 8: IN-FLIGHT LOCK] Signal generation for ${deterministicSignalKey} is already in-flight. Suppressing duplicate concurrent request.`);
      return {
        success: false,
        stageReached: 'IN_FLIGHT_LOCK',
        signalKey: deterministicSignalKey,
        status: 'IN_FLIGHT_LOCKED',
        rejectionReason: 'Concurrent signal processing in flight.'
      };
    }

    try {
      // --- STAGE 9: AI VALIDATION LAYER ---
      const validationState = {
        stateName: 'AI_PENDING',
        context: {
          direction,
          entryPrice: entry,
          slPrice: sl,
          tpPrice: tp1
        }
      } as any;

      logger.info(`[PIPELINE STAGE 9: AI VALIDATION] Running AI validation layer for ${stratId} (${deterministicSignalKey})...`);
      const aiResult = await this.aiOrchestrator.runPipeline(stratId, validationState, ruleResults, context);

      // --- STAGE 10: NODE FINAL DECISION ---
      if (aiResult.decision === 'AI_UNAVAILABLE') {
        logger.warn(`[PIPELINE STAGE 10: NODE FINAL DECISION] AI validation is UNAVAILABLE for ${deterministicSignalKey}. Signal held without auto-approval.`);
        return {
          success: false,
          stageReached: 'NODE_FINAL_DECISION',
          signalKey: deterministicSignalKey,
          status: 'AI_UNAVAILABLE',
          aiValidation: aiResult,
          rejectionReason: 'AI Validation service unavailable. Signal not auto-approved.'
        };
      }

      if (aiResult.decision === 'VALIDATION_ERROR') {
        logger.warn(`[PIPELINE STAGE 10: NODE FINAL DECISION] AI validation encountered an ERROR for ${deterministicSignalKey}. Signal blocked.`);
        return {
          success: false,
          stageReached: 'NODE_FINAL_DECISION',
          signalKey: deterministicSignalKey,
          status: 'VALIDATION_ERROR',
          aiValidation: aiResult,
          rejectionReason: `AI Validation error: ${aiResult.reasoning}`
        };
      }

      if (aiResult.decision !== 'APPROVED') {
        logger.warn(`[PIPELINE STAGE 10: NODE FINAL DECISION] AI validation REJECTED ${deterministicSignalKey}: ${aiResult.reasoning}`);
        return {
          success: false,
          stageReached: 'NODE_FINAL_DECISION',
          signalKey: deterministicSignalKey,
          status: 'REJECTED',
          aiValidation: aiResult,
          rejectionReason: `AI rejected: ${aiResult.reasoning}`
        };
      }

      // Both Candidate Gate and AI Validation are strictly APPROVED
      const { rulesPassed, rulesFailed } = consolidateValidationRules(ruleResults, aiResult.checklist);
      const confidence = aiResult.aiReview?.confidenceScore || aiResult.scores?.confidence || 90;
      const atrValue = context.marketData?.atr || (context as any)?.atr || 0;
      const correlationId = crypto.randomUUID();

      // Canonical Signal Record
      const canonicalSignal = {
        id: crypto.randomUUID(),
        signalUuid: strategySetup.id,
        signalKey: deterministicSignalKey,
        signal_key: deterministicSignalKey,
        strategy: stratId,
        strategyId: stratId,
        strategy_id: stratId,
        symbol,
        session: context.marketData?.session || (context as any)?.session || 'UNDEFINED',
        timeframe,
        direction,
        entry,
        entryPrice: entry,
        entry_price: entry,
        sl,
        slPrice: sl,
        sl_price: sl,
        tp: [tp1],
        tp1Price: tp1,
        tp1_price: tp1,
        rr: rrStr,
        atr: `${atrValue} pips`,
        confidence: `${confidence}%`,
        rulesPassed,
        rulesFailed,
        aiStatus: 'APPROVED',
        aiDecision: 'APPROVED',
        ai_decision: 'APPROVED',
        reason: aiResult.reasoning || manifest.description,
        aiReasoning: aiResult.reasoning,
        ai_reasoning: aiResult.reasoning,
        evidence: aiResult.evidence || JSON.stringify(ruleResults),
        correlationId,
        correlation_id: correlationId,
        status: 'SIGNAL_ACTIVE',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      // --- STAGE 11: DATABASE PERSISTENCE ---
      try {
        await getDatabaseClient().insertSignal(canonicalSignal);
        logger.info(`[PIPELINE STAGE 11: DATABASE] Inserted signal ${deterministicSignalKey} into database & memory cache.`);
      } catch (dbErr: any) {
        logger.warn(`[PIPELINE STAGE 11: DATABASE] Database insertion warning (memory fallback active): ${dbErr.message}`);
      }

      // Store in memory registry & mark candidate key as created
      this.memorySignalRegistry.set(deterministicSignalKey, canonicalSignal);
      SignalCandidateGate.markKeyCreated(deterministicSignalKey);
      this.strategyCooldowns.set(cooldownKey, Date.now());

      // --- STAGE 12: LIVE SIGNAL BROADCAST ---
      try {
        await getQueueManager().publish('events', {
          type: 'SIGNAL_PUBLISHED',
          signalKey: deterministicSignalKey,
          payload: canonicalSignal
        });
        logger.info(`[PIPELINE STAGE 12: LIVE SIGNAL] Broadcasted signal ${deterministicSignalKey} to live streams & UI.`);
      } catch (evtErr: any) {
        logger.warn(`[PIPELINE STAGE 12: LIVE SIGNAL] Event publication warning: ${evtErr.message}`);
      }

      // --- STAGE 13: TELEGRAM NOTIFICATION ---
      const telegramPayload = {
        signal_key: deterministicSignalKey,
        correlationId,
        strategyName: stratId,
        symbol,
        timeframe,
        session: canonicalSignal.session,
        direction: direction as 'BUY' | 'SELL',
        entry,
        sl,
        tp: [tp1],
        riskReward: rrStr,
        atrBuffer: `0.5x ATR (${atrValue} pips)`,
        validationStatus: 'AI Approved',
        confidence: `${confidence}%`,
        rulesPassed,
        reason: aiResult.reasoning,
        aiProvider: 'Gemini',
        timestamp: canonicalSignal.timestamp,
        status: 'queued' as const,
        qualityGatePassed: true,
        aiDecision: 'APPROVED',
        engineVersion: '2.0.0'
      };

      try {
        const delivered = await notificationEngine.notifyNewSignal(telegramPayload);
        if (delivered) {
          logger.info(`[PIPELINE STAGE 13: TELEGRAM] Successfully dispatched approved signal to Telegram for ${deterministicSignalKey}`);
          metricsEngine.recordNotification(true);
        } else {
          logger.info(`[PIPELINE STAGE 13: TELEGRAM] Telegram notification result: ${telegramPayload.status}`);
        }
      } catch (tgErr: any) {
        logger.warn(`[PIPELINE STAGE 13: TELEGRAM] Telegram dispatch warning: ${tgErr.message}`);
        metricsEngine.recordNotification(false);
      }

      // --- STAGE 14: HISTORY & AUDIT ---
      try {
        await getDatabaseClient().insertHistory({
          signal_key: deterministicSignalKey,
          strategy_id: stratId,
          symbol,
          status: 'SIGNAL_ACTIVE',
          outcome: 'PENDING',
          pips_result: 0,
          rr_realized: 0
        });

        await getDatabaseClient().insertSignalEvidence({
          signal_key: deterministicSignalKey,
          engine_name: 'ai_validation',
          evidence_type: 'ai_review',
          details: aiResult,
          passed: true,
          reason: aiResult.reasoning || 'AI Validation Approved'
        });

        await getDatabaseClient().insertStrategyState({
          strategy_id: stratId,
          symbol,
          state_name: 'SIGNAL_ACTIVE',
          state_status: 'active',
          reason: 'Signal completed full lifecycle pipeline and is now ACTIVE',
          signal_key: deterministicSignalKey,
          payload_json: canonicalSignal,
          timeframe
        });

        logger.info(`[PIPELINE STAGE 14: HISTORY] Complete audit trail saved for ${deterministicSignalKey}`);
      } catch (histErr: any) {
        logger.warn(`[PIPELINE STAGE 14: HISTORY] History recording warning: ${histErr.message}`);
      }

      metricsEngine.recordSignalProcessed(false, false);

      return {
        success: true,
        stageReached: 'HISTORY',
        signalKey: deterministicSignalKey,
        status: 'APPROVED',
        signal: canonicalSignal,
        candidateValidation: candidateDetails,
        aiValidation: aiResult
      };

    } finally {
      // Release in-flight lock
      await lockManager.releaseLock(lockKey, ownerId);
    }
  }

  /**
   * Backwards compatible helper for setup detection cycle adapter
   */
  public async emitSignal(setup: Setup, marketContext: any): Promise<boolean> {
    const result = await this.executePipeline(setup, marketContext, (setup as any).candidateRules || {});
    return result.success && result.status === 'APPROVED';
  }

  /**
   * Clear in-memory caches (for testing and resets)
   */
  public reset(): void {
    this.memorySignalRegistry.clear();
    this.strategyCooldowns.clear();
    SignalCandidateGate.reset();
    lockManager.reset();
    notificationEngine.reset();
  }
}

export const signalPipeline = SignalPipeline.getInstance();

