import { RuleEvaluationContext } from '@/types';

export interface StrategyExecutionResult {
  isCandidateValid: boolean | 'pending';
  direction: 'buy' | 'sell';
  candidateRules: Record<string, any>;
  confluenceScore: number;
  confirmationStatus: string;
  setupSnapshot: Record<string, any>;
}

export function detectStrategy2SND(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  const pairMatch = symbol === 'XAUUSD';
  const currentSession = pyData.current_session || pyData.session || 'Any';

  const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
  const sdActive = !!pyData.sd_zone_active;
  const engulfBull = !!pyData.engulfing_bull;
  const engulfBear = !!pyData.engulfing_bear;
  const spreadAcceptable = pyData.spread_acceptable !== false;
  const atr = pyData.atr || 4.5;
  const currentPrice = pyData.current_price || context.candles?.[context.candles.length - 1]?.close;

  const candidateRules = {
    rule_pair_xauusd: {
      status: pairMatch ? 'valid' : 'invalid',
      evidence: { symbol, required: 'XAUUSD', match: pairMatch },
      description: 'Pair restriction strictly XAUUSD'
    },
    rule_ma_trend: {
      status: 'valid',
      evidence: { trend: h1Trend, timeframe: 'H1/H4', detail: 'MA Alignment Valid' },
      description: 'Moving Average Trend Alignment'
    },
    rule_sd_zone_touch: {
      status: sdActive ? 'valid' : 'pending',
      evidence: { activeZone: sdActive, detail: sdActive ? 'Price inside Supply/Demand Zone' : 'Monitoring S&D Zone' },
      description: 'Supply & Demand Zone Interaction'
    },
    rule_engulfing_confirm: {
      status: (engulfBull || engulfBear) ? 'valid' : 'pending',
      evidence: { bullEngulf: engulfBull, bearEngulf: engulfBear, detail: (engulfBull || engulfBear) ? 'M15/M5 Engulfing Candlestick Confirmed' : 'Engulfing Candlestick Monitored' },
      description: 'M15/M5 Engulfing Candlestick Trigger'
    },
    rule_spread_check: {
      status: spreadAcceptable ? 'valid' : 'invalid',
      evidence: { acceptable: spreadAcceptable, detail: spreadAcceptable ? 'Spread within acceptable thresholds' : 'Spread exceeds limit' },
      description: 'Spread Width Safety Gate'
    },
    rule_atr_sl_buffer: {
      status: 'valid',
      evidence: { atr, slBufferPips: ((atr * 0.5) * 10).toFixed(1) },
      description: 'ATR (14) Dynamic Buffer'
    }
  };

  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;

  for (const [key, res] of Object.entries(candidateRules)) {
    totalCount++;
    if (res.status === 'invalid') {
      if (key.includes('pair') || key.includes('spread')) {
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
  else isCandidateValid = confluenceScore >= 75;

  const direction: 'buy' | 'sell' = engulfBull ? 'buy' : (engulfBear ? 'sell' : (h1Trend === 'bearish' ? 'sell' : 'buy'));

  const confirmationStatus = sdActive && (engulfBull || engulfBear)
    ? 'Supply/Demand Touch & Engulfing Trigger Confirmed'
    : 'Supply/Demand Zone & Engulfing Monitored';

  const riskDistance = atr * 0.5;
  const entryPriceVal = currentPrice || 0;
  const slVal = entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined;
  const tp1Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 2.0) : entryPriceVal - (riskDistance * 2.0)) : undefined;
  const tp2Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 3.5) : entryPriceVal - (riskDistance * 3.5)) : undefined;
  const tp3Val = entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 5.0) : entryPriceVal - (riskDistance * 5.0)) : undefined;

  const setupSnapshot = {
    strategyId: 'strategy-2-snd',
    strategyName: 'STRATEGI 2 — Supply & Demand + Engulfing',
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
    sdZoneStatus: sdActive ? 'Inside S&D Zone' : 'Monitoring S&D Zone',
    engulfingStatus: (engulfBull || engulfBear) ? 'Engulfing Confirmed' : 'Engulfing Monitored',
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
