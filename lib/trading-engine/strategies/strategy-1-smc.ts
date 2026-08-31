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
    if (res.status === 'WAIT' || res.status === 'pending') hasPending = true;
    if (res.status === 'PASS' || res.status === 'valid') validCount++;
  }
  
  const confluenceScore = totalCount > 0 ? Math.round((validCount / totalCount) * 100) : 0;
  let isCandidateValid: boolean | 'pending' = true;
  if (hasCriticalInvalid) isCandidateValid = false;
  else if (hasPending) isCandidateValid = 'pending';
  else isCandidateValid = confluenceScore >= 80;

  const s1 = pyData.strategy1 || {};
  const sweepBull = !!pyData.liq_sweep_bull || !!pyData.asian_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear || !!pyData.asian_sweep_bear;
  const chochBull = !!pyData.choch_bull;
  const chochBear = !!pyData.choch_bear;
  const obFvgBull = !!pyData.ob_fvg_bull;
  const obFvgBear = !!pyData.ob_fvg_bear;
  const h1Trend = (pyData.trend_h1 || pyData.trend || 'NEUTRAL').toLowerCase();
  
  const direction: 'buy' | 'sell' = s1.direction || ((chochBull || sweepBull) ? 'buy' : ((chochBear || sweepBear) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy')));

  const confirmationStatus = (sweepBull || sweepBear) && (chochBull || chochBear)
    ? 'Asia Sweep & M15 CHoCH Confirmed'
    : 'Asia Liquidity Sweep / CHoCH Monitored';

  const atr = typeof pyData.atr === 'number' && pyData.atr > 0 ? pyData.atr : 0;
  const entryPriceVal = s1.entry || pyData.current_price || context.candles?.[context.candles?.length - 1]?.close || 0;
  const slVal = s1.sl || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal - (atr * 0.5)).toFixed(2) : +(entryPriceVal + (atr * 0.5)).toFixed(2)) : undefined);
  const tp1Val = s1.tp1 || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal + (atr * 1.0)).toFixed(2) : +(entryPriceVal - (atr * 1.0)).toFixed(2)) : undefined);
  const tp2Val = s1.tp2 || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal + (atr * 1.75)).toFixed(2) : +(entryPriceVal - (atr * 1.75)).toFixed(2)) : undefined);
  
  const currentSession = pyData.current_session || pyData.session || 'UNDEFINED';

  const setupSnapshot = {
    strategyId: 'strategy-1-smc',
    strategyName: 'STRATEGI 1 — SMC + Sesi London + M15',
    symbol,
    timeframe: 'M15',
    session: currentSession,
    h1Trend: h1Trend.toUpperCase(),
    bias: h1Trend.toUpperCase(),
    marketBias: h1Trend.toUpperCase(),
    direction,
    entry: entryPriceVal || '--',
    entryPrice: entryPriceVal || '--',
    sl: slVal || '--',
    slPrice: slVal || '--',
    tp1: tp1Val || '--',
    tp1Price: tp1Val || '--',
    tp2: tp2Val || '--',
    tp2Price: tp2Val || '--',
    rr: s1.rr || candidateRules['rule_risk_reward']?.evidence?.rr || '--',
    dealingRangeZone: pyData.dealing_range_zone || 'UNDEFINED',
    fibLevel: pyData.fib_level ?? null,
    sweepStatus: s1.sweepStatus || ((sweepBull || sweepBear) ? 'Asia Sweep Confirmed' : 'Asia Sweep Monitored'),
    chochStatus: s1.chochStatus || ((chochBull || chochBear) ? 'M15 CHoCH Confirmed' : 'M15 CHoCH Monitored'),
    obFvgStatus: s1.obFvgStatus || ((obFvgBull || obFvgBear) ? 'OB/FVG Aligned' : 'OB/FVG Monitored'),
    hasDisplacement: !!pyData.has_displacement,
    idmTaken: !!pyData.idm_taken,
    atr14: atr > 0 ? atr : '--',
    atrBuffer50Pct: atr > 0 ? `${((atr * 0.5) * 10).toFixed(1)} pips` : '--',
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
