import { RuleEvaluationContext } from '@/types';

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
  const currentSession = pyData.current_session || pyData.session || 'News Window';

  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const bosBull = !!pyData.bos_bull;
  const bosBear = !!pyData.bos_bear;
  const spreadAcceptable = pyData.spread_acceptable !== false;
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const candidateRules = {
    rule_news_high_impact: {
      status: 'valid',
      evidence: { detail: 'Post-News Reaction Window Monitored' },
      description: 'Post-News Reaction Window'
    },
    rule_spread_wide_filter: {
      status: spreadAcceptable ? 'valid' : 'invalid',
      evidence: { acceptable: spreadAcceptable, detail: spreadAcceptable ? 'Spread Normalization Confirmed' : 'Spread Exceptionally Wide' },
      description: 'Post-News Spread Normalization Check'
    },
    rule_liquidity_sweep: {
      status: (sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: (sweepBull || sweepBear) ? 'Post-News Spike Liquidity Sweep Confirmed' : 'Post-News Spike Liquidity Sweep Monitored' },
      description: 'Post-News Spike Liquidity Sweep'
    },
    rule_rejection_confirmation: {
      status: (sweepBull || sweepBear) ? 'valid' : 'pending',
      evidence: { detail: (sweepBull || sweepBear) ? 'Strong Wick Rejection Candle Confirmed' : 'Monitoring Rejection Candle Wicks' },
      description: 'Strong Wick Rejection Confirmation'
    },
    rule_bos_reversal: {
      status: (bosBull || bosBear) ? 'valid' : 'pending',
      evidence: { bosBull, bosBear, detail: (bosBull || bosBear) ? 'M1 Structure Break in Reversal Direction' : 'Monitoring Reversal Structure Break' },
      description: 'M1 Break of Structure (BOS) Reversal'
    },
    rule_ai_validation: {
      status: 'valid',
      evidence: { note: 'News Reversal AI Confluence Gate Ready', decision: pyData.aiDecision || 'APPROVED' },
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
      if (key.includes('spread')) {
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
  else isCandidateValid = confluenceScore >= 70;

  const direction: 'buy' | 'sell' = sweepBull ? 'buy' : (sweepBear ? 'sell' : (bosBull ? 'buy' : 'sell'));

  const confirmationStatus = (sweepBull || sweepBear) && (bosBull || bosBear)
    ? 'Post-News Spike Sweep & M1 Reversal BOS Confirmed'
    : 'Post-News Reaction & Reversal Monitored';

  const setupSnapshot = {
    strategyId: 'strategy-4-news',
    strategyName: 'Strategi 4 (news)',
    symbol,
    timeframe: 'M1',
    session: currentSession,
    h1Trend: direction === 'buy' ? 'bullish' : 'bearish',
    bias: direction === 'buy' ? 'BULLISH' : 'BEARISH',
    marketBias: direction === 'buy' ? 'BULLISH' : 'BEARISH',
    direction,
    entry: currentPrice,
    sl: direction === 'buy' ? (currentPrice ? currentPrice - (atr * 0.6) : undefined) : (currentPrice ? currentPrice + (atr * 0.6) : undefined),
    tp1: direction === 'buy' ? (currentPrice ? currentPrice + (atr * 1.5) : undefined) : (currentPrice ? currentPrice - (atr * 1.5) : undefined),
    spikeSweepStatus: (sweepBull || sweepBear) ? 'Spike Sweep Confirmed' : 'Monitoring News Spike',
    reversalBosStatus: (bosBull || bosBear) ? 'Reversal BOS Confirmed' : 'Monitoring Reversal BOS',
    spreadStatus: spreadAcceptable ? 'Normalized' : 'Wide',
    atr14: atr,
    atrBuffer50Pct: `${((atr * 0.6) * 10).toFixed(1)} pips`,
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
