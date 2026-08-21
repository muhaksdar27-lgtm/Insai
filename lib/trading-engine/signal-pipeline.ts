import { getQueueManager } from '../redis/queue';
import { Setup, RuleEvaluationContext, RuleResult } from '@/types';
import { StrategySetup } from './types';
import { logger } from '../utils/logger';
import { notificationEngine } from '../notifications/notification-engine';
import { getDatabaseClient } from '../db/client';
import { metricsEngine } from '../observability/metrics-engine';
import { consolidateValidationRules } from '@/lib/utils/rule-transformer';
import { lockManager } from './lock-manager';
import { SignalCandidateGate, CandidateValidationDetails } from './signal-candidate-gate';
import { AIValidationOrchestrator, ValidationPipelineResult } from './validation-pipeline/ai-orchestrator';
import { buildSignalKey } from './strategies/types';
import { getStrategyManifest } from './strategies';
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
   * Generates a deterministic signal key based on setup anchor and context, NOT execution timestamp.
   */
  public generateDeterministicSignalKey(
    strategyId: string,
    symbol: string,
    direction: string,
    setupInstanceId: string,
    eventContext: string = 'candle_closed'
  ): string {
    return buildSignalKey(
      strategyId,
      symbol,
      (direction || 'buy').toLowerCase() as 'buy' | 'sell',
      setupInstanceId,
      eventContext
    );
  }

  /**
   * Executes the full 14-stage Signal Lifecycle Pipeline strictly:
   * 1. MARKET SCAN
   * 2. STRATEGY EVALUATION
   * 3. SETUP COMPLETE
   * 4. RISK CALCULATION
   * 5. SIGNAL CANDIDATE
   * 6. IDEMPOTENCY
   * 7. DEDUPE
   * 8. IN-FLIGHT LOCK
   * 9. AI VALIDATION
   * 10. NODE FINAL DECISION
   * 11. DATABASE
   * 12. LIVE SIGNAL
   * 13. TELEGRAM
   * 14. HISTORY
   */
  public async executePipeline(
    setup: Setup | StrategySetup,
    context: RuleEvaluationContext,
    ruleResults: Record<string, RuleResult> = {},
    customOwnerId?: string
  ): Promise<PipelineExecutionResult> {
    const stratId = (setup as any).sourceStrategy || (setup as any).strategy_id || 'strategy-1-smc';
    const symbol = setup.symbol || 'XAUUSD';
    const timeframe = setup.timeframe || 'M15';
    const direction = ((setup.direction || 'BUY').toUpperCase() === 'BUY' ? 'BUY' : 'SELL');
    const setupInstanceId = setup.id || 'unknown_instance';
    const eventContext = (context as any)?.event_context || (context as any)?.sourceEvent || 'candle_closed';

    // --- STAGE 1: MARKET SCAN VALIDATION ---
    if (!context || !context.candles || context.candles.length === 0) {
      logger.warn(`[PIPELINE STAGE 1: MARKET SCAN] Failed: No candles in context for ${stratId} ${symbol}`);
      return {
        success: false,
        stageReached: 'MARKET_SCAN',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: 'Market Scan failed: Context candles missing or empty.'
      };
    }

    // --- STAGE 2 & 3: STRATEGY EVALUATION & SETUP COMPLETE ---
    const manifest = getStrategyManifest(stratId);
    if (!manifest) {
      logger.warn(`[PIPELINE STAGE 2: STRATEGY EVALUATION] Failed: Unknown strategy ${stratId}`);
      return {
        success: false,
        stageReached: 'STRATEGY_EVALUATION',
        signalKey: '',
        status: 'REJECTED',
        rejectionReason: `Unknown strategy ID: ${stratId}`
      };
    }

    // Convert setup format if needed
    const strategySetup: StrategySetup = (setup as any).steps ? (setup as StrategySetup) : {
      id: setup.id,
      strategy_id: stratId,
      symbol,
      timeframe,
      direction: direction.toLowerCase() as 'buy' | 'sell',
      state: 'VALIDATED' as any,
      steps: manifest.setup_sequence.map(seq => ({
        step_id: seq.step_id,
        rule_id: seq.rule_id,
        state: 'VALIDATED' as any,
        started_at: setup.timestamp || new Date().toISOString(),
        updated_at: setup.timestamp || new Date().toISOString(),
        retry_count: 0
      })),
      entry_price: (setup as any).entryPrice ?? (setup as any).entry_price ?? 0,
      sl_price: (setup as any).slPrice ?? (setup as any).sl_price ?? 0,
      tp1_price: (setup as any).tpPrice ?? (setup as any).tp1_price ?? 0,
      created_at: setup.timestamp || new Date().toISOString(),
      updated_at: setup.timestamp || new Date().toISOString(),
      validation_logs: []
    };

    // --- STAGE 4: RISK CALCULATION ---
    const entry = strategySetup.entry_price;
    const sl = strategySetup.sl_price;
    const tp1 = strategySetup.tp1_price;
    const riskDist = Math.abs(entry - sl);
    const rewardDist = Math.abs(tp1 - entry);
    const calculatedRR = riskDist > 0 ? parseFloat((rewardDist / riskDist).toFixed(2)) : 0;
    const rrStr = `1:${calculatedRR.toFixed(2)}`;

    // --- STAGE 5: SIGNAL CANDIDATE GATE ---
    const deterministicSignalKey = this.generateDeterministicSignalKey(
      stratId,
      symbol,
      direction,
      setupInstanceId,
      eventContext
    );

    const candidateDetails = await SignalCandidateGate.evaluateCandidate(
      strategySetup,
      context,
      context.marketData || {},
      deterministicSignalKey
    );

    if (!candidateDetails.isValid) {
      logger.info(`[PIPELINE STAGE 5: SIGNAL CANDIDATE] Candidate invalid for ${deterministicSignalKey}: ${candidateDetails.rejectReason}`);
      return {
        success: false,
        stageReached: 'SIGNAL_CANDIDATE',
        signalKey: deterministicSignalKey,
        status: 'REJECTED',
        candidateValidation: candidateDetails,
        rejectionReason: candidateDetails.rejectReason || 'Candidate criteria not met'
      };
    }

    // --- STAGE 6: IDEMPOTENCY ---
    // Check if deterministic signal key was already executed & finalized
    const existingSignal = this.memorySignalRegistry.get(deterministicSignalKey);
    if (existingSignal) {
      logger.info(`[PIPELINE STAGE 6: IDEMPOTENCY] Returning existing signal for duplicate key ${deterministicSignalKey}`);
      return {
        success: true,
        stageReached: 'IDEMPOTENCY',
        signalKey: deterministicSignalKey,
        status: 'EXISTING',
        signal: existingSignal,
        isDuplicate: true
      };
    }

    try {
      const dbSignal = await getDatabaseClient().getSignalByKey(deterministicSignalKey);
      if (dbSignal && (dbSignal.status === 'SIGNAL_ACTIVE' || dbSignal.status === 'APPROVED')) {
        this.memorySignalRegistry.set(deterministicSignalKey, dbSignal);
        logger.info(`[PIPELINE STAGE 6: IDEMPOTENCY] Found existing active signal in DB for ${deterministicSignalKey}`);
        return {
          success: true,
          stageReached: 'IDEMPOTENCY',
          signalKey: deterministicSignalKey,
          status: 'EXISTING',
          signal: dbSignal,
          isDuplicate: true
        };
      }
    } catch (dbErr: any) {
      logger.debug(`Database idempotency check notice: ${dbErr.message}`);
    }

    // --- STAGE 7: DEDUPE (Strategy-Aware Cooldown) ---
    const cooldownKey = `${stratId}_${symbol}_${direction}`;
    const nowMs = Date.now();
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
      // AI is strictly a validator; never creates setups or alters rules
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
      // Evaluate AI Decision & Quality Thresholds
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

      // Both Candidate Gate and AI Validation are APPROVED
      const { rulesPassed, rulesFailed } = consolidateValidationRules(ruleResults, aiResult.checklist);
      const confidence = aiResult.aiReview?.confidenceScore || aiResult.scores?.confidence || 90;
      const atrValue = context.marketData?.atr || (context as any)?.atr || 4.5;
      const correlationId = crypto.randomUUID();

      // Canonical Signal Record
      const canonicalSignal = {
        id: crypto.randomUUID(),
        signalUuid: setup.id,
        signalKey: deterministicSignalKey,
        signal_key: deterministicSignalKey,
        strategy: stratId,
        strategyId: stratId,
        strategy_id: stratId,
        symbol,
        session: context.marketData?.session || (context as any)?.session || 'London',
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
      // Only sends FINAL APPROVED signals with unique notification_key
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
        // Insert history record
        await getDatabaseClient().insertHistory({
          signal_key: deterministicSignalKey,
          strategy_id: stratId,
          symbol,
          status: 'SIGNAL_ACTIVE',
          outcome: 'PENDING',
          pips_result: 0,
          rr_realized: 0
        });

        // Insert AI evidence
        await getDatabaseClient().insertSignalEvidence({
          signal_key: deterministicSignalKey,
          engine_name: 'ai_validation',
          evidence_type: 'ai_review',
          details: aiResult,
          passed: true,
          reason: aiResult.reasoning || 'AI Validation Approved'
        });

        // Insert strategy state record
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
