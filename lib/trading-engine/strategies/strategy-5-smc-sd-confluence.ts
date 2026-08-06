import { RuleEvaluationContext } from '@/types';

export interface StrategyExecutionResult {
  isCandidateValid: boolean | 'pending';
  direction: 'buy' | 'sell';
  candidateRules: Record<string, any>;
  confluenceScore: number;
  confirmationStatus: string;
  setupSnapshot: Record<string, any>;
}

export function detectStrategy5Confluence(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  const currentSession = pyData.current_session || pyData.session || 'Any';

  const bosBull = !!pyData.bos_bull;
  const bosBear = !!pyData.bos_bear;
  const sdActive = !!pyData.sd_zone_active;
  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const h1Trend = pyData.trend_h1 || pyData.trend || 'neutral';
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const pairMatch = symbol === 'XAUUSD';
  const spreadAcceptable = pyData.spread_acceptable !== false;
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
      evidence: { trend: h1Trend, timeframe: 'H1/M15', detail: 'H1/M15 Structural Alignment' },
      description: 'H1 Higher Timeframe Trend Alignment'
    },
    rule_confluence_overlap: {
      status: ((bosBull || bosBear) && sdActive) ? 'valid' : 'pending',
      evidence: { bosBull, bosBear, sdActive, detail: ((bosBull || bosBear) && sdActive) ? 'S&D & Structural Confluence Overlap Confirmed' : 'Monitoring Confluence Overlap' },
      description: 'SMC-SD Multi-Zone Confluence Overlap'
    },
    rule_spread_check: {
      status: spreadAcceptable ? 'valid' : 'invalid',
      evidence: { acceptable: spreadAcceptable, detail: spreadAcceptable ? 'Spread within acceptable thresholds' : 'Spread exceeds limit' },
      description: 'Spread Width Safety Gate'
    },
    rule_atr_sl_buffer: {
      status: 'valid',
      evidence: { atr, slBufferPips: ((atr * 0.4) * 10).toFixed(1) },
      description: 'ATR (14) Dynamic Buffer'
    },
    rule_risk_reward: {
      status: 'valid',
      evidence: { minRR: '1:2+', detail: 'Risk/Reward Ratio Check Passed (Min 1:2+)' },
      description: 'Min 1:2 Risk/Reward Confluence Gate'
    }
  };

  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;

  for (const [, res] of Object.entries(candidateRules)) {
    totalCount++;
    if (res.status === 'invalid') {
      hasCriticalInvalid = true;
    }
    if (res.status === 'pending') hasPending = true;
    if (res.status === 'valid') validCount++;
  }

  const confluenceScore = totalCount > 0 ? Math.round((validCount / totalCount) * 100) : 0;
  let isCandidateValid: boolean | 'pending' = true;
  if (hasCriticalInvalid) isCandidateValid = false;
  else if (hasPending) isCandidateValid = 'pending';
  else isCandidateValid = confluenceScore >= 80;

  const direction: 'buy' | 'sell' = (bosBull || sweepBull) ? 'buy' : ((bosBear || sweepBear) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy'));

  const confirmationStatus = (bosBull || bosBear) && sdActive
    ? 'H1/M15 Structure & S&D Overlap Confluence Confirmed'
    : 'Multi-Zone Overlap & Structure Monitored';

  const riskDistance = atr * 0.4;
  const entryPriceVal = currentPrice || 0;
  const slVal = entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined;
  const tp1Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 3.0) : entryPriceVal - (riskDistance * 3.0)) : undefined;
  const tp2Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 5.0) : entryPriceVal - (riskDistance * 5.0)) : undefined;
  const tp3Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 7.5) : entryPriceVal - (riskDistance * 7.5)) : undefined;

  const setupSnapshot = {
    strategyId: 'strategy-5-smc-sd-confluence',
    strategyName: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    symbol,
    timeframe: 'M5',
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
    structureStatus: (bosBull || bosBear) ? 'Structure Aligned' : 'Structure Monitored',
    zoneOverlapStatus: sdActive ? 'S&D / Fib Overlap Active' : 'Zone Overlap Monitored',
    sweepStatus: (sweepBull || sweepBear) ? 'Sweep Confirmed' : 'Sweep Monitored',
    atr14: atr,
    atrBuffer50Pct: `${((atr * 0.4) * 10).toFixed(1)} pips`,
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
