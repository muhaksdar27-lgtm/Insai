// @ts-nocheck
import { RuleEvaluationContext } from '@/types';
import { RuleEngine } from '../rule-engine';

export interface StrategyExecutionResult {
  isCandidateValid: boolean | 'pending';
  direction: 'buy' | 'sell';
  candidateRules: Record<string, any>;
  confluenceScore: number;
  confirmationStatus: string;
  setupSnapshot: Record<string, any>;
}

export function detectStrategy1SMC(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  
  // Use RuleEngine to evaluate rules
  const candidateRules = RuleEngine.evaluateStrategyRules('strategy-1-smc', context, pyData);
  
  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;
  
  for (const res of Object.values(candidateRules)) {
    totalCount++;
    if (res.status === 'invalid' || res.status === 'FAIL') {
      if (res.mandatory) hasCriticalInvalid = true;
    }
    if (res.status === 'WAIT' || res.status === 'valid_wait') hasPending = true;
    if (res.status === 'PASS' || res.status === 'valid') validCount++;
  }
  
  const confluenceScore = totalCount > 0 ? Math.round((validCount / totalCount) * 100) : 0;
  let isCandidateValid: boolean | 'pending' = true;
  if (hasCriticalInvalid) isCandidateValid = false;
  else if (hasPending) isCandidateValid = 'pending';
  else isCandidateValid = confluenceScore >= 80;

  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const chochBull = !!pyData.choch_bull;
  const chochBear = !!pyData.choch_bear;
  const obFvgBull = !!pyData.ob_fvg_bull;
  const obFvgBear = !!pyData.ob_fvg_bear;
  const h1Trend = pyData.trend_h1 || pyData.trend || 'neutral';
  
  const direction: 'buy' | 'sell' = (chochBull || sweepBull) ? 'buy' : ((chochBear || sweepBear) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy'));

  const confirmationStatus = (sweepBull || sweepBear) && (chochBull || chochBear)
    ? 'Asia Sweep & M15 CHoCH Confirmed'
    : 'Asia Liquidity Sweep / CHoCH Monitored';

  const atr = pyData.atr || 4.5;
  const riskDistance = atr * 0.5;
  const entryPriceVal = pyData.entry_price || pyData.current_price || context.candles?.[context.candles?.length - 1]?.close || 0;
  const slVal = pyData.sl_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined);
  const tp1Val = pyData.tp_price || pyData.tp1_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 2.0) : entryPriceVal - (riskDistance * 2.0)) : undefined);
  
  const currentSession = pyData.current_session || pyData.session || 'London';

  const setupSnapshot = {
    strategyId: 'strategy-1-smc',
    strategyName: 'STRATEGI 1 — SMC + Sesi London + M15',
    symbol,
    timeframe: 'M15',
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
    rr: candidateRules['rule_risk_reward']?.evidence?.rr || '1:2.0',
    sweepStatus: (sweepBull || sweepBear) ? 'Asia Sweep Confirmed' : 'Asia Sweep Monitored',
    chochStatus: (chochBull || chochBear) ? 'M15 CHoCH Confirmed' : 'M15 CHoCH Monitored',
    obFvgStatus: (obFvgBull || obFvgBear) ? 'OB/FVG Aligned' : 'OB/FVG Monitored',
    atr14: atr,
    atrBuffer50Pct: `${((atr * 0.5) * 10).toFixed(1)} pips`,
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
