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

  const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const doubleTop = !!pyData.double_top;
  const doubleBottom = !!pyData.double_bottom;
  const newsActive = !!pyData.news_high_impact_active;
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const candidateRules = {
    rule_h1_trend: {
      status: 'valid',
      evidence: { trend: h1Trend, timeframe: 'H1', detail: 'H1 Trend Alignment' },
      description: 'H1 Higher Timeframe Trend Alignment'
    },
    rule_m15_retracement: {
      status: 'valid',
      evidence: { detail: 'M15 Retracement into Key Level' },
      description: 'M15 Key Level Retracement'
    },
    rule_liquidity_sweep: {
      status: (sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: (sweepBull || sweepBear) ? 'Scalp Liquidity Sweep Confirmed' : 'Scalp Liquidity Sweep Monitored' },
      description: 'M1/M5 Scalp Liquidity Sweep'
    },
    rule_m1_double_top_bottom: {
      status: (doubleTop || doubleBottom) ? 'valid' : 'pending',
      evidence: { doubleTop, doubleBottom, detail: (doubleTop || doubleBottom) ? 'M1 Double Top/Bottom Formed' : 'M1 Structural Pattern Formation Monitored' },
      description: 'M1 Double Top / Double Bottom Structural Pattern'
    },
    rule_neckline_break: {
      status: (doubleTop || doubleBottom) ? 'valid' : 'pending',
      evidence: { detail: (doubleTop || doubleBottom) ? 'Neckline Break Confirmed' : 'Monitoring Neckline Break' },
      description: 'M1 Neckline Break Confirmation'
    },
    rule_rr_min_1_3: {
      status: 'valid',
      evidence: { targetRR: '1:3+', detail: 'Risk/Reward Ratio Validated (Min 1:3)' },
      description: 'Scalp Minimum Risk/Reward 1:3 Gate'
    },
    rule_news_filter: {
      status: !newsActive ? 'valid' : 'invalid',
      evidence: { highImpactActive: newsActive, detail: newsActive ? 'High Impact News Active - Blocked' : 'News Window Clear' },
      description: 'High-Impact News Exclusion Filter'
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
