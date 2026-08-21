import { describe, it, expect, beforeEach } from 'vitest';
import { SetupDetector } from '../lib/trading-engine/setup-detector';
import { StepEvaluator } from '../lib/trading-engine/step-evaluator';
import {
  STRATEGY_MANIFESTS,
  getStrategyManifest,
  getAllStrategyManifests,
  buildSignalKey,
  parseSignalKey
} from '../lib/trading-engine/strategies';
import { RuleEvaluationContext, Candle } from '../types';

describe('STRATEGY ENGINE & ISOLATION TESTS (PROMPT 4)', () => {
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

  describe('1. Strategy Matrix & Specifications (All 5 Strategies)', () => {
    it('has all 5 distinct strategy manifests with full specifications', () => {
      const manifests = getAllStrategyManifests();
      expect(manifests.length).toBe(5);

      const strategyIds = manifests.map((m) => m.strategy_id);
      expect(strategyIds).toContain('strategy-1-smc');
      expect(strategyIds).toContain('strategy-2-snd');
      expect(strategyIds).toContain('strategy-3-scalping');
      expect(strategyIds).toContain('strategy-4-news');
      expect(strategyIds).toContain('strategy-5-smc-sd-confluence');

      for (const m of manifests) {
        expect(m.strategy_id).toBeDefined();
        expect(m.name).toBeDefined();
        expect(m.version).toBeDefined();
        expect(m.status).toBeDefined();
        expect(m.timeframe.htf).toBeDefined();
        expect(m.timeframe.execution).toBeDefined();
        expect(m.setup_sequence.length).toBeGreaterThanOrEqual(5);
        expect(m.rule_definition.length).toBeGreaterThanOrEqual(5);
        expect(m.entry_rule.trigger).toBeDefined();
        expect(m.sl_rule.bufferFormula).toBeDefined();
        expect(m.tp_rule.minRR).toBeGreaterThanOrEqual(1.5);
        expect(m.filter.spreadMaxPips).toBeGreaterThan(0);
        expect(m.invalidation_rule.conditions.length).toBeGreaterThan(0);
        expect(m.expiry_rule.maxDurationMinutes).toBeGreaterThan(0);
        expect(m.evidence_model.requiredFields.length).toBeGreaterThan(0);
      }
    });

    it('Strategy 5 is audited and explicitly marked as UNDEFINED / SAME RULESET AS PRD', () => {
      const s5 = getStrategyManifest('strategy-5-smc-sd-confluence');
      expect(s5.status).toBe('UNDEFINED / SAME RULESET AS PRD');
      expect(s5.description).toContain('UNDEFINED / SAME RULESET AS PRD');
    });
  });

  describe('2. Strategy 1 (SMC + London Session + M15)', () => {
    it('strictly maintains rule sequence: London -> H1 Trend -> Asia Sweep -> CHoCH -> OB/FVG -> Risk', () => {
      const s1 = getStrategyManifest('strategy-1-smc');
      const stepIds = s1.setup_sequence.map((s) => s.step_id);

      expect(stepIds).toEqual([
        'H1_TREND',
        'LONDON_FILTER',
        'ASIA_LIQUIDITY',
        'LIQUIDITY_SWEEP',
        'FAKEOUT_REJECTION',
        'M15_CHOCH',
        'OB_FVG_ALIGNMENT',
        'ENTRY_RISK_EXECUTION',
        'AI_GATE'
      ]);
      expect(s1.session_requirement.allowedSessions).toContain('London');
      expect(s1.timeframe.execution).toBe('M15');
    });
  });

  describe('3. Strategy 2 (Supply & Demand + Engulfing)', () => {
    it('uses independent S&D rules with MA50/MA200 trend, area touch, and LTF engulfing', () => {
      const s2 = getStrategyManifest('strategy-2-snd');
      const stepIds = s2.setup_sequence.map((s) => s.step_id);

      expect(stepIds).toEqual([
        'HTF_MA_TREND',
        'SD_ZONE_IMBALANCE',
        'BOS_CONFIRMATION',
        'AREA_TOUCH',
        'LTF_ENGULFING',
        'ENTRY_RISK_SD',
        'AI_GATE'
      ]);

      // Verify Step 1 MA trend evaluation
      const res = StepEvaluator.evaluateStep(
        {
          step_id: 'HTF_MA_TREND',
          step_order: 1,
          strategy_id: 'strategy-2-snd',
          rule_id: 'rule_htf_ma_trend',
          name: 'MA Trend',
          description: '',
          state: 'AWAITING',
          timestamp: '2025-02-20T09:00:00Z',
          evidence: {},
          reason: '',
          invalidation: '',
          last_evaluated_timestamp: ''
        },
        { symbol: 'XAUUSD', timeframe: 'M15', timestamp: '2025-02-20T09:00:00Z', candles: [mockCandle('2025-02-20T09:00:00Z', 2700)], indicators: {} },
        { trend_h1: 'BULLISH', ema50: 2680, ema200: 2650, current_price: 2700 }
      );

      expect(res.status).toBe('VALIDATED');
      expect(res.direction).toBe('buy');
    });
  });

  describe('4. Strategy 3 (Scalping: Sweep MUST Precede Double Bottom/Top)', () => {
    it('REJECTS double bottom/top that occurs BEFORE liquidity sweep', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M1',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      const stepRecord = {
        step_id: 'DOUBLE_TOP_BOTTOM',
        step_order: 4,
        strategy_id: 'strategy-3-scalping',
        rule_id: 'rule_double_top_bottom',
        name: 'Pola Double Top/Bottom',
        description: '',
        state: 'AWAITING' as const,
        timestamp: ts,
        evidence: {},
        reason: '',
        invalidation: '',
        last_evaluated_timestamp: ts
      };

      // Prior steps where sweep is NOT validated (or double_pattern_before_sweep = true)
      const priorStepsWithoutSweep = [
        {
          step_id: 'H1_TREND',
          step_order: 1,
          strategy_id: 'strategy-3-scalping',
          rule_id: 'rule_h1_trend',
          name: 'H1 Trend',
          description: '',
          state: 'VALIDATED' as const,
          timestamp: ts,
          evidence: {},
          reason: '',
          invalidation: '',
          last_evaluated_timestamp: ts
        },
        {
          step_id: 'M15_RETRACEMENT',
          step_order: 2,
          strategy_id: 'strategy-3-scalping',
          rule_id: 'rule_m15_retracement',
          name: 'M15 Retracement',
          description: '',
          state: 'VALIDATED' as const,
          timestamp: ts,
          evidence: {},
          reason: '',
          invalidation: '',
          last_evaluated_timestamp: ts
        },
        {
          step_id: 'MICRO_SWEEP',
          step_order: 3,
          strategy_id: 'strategy-3-scalping',
          rule_id: 'rule_micro_sweep',
          name: 'Micro Sweep',
          description: '',
          state: 'AWAITING' as const, // Sweep NOT YET validated!
          timestamp: ts,
          evidence: {},
          reason: '',
          invalidation: '',
          last_evaluated_timestamp: ts
        }
      ];

      const res = StepEvaluator.evaluateStep(
        stepRecord,
        context,
        { double_bottom: true, current_price: 2700 },
        priorStepsWithoutSweep,
        'buy'
      );

      // MUST be INVALIDATED because double bottom occurred before sweep!
      expect(res.status).toBe('INVALIDATED');
      expect(res.reason).toContain('Double Top/Bottom formed BEFORE liquidity sweep');
    });

    it('VALIDATES double bottom/top when formed strictly AFTER sweep', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M1',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      const stepRecord = {
        step_id: 'DOUBLE_TOP_BOTTOM',
        step_order: 4,
        strategy_id: 'strategy-3-scalping',
        rule_id: 'rule_double_top_bottom',
        name: 'Pola Double Top/Bottom',
        description: '',
        state: 'AWAITING' as const,
        timestamp: ts,
        evidence: {},
        reason: '',
        invalidation: '',
        last_evaluated_timestamp: ts
      };

      const priorStepsWithSweepValidated = [
        {
          step_id: 'MICRO_SWEEP',
          step_order: 3,
          strategy_id: 'strategy-3-scalping',
          rule_id: 'rule_micro_sweep',
          name: 'Micro Sweep',
          description: '',
          state: 'VALIDATED' as const, // Sweep IS validated!
          timestamp: ts,
          evidence: {},
          reason: '',
          invalidation: '',
          last_evaluated_timestamp: ts
        }
      ];

      const res = StepEvaluator.evaluateStep(
        stepRecord,
        context,
        { double_bottom: true, peak1_price: 2695, peak2_price: 2695.2, neckline_price: 2702, current_price: 2700 },
        priorStepsWithSweepValidated,
        'buy'
      );

      expect(res.status).toBe('VALIDATED');
      expect(res.reason).toContain('Post-sweep Double Bottom formation confirmed');
      expect(res.evidence.sweepConfirmedBeforePattern).toBe(true);
    });
  });

  describe('5. Strategy 4 (News Liquidity Sweep Reversal)', () => {
    it('prohibits entry on first news candle and awaits spread normalization', () => {
      const ts = '2025-02-20T13:30:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M5',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      const stepRecord = {
        step_id: 'NO_TRADE_WINDOW',
        step_order: 2,
        strategy_id: 'strategy-4-news',
        rule_id: 'rule_no_trade_window',
        name: 'No-Trade Window',
        description: '',
        state: 'AWAITING' as const,
        timestamp: ts,
        evidence: {},
        reason: '',
        invalidation: '',
        last_evaluated_timestamp: ts
      };

      // Case A: First news candle active -> AWAITING (Do not trade)
      const resFirstCandle = StepEvaluator.evaluateStep(
        stepRecord,
        context,
        { first_news_candle: true, candle_index: 0, spreadPips: 6.5, current_price: 2700 }
      );
      expect(resFirstCandle.status).toBe('AWAITING');
      expect(resFirstCandle.reason).toContain('First news candle active: Entry strictly prohibited');

      // Case B: Post-first candle with normalized spread (< 3.0 pips) -> VALIDATED
      const resNormalized = StepEvaluator.evaluateStep(
        stepRecord,
        context,
        { first_news_candle: false, candle_index: 2, spreadPips: 1.8, current_price: 2700 }
      );
      expect(resNormalized.status).toBe('VALIDATED');
      expect(resNormalized.reason).toContain('spread normalized');
    });
  });

  describe('6. Strict Strategy Isolation (Cross-Strategy Event Immunity)', () => {
    it('proves Strategy 1 event ≠ Strategy 2 event ≠ Strategy 3 event ≠ Strategy 4 event ≠ Strategy 5 event', () => {
      const ts = '2025-02-20T09:00:00.000Z';
      const context: RuleEvaluationContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: ts,
        candles: [mockCandle(ts, 2700)],
        indicators: {}
      };

      // Trigger Strategy 1 (SMC London)
      const resS1 = setupDetector.evaluateSetup(
        'strategy-1-smc',
        context,
        { current_session: 'London', trend_h1: 'BULLISH', current_price: 2700 },
        'candle_update'
      );

      // Trigger Strategy 2 (S&D)
      const resS2 = setupDetector.evaluateSetup(
        'strategy-2-snd',
        context,
        { trend_h1: 'BULLISH', ema50: 2680, ema200: 2650, current_price: 2700, sd_zone_active: false },
        'candle_update'
      );

      // Trigger Strategy 3 (Scalping)
      const resS3 = setupDetector.evaluateSetup(
        'strategy-3-scalping',
        context,
        { trend_h1: 'BULLISH', m15_retracement: true, current_price: 2700 },
        'candle_update'
      );

      // Trigger Strategy 4 (News)
      const resS4 = setupDetector.evaluateSetup(
        'strategy-4-news',
        context,
        { news_high_impact_active: true, news_title: 'US CPI Release', current_price: 2700 },
        'candle_update'
      );

      // Trigger Strategy 5 (Confluence)
      const resS5 = setupDetector.evaluateSetup(
        'strategy-5-smc-sd-confluence',
        context,
        { trend_h1: 'BULLISH', current_price: 2700 },
        'candle_update'
      );

      // All 5 setups must exist independently with their respective strategy IDs and distinct step configurations
      expect(resS1.setup.strategy_id).toBe('strategy-1-smc');
      expect(resS2.setup.strategy_id).toBe('strategy-2-snd');
      expect(resS3.setup.strategy_id).toBe('strategy-3-scalping');
      expect(resS4.setup.strategy_id).toBe('strategy-4-news');
      expect(resS5.setup.strategy_id).toBe('strategy-5-smc-sd-confluence');

      // Invalidating Strategy 1 MUST NOT affect Strategy 2, 3, 4, or 5
      setupDetector.invalidateSetup('strategy-1-smc', 'XAUUSD', 'Strategy 1 invalidation test');

      expect(setupDetector.getLockedSetup('strategy-1-smc', 'XAUUSD')).toBeUndefined();
      expect(setupDetector.getLockedSetup('strategy-2-snd', 'XAUUSD')).toBeDefined();
      expect(setupDetector.getLockedSetup('strategy-3-scalping', 'XAUUSD')).toBeDefined();
      expect(setupDetector.getLockedSetup('strategy-4-news', 'XAUUSD')).toBeDefined();
      expect(setupDetector.getLockedSetup('strategy-5-smc-sd-confluence', 'XAUUSD')).toBeDefined();
    });
  });

  describe('7. Signal Identity Standard (5 Mandatory Components)', () => {
    it('builds and parses signal key containing strategy_id, symbol, direction, setup instance, and event context', () => {
      const key = buildSignalKey({
        strategy_id: 'strategy-1-smc',
        symbol: 'XAUUSD',
        direction: 'BUY',
        setup_instance: 'inst-98765',
        event_context: 'london_open_sweep'
      });

      expect(key).toBe('sig::strategy-1-smc::XAUUSD::BUY::inst-98765::london_open_sweep');

      const parsed = parseSignalKey(key);
      expect(parsed).toEqual({
        strategy_id: 'strategy-1-smc',
        symbol: 'XAUUSD',
        direction: 'BUY',
        setup_instance: 'inst-98765',
        event_context: 'london_open_sweep'
      });
    });
  });
});
