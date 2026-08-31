import { describe, it, expect } from 'vitest';
import { StrategyContextBuilder } from '@/lib/trading-engine/strategy-context-builder';
import { StrategyMarketContext } from '@/types/strategy-market-context';
import { StepEvaluator } from '@/lib/trading-engine/step-evaluator';
import { RuleEngine } from '@/lib/trading-engine/rule-engine';
import { RuleEvaluationContext } from '@/types';

describe('Strategy Timeframe Isolation & Assertions', () => {
  it('should build isolated context for Strategy 3 and flag missing M1 if M1 is absent', () => {
    const mockGlobalContext: StrategyMarketContext = {
      symbol: 'XAUUSD',
      currentPrice: 2650.5,
      currentTimestamp: new Date().toISOString(),
      session: 'London',
      H1: {
        timeframe: 'H1',
        candles: [
          { timestamp: '2026-03-30T10:00:00Z', open: 2640, high: 2655, low: 2638, close: 2650, volume: 1000, provider: 'twelvedata', latency: 50, freshness: 'live', confidence: 1.0 }
        ],
        timestamp: '2026-03-30T10:00:00Z',
        ageMs: 1000,
        ohlc: { open: 2640, high: 2655, low: 2638, close: 2650, volume: 1000 },
        freshness: 'live',
        sourceProvider: 'twelvedata',
        completeness: true,
        candleCount: 1
      },
      M15: {
        timeframe: 'M15',
        candles: [
          { timestamp: '2026-03-30T10:45:00Z', open: 2648, high: 2652, low: 2647, close: 2650.5, volume: 300, provider: 'twelvedata', latency: 50, freshness: 'live', confidence: 1.0 }
        ],
        timestamp: '2026-03-30T10:45:00Z',
        ageMs: 1000,
        ohlc: { open: 2648, high: 2652, low: 2647, close: 2650.5, volume: 300 },
        freshness: 'live',
        sourceProvider: 'twelvedata',
        completeness: true,
        candleCount: 1
      },
      M5: {
        timeframe: 'M5',
        candles: [
          { timestamp: '2026-03-30T10:55:00Z', open: 2650, high: 2651, low: 2649, close: 2650.5, volume: 100, provider: 'twelvedata', latency: 50, freshness: 'live', confidence: 1.0 }
        ],
        timestamp: '2026-03-30T10:55:00Z',
        ageMs: 1000,
        ohlc: { open: 2650, high: 2651, low: 2649, close: 2650.5, volume: 100 },
        freshness: 'live',
        sourceProvider: 'twelvedata',
        completeness: true,
        candleCount: 1
      },
      // M1 is purposefully missing
      spread: { spreadPips: 1.5, isAcceptable: true, timestamp: new Date().toISOString() },
      provider: 'twelvedata',
      dataFreshness: 'live'
    };

    const isolated = StrategyContextBuilder.buildStrategyIsolatedContext('strategy-3-scalping', mockGlobalContext);
    
    // Strategy 3 canonical spec requires H1, M15, M5, M1
    expect(isolated.hasAllRequiredTimeframes).toBe(false);
    expect(isolated.missingTimeframes).toContain('M1');
    expect(isolated.marketContext.M1).toBeUndefined();
    expect(isolated.marketContext.H1).toBeDefined();
  });

  it('StepEvaluator should return AWAITING when required M1 step is evaluated without M1 data', () => {
    const contextWithoutM1: RuleEvaluationContext = {
      symbol: 'XAUUSD',
      timeframe: 'M15',
      timestamp: new Date().toISOString(),
      candles: [{ timestamp: '2026-03-30T10:00:00Z', open: 2640, high: 2655, low: 2638, close: 2650, volume: 1000, provider: 'twelvedata', latency: 50, freshness: 'live', confidence: 1.0 }],
      strategyMarketContext: {
        symbol: 'XAUUSD',
        currentPrice: 2650,
        currentTimestamp: new Date().toISOString(),
        session: 'London',
        H1: { timeframe: 'H1', candles: [], timestamp: '', ageMs: 0, ohlc: { open: 0, high: 0, low: 0, close: 0, volume: 0 }, freshness: 'live', sourceProvider: 'mock', completeness: true, candleCount: 10 },
        spread: { spreadPips: 1.5, isAcceptable: true, timestamp: new Date().toISOString() },
        provider: 'mock',
        dataFreshness: 'live'
      }
    };

    const step = {
      step_id: 'DOUBLE_TOP_BOTTOM',
      step_order: 3,
      strategy_id: 'strategy-3-scalping',
      rule_id: 'rule_scalp_pattern',
      name: 'M1 Scalp Pattern',
      description: 'Double top/bottom on M1',
      state: 'ACTIVE' as any,
      timestamp: new Date().toISOString(),
      evidence: {},
      reason: '',
      invalidation: '',
      last_evaluated_timestamp: new Date().toISOString()
    };

    const result = StepEvaluator.evaluateStep(step, contextWithoutM1, {});
    expect(result.status).toBe('AWAITING');
    expect(result.reason).toContain('M1');
  });

  it('RuleEngine should return WAIT when strategy-3-scalping lacks M1 data', () => {
    const contextWithoutM1: RuleEvaluationContext = {
      symbol: 'XAUUSD',
      timeframe: 'M15',
      timestamp: new Date().toISOString(),
      candles: [{ timestamp: '2026-03-30T10:00:00Z', open: 2640, high: 2655, low: 2638, close: 2650, volume: 1000, provider: 'twelvedata', latency: 50, freshness: 'live', confidence: 1.0 }],
      strategyMarketContext: {
        symbol: 'XAUUSD',
        currentPrice: 2650,
        currentTimestamp: new Date().toISOString(),
        session: 'London',
        spread: { spreadPips: 1.5, isAcceptable: true, timestamp: new Date().toISOString() },
        provider: 'mock',
        dataFreshness: 'live'
      }
    };

    const results = RuleEngine.evaluateStrategyRules('strategy-3-scalping', contextWithoutM1, {});
    expect(results['rule_timeframe_m1']?.status).toBe('WAIT');
  });
});
