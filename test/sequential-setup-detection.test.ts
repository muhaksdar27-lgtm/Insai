import { describe, it, expect, beforeEach } from 'vitest';
import { SetupDetector } from '../lib/trading-engine/setup-detector';
import { StepEvaluator } from '../lib/trading-engine/step-evaluator';
import { instantiateStrategySteps } from '../lib/trading-engine/strategy-steps';
import { RuleEvaluationContext, Candle } from '../types';

describe('Task 05: True Sequential Setup Detection & Lifecycle Engine', () => {
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

  describe('1. Principle: Setup is NOT a Signal (Strict Sequential Progression)', () => {
    it('initializes all steps in canonical AWAITING state with complete metadata', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const setup = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);

      expect(setup.state).toBe('AWAITING');
      expect(setup.current_step_order).toBe(1);
      expect(setup.current_step_id).toBe('LONDON_FILTER');
      expect(setup.steps.length).toBe(7);

      for (const step of setup.steps) {
        expect(step.state).toBe('AWAITING');
        expect(step.first_detected_at).toBe(ts);
        expect(step.last_evaluated_at).toBe(ts);
        expect(step.invalidation_condition).toBeDefined();
        expect(step.invalidation).toBeDefined();
        expect(step.timeframe).toBeDefined();
        expect(step.data_source).toBe('MarketDataService');
        expect(step.transition_history.length).toBeGreaterThanOrEqual(1);
        expect(step.transition_history[0].from_state).toBe('AWAITING');
        expect(step.transition_history[0].to_state).toBe('AWAITING');
      }
    });

    it('blocks illegal transition to SIGNAL_ACTIVE when mandatory steps are not validated', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const setup = setupDetector.startScanning('strategy-1-smc', 'XAUUSD', 'M15', ts);

      // Attempt to force transition to SIGNAL_ACTIVE directly from AWAITING
      const audit = setupDetector.recordTransition(
        setup,
        'SIGNAL_ACTIVE',
        'Direct signal dispatch attempt',
        'manual_scan'
      );

      // Must be blocked and set to INVALIDATED
      expect(setup.state).toBe('INVALIDATED');
      expect(audit.to_state).toBe('INVALIDATED');
      expect(audit.reason).toContain('BLOCKED: Illegal transition to SIGNAL_ACTIVE');
    });
  });

  describe('2. Sequential Scanning & No Auto-Validation', () => {
    it('validates Step 1 and monitors Step 2 without auto-validating Step 3..7', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      // In this evaluation: Session is London (Step 1 passes), but H1 trend is NEUTRAL (Step 2 awaits)
      const res = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context,
        { current_session: 'London', trend_h1: 'NEUTRAL', current_price: 2700 },
        'candle_update'
      );

      expect(res.setup.steps[0].state).toBe('VALIDATED');
      expect(res.setup.steps[1].state).toBe('AWAITING'); // Step 2 awaiting
      expect(res.setup.steps[2].state).toBe('AWAITING'); // Step 3 untouched!
      expect(res.setup.steps[3].state).toBe('AWAITING'); // Step 4 untouched!
      expect(res.setup.current_step_order).toBe(2);
      expect(res.setup.current_step_id).toBe('H1_TREND');
      expect(res.setup.state).toBe('DETECTED');
    });

    it('holds Step 3 in active scanning across multiple candle updates until condition triggers', () => {
      const ts1 = '2025-02-20T09:00:00.000Z';
      const context1: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts1,
        candles: [mockCandle(ts1, 2700)],
        indicators: {}
      };

      // T0: Step 1 (London) & Step 2 (H1 Trend) validate -> Step 3 (ASIA_SWEEP) begins scanning
      const res1 = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context1,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700, asian_sweep_bull: false },
        'candle_update'
      );

      expect(res1.setup.steps[0].state).toBe('VALIDATED');
      expect(res1.setup.steps[1].state).toBe('VALIDATED');
      expect(res1.setup.steps[2].state).toBe('AWAITING');
      expect(res1.setup.current_step_order).toBe(3);
      expect(res1.setup.current_step_id).toBe('ASIA_SWEEP');

      // T1: 15 minutes later, still no sweep -> Step 3 stays scanning in AWAITING
      const ts2 = '2025-02-20T09:15:00.000Z';
      const context2: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts2,
        candles: [mockCandle(ts1, 2700), mockCandle(ts2, 2698)],
        indicators: {}
      };

      const res2 = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context2,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2698, asian_sweep_bull: false },
        'candle_update'
      );

      expect(res2.setup.steps[0].state).toBe('VALIDATED');
      expect(res2.setup.steps[1].state).toBe('VALIDATED');
      expect(res2.setup.steps[2].state).toBe('AWAITING');
      expect(res2.setup.current_step_order).toBe(3);

      // T2: 30 minutes later, sweep triggers with rejection!
      const ts3 = '2025-02-20T09:30:00.000Z';
      const context3: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts3,
        candles: [mockCandle(ts1, 2700), mockCandle(ts2, 2698), mockCandle(ts3, 2694)],
        indicators: {}
      };

      const res3 = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context3,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2694, asian_sweep_bull: true, sweep_level: 2695 },
        'new_candle'
      );

      expect(res3.setup.steps[2].state).toBe('VALIDATED');
      expect(res3.setup.steps[2].evidence.level).toBe(2695);
      expect(res3.setup.current_step_order).toBe(4);
      expect(res3.setup.current_step_id).toBe('M15_CHOCH');
    });
  });

  describe('3. Premise Invalidation When Foundational Conditions Fail', () => {
    it('invalidates active setup if H1 HTF Trend reverses opposite to locked direction', () => {
      const ts1 = '2025-02-20T09:00:00.000Z';
      const context1: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts1,
        candles: [mockCandle(ts1, 2700)],
        indicators: {}
      };

      // Initialize setup as BULLISH BUY setup through Steps 1-2
      setupDetector.evaluateSetup(
        'strategy-1-smc',
        context1,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700 },
        'candle_update'
      );

      const lockedBefore = setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD');
      expect(lockedBefore).toBeDefined();
      expect(lockedBefore?.direction).toBe('buy');
      expect(lockedBefore?.current_step_order).toBe(3);

      // Now market updates: H1 trend reverses to BEARISH
      const ts2 = '2025-02-20T09:15:00.000Z';
      const context2: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts2,
        candles: [mockCandle(ts1, 2700), mockCandle(ts2, 2680)],
        indicators: {}
      };

      const res = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context2,
        { current_session: 'London', trend_h1: 'BEARISH', current_price: 2680 },
        'candle_update'
      );

      expect(res.setup.state).toBe('INVALIDATED');
      expect(res.setup.validation_logs[res.setup.validation_logs.length - 1].reason).toContain('H1 HTF Trend flipped to BEARISH');
      
      // Active lock must be cleared
      expect(setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD')).toBeUndefined();
    });

    it('invalidates Strategy 3 if Double Top/Bottom forms before liquidity sweep', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M1',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {},
        strategyMarketContext: {
          M1: { candles: [mockCandle(ts, 2700)], ageMs: 100, completeness: true },
          M15: { candles: [mockCandle(ts, 2700)], ageMs: 100, completeness: true },
          H1: { candles: [mockCandle(ts, 2700)], ageMs: 100, completeness: true }
        }
      };

      // Evaluate Strategy 3 with double_pattern_before_sweep = true
      const res = setupDetector.evaluateSetup(
        'strategy-3-scalping',
        context,
        { 
          trend_h1: 'BULLISH', 
          current_price: 2700, 
          m15_retracement: true, 
          dealing_range_zone: 'DISCOUNT',
          double_pattern_before_sweep: true
        },
        'candle_update'
      );

      expect(res.setup.state).toBe('INVALIDATED');
      expect(res.setup.validation_logs[res.setup.validation_logs.length - 1].reason).toContain('Double Top/Bottom formed BEFORE liquidity sweep');
    });
  });

  describe('4. Step Metadata & Transition History Audit', () => {
    it('records every step transition in transition_history', () => {
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
        'candle_update'
      );

      const step1 = res.setup.steps[0];
      expect(step1.state).toBe('VALIDATED');
      expect(step1.transition_history.length).toBeGreaterThanOrEqual(2);
      expect(step1.transition_history.some(t => t.to_state === 'VALIDATED')).toBe(true);

      const step2 = res.setup.steps[1];
      expect(step2.state).toBe('VALIDATED');
      expect(step2.transition_history.some(t => t.to_state === 'VALIDATED')).toBe(true);

      const step3 = res.setup.steps[2];
      expect(step3.transition_history.some(t => t.to_state === 'ACTIVE' || t.to_state === 'AWAITING')).toBe(true);
    });
  });

  describe('5. Full Canonical Strategy Validation Flows', () => {
    it('completes all steps sequentially for Strategy 2 (S&D Zone + Engulfing)', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      const res = setupDetector.evaluateSetup(
        'strategy-2-snd',
        context,
        {
          trend_h1: 'BULLISH',
          current_price: 2700,
          sd_zone_active: true,
          zone_upper: 2702,
          zone_lower: 2698,
          engulfing_bull: true,
          atr: 4.0,
          aiDecision: 'APPROVED',
          aiConfidence: 85,
          aiReasoning: 'S&D confluence verified'
        },
        'candle_update'
      );

      expect(res.setup.steps[0].state).toBe('VALIDATED'); // MA_TREND
      expect(res.setup.steps[1].state).toBe('VALIDATED'); // SD_ZONE
      expect(res.setup.steps[2].state).toBe('VALIDATED'); // ENGULFING_TRIGGER
      expect(res.setup.steps[3].state).toBe('VALIDATED'); // RISK_PARAMS
      expect(res.setup.steps[4].state).toBe('VALIDATED'); // AI_GATE
      expect(res.setup.state).toBe('VALIDATED');
    });

    it('completes all steps sequentially for Strategy 4 (News Momentum)', () => {
      const ts = '2025-02-20T13:35:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M5',
        timestamp: ts,
        candles: [mockCandle(ts, 2710)],
        indicators: {}
      };

      const res = setupDetector.evaluateSetup(
        'strategy-4-news',
        context,
        {
          news_high_impact_active: true,
          news_title: 'US CPI Release',
          first_news_candle: false,
          spread_acceptable: true,
          spreadPips: 1.8,
          pre_news_high: 2715,
          pre_news_low: 2695,
          liq_sweep_bull: true,
          sweep_level: 2695,
          wick_rejection_bull: true,
          wick_ratio: 0.65,
          choch_bull: true,
          atr: 6.0,
          aiDecision: 'APPROVED',
          aiConfidence: 88,
          aiReasoning: 'Post-news liquidity sweep and BOS confirmed'
        },
        'candle_update'
      );

      expect(res.setup.steps[0].state).toBe('VALIDATED'); // NEWS_WINDOW
      expect(res.setup.steps[1].state).toBe('VALIDATED'); // SPREAD_NORMAL
      expect(res.setup.steps[2].state).toBe('VALIDATED'); // POST_NEWS_SWEEP
      expect(res.setup.steps[3].state).toBe('VALIDATED'); // WICK_REJECTION
      expect(res.setup.steps[4].state).toBe('VALIDATED'); // M1_BOS_REVERSAL
      expect(res.setup.steps[5].state).toBe('VALIDATED'); // RISK_PARAMS
      expect(res.setup.steps[6].state).toBe('VALIDATED'); // AI_GATE
      expect(res.setup.state).toBe('VALIDATED');
    });
  });
});
