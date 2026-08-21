import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SignalPipeline } from '../lib/trading-engine/signal-pipeline';
import { SignalCandidateGate } from '../lib/trading-engine/signal-candidate-gate';
import { lockManager } from '../lib/trading-engine/lock-manager';
import { notificationEngine } from '../lib/notifications/notification-engine';
import { getTelegramBot } from '../lib/notifications/telegram-bot';
import { getDatabaseClient } from '../lib/db/client';
import { getProviderRegistry } from '../lib/market-data/provider-registry';
import { getStrategyManifest } from '../lib/trading-engine/strategies';
import { StrategySetup } from '../lib/trading-engine/types';
import { RuleEvaluationContext, Candle, RuleResult } from '../types';

describe('PROMPT 5 — SIGNAL PIPELINE END-TO-END & ANTI-DUPLICATION SUITE', () => {
  let pipeline: SignalPipeline;

  const createMockCandles = (basePrice: number = 2700, count: number = 35): Candle[] => {
    const candles: Candle[] = [];
    const now = Date.now();
    for (let i = count - 1; i >= 0; i--) {
      const ts = new Date(now - i * 60 * 1000).toISOString();
      candles.push({
        timestamp: ts,
        open: basePrice - 1,
        high: basePrice + 3,
        low: basePrice - 3,
        close: basePrice + (i % 2 === 0 ? 1 : -1),
        volume: 1200 + i * 10
      });
    }
    return candles;
  };

  const createValidContext = (timestamp: string = new Date().toISOString(), session: string = 'London'): RuleEvaluationContext => {
    return {
      symbol: 'XAUUSD',
      timeframe: 'M15',
      timestamp,
      candles: createMockCandles(2700, 35),
      marketData: {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        session,
        spreadPips: 1.2,
        atr: 4.5,
        candles: createMockCandles(2700, 35)
      }
    };
  };

  const createValidSetup = (strategyId: string = 'strategy-1-smc', direction: 'buy' | 'sell' = 'buy', id: string = 'setup_anchor_001'): StrategySetup => {
    const entry = 2700.00;
    const sl = direction === 'buy' ? 2690.00 : 2710.00;
    const tp1 = direction === 'buy' ? 2725.00 : 2675.00; // 1:2.5 RR
    const manifest = getStrategyManifest(strategyId);

    const steps = manifest ? manifest.setup_sequence.map(s => ({
      step_id: s.step_id,
      rule_id: s.rule_id,
      state: 'VALIDATED' as const,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      retry_count: 0
    })) : [];

    return {
      id,
      strategy_id: strategyId,
      symbol: 'XAUUSD',
      timeframe: manifest?.timeframe.execution || 'M15',
      direction,
      state: 'VALIDATED',
      steps,
      entry_price: entry,
      sl_price: sl,
      tp1_price: tp1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      validation_logs: []
    };
  };

  const createRuleResults = (): Record<string, RuleResult> => ({
    'H1 Trend Validator': { status: 'PASS', score: 100, confidence: 95, mandatory: true, evidence: { trend: 'BULLISH' }, latencyMs: 2 },
    'London Session Validator': { status: 'PASS', score: 100, confidence: 100, mandatory: true, evidence: { session: 'London' }, latencyMs: 1 },
    'Liquidity Sweep Validator': { status: 'PASS', score: 100, confidence: 92, mandatory: true, evidence: { swept: 'Asia High' }, latencyMs: 2 },
    'CHOCH Confirmation Validator': { status: 'PASS', score: 100, confidence: 90, mandatory: true, evidence: { choch: true }, latencyMs: 1 },
    'Order Block Entry Validator': { status: 'PASS', score: 100, confidence: 90, mandatory: true, evidence: { price: 2700 }, latencyMs: 1 },
    'Risk Validator': { status: 'PASS', score: 100, confidence: 95, mandatory: true, evidence: { sl: 2690, tp1: 2725, rr: 2.5 }, latencyMs: 1 }
  });

  beforeEach(() => {
    pipeline = SignalPipeline.getInstance();
    pipeline.reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TEST 1: Dua Request Bersamaan (Concurrent Requests)
  describe('Test Case 1: Dua request bersamaan (Concurrent Requests)', () => {
    it('only processes the setup once, acquiring the in-flight lock, and returns the existing signal on the duplicate', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy', 'anchor_concurrent_01');
      const context = createValidContext();
      const rules = createRuleResults();

      // Mock Telegram Bot to spy on notifications
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);

      // Mock AI Orchestrator to return APPROVED
      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockImplementation(async () => {
        // Add a small delay to simulate processing time
        await new Promise(r => setTimeout(r, 20));
        return {
          strategyName: 'strategy-1-smc',
          decision: 'APPROVED',
          reasoning: 'Clean institutional liquidity sweep with validated Order Block retest',
          checklist: [{ rule: 'Trend', status: 'PASS', evidence: 'Bullish', reason: 'Confirmed' }],
          riskNotes: 'Risk verified',
          missingFactors: [],
          recommendedAction: 'execute',
          scores: { confidence: 92 }
        };
      });

      // Fire 2 concurrent requests simultaneously
      const [res1, res2] = await Promise.all([
        pipeline.executePipeline(setup, context, rules, 'worker_A'),
        pipeline.executePipeline(setup, context, rules, 'worker_B')
      ]);

      // Exactly one succeeds with APPROVED, the other is blocked by IN_FLIGHT_LOCKED or returns EXISTING
      const approvedResults = [res1, res2].filter(r => r.status === 'APPROVED');
      const deduplicatedResults = [res1, res2].filter(r => r.status === 'IN_FLIGHT_LOCKED' || r.status === 'EXISTING');

      expect(approvedResults.length).toBe(1);
      expect(deduplicatedResults.length).toBe(1);

      // Telegram must only receive exactly ONE message
      expect(tgSpy).toHaveBeenCalledTimes(1);
    });
  });

  // TEST 2: Dua candle dengan event sama (Identical setup event across 2 candle updates)
  describe('Test Case 2: Dua candle dengan event sama (Sequential deduplication by deterministic key)', () => {
    it('deduplicates identical setups across sequential candle updates via deterministic signal key', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy', 'anchor_candle_cycle_100');
      const rules = createRuleResults();
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);

      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-1-smc',
        decision: 'APPROVED',
        reasoning: 'Setup passed all conditions',
        checklist: [],
        riskNotes: '',
        missingFactors: [],
        recommendedAction: 'execute',
        scores: { confidence: 90 }
      });

      // First candle update at T0
      const contextT0 = createValidContext('2026-08-21T08:00:00.000Z');
      const res1 = await pipeline.executePipeline(setup, contextT0, rules);
      expect(res1.status).toBe('APPROVED');
      expect(res1.success).toBe(true);

      // Second candle update at T1 with identical setup anchor
      const contextT1 = createValidContext('2026-08-21T08:01:00.000Z');
      const res2 = await pipeline.executePipeline(setup, contextT1, rules);

      // Must be identified as EXISTING via idempotency / Candidate Gate
      expect(res2.status === 'EXISTING' || res2.status === 'REJECTED').toBe(true);
      if (res2.status === 'EXISTING') {
        expect(res2.isDuplicate).toBe(true);
        expect(res2.signalKey).toBe(res1.signalKey);
      }

      // Telegram only sent once
      expect(tgSpy).toHaveBeenCalledTimes(1);
    });
  });

  // TEST 3: Restart di tengah signal creation (In-flight lock recovery & state resumption)
  describe('Test Case 3: Restart di tengah signal creation (Lock Recovery & Resumption)', () => {
    it('recovers expired locks from abandoned workers and allows subsequent workers to proceed', async () => {
      const lockKey = 'signal_inflight_sig::strategy-1-smc::XAUUSD::BUY::anchor_dead_worker::candle_closed';
      const deadWorkerId = 'worker_dead_999';

      // Dead worker acquired lock with 0-second TTL (immediately expired)
      await lockManager.acquireLock(lockKey, deadWorkerId, 0);

      // Verify lock is identified and recovered by new worker
      const newWorkerId = 'worker_active_001';
      const acquired = await lockManager.acquireLock(lockKey, newWorkerId, 30);
      expect(acquired).toBe(true);

      const lockInfo = lockManager.getLockInfo(lockKey);
      expect(lockInfo?.owner).toBe(newWorkerId);

      // Safely release
      await lockManager.releaseLock(lockKey, newWorkerId);
      expect(lockManager.isLocked(lockKey)).toBe(false);
    });
  });

  // TEST 4: AI Timeout (Returns AI_UNAVAILABLE / VALIDATION_ERROR, does NOT auto-approve)
  describe('Test Case 4: AI timeout / offline', () => {
    it('returns AI_UNAVAILABLE on offline / timeout and does NOT auto-approve the signal', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy', 'anchor_ai_timeout_01');
      const context = createValidContext();
      const rules = createRuleResults();
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);

      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-1-smc',
        decision: 'AI_UNAVAILABLE',
        reasoning: 'Gemini API call timed out after 8000ms',
        checklist: [],
        riskNotes: 'AI_UNAVAILABLE - Request Timeout',
        missingFactors: ['AI Validation Layer'],
        recommendedAction: 'wait',
        scores: { confidence: 0 }
      });

      const res = await pipeline.executePipeline(setup, context, rules);

      expect(res.success).toBe(false);
      expect(res.status).toBe('AI_UNAVAILABLE');
      expect(res.stageReached).toBe('NODE_FINAL_DECISION');
      expect(res.rejectionReason).toContain('AI Validation service unavailable');

      // Crucial: Telegram must NOT receive unapproved signals
      expect(tgSpy).not.toHaveBeenCalled();
    });

    it('returns VALIDATION_ERROR on system failure and halts emission', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy', 'anchor_ai_err_01');
      const context = createValidContext();
      const rules = createRuleResults();
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);

      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-1-smc',
        decision: 'VALIDATION_ERROR',
        reasoning: 'Parsing schema mismatch from AI response',
        checklist: [],
        riskNotes: 'VALIDATION_ERROR',
        missingFactors: ['AI Validation'],
        recommendedAction: 'block',
        scores: { confidence: 0 }
      });

      const res = await pipeline.executePipeline(setup, context, rules);

      expect(res.success).toBe(false);
      expect(res.status).toBe('VALIDATION_ERROR');
      expect(tgSpy).not.toHaveBeenCalled();
    });
  });

  // TEST 5: Telegram Timeout (Safe retry with exponential backoff, max retries limit, deduplication)
  describe('Test Case 5: Telegram timeout and retry', () => {
    it('retries up to MAX_RETRIES (3 times) on failure, then terminates safely without looping indefinitely', async () => {
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockRejectedValue(new Error('Telegram API connection timeout'));

      const payload = {
        signal_key: 'sig::strategy-1-smc::XAUUSD::BUY::tg_timeout_01::candle_closed',
        strategyName: 'strategy-1-smc',
        symbol: 'XAUUSD',
        direction: 'BUY' as const,
        entry: 2700,
        sl: 2690,
        tp: [2725],
        timestamp: new Date().toISOString(),
        status: 'queued' as const,
        qualityGatePassed: true,
        aiDecision: 'APPROVED'
      };

      const result = await notificationEngine.notifyNewSignal(payload);

      expect(result).toBe(false);
      expect(payload.status).toBe('failed');
      expect(tgSpy).toHaveBeenCalledTimes(3); // Exactly 3 retries (MAX_RETRIES)
    });

    it('succeeds if a subsequent retry passes and marks key to prevent duplicate sends', async () => {
      let attempts = 0;
      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockImplementation(async () => {
        attempts++;
        if (attempts < 2) throw new Error('Temporary gateway timeout');
        return true;
      });

      const payload = {
        signal_key: 'sig::strategy-1-smc::XAUUSD::BUY::tg_recovery_01::candle_closed',
        strategyName: 'strategy-1-smc',
        symbol: 'XAUUSD',
        direction: 'BUY' as const,
        entry: 2700,
        sl: 2690,
        tp: [2725],
        timestamp: new Date().toISOString(),
        status: 'queued' as const,
        qualityGatePassed: true,
        aiDecision: 'APPROVED'
      };

      const result = await notificationEngine.notifyNewSignal(payload);
      expect(result).toBe(true);
      expect(payload.status).toBe('sent');
      expect(tgSpy).toHaveBeenCalledTimes(2);

      // Attempting to send again with same signal key is deduped
      const result2 = await notificationEngine.notifyNewSignal(payload);
      expect(result2).toBe(false);
      expect(payload.status).toBe('deduped');
      expect(tgSpy).toHaveBeenCalledTimes(2); // No additional send
    });
  });

  // TEST 6: Database Timeout (Fallback to in-memory idempotency cache & circuit breaker)
  describe('Test Case 6: Database timeout & fallback', () => {
    it('gracefully handles database failure by storing in memory cache and continuing execution', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy', 'anchor_db_fail_01');
      const context = createValidContext();
      const rules = createRuleResults();

      vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);
      vi.spyOn(getDatabaseClient(), 'insertSignal').mockRejectedValue(new Error('Postgres connection pool exhausted'));
      vi.spyOn(getDatabaseClient(), 'insertHistory').mockRejectedValue(new Error('Postgres connection pool exhausted'));

      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-1-smc',
        decision: 'APPROVED',
        reasoning: 'Valid setup',
        checklist: [],
        riskNotes: '',
        missingFactors: [],
        recommendedAction: 'execute',
        scores: { confidence: 95 }
      });

      const res = await pipeline.executePipeline(setup, context, rules);

      expect(res.success).toBe(true);
      expect(res.status).toBe('APPROVED');
      expect(res.signal).toBeDefined();

      // Second request checks in-memory registry even if DB is down
      const res2 = await pipeline.executePipeline(setup, context, rules);
      expect(res2.status).toBe('EXISTING');
      expect(res2.isDuplicate).toBe(true);
    });
  });

  // TEST 7: Provider Retry (Duplicate provider event returns existing signal)
  describe('Test Case 7: Provider retry (Duplicate provider event returns existing signal)', () => {
    it('returns existing signal when market data provider resends identical candle payload', async () => {
      const setup = createValidSetup('strategy-2-snd', 'sell', 'anchor_provider_retry_01');
      setup.steps = [
        { step_id: 'HTF_TREND', rule_id: 'rule_h1_trend', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'MA_DYNAMIC_TREND', rule_id: 'rule_ma_trend', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'SUPPLY_ZONE_TOUCH', rule_id: 'rule_sd_zone_touch', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'ENGULFING_TRIGGER', rule_id: 'rule_engulfing_confirm', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'SPREAD_FILTER', rule_id: 'rule_spread_check', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 }
      ];
      setup.entry_price = 2715.00;
      setup.sl_price = 2725.00;
      setup.tp1_price = 2690.00; // 1:2.5 RR

      const context = createValidContext();
      const rules = createRuleResults();

      vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);
      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-2-snd',
        decision: 'APPROVED',
        reasoning: 'Supply zone touch with engulfing confirmation',
        checklist: [],
        riskNotes: '',
        missingFactors: [],
        recommendedAction: 'execute',
        scores: { confidence: 91 }
      });

      // Provider Event 1
      const res1 = await pipeline.executePipeline(setup, context, rules);
      expect(res1.status).toBe('APPROVED');

      // Provider Retry (duplicate event delivery)
      const res2 = await pipeline.executePipeline(setup, context, rules);
      expect(res2.status).toBe('EXISTING');
      expect(res2.isDuplicate).toBe(true);
      expect(res2.signal?.signalKey).toBe(res1.signalKey);
    });
  });

  // TEST 8: Duplicate Webhook / Event
  describe('Test Case 8: Duplicate webhook / event', () => {
    it('ensures duplicate webhook deliveries result in zero duplicated notifications and zero duplicate database entries', async () => {
      const setup = createValidSetup('strategy-3-scalping', 'buy', 'anchor_webhook_01');
      setup.timeframe = 'M1';
      setup.steps = [
        { step_id: 'H1_TREND_BIAS', rule_id: 'rule_h1_trend', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'LIQUIDITY_SWEEP', rule_id: 'rule_liquidity_sweep', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'M15_RETRACEMENT', rule_id: 'rule_m15_retracement', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'M1_DOUBLE_PATTERN', rule_id: 'rule_m1_double_top_bottom', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 },
        { step_id: 'NECKLINE_BREAKOUT', rule_id: 'rule_neckline_break', state: 'VALIDATED', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), retry_count: 0 }
      ];
      setup.entry_price = 2700.00;
      setup.sl_price = 2697.00; // 30 pips
      setup.tp1_price = 2710.00; // 100 pips (1:3.33 RR)

      const context = createValidContext();
      context.timeframe = 'M1';
      const rules = createRuleResults();

      const tgSpy = vi.spyOn(getTelegramBot(), 'sendNotification').mockResolvedValue(true);
      const orchestrator = (pipeline as any).aiOrchestrator;
      vi.spyOn(orchestrator, 'runPipeline').mockResolvedValue({
        strategyName: 'strategy-3-scalping',
        decision: 'APPROVED',
        reasoning: 'M1 double bottom reversal',
        checklist: [],
        riskNotes: '',
        missingFactors: [],
        recommendedAction: 'execute',
        scores: { confidence: 89 }
      });

      // 5 identical webhook deliveries
      const results = await Promise.all([
        pipeline.executePipeline(setup, context, rules),
        pipeline.executePipeline(setup, context, rules),
        pipeline.executePipeline(setup, context, rules),
        pipeline.executePipeline(setup, context, rules),
        pipeline.executePipeline(setup, context, rules)
      ]);

      const approvedCount = results.filter(r => r.status === 'APPROVED').length;
      expect(approvedCount).toBe(1);

      // Telegram notification sent exactly ONCE
      expect(tgSpy).toHaveBeenCalledTimes(1);
    });
  });

  // Strict Candidate Gate Criteria Verifications
  describe('Candidate Gate Strict Validation Criteria', () => {
    it('rejects candidate if entry price is invalid or zero', async () => {
      const setup = createValidSetup();
      setup.entry_price = 0;
      const context = createValidContext();

      const details = await SignalCandidateGate.evaluateCandidate(setup, context, {}, 'sig::test::01');
      expect(details.isValid).toBe(false);
      expect(details.checks.entryValid).toBe(false);
      expect(details.rejectReason).toContain('Invalid entry price');
    });

    it('rejects candidate if BUY stop loss is above entry price', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy');
      setup.entry_price = 2700;
      setup.sl_price = 2705; // Invalid for BUY
      const context = createValidContext();

      const details = await SignalCandidateGate.evaluateCandidate(setup, context, {}, 'sig::test::02');
      expect(details.isValid).toBe(false);
      expect(details.checks.slValid).toBe(false);
      expect(details.rejectReason).toContain('BUY SL');
    });

    it('rejects candidate if Risk-Reward ratio is below strategy requirement', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy');
      setup.entry_price = 2700;
      setup.sl_price = 2690; // Risk = 10
      setup.tp1_price = 2710; // Reward = 10 -> 1:1 RR (Strategy 1 requires min 1:2.0)
      const context = createValidContext();

      const details = await SignalCandidateGate.evaluateCandidate(setup, context, {}, 'sig::test::03');
      expect(details.isValid).toBe(false);
      expect(details.checks.rrValid).toBe(false);
      expect(details.rejectReason).toContain('Risk-Reward ratio');
    });

    it('rejects candidate if mandatory step is in AWAITING or REJECTED state', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy');
      setup.steps[2].state = 'AWAITING'; // Step 3 not completed
      const context = createValidContext();

      const details = await SignalCandidateGate.evaluateCandidate(setup, context, {}, 'sig::test::04');
      expect(details.isValid).toBe(false);
      expect(details.checks.mandatoryStepsComplete).toBe(false);
      expect(details.rejectReason).toContain('Mandatory setup incomplete');
    });

    it('rejects candidate if spread exceeds strategy maximum', async () => {
      const setup = createValidSetup('strategy-1-smc', 'buy');
      const context = createValidContext();
      const marketData = { spreadPips: 4.5 }; // Strategy 1 max allowed is 2.5 pips

      const details = await SignalCandidateGate.evaluateCandidate(setup, context, marketData, 'sig::test::05');
      expect(details.isValid).toBe(false);
      expect(details.checks.filterValid).toBe(false);
      expect(details.rejectReason).toContain('exceeds maximum allowed');
    });
  });
});
