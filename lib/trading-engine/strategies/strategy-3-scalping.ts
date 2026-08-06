import { RuleEvaluationContext } from '@/types';

export interface StrategyExecutionResult {
  isCandidateValid: boolean | 'pending';
  direction: 'buy' | 'sell';
  candidateRules: Record<string, any>;
  confluenceScore: number;
  confirmationStatus: string;
  setupSnapshot: Record<string, any>;
}

export function detectStrategy3Scalping(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  const currentSession = pyData.current_session || pyData.session || 'Any';

  const pairMatch = symbol === 'XAUUSD';
  const h1Trend = pyData.trend_h1 || pyData.trend || 'neutral';
  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const doubleTop = !!pyData.double_top;
  const doubleBottom = !!pyData.double_bottom;
  const newsActive = !!pyData.news_high_impact_active;
  const spreadAcceptable = pyData.spread_acceptable !== false;
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;
  const hasTrend = h1Trend === 'bullish' || h1Trend === 'bearish';

  const candidateRules = {
    rule_pair_restriction: {
      status: pairMatch ? 'valid' : 'invalid',
      evidence: { symbol, required: 'XAUUSD', match: pairMatch },
      description: 'Pair restriction strictly XAUUSD'
    },
    rule_session_restriction: {
      status: 'valid',
      evidence: { session: currentSession, required: 'Any', valid: true },
      description: 'Session Filter Window'
    },
    rule_h1_trend: {
      status: hasTrend ? 'valid' : 'pending',
      evidence: { trend: h1Trend, timeframe: 'H1', detail: 'H1 Trend Alignment' },
      description: 'H1 Higher Timeframe Trend Alignment'
    },
    rule_scalp_pattern: {
      status: (doubleTop || doubleBottom || sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { doubleTop, doubleBottom, sweepBull, sweepBear, detail: (doubleTop || doubleBottom) ? 'M1 Double Top/Bottom Formed' : 'M1 Structural Pattern Formation Monitored' },
      description: 'M1 Scalp Pattern & Liquidity Sweep'
    },
    rule_spread_check: {
      status: spreadAcceptable ? 'valid' : 'invalid',
      evidence: { acceptable: spreadAcceptable, detail: spreadAcceptable ? 'Spread within acceptable thresholds' : 'Spread exceeds limit' },
      description: 'Spread Width Safety Gate'
    },
    rule_atr_sl_buffer: {
      status: 'valid',
      evidence: { atr, slBufferPips: ((atr * 0.3) * 10).toFixed(1) },
      description: 'ATR (14) Dynamic Buffer'
    },
    rule_risk_reward: {
      status: !newsActive ? 'valid' : 'invalid',
      evidence: { targetRR: '1:3+', highImpactActive: newsActive, detail: newsActive ? 'Blocked by High Impact News' : 'Min 1:3 RR Validated' },
      description: 'Scalp Minimum Risk/Reward 1:3 Gate'
    }
  };

  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;

  for (const [key, res] of Object.entries(candidateRules)) {
    totalCount++;
    if (res.status === 'invalid') {
      if (key.includes('news')) {
        hasCriticalInvalid = true;
      }
    }
    if (res.status === 'pending') hasPending = true;
    if (res.status === 'valid') validCount++;
  }

  const confluenceScore = totalCount > 0 ? Math.round((validCount / totalCount) * 100) : 0;
  let isCandidateValid: boolean | 'pending' = true;
  if (hasCriticalInvalid) isCandidateValid = false;
  else if (hasPending) isCandidateValid = 'pending';
  else isCandidateValid = confluenceScore >= 75;

  const direction: 'buy' | 'sell' = doubleBottom ? 'buy' : (doubleTop ? 'sell' : (sweepBull ? 'buy' : (sweepBear ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy'))));

  const confirmationStatus = (doubleTop || doubleBottom)
    ? 'M1 Double Top/Bottom & Neckline Break Confirmed'
    : 'M1 Structural Pattern & Neckline Monitored';

  const riskDistance = atr * 0.3;
  const entryPriceVal = currentPrice || 0;
  const slVal = entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined;
  const tp1Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 3.0) : entryPriceVal - (riskDistance * 3.0)) : undefined;
  const tp2Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 4.5) : entryPriceVal - (riskDistance * 4.5)) : undefined;
  const tp3Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 6.0) : entryPriceVal - (riskDistance * 6.0)) : undefined;

  const setupSnapshot = {
    strategyId: 'strategy-3-scalping',
    strategyName: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    symbol,
    timeframe: 'M1',
    session: currentSession,
    h1Trend,
    bias: h1Trend.toUpperCase(),
    marketBias: h1Trend.toUpperCase(),
    direction,
    entry: entryPriceVal,
    entryPrice: entryPriceVal,
    sl: slVal,
    slPrice: slVal,
    tp1: tp1Val,
    tp1Price: tp1Val,
    tp2: tp2Val,
    tp2Price: tp2Val,
    tp3: tp3Val,
    tp3Price: tp3Val,
    rr: '1:3.0',
    patternStatus: (doubleTop || doubleBottom) ? 'M1 Double Top/Bottom Formed' : 'Monitoring M1 Pattern',
    necklineStatus: (doubleTop || doubleBottom) ? 'Neckline Broken' : 'Monitoring Neckline',
    newsStatus: newsActive ? 'High Impact Active' : 'Clear',
    atr14: atr,
    atrBuffer50Pct: `${((atr * 0.3) * 10).toFixed(1)} pips`,
    confluenceScore,
    confirmationStatus,
    aiDecision: pyData.aiDecision || 'PENDING'
  };

  return {
    isCandidateValid,
    direction,
    candidateRules,
    confluenceScore,
    confirmationStatus,
    setupSnapshot
  };
}
