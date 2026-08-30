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

export function detectStrategy3Scalping(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  
  // Evaluate strategy rules
  const candidateRules = RuleEngine.evaluateStrategyRules('strategy-3-scalping', context, pyData);
  
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

  const s3 = pyData.strategy3 || {};
  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const chochBull = !!pyData.choch_bull;
  const chochBear = !!pyData.choch_bear;
  const bosBull = !!pyData.bos_bull;
  const bosBear = !!pyData.bos_bear;
  const obFvgBull = !!pyData.ob_fvg_bull;
  const obFvgBear = !!pyData.ob_fvg_bear;
  const sdActive = !!pyData.sd_zone_active;
  const engulfBull = !!pyData.engulfing_bull;
  const engulfBear = !!pyData.engulfing_bear;
  const doubleTop = !!pyData.double_top;
  const doubleBottom = !!pyData.double_bottom;

  const h1Trend = (pyData.trend_h1 || pyData.trend || 'NEUTRAL').toLowerCase();
  
  const direction: 'buy' | 'sell' = s3.direction || ((chochBull || sweepBull || bosBull || engulfBull || doubleBottom) ? 'buy' : ((chochBear || sweepBear || bosBear || engulfBear || doubleTop) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy')));

  const confirmationStatus = (sweepBull || sweepBear) && (doubleTop || doubleBottom) ? 'Scalp Sweep & Double Top/Bottom Confirmed' : 'Scalp Pattern Monitored';

  const atr = typeof pyData.atr === 'number' && pyData.atr > 0 ? pyData.atr : 0;
  const entryPriceVal = s3.entry || pyData.current_price || context.candles?.[context.candles?.length - 1]?.close || 0;
  const slVal = s3.sl || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal - (atr * 0.3)).toFixed(2) : +(entryPriceVal + (atr * 0.3)).toFixed(2)) : undefined);
  const tp1Val = s3.tp1 || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal + (atr * 0.45)).toFixed(2) : +(entryPriceVal - (atr * 0.45)).toFixed(2)) : undefined);
  const tp2Val = s3.tp2 || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal + (atr * 0.75)).toFixed(2) : +(entryPriceVal - (atr * 0.75)).toFixed(2)) : undefined);
  
  const currentSession = pyData.current_session || pyData.session || 'UNDEFINED';

  const setupSnapshot = {
    strategyId: 'strategy-3-scalping',
    strategyName: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    symbol,
    timeframe: 'M1',
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
    rr: s3.rr || candidateRules['rule_risk_reward']?.evidence?.rr || '--',
    sweepStatus: s3.sweepStatus || ((sweepBull || sweepBear || pyData.asian_sweep_bull || pyData.asian_sweep_bear) ? 'Scalp Sweep Confirmed' : 'Scalp Sweep Monitored'),
    doubleTopBottomStatus: s3.doubleTopBottomStatus || ((doubleTop || doubleBottom) ? (doubleTop ? 'Double Top Confirmed' : 'Double Bottom Confirmed') : 'Double Top/Bottom Monitored'),
    atr14: atr > 0 ? atr : '--',
    atrBuffer50Pct: atr > 0 ? `${((atr * 0.3) * 10).toFixed(1)} pips` : '--',
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
