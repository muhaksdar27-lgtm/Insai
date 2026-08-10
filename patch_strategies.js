const fs = require('fs');

const strategies = [
  {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    timeframe: 'M15',
    statuses: [
      `sdZoneStatus: sdActive ? 'S&D Zone Active' : 'S&D Zone Monitored'`,
      `engulfingStatus: (engulfBull || engulfBear) ? 'Engulfing Confirmed' : 'Engulfing Monitored'`
    ],
    confStatus: "sdActive && (engulfBull || engulfBear) ? 'S&D + Engulfing Confirmed' : 'S&D / Engulfing Monitored'",
    fnSuffix: 'SND'
  },
  {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    timeframe: 'M1',
    statuses: [
      `sweepStatus: (sweepBull || sweepBear) ? 'Scalp Sweep Confirmed' : 'Scalp Sweep Monitored'`,
      `doubleTopBottomStatus: (doubleTop || doubleBottom) ? 'Double Top/Bottom Confirmed' : 'Double Top/Bottom Monitored'`
    ],
    confStatus: "(sweepBull || sweepBear) && (doubleTop || doubleBottom) ? 'Scalp Sweep & Double Top/Bottom Confirmed' : 'Scalp Pattern Monitored'",
    fnSuffix: 'Scalping'
  },
  {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    timeframe: 'M1',
    statuses: [
      `newsStatus: pyData.news_active ? 'News Window Active' : 'News Window Inactive'`,
      `reversalStatus: ((bosBull || bosBear) && (sweepBull || sweepBear)) ? 'News Reversal Confirmed' : 'News Reversal Monitored'`
    ],
    confStatus: "((bosBull || bosBear) && (sweepBull || sweepBear)) ? 'Post-News Reversal Confirmed' : 'Post-News Reversal Monitored'",
    fnSuffix: 'News'
  },
  {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    timeframe: 'M15',
    statuses: [
      `confluenceStatus: ((bosBull || bosBear) && sdActive) ? 'Confluence Overlap Confirmed' : 'Confluence Overlap Monitored'`
    ],
    confStatus: "((bosBull || bosBear) && sdActive) ? 'SMC-SD Confluence Confirmed' : 'SMC-SD Confluence Monitored'",
    fnSuffix: 'Confluence'
  }
];

strategies.forEach(s => {
  const content = `import { RuleEvaluationContext } from '@/types';
import { RuleEngine } from '../rule-engine';

export interface StrategyExecutionResult {
  isCandidateValid: boolean | 'pending';
  direction: 'buy' | 'sell';
  candidateRules: Record<string, any>;
  confluenceScore: number;
  confirmationStatus: string;
  setupSnapshot: Record<string, any>;
}

export function detectStrategy${s.id.split('-')[1].toUpperCase()}${s.fnSuffix}(context: RuleEvaluationContext, pyData: any = {}): StrategyExecutionResult {
  const symbol = context.symbol || 'XAUUSD';
  
  const candidateRules = RuleEngine.evaluateStrategyRules('${s.id}', context, pyData);
  
  let validCount = 0;
  let totalCount = 0;
  let hasCriticalInvalid = false;
  let hasPending = false;
  
  for (const [key, res] of Object.entries(candidateRules)) {
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

  const confirmationStatus = ${s.confStatus};

  const atr = pyData.atr || 4.5;
  const riskDistance = atr * 0.5;
  const entryPriceVal = pyData.entry_price || pyData.current_price || context.candles?.[context.candles?.length - 1]?.close || 0;
  const slVal = pyData.sl_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal - riskDistance : entryPriceVal + riskDistance) : undefined);
  const tp1Val = pyData.tp_price || pyData.tp1_price || (entryPriceVal ? (direction === 'buy' ? entryPriceVal + (riskDistance * 2.0) : entryPriceVal - (riskDistance * 2.0)) : undefined);
  
  const currentSession = pyData.current_session || pyData.session || 'Any';

  const setupSnapshot = {
    strategyId: '${s.id}',
    strategyName: '${s.name}',
    symbol,
    timeframe: '${s.timeframe}',
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
    ${s.statuses.join(',\n    ')},
    atr14: atr,
    atrBuffer50Pct: \`\${((atr * 0.5) * 10).toFixed(1)} pips\`,
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
`;
  
  const filename = `lib/trading-engine/strategies/${s.id}.ts`;
  fs.writeFileSync(filename, content);
});
