import { describe, it, expect, beforeEach } from 'vitest';
import { SetupDetector } from '../lib/trading-engine/setup-detector';
import { StateMachine, normalizeStateName, OFFICIAL_SETUP_STATES } from '../lib/trading-engine/state-machine';
import { StepEvaluator } from '../lib/trading-engine/step-evaluator';
import { instantiateStrategySteps } from '../lib/trading-engine/strategy-steps';
import { RuleEvaluationContext, Candle } from '../types';

describe('Trading Engine & Setup Lifecycle - Prompt 3 Acceptance Tests', () => {
  let setupDetector: SetupDetector;

  const mockCandle = (timestamp: string, close: number = 2700): Candle => ({
    timestamp,
    open: close - 2,
    high: close + 5,
    low: close - 5,
    close,
    volume: 1500
  });

  beforeEach(() => {
    setupDetector = new SetupDetector();
    setupDetector.reset();
  });

  describe('1. Setup Dimulai pada State yang Benar (AWAITING)', () => {
    it('initializes setup in canonical AWAITING state with Step 1 active', () => {
      const now = new Date().toISOString();
      const setup = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', now);

      expect(setup.state).toBe('AWAITING');
      expect(setup.current_step_order).toBe(1);
      expect(setup.current_step_id).toBe('LONDON_FILTER');
      expect(setup.steps.length).toBe(7);
      expect(setup.steps[0].state).toBe('AWAITING');
      expect(setup.validation_logs.length).toBeGreaterThan(0);
      expect(setup.validation_logs[0].to_state).toBe('AWAITING');
    });

    it('all 12 official setup states are valid canonical representations', () => {
      expect(OFFICIAL_SETUP_STATES).toEqual([
        'AWAITING',
        'DETECTED',
        'ACTIVE',
        'VALIDATED',
        'AI_PENDING',
        'APPROVED',
        'SIGNAL_ACTIVE',
        'REJECTED',
        'INVALIDATED',
        'EXPIRED',
        'COMPLETED',
        'ERROR'
      ]);
    });
  });

  describe('2. Setup Berpindah Step Secara Berurutan (No Step Skipping)', () => {
    it('progresses strictly step-by-step through Strategy 1 (SMC London)', () => {
      const ts = '2025-02-20T09:00:00.000Z'; // 09:00 UTC = Active London session
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      // Step 1: London Session matches -> progresses to Step 2 (H1 Trend)
      const res1 = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700 },
        'candle_update'
      );

      // In this evaluation, London Filter (Step 1) and H1 Trend (Step 2) both pass -> moves to Step 3 (Asia Sweep)
      expect(res1.setup.steps[0].state).toBe('VALIDATED');
      expect(res1.setup.steps[1].state).toBe('VALIDATED');
      expect(res1.setup.current_step_id).toBe('ASIA_SWEEP');
      expect(res1.setup.current_step_order).toBe(3);
      expect(res1.setup.state).toBe('DETECTED');
    });
  });

  describe('3. AWAITING Tetap Melakukan Monitoring (Non-blocking Engine)', () => {
    it('holds setup in monitoring state when a condition is waiting without throwing or deleting', () => {
      const ts = '2025-02-20T09:15:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      // Strategy 1: London and H1 trend validated, but ASIA_SWEEP not yet occurred
      const res = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700, asian_sweep_bull: false },
        'candle_update'
      );

      expect(res.setup.steps[0].state).toBe('VALIDATED');
      expect(res.setup.steps[1].state).toBe('VALIDATED');
      expect(res.setup.steps[2].state).toBe('AWAITING'); // ASIA_SWEEP awaiting
      expect(res.setup.current_step_id).toBe('ASIA_SWEEP');
      expect(res.setup.current_step_order).toBe(3);

      // Active setup remains locked in memory and ready for next evaluation
      const locked = setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD');
      expect(locked).toBeDefined();
      expect(locked?.id).toBe(res.setup.id);
      expect(locked?.steps[0].state).toBe('VALIDATED');
    });
  });

  describe('4. Setup Dapat Berubah Setelah Candle Baru', () => {
    it('advances from AWAITING to VALIDATED on Step 3 when new candle triggers liquidity sweep', () => {
      const ts1 = '2025-02-20T09:15:00.000Z';
      const context1: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts1,
        candles: [mockCandle(ts1, 2700)],
        indicators: {}
      };

      // Cycle 1: Sweep not ready -> Step 3 Awaiting
      setupDetector.evaluateSetup(
        'strategy-1-smc',
        context1,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700, asian_sweep_bull: false },
        'candle_update'
      );

      // Cycle 2: New Candle arrives at 09:30 UTC with asian_sweep_bull = true!
      const ts2 = '2025-02-20T09:30:00.000Z';
      const context2: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts2,
        candles: [mockCandle(ts1, 2700), mockCandle(ts2, 2694)],
        indicators: {}
      };

      const res2 = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context2,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2694, asian_sweep_bull: true, sweep_level: 2695 },
        'new_candle'
      );

      // Step 3 (ASIA_SWEEP) is now VALIDATED!
      expect(res2.setup.steps[2].state).toBe('VALIDATED');
      expect(res2.setup.steps[2].evidence.level).toBe(2695);
      expect(res2.setup.current_step_order).toBe(4); // Advanced to Step 4 (M15_CHOCH)
      expect(res2.setup.current_step_id).toBe('M15_CHOCH');
      expect(res2.setup.state).toBe('ACTIVE');
    });
  });

  describe('5. Setup Dapat Invalidated', () => {
    it('transitions setup to INVALIDATED and clears active lock when invalidation occurs', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const setup = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);
      expect(setup.state).toBe('AWAITING');

      const invalidated = setupDetector.invalidateSetup(
        'strategy-1-smc',
        'XAUUSD',
        'H1 HTF Trend flipped to Strong Bearish breaking bullish market structure'
      );

      expect(invalidated).toBeDefined();
      expect(invalidated?.state).toBe('INVALIDATED');
      
      // Active lock should be cleared
      const locked = setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD');
      expect(locked).toBeUndefined();

      // Check transition audit
      const lastAudit = invalidated?.validation_logs[invalidated.validation_logs.length - 1];
      expect(lastAudit?.to_state).toBe('INVALIDATED');
      expect(lastAudit?.source_event).toBe('invalidation');
      expect(lastAudit?.reason).toContain('H1 HTF Trend flipped');
    });
  });

  describe('6. Setup Dapat Expired', () => {
    it('transitions setup to EXPIRED when time limit is exceeded', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);

      const expired = setupDetector.expireSetup(
        'strategy-1-smc',
        'XAUUSD',
        'Setup lifecycle window expired after 4 hours without entry trigger'
      );

      expect(expired?.state).toBe('EXPIRED');
      const locked = setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD');
      expect(locked).toBeUndefined();
    });
  });

  describe('7. Setup Bertahan Setelah Restart (Persistent Restore)', () => {
    it('restores active setups with previously completed steps intact', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const initialSetup = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);
      initialSetup.steps[0].state = 'VALIDATED';
      initialSetup.steps[1].state = 'VALIDATED';
      initialSetup.current_step_order = 3;
      initialSetup.current_step_id = 'ASIA_SWEEP';
      initialSetup.state = 'DETECTED';
      // Set expiration to 2 hours in the future
      initialSetup.expires_at = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

      // Simulate reboot by creating new SetupDetector and calling restoreFromStorage
      const newDetectorInstance = new SetupDetector();
      newDetectorInstance.restoreFromStorage([initialSetup]);

      const restored = newDetectorInstance.getLockedSetup('strategy-1-smc', 'XAUUSD');
      expect(restored).toBeDefined();
      expect(restored?.id).toBe(initialSetup.id);
      expect(restored?.state).toBe('DETECTED');
      expect(restored?.current_step_id).toBe('ASIA_SWEEP');
      expect(restored?.steps[0].state).toBe('VALIDATED');
      expect(restored?.steps[1].state).toBe('VALIDATED');
    });
  });

  describe('8. Setup Strategy A Tidak Dapat Mengubah State Strategy B (Strict Isolation)', () => {
    it('maintains strict state isolation across multiple concurrent strategies', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      // Evaluate Strategy 1 (SMC) -> Advances to Step 3
      setupDetector.evaluateSetup(
        'strategy-1-smc',
        context,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700 },
        'candle_update'
      );

      // Evaluate Strategy 2 (S&D) -> Step 1 MA_TREND passes
      setupDetector.evaluateSetup(
        'strategy-2-snd',
        context,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700, sd_zone_active: false },
        'candle_update'
      );

      // Invalidate Strategy 1
      setupDetector.invalidateSetup('strategy-1-smc', 'XAUUSD', 'Strategy 1 manual invalidation');

      // Strategy 2 MUST still be active and unaffected!
      const strat1Setup = setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD');
      const strat2Setup = setupDetector.getLockedSetup('strategy-2-snd', 'XAUUSD');

      expect(strat1Setup).toBeUndefined(); // Strategy 1 cleared
      expect(strat2Setup).toBeDefined(); // Strategy 2 intact!
      expect(strat2Setup?.strategy_id).toBe('strategy-2-snd');
      expect(strat2Setup?.steps[0].state).toBe('VALIDATED');
    });
  });

  describe('9. Tidak Ada Setup Duplicate', () => {
    it('returns the same setup instance for the same strategy and session cycle', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const setup1 = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);
      const setup2 = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);

      expect(setup1.id).toBe(setup2.id);
      expect(setupDetector.getAllActiveSetups().length).toBe(1);
    });
  });

  describe('10. Semua State Transition Tercatat (Comprehensive Audit Log)', () => {
    it('records timestamped transition logs with reason and source event', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      const res = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700 },
        'new_candle'
      );

      const logs = res.setup.validation_logs;
      expect(logs.length).toBeGreaterThanOrEqual(2);

      for (const entry of logs) {
        expect(entry.from_state).toBeDefined();
        expect(entry.to_state).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        expect(entry.reason).toBeDefined();
        expect(entry.source_event).toBeDefined();
      }

      expect(logs[0].source_event).toBe('system_init');
      expect(logs[logs.length - 1].to_state).toBe('DETECTED');
    });
  });
});
