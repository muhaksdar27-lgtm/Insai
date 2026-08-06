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
  
  const newsActive = !!pyData.news_high_impact_active || !!pyData.is_news_active || pyData.current_session === 'News Window';
  const currentSession = pyData.current_session || pyData.session || (newsActive ? 'News Window' : 'No-News Window');

  const sweepBull = !!pyData.liq_sweep_bull;
  const sweepBear = !!pyData.liq_sweep_bear;
  const bosBull = !!pyData.bos_bull;
  const bosBear = !!pyData.bos_bear;
  const spreadAcceptable = pyData.spread_acceptable !== false;
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const pairMatch = symbol === 'XAUUSD';
  const candidateRules = {
    rule_pair_restriction: {
      status: pairMatch ? 'valid' : 'invalid',
      evidence: { symbol, required: 'XAUUSD', match: pairMatch },
      description: 'Pair restriction strictly XAUUSD'
    },
    rule_session_restriction: {
      status: newsActive ? 'valid' : 'invalid',
      evidence: { newsActive, session: currentSession, detail: newsActive ? 'Post-News Reaction Window Active' : 'No-News Window Active (Strategy 4 Blocked)' },
      description: 'High-Impact Post-News Reaction Window Restriction'
    },
    rule_news_reversal: {
      status: ((sweepBull || sweepBear) && (bosBull || bosBear)) ? 'valid' : 'pending',
      evidence: { sweepBull, sweepBear, bosBull, bosBear, detail: ((sweepBull || sweepBear) && (bosBull || bosBear)) ? 'Post-News Spike Sweep & BOS Reversal Confirmed' : 'Monitoring Reversal Pattern' },
      description: 'Post-News Reversal BOS Pattern'
    },
    rule_spread_check: {
      status: spreadAcceptable ? 'valid' : 'invalid',
      evidence: { acceptable: spreadAcceptable, detail: spreadAcceptable ? 'Spread Normalization Confirmed' : 'Spread Exceptionally Wide' },
      description: 'Post-News Spread Normalization Check'
    },
    rule_atr_sl_buffer: {
      status: 'valid',
      evidence: { atr, slBufferPips: ((atr * 0.6) * 10).toFixed(1) },
      description: 'ATR (14) Dynamic Buffer'
    },
    rule_risk_reward: {
      status: 'valid',
      evidence: { targetRR: '1:2.5+', detail: 'News Reversal Minimum Risk/Reward Validated' },
      description: 'Minimum Risk/Reward Gate'
    }
  };

  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;

  for (const [key, res] of Object.entries(candidateRules)) {
    totalCount++;
    if (res.status === 'invalid') {
      if (key.includes('news') || key.includes('spread')) {
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

  const riskDistance = atr * 0.6;
  const entryPriceVal = currentPrice || 0;
  const slVal = entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined;
  const tp1Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 2.5) : entryPriceVal - (riskDistance * 2.5)) : undefined;
  const tp2Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 4.0) : entryPriceVal - (riskDistance * 4.0)) : undefined;
  const tp3Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 6.0) : entryPriceVal - (riskDistance * 6.0)) : undefined;

  const setupSnapshot = {
    strategyId: 'strategy-4-news',
    strategyName: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    symbol,
    timeframe: 'M1',
    session: currentSession,
    h1Trend: direction === 'buy' ? 'bullish' : 'bearish',
    bias: direction === 'buy' ? 'BULLISH' : 'BEARISH',
    marketBias: direction === 'buy' ? 'BULLISH' : 'BEARISH',
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
    rr: '1:2.5',
    spikeSweepStatus: (sweepBull || sweepBear) ? 'Spike Sweep Confirmed' : 'Monitoring News Spike',
    reversalBosStatus: (bosBull || bosBear) ? 'Reversal BOS Confirmed' : 'Monitoring Reversal BOS',
    spreadStatus: spreadAcceptable ? 'Normalized' : 'Wide',
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
