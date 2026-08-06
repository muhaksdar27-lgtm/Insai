import { RuleEvaluationContext } from '@/types';

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
  const pairMatch = symbol === 'XAUUSD';

  const currentHour = new Date(context.timestamp || Date.now()).getUTCHours();
  const isLondonHours = currentHour >= 7 && currentHour < 16;
  const currentSession = pyData.current_session || pyData.session || (isLondonHours ? 'London' : 'Asian/Off-Session');
  const sessionValid = isLondonHours && (currentSession === 'London' || currentSession === 'London/NY Overlap');

  const h1Trend = pyData.trend_h1 || pyData.trend || 'neutral';
  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const chochBull = !!pyData.choch_bull;
  const chochBear = !!pyData.choch_bear;
  const obFvgBull = !!pyData.ob_fvg_bull;
  const obFvgBear = !!pyData.ob_fvg_bear;
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
      status: sessionValid ? 'valid' : 'invalid',
      evidence: { session: currentSession, required: 'London', valid: sessionValid },
      description: 'London Session execution window'
    },
    rule_h1_trend: {
      status: hasTrend ? 'valid' : 'pending',
      evidence: { trend: h1Trend, timeframe: 'H1', bias: h1Trend.toUpperCase() },
      description: 'H1 Higher Timeframe Trend Alignment'
    },
    rule_liquidity_sweep: {
      status: (sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: (sweepBull || sweepBear) ? 'Asia Liquidity Sweep Confirmed' : 'Asia Liquidity Sweep Monitored' },
      description: 'Asia Session High/Low Liquidity Sweep'
    },
    rule_choch_confirmation: {
      status: (chochBull || chochBear) ? 'valid' : 'pending',
      evidence: { bullChoch: chochBull, bearChoch: chochBear, detail: (chochBull || chochBear) ? 'M15 CHoCH Confirmed' : 'M15 CHoCH Structural Confirmation Monitored' },
      description: 'M15 Change of Character (CHoCH)'
    },
    rule_ob_fvg_entry: {
      status: (obFvgBull || obFvgBear) ? 'valid' : 'pending',
      evidence: { obFvgBull, obFvgBear, detail: (obFvgBull || obFvgBear) ? 'Order Block / FVG Aligned' : 'Order Block / FVG Alignment Monitored' },
      description: 'Order Block & Fair Value Gap Alignment'
    },
    rule_spread_check: {
      status: spreadAcceptable ? 'valid' : 'invalid',
      evidence: { acceptable: spreadAcceptable, detail: spreadAcceptable ? 'Spread within acceptable thresholds' : 'Spread exceeds limit' },
      description: 'Spread Width Safety Gate'
    },
    rule_atr_sl_buffer: {
      status: 'valid',
      evidence: { atr, slBufferPips: ((atr * 0.5) * 10).toFixed(1) },
      description: 'ATR (14) SL Dynamic Buffer'
    }
  };

  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;

  for (const [key, res] of Object.entries(candidateRules)) {
    totalCount++;
    if (res.status === 'invalid') {
      if (key.includes('pair') || key.includes('session')) {
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
  else isCandidateValid = confluenceScore >= 80;

  const direction: 'buy' | 'sell' = (chochBull || sweepBull) ? 'buy' : ((chochBear || sweepBear) ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy'));

  const confirmationStatus = (sweepBull || sweepBear) && (chochBull || chochBear) 
    ? 'Asia Sweep & M15 CHoCH Confirmed'
    : 'Asia Liquidity Sweep / CHoCH Monitored';

  const riskDistance = atr * 0.5;
  const entryPriceVal = currentPrice || 0;
  const slVal = entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined;
  const tp1Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 2.0) : entryPriceVal - (riskDistance * 2.0)) : undefined;
  const tp2Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 3.5) : entryPriceVal - (riskDistance * 3.5)) : undefined;
  const tp3Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 5.0) : entryPriceVal - (riskDistance * 5.0)) : undefined;

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
    tp2: tp2Val,
    tp2Price: tp2Val,
    tp3: tp3Val,
    tp3Price: tp3Val,
    rr: '1:2.0',
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
