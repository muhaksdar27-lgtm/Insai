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

export function detectStrategy4News(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  
  const candidateRules = RuleEngine.evaluateStrategyRules('strategy-4-news', context, pyData);
  
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

  const s4 = pyData.strategy4 || {};
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
  
  const direction: 'buy' | 'sell' = s4.direction || ((chochBull || sweepBull || bosBull || engulfBull || doubleBottom) ? 'buy' : ((chochBear || sweepBear || bosBear || engulfBear || doubleTop) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy')));

  const confirmationStatus = ((bosBull || bosBear) && (sweepBull || sweepBear)) ? 'Post-News Reversal Confirmed' : 'Post-News Reversal Monitored';

  const atr = pyData.atr || 0;
  const entryPriceVal = s4.entry || pyData.current_price || context.candles?.[context.candles?.length - 1]?.close || 0;
  const slVal = s4.sl || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal - (atr * 0.6)).toFixed(2) : +(entryPriceVal + (atr * 0.6)).toFixed(2)) : undefined);
  const tp1Val = s4.tp1 || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal + (atr * 1.5)).toFixed(2) : +(entryPriceVal - (atr * 1.5)).toFixed(2)) : undefined);
  const tp2Val = s4.tp2 || (entryPriceVal && atr > 0 ? (direction === 'buy' ? +(entryPriceVal + (atr * 2.4)).toFixed(2) : +(entryPriceVal - (atr * 2.4)).toFixed(2)) : undefined);
  
  const currentSession = pyData.current_session || pyData.session || 'News Window';

  const setupSnapshot = {
    strategyId: 'strategy-4-news',
    strategyName: 'STRATEGI 4 — News Liquidity Sweep Reversal',
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
    rr: s4.rr || candidateRules['rule_risk_reward']?.evidence?.rr || '1:2.5',
    newsStatus: s4.newsStatus || (pyData.news_high_impact_active ? 'High Impact Active' : 'Normal Post-News Volatility'),
    reversalStatus: s4.reversalStatus || (((bosBull || bosBear || chochBull || chochBear) && (sweepBull || sweepBear)) ? 'Post-News Spike Reversal Confirmed' : 'News Reversal Monitored'),
    atr14: atr,
    atrBuffer50Pct: `${((atr * 0.6) * 10).toFixed(1)} pips`,
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
