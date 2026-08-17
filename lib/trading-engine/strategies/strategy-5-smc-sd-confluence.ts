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

export function detectStrategy5Confluence(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  
  const candidateRules = RuleEngine.evaluateStrategyRules('strategy-5-smc-sd-confluence', context, pyData);
  
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
  const bosBull = !!pyData.bos_bull;
  const bosBear = !!pyData.bos_bear;
  const obFvgBull = !!pyData.ob_fvg_bull;
  const obFvgBear = !!pyData.ob_fvg_bear;
  const sdActive = !!pyData.sd_zone_active;
  const engulfBull = !!pyData.engulfing_bull;
  const engulfBear = !!pyData.engulfing_bear;
  const doubleTop = !!pyData.double_top;
  const doubleBottom = !!pyData.double_bottom;

  const h1Trend = pyData.trend_h1 || pyData.trend || 'neutral';
  
  const direction: 'buy' | 'sell' = (chochBull || sweepBull || bosBull || engulfBull || doubleBottom) ? 'buy' : ((chochBear || sweepBear || bosBear || engulfBear || doubleTop) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy'));

  const confirmationStatus = ((bosBull || bosBear) && sdActive) ? 'SMC-SD Confluence Confirmed' : 'SMC-SD Confluence Monitored';

  const atr = pyData.atr || 4.5;
  const riskDistance = atr * 0.5;
  const entryPriceVal = pyData.entry_price || pyData.current_price || context.candles?.[context.candles?.length - 1]?.close || 0;
  const slVal = pyData.sl_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined);
  const tp1Val = pyData.tp1_price || pyData.tp_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 2.0) : entryPriceVal - (riskDistance * 2.0)) : undefined);
  const tp2Val = pyData.tp2_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 3.5) : entryPriceVal - (riskDistance * 3.5)) : undefined);
  
  const currentSession = pyData.current_session || pyData.session || 'Any';

  const setupSnapshot = {
    strategyId: 'strategy-5-smc-sd-confluence',
    strategyName: 'STRATEGI 5 — SMC-SD Pattern Confluence',
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
    tp2: tp2Val,
    tp2Price: tp2Val,
    rr: candidateRules['rule_risk_reward']?.evidence?.rr || '1:2.0',
    dealingRangeZone: pyData.dealing_range_zone || 'EQUILIBRIUM',
    sdPattern: pyData.sd_pattern || 'DBR',
    zoneFreshness: pyData.zone_freshness || 'FRESH',
    confluenceStatus: ((bosBull || bosBear || chochBull || chochBear) && sdActive) ? `SMC + ${pyData.sd_pattern || 'S&D'} Confluence Confirmed` : 'Confluence Overlap Monitored',
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
