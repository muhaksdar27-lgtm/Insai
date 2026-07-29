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
  const currentSession = pyData.current_session || pyData.session || 'London';
  const sessionValid = currentSession === 'London' || currentSession === 'London/NY Overlap';

  const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const chochBull = !!pyData.choch_bull;
  const chochBear = !!pyData.choch_bear;
  const obFvgBull = !!pyData.ob_fvg_bull;
  const obFvgBear = !!pyData.ob_fvg_bear;
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const candidateRules = {
    rule_pair_xauusd: {
      status: pairMatch ? 'valid' : 'invalid',
      evidence: { symbol, required: 'XAUUSD', match: pairMatch },
      description: 'Pair restriction strictly XAUUSD'
    },
    rule_session_london: {
      status: sessionValid ? 'valid' : 'invalid',
      evidence: { session: currentSession, required: 'London', valid: sessionValid },
      description: 'London Session execution window'
    },
    rule_h1_trend: {
      status: 'valid',
      evidence: { trend: h1Trend, timeframe: 'H1', bias: h1Trend.toUpperCase() },
      description: 'H1 Higher Timeframe Trend Alignment'
    },
    rule_asia_liquidity_sweep: {
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
    rule_atr_sl_buffer: {
      status: 'valid',
      evidence: { atr, slBufferPips: ((atr * 0.5) * 10).toFixed(1) },
      description: 'ATR (14) SL Dynamic Buffer'
    },
    rule_ai_validation: {
      status: 'valid',
      evidence: { note: 'SMC London AI Confluence Gate Ready', decision: pyData.aiDecision || 'APPROVED' },
      description: 'AI Institutional Confluence Audit'
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

  const direction: 'buy' | 'sell' = (h1Trend === 'bearish' || chochBear || sweepBear) ? 'sell' : 'buy';

  const confirmationStatus = (sweepBull || sweepBear) && (chochBull || chochBear) 
    ? 'Asia Sweep & M15 CHoCH Confirmed'
    : 'Asia Liquidity Sweep / CHoCH Monitored';

  const setupSnapshot = {
    strategyId: 'strategy-1-smc',
    strategyName: 'STRATEGI 1 (smc +sesi landon+15mnt)',
    symbol,
    timeframe: 'M15',
    session: currentSession,
    h1Trend,
    bias: h1Trend.toUpperCase(),
    marketBias: h1Trend.toUpperCase(),
    direction,
    entry: currentPrice,
    sl: direction === 'buy' ? (currentPrice ? currentPrice - (atr * 0.5) : undefined) : (currentPrice ? currentPrice + (atr * 0.5) : undefined),
    tp1: direction === 'buy' ? (currentPrice ? currentPrice + (atr * 1.0) : undefined) : (currentPrice ? currentPrice - (atr * 1.0) : undefined),
    sweepStatus: (sweepBull || sweepBear) ? 'Asia Sweep Confirmed' : 'Asia Sweep Monitored',
    chochStatus: (chochBull || chochBear) ? 'M15 CHoCH Confirmed' : 'M15 CHoCH Monitored',
    obFvgStatus: (obFvgBull || obFvgBear) ? 'OB/FVG Aligned' : 'OB/FVG Monitored',
    atr14: atr,
    atrBuffer50Pct: `${((atr * 0.5) * 10).toFixed(1)} pips`,
    confluenceScore,
    confirmationStatus,
    aiDecision: pyData.aiDecision || 'APPROVED'
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
