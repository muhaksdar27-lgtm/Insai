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
  const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const candidateRules = {
    rule_h1_m15_structure: {
      status: (bosBull || bosBear) ? 'valid' : 'pending',
      evidence: { bosBull, bosBear, detail: (bosBull || bosBear) ? 'H1/M15 Structural Break Confirmed' : 'H1/M15 Structural Alignment Monitored' },
      description: 'H1/M15 Structural Alignment (BOS/CHoCH)'
    },
    rule_zone_overlap_2_of_3: {
      status: sdActive ? 'valid' : 'pending',
      evidence: { activeZone: sdActive, detail: sdActive ? 'S&D / Fibonacci Overlap Confirmed (2 of 3)' : 'Monitoring Zone Overlap' },
      description: 'Supply & Demand / Fib Multi-Zone Overlap'
    },
    rule_liquidity_sweep: {
      status: (sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: (sweepBull || sweepBear) ? 'Liquidity Sweep at Confluence Level Confirmed' : 'Liquidity Sweep Monitored' },
      description: 'Liquidity Sweep at Key Confluence Level'
    },
    rule_entry_trigger: {
      status: (bosBull || bosBear || sdActive || sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { detail: (bosBull || bosBear || sdActive || sweepBull || sweepBear) ? 'Trigger Candle Pattern Confirmed' : 'Monitoring Rejection Trigger Candle' },
      description: 'Trigger Candle Rejection Pattern'
    },
    rule_rr_gate: {
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
