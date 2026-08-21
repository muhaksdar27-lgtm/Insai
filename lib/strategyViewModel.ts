import { StrategyResponse, DashboardCard, StrategyStep } from "@/types";
import { getStrategyFlow, getStepDisplayName as getSMStepDisplayName } from "@/lib/trading-engine/state-machine";
import { getStrategyDefinition } from "@/lib/trading-engine/strategy-registry";
import { transformCandidateRules, RuleValidationResult } from "@/lib/utils/rule-transformer";

export const CANONICAL_STRATEGIES = [
  {
    id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    description: 'SMC Strategy strictly for London session on M15 timeframe. Relies on Asia session liquidity sweep and M15 CHoCH.'
  },
  {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    description: 'Supply and Demand zones paired with moving average confluence and engulfing trigger.'
  },
  {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    description: 'Aggressive M1 scalping aligned with H1 trend, requiring liquidity sweep before double top/bottom structural formation.'
  },
  {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    description: 'Trades the post-news liquidity sweep. Strictly avoids the initial news candle, waiting for structural reversal.'
  },
  {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    description: 'High-probability confluence engine requiring overlaps between market structure, SD zones, and liquidity sweeps.'
  }
] as const;

export function normalizeStrategy(strategy: StrategyResponse) {
  const steps = buildTimeline(strategy);
  const validatedCount = steps.filter((s: StrategyStep) => s.status === 'validated' || s.status === 'approved').length;
  const progress = steps.length > 0 ? Math.round((validatedCount / steps.length) * 100) : (strategy.progress || 0);
  
  let setupStatus = strategy.status || 'active';
  if (strategy.status === 'stopped' || strategy.status === 'disabled') {
     setupStatus = 'disabled';
  } else if (strategy.status === 'error') {
     setupStatus = 'error';
  } else if (progress === 100 || strategy.signal || strategy.currentStep === 'DISPATCHED' || (strategy as any).setupStatus === 'approved') {
     setupStatus = 'approved';
  } else if (steps.some((st: StrategyStep) => st.status === 'rejected')) {
     setupStatus = 'rejected';
  } else {
     setupStatus = 'active';
  }
  
  const activeStep = steps.find(s => s.status === 'active') || steps[steps.length - 1];
  const currentStep = activeStep?.name || strategy.currentStep || 'Scanning';
  const currentStepId = activeStep?.id || null;

  return {
    ...strategy,
    setupStatus,
    progress,
    steps,
    currentStep,
    currentStepId,
    setupSnapshot: strategy.setupSnapshot || null,
    ruleResults: strategy.ruleResults || null,
    signal: strategy.signal || null
  };
}

export function buildTimeline(strategy: StrategyResponse): StrategyStep[] {
  const canonical = getStrategyFlow(strategy.id);
  const flow = canonical?.steps || [];
  if (!flow.length) return strategy.steps || [];

  const sequentialSteps = flow.filter(s => s.id !== 'FAILED');
  const rules = strategy.ruleResults || {};
  const snapshot: any = strategy.setupSnapshot || {};
  const aiDecision = snapshot.aiDecision || (strategy as any).aiDecision;
  const isDispatched = !!strategy.signal || strategy.currentStep === 'DISPATCHED' || strategy.currentStep === 'Signal Active' || strategy.status === 'finished' || (strategy as any).setupStatus === 'approved';

  const checkRule = (ruleKey: string): boolean => {
    const r = rules[ruleKey] || Object.values(rules).find((x: any) => x.ruleId === ruleKey || x.name === ruleKey);
    if (!r) return false;
    const st = String(r.status || '').toUpperCase();
    return st === 'PASS' || st === 'VALID' || st === 'VALIDATED' || st === 'APPROVED' || r.passed === true;
  };

  const checkRuleFailed = (ruleKey: string): boolean => {
    const r = rules[ruleKey] || Object.values(rules).find((x: any) => x.ruleId === ruleKey || x.name === ruleKey);
    if (!r) return false;
    const st = String(r.status || '').toUpperCase();
    return st === 'FAIL' || st === 'INVALID' || st === 'REJECTED';
  };

  if (isDispatched) {
    return sequentialSteps.map((stepConfig, idx) => ({
      id: stepConfig.id,
      name: stepConfig.title,
      status: idx === sequentialSteps.length - 1 ? 'approved' : 'validated'
    }));
  }

  // Strategy-specific step evaluation
  const strategyId = strategy.id;
  const stepStatuses: Record<string, string> = {};

  if (strategyId === 'strategy-1-smc') {
    // 1. LONDON_FILTER
    const londonPassed = checkRule('rule_session_restriction');
    stepStatuses['LONDON_FILTER'] = londonPassed ? 'validated' : (checkRuleFailed('rule_session_restriction') ? 'rejected' : 'active');

    // 2. H1_TREND
    const trendPassed = checkRule('rule_h1_trend');
    stepStatuses['H1_TREND'] = trendPassed ? 'validated' : (checkRuleFailed('rule_h1_trend') ? 'rejected' : (stepStatuses['LONDON_FILTER'] === 'validated' ? 'active' : 'awaiting'));

    // 3. ASIA_SWEEP
    const sweepPassed = checkRule('rule_liquidity_sweep') || String(snapshot.sweepStatus || '').includes('Confirmed');
    stepStatuses['ASIA_SWEEP'] = sweepPassed ? 'validated' : (checkRuleFailed('rule_liquidity_sweep') ? 'rejected' : (stepStatuses['H1_TREND'] === 'validated' ? 'active' : 'awaiting'));

    // 4. M15_CHOCH
    const chochPassed = checkRule('rule_choch_confirmation') || String(snapshot.confirmationStatus || snapshot.chochStatus || '').includes('Confirmed');
    stepStatuses['M15_CHOCH'] = chochPassed ? 'validated' : (checkRuleFailed('rule_choch_confirmation') ? 'rejected' : (stepStatuses['ASIA_SWEEP'] === 'validated' ? 'active' : 'awaiting'));

    // 5. OB_FVG
    const obFvgPassed = checkRule('rule_ob_fvg_entry') || String(snapshot.obFvgStatus || '').includes('Aligned');
    stepStatuses['OB_FVG'] = obFvgPassed ? 'validated' : (checkRuleFailed('rule_ob_fvg_entry') ? 'rejected' : (stepStatuses['M15_CHOCH'] === 'validated' ? 'active' : 'awaiting'));

    // 6. RISK_PARAMS
    const riskPassed = checkRule('rule_spread_check') && checkRule('rule_atr_sl_buffer') && checkRule('rule_risk_reward');
    stepStatuses['RISK_PARAMS'] = riskPassed ? 'validated' : (checkRuleFailed('rule_spread_check') ? 'rejected' : (stepStatuses['OB_FVG'] === 'validated' ? 'active' : 'awaiting'));

    // 7. AI_GATE
    if (aiDecision === 'APPROVED') stepStatuses['AI_GATE'] = 'validated';
    else if (aiDecision === 'REJECTED') stepStatuses['AI_GATE'] = 'rejected';
    else stepStatuses['AI_GATE'] = stepStatuses['RISK_PARAMS'] === 'validated' ? 'active' : 'awaiting';

    // 8. DISPATCHED
    stepStatuses['DISPATCHED'] = isDispatched ? 'approved' : 'awaiting';
  } else if (strategyId === 'strategy-2-snd') {
    // 1. MA_TREND
    const trendPassed = checkRule('rule_h1_trend') || checkRule('rule_pair_restriction');
    stepStatuses['MA_TREND'] = trendPassed ? 'validated' : (checkRuleFailed('rule_h1_trend') ? 'rejected' : 'active');

    // 2. SD_ZONE
    const sdZonePassed = checkRule('rule_sd_zone') || String(snapshot.sdZoneStatus || '').includes('Active');
    stepStatuses['SD_ZONE'] = sdZonePassed ? 'validated' : (checkRuleFailed('rule_sd_zone') ? 'rejected' : (stepStatuses['MA_TREND'] === 'validated' ? 'active' : 'awaiting'));

    // 3. ENGULFING_TRIGGER
    const engulfPassed = checkRule('rule_engulfing_trigger') || String(snapshot.engulfingStatus || '').includes('Confirmed');
    stepStatuses['ENGULFING_TRIGGER'] = engulfPassed ? 'validated' : (checkRuleFailed('rule_engulfing_trigger') ? 'rejected' : (stepStatuses['SD_ZONE'] === 'validated' ? 'active' : 'awaiting'));

    // 4. RISK_PARAMS
    const riskPassed = checkRule('rule_spread_check') && checkRule('rule_atr_sl_buffer') && checkRule('rule_risk_reward');
    stepStatuses['RISK_PARAMS'] = riskPassed ? 'validated' : (checkRuleFailed('rule_spread_check') ? 'rejected' : (stepStatuses['ENGULFING_TRIGGER'] === 'validated' ? 'active' : 'awaiting'));

    // 5. AI_GATE
    if (aiDecision === 'APPROVED') stepStatuses['AI_GATE'] = 'validated';
    else if (aiDecision === 'REJECTED') stepStatuses['AI_GATE'] = 'rejected';
    else stepStatuses['AI_GATE'] = stepStatuses['RISK_PARAMS'] === 'validated' ? 'active' : 'awaiting';

    // 6. DISPATCHED
    stepStatuses['DISPATCHED'] = isDispatched ? 'approved' : 'awaiting';
  } else if (strategyId === 'strategy-3-scalping') {
    // 1. H1_TREND
    const trendPassed = checkRule('rule_h1_trend');
    stepStatuses['H1_TREND'] = trendPassed ? 'validated' : (checkRuleFailed('rule_h1_trend') ? 'rejected' : 'active');

    // 2. M15_RETRACEMENT
    stepStatuses['M15_RETRACEMENT'] = trendPassed ? 'validated' : (stepStatuses['H1_TREND'] === 'validated' ? 'active' : 'awaiting');

    // 3. M1_M5_SWEEP
    const sweepPassed = checkRule('rule_liquidity_sweep') || String(snapshot.sweepStatus || '').includes('Confirmed');
    stepStatuses['M1_M5_SWEEP'] = sweepPassed ? 'validated' : (stepStatuses['M15_RETRACEMENT'] === 'validated' ? 'active' : 'awaiting');

    // 4. DOUBLE_TOP_BOTTOM
    const patternPassed = checkRule('rule_scalp_pattern') || String(snapshot.doubleTopBottomStatus || '').includes('Confirmed');
    stepStatuses['DOUBLE_TOP_BOTTOM'] = patternPassed ? 'validated' : (stepStatuses['M1_M5_SWEEP'] === 'validated' ? 'active' : 'awaiting');

    // 5. NECKLINE_BREAK
    stepStatuses['NECKLINE_BREAK'] = patternPassed ? 'validated' : (stepStatuses['DOUBLE_TOP_BOTTOM'] === 'validated' ? 'active' : 'awaiting');

    // 6. RISK_NEWS_FILTER
    const riskPassed = checkRule('rule_spread_check') && checkRule('rule_atr_sl_buffer');
    stepStatuses['RISK_NEWS_FILTER'] = riskPassed ? 'validated' : (stepStatuses['NECKLINE_BREAK'] === 'validated' ? 'active' : 'awaiting');

    // 7. AI_GATE
    if (aiDecision === 'APPROVED') stepStatuses['AI_GATE'] = 'validated';
    else if (aiDecision === 'REJECTED') stepStatuses['AI_GATE'] = 'rejected';
    else stepStatuses['AI_GATE'] = stepStatuses['RISK_NEWS_FILTER'] === 'validated' ? 'active' : 'awaiting';

    // 8. DISPATCHED
    stepStatuses['DISPATCHED'] = isDispatched ? 'approved' : 'awaiting';
  } else if (strategyId === 'strategy-4-news') {
    // 1. NEWS_WINDOW
    const newsWindowPassed = checkRule('rule_session_restriction');
    stepStatuses['NEWS_WINDOW'] = newsWindowPassed ? 'validated' : 'active';

    // 2. SPREAD_NORMAL
    const spreadPassed = checkRule('rule_spread_check');
    stepStatuses['SPREAD_NORMAL'] = spreadPassed ? 'validated' : (stepStatuses['NEWS_WINDOW'] === 'validated' ? 'active' : 'awaiting');

    // 3. POST_NEWS_SWEEP
    const sweepPassed = checkRule('rule_news_reversal') || String(snapshot.reversalStatus || '').includes('Confirmed');
    stepStatuses['POST_NEWS_SWEEP'] = sweepPassed ? 'validated' : (stepStatuses['SPREAD_NORMAL'] === 'validated' ? 'active' : 'awaiting');

    // 4. WICK_REJECTION
    stepStatuses['WICK_REJECTION'] = sweepPassed ? 'validated' : (stepStatuses['POST_NEWS_SWEEP'] === 'validated' ? 'active' : 'awaiting');

    // 5. M1_BOS_REVERSAL
    stepStatuses['M1_BOS_REVERSAL'] = sweepPassed ? 'validated' : (stepStatuses['WICK_REJECTION'] === 'validated' ? 'active' : 'awaiting');

    // 6. RISK_PARAMS
    const riskPassed = checkRule('rule_atr_sl_buffer') && checkRule('rule_risk_reward');
    stepStatuses['RISK_PARAMS'] = riskPassed ? 'validated' : (stepStatuses['M1_BOS_REVERSAL'] === 'validated' ? 'active' : 'awaiting');

    // 7. AI_GATE
    if (aiDecision === 'APPROVED') stepStatuses['AI_GATE'] = 'validated';
    else if (aiDecision === 'REJECTED') stepStatuses['AI_GATE'] = 'rejected';
    else stepStatuses['AI_GATE'] = stepStatuses['RISK_PARAMS'] === 'validated' ? 'active' : 'awaiting';

    // 8. DISPATCHED
    stepStatuses['DISPATCHED'] = isDispatched ? 'approved' : 'awaiting';
  } else {
    // strategy-5-smc-sd-confluence
    // 1. H1_M15_STRUCTURE
    const structPassed = checkRule('rule_h1_trend');
    stepStatuses['H1_M15_STRUCTURE'] = structPassed ? 'validated' : 'active';

    // 2. SD_FIB_OVERLAP
    const sdFibPassed = checkRule('rule_sd_zone') || checkRule('rule_confluence_overlap') || String(snapshot.confluenceStatus || '').includes('Confirmed');
    stepStatuses['SD_FIB_OVERLAP'] = sdFibPassed ? 'validated' : (stepStatuses['H1_M15_STRUCTURE'] === 'validated' ? 'active' : 'awaiting');

    // 3. CONFLUENCE_SWEEP
    const sweepPassed = checkRule('rule_liquidity_sweep') || String(snapshot.sweepStatus || '').includes('Confirmed');
    stepStatuses['CONFLUENCE_SWEEP'] = sweepPassed ? 'validated' : (stepStatuses['SD_FIB_OVERLAP'] === 'validated' ? 'active' : 'awaiting');

    // 4. REJECTION_TRIGGER
    const trigPassed = checkRule('rule_confluence_overlap') || String(snapshot.confluenceStatus || '').includes('Confirmed');
    stepStatuses['REJECTION_TRIGGER'] = trigPassed ? 'validated' : (stepStatuses['CONFLUENCE_SWEEP'] === 'validated' ? 'active' : 'awaiting');

    // 5. MIN_RR_CALC
    const minRRPassed = checkRule('rule_spread_check') && checkRule('rule_atr_sl_buffer') && checkRule('rule_risk_reward');
    stepStatuses['MIN_RR_CALC'] = minRRPassed ? 'validated' : (stepStatuses['REJECTION_TRIGGER'] === 'validated' ? 'active' : 'awaiting');

    // 6. AI_GATE
    if (aiDecision === 'APPROVED') stepStatuses['AI_GATE'] = 'validated';
    else if (aiDecision === 'REJECTED') stepStatuses['AI_GATE'] = 'rejected';
    else stepStatuses['AI_GATE'] = stepStatuses['MIN_RR_CALC'] === 'validated' ? 'active' : 'awaiting';

    // 7. DISPATCHED
    stepStatuses['DISPATCHED'] = isDispatched ? 'approved' : 'awaiting';
  }

  // Ensure at least one step is active if none are active and not all validated
  let hasActive = false;
  for (const step of sequentialSteps) {
    if (stepStatuses[step.id] === 'active') {
      hasActive = true;
      break;
    }
  }

  if (!hasActive) {
    for (const step of sequentialSteps) {
      if (stepStatuses[step.id] === 'awaiting') {
        stepStatuses[step.id] = 'active';
        break;
      }
    }
  }

  return sequentialSteps.map((stepConfig) => ({
    id: stepConfig.id,
    name: stepConfig.title,
    status: stepStatuses[stepConfig.id] || 'awaiting'
  }));
}

export function buildRules(strategy: StrategyResponse) {
  return buildRuleResults(strategy.id, strategy.ruleResults || {});
}

export function buildSetupSnapshot(strategyId: string, context: any) {
  const config = getStrategyConfig(strategyId);
  if (!config) return null;

  const snap = context || {};
  const h1Trend = snap.h1Bias ?? snap.marketBias ?? snap.bias ?? snap.h1Trend ?? snap.trend_h1 ?? snap.trend ?? "--";
  const biasUpper = h1Trend !== "--" ? String(h1Trend).toUpperCase() : "--";
  
  const dir = snap.direction || snap.signal_direction || snap.signalDirection || (biasUpper === 'BULLISH' ? 'BUY' : (biasUpper === 'BEARISH' ? 'SELL' : '--'));
  const dirUpper = String(dir).toUpperCase();
  const normalizedDirection = (dirUpper === 'BUY' || dirUpper === 'LONG') ? 'BUY' : ((dirUpper === 'SELL' || dirUpper === 'SHORT') ? 'SELL' : '--');

  // Base fields
  const base = {
    pair: snap.pair || snap.symbol || "XAUUSD",
    session: snap.session || snap.current_session || "London",
    timeframe: snap.timeframe || "M15",
    
    // Core attributes
    direction: normalizedDirection,
    h1Bias: biasUpper,
    bias: biasUpper,
    marketBias: biasUpper,
    m15Bias: snap.m15Bias ?? "--",
    m5Bias: snap.m5Bias ?? "--",
    m1Trigger: snap.m1Trigger ?? "--",
    
    // Pricing
    atr14: snap.atr14 ?? snap.atr ?? 4.5,
    atrBuffer50Pct: snap.atrBuffer50Pct ?? `${(Number(snap.atr14 || snap.atr || 4.5) * 0.5 * 10).toFixed(1)} pips`,
    entry: snap.entry ?? snap.entryPrice ?? snap.current_price ?? "--",
    sl: snap.sl ?? snap.slPrice ?? "--",
    tp1: snap.tp1 ?? snap.tp1Price ?? snap.tpPrice ?? snap.tp ?? "--",
    tp: snap.tp ?? snap.tpPrice ?? snap.tp1Price ?? snap.tp1 ?? "--",
    tp2: snap.tp2 ?? snap.tp2Price ?? "--",
    tp3: snap.tp3 ?? snap.tp3Price ?? "--",
    rr: snap.rr ?? "--",
    
    // Validation flags
    sweepStatus: snap.sweepStatus ?? snap.liq_sweep_status ?? "--",
    confirmationStatus: snap.confirmationStatus ?? snap.confirmation_status ?? snap.chochStatus ?? snap.reversalStatus ?? snap.confluenceStatus ?? "--",
    chochStatus: snap.chochStatus ?? "--",
    bosStatus: snap.bosStatus ?? "--",
    engulfingStatus: snap.engulfingStatus ?? "--",
    doubleTopBottomStatus: snap.doubleTopBottomStatus ?? "--",
    newsStatus: snap.newsStatus ?? "--",
    zoneOverlapStatus: snap.zoneOverlapStatus ?? "--",
    
    confluenceScore: snap.confluenceScore ?? "--",
    validationLogSummary: snap.validationLogSummary ?? "--"
  };

  return base;
}

export function buildRuleResults(strategyId: string, context: any): RuleValidationResult[] {
  const config = getStrategyConfig(strategyId);
  if (!config) return [];
  
  const rules = context || {};
  const { rulesPassed } = transformCandidateRules(rules);
  
  return config.validationRules.map((ruleName: string) => {
    const matchedRule = rules[ruleName] || Object.values(rules).find((r: any) => r.ruleId === ruleName || r.name === ruleName);
    const stUpper = String(matchedRule?.status || '').toUpperCase();
    const isExplicitPass = stUpper === 'PASS' || stUpper === 'VALID' || stUpper === 'VALIDATED' || stUpper === 'APPROVED';
    const isExplicitFail = stUpper === 'FAIL' || stUpper === 'INVALID' || stUpper === 'REJECTED';
    const isPassed = matchedRule ? (matchedRule.passed || isExplicitPass) : rulesPassed.includes(ruleName);
    
    let status: 'valid' | 'invalid' | 'pending' = 'pending';
    if (isExplicitPass || (matchedRule && isPassed && !isExplicitFail)) {
      status = 'valid';
    } else if (isExplicitFail) {
      status = 'invalid';
    } else {
      status = 'pending';
    }

    return {
      ruleId: ruleName,
      status: status,
      passed: isPassed && !isExplicitFail,
      invalidations: matchedRule?.invalidations || [],
      evidence: matchedRule?.evidence || matchedRule?.details || null
    };
  });
}

export function buildProgress(strategyId: string, state: any) {
  let percentage = state.progress || 0;
  let currentStep = state.currentStep || 'IDLE';

  if (strategyId && getStrategyConfig(strategyId)) {
    const calculatedProgress = getCurrentProgress(strategyId, currentStep);
    if (calculatedProgress > 0) percentage = calculatedProgress;
    currentStep = getStepDisplayName(strategyId, currentStep);
  } else {
    currentStep = "--";
  }

  return {
    currentStep: currentStep || "--",
    percentage,
    status: state.status || 'awaiting'
  };
}

export function buildSignalMetadata(strategyId: string, context: any) {
  return {
    strategyId,
    timestamp: context?.timestamp || Date.now(),
    signalKey: context?.signalKey || null,
    direction: context?.direction || "--",
    confidence: context?.confidence || "--",
    isReady: context?.isReady || false
  };
}

export function buildStrategySummary(strategyId: string, context: any) {
  const config = getStrategyConfig(strategyId);
  const snap = buildSetupSnapshot(strategyId, context?.setupSnapshot);
  const rules = buildRuleResults(strategyId, context?.ruleResults);
  const progress = buildProgress(strategyId, context);
  const metadata = buildSignalMetadata(strategyId, context);

  return {
    id: strategyId,
    name: config?.name || "--",
    description: config?.description || "--",
    config,
    setup: snap,
    rules,
    progress,
    metadata
  };
}

export function buildSetup(strategy: StrategyResponse) {
  const snap = buildSetupSnapshot(strategy.id, strategy.setupSnapshot || {});
  
  let rr = "--";
  if (snap && snap.entry !== "--" && snap.sl !== "--" && snap.tp1 !== "--" && snap.entry !== undefined && snap.sl !== undefined && snap.tp1 !== undefined) {
      let risk = 0;
      let reward = 0;
      const entry = Number(snap.entry);
      const sl = Number(snap.sl);
      const tp1 = Number(snap.tp1);
      
      const directionRaw = typeof strategy.setupSnapshot?.direction === 'string' ? strategy.setupSnapshot.direction.toUpperCase() : (snap.direction || '');
      if (directionRaw === 'LONG' || directionRaw === 'BUY') {
         risk = Math.abs(entry - sl);
         reward = Math.abs(tp1 - entry);
      } else if (directionRaw === 'SHORT' || directionRaw === 'SELL') {
         risk = Math.abs(sl - entry);
         reward = Math.abs(entry - tp1);
      }
      if (risk > 0) {
          rr = `1:${(reward / risk).toFixed(1)}`;
      }
  } else if (snap?.rr && snap.rr !== "--") {
      rr = String(snap.rr);
  }

  const formatPrice = (val: any) => {
      if (val === undefined || val === null || val === '--' || val === '') return '--';
      const num = Number(val);
      return isNaN(num) ? String(val) : num.toFixed(2);
  };

  return {
      pair: snap?.pair && snap.pair !== "--" ? snap.pair : '--',
      bias: snap?.h1Bias && snap.h1Bias !== "--" ? snap.h1Bias : (snap?.bias && snap.bias !== "--" ? snap.bias : '--'),
      session: snap?.session && snap.session !== "--" ? snap.session : '--',
      direction: (() => {
        const d = (typeof strategy.setupSnapshot?.direction === 'string' ? strategy.setupSnapshot.direction.toUpperCase() : (snap?.direction || '')).toUpperCase();
        if (d === 'LONG' || d === 'BUY') return 'BUY';
        if (d === 'SHORT' || d === 'SELL') return 'SELL';
        return d && d !== '--' ? d : '--';
      })(),
      entry: formatPrice(snap?.entry),
      sl: formatPrice(snap?.sl),
      tp: formatPrice(snap?.tp1 !== '--' ? snap?.tp1 : snap?.tp),
      rr: rr,
      validationLogSummary: snap?.validationLogSummary,
      timeframe: snap?.timeframe && snap.timeframe !== "--" ? snap.timeframe : '--',
      marketBias: snap?.h1Bias && snap.h1Bias !== "--" ? snap.h1Bias : (snap?.bias && snap.bias !== "--" ? snap.bias : '--'),
      atrBuffer: snap?.atrBuffer50Pct || snap?.atr14 || '--',
      sweepStatus: snap?.sweepStatus || '--',
      confirmationStatus: snap?.confirmationStatus || snap?.chochStatus || snap?.bosStatus || snap?.engulfingStatus || snap?.doubleTopBottomStatus || '--',
      confidence: strategy.setupSnapshot?.confidence,
      aiConfidence: strategy.setupSnapshot?.aiConfidence,
      aiReasoning: strategy.setupSnapshot?.aiReasoning,
      aiDecision: strategy.setupSnapshot?.aiDecision || strategy.aiDecision
  };
}

export function buildDashboard(strategy: StrategyResponse): DashboardCard | null {
  if (!strategy || !strategy.id) {
    return null;
  }

  const rules = buildRuleResults(strategy.id, strategy.ruleResults || {});
  const rulesCount = rules.length;
  const passedCount = rules.filter((r: any) => r.passed).length;
  const validationScore = rulesCount > 0 ? `${passedCount}/${rulesCount}` : "N/A";
  
  const setup = buildSetup(strategy);
  const progress = buildProgress(strategy.id, strategy);
  const config = getStrategyConfig(strategy.id);

  return {
      id: strategy.id,
      name: config?.name || strategy.name || strategy.id,
      description: config?.description || strategy.description || "",
      currentStep: progress.currentStep,
      progress: progress.percentage,
      status: progress.status,
      bias: setup.bias,
      session: setup.session,
      direction: setup.direction,
      validationScore,
      rr: setup.rr,
      entry: setup.entry,
      sl: setup.sl,
      tp: setup.tp,
      passedCount,
      rulesCount,
      pair: setup.pair,
      updatedAt: strategy.updatedAt
  };
}




export function getStrategyConfig(strategyId: string) {
  return getStrategyDefinition(strategyId) || null;
}


export function getStrategyFlowConfig(strategyId: string) {
  return getStrategyFlow(strategyId);
}

export function getStepDisplayName(strategyId: string, stepId: string): string {
  if (!strategyId || !stepId) return "--";
  const name = getSMStepDisplayName(strategyId, stepId);
  return name || stepId || "--";
}

export function getCurrentProgress(strategyId: string, currentStepId: string): number {
  if (!strategyId || !currentStepId) return 0;
  const canonical = getStrategyFlow(strategyId);
  if (!canonical) return 0;
  
  const flow = canonical.steps;
  if (!flow.length) return 0;
  
  // Build sequential path to calculate progress
  const sequentialPath: string[] = [];
  let current: string | null = 'IDLE';
  
  while (current && !sequentialPath.includes(current)) {
    sequentialPath.push(current);
    const step = flow.find(s => s.id === current);
    current = step?.next || null;
  }
  
  const stepConfig = flow.find(s => s.id === currentStepId);
  if (stepConfig?.status === 'terminal') {
      if (currentStepId === 'FINISHED') return 100;
  }

  const idx = sequentialPath.indexOf(currentStepId);
  if (idx === -1) return 0;
  
  if (sequentialPath.length <= 1) return 100;
  return Math.round((idx / (sequentialPath.length - 1)) * 100);
}

export function getRequiredSetupFields(strategyId: string): string[] {
  const config = getStrategyConfig(strategyId);
  return config ? config.setupFields : [];
}

export function getValidationRules(strategyId: string): string[] {
  const config = getStrategyConfig(strategyId);
  return config ? config.validationRules : [];
}


export function getAllStrategiesWithFallback(rawStrategies: StrategyResponse[]): StrategyResponse[] {
  const mapByCanonicalId = new Map<string, StrategyResponse>();
  if (Array.isArray(rawStrategies)) {
    for (const raw of rawStrategies) {
      if (raw && raw.id) {
        mapByCanonicalId.set(raw.id, raw);
      }
    }
  }

  return CANONICAL_STRATEGIES.map((canon) => {
    const existing = mapByCanonicalId.get(canon.id);
    if (existing) {
      return {
        ...existing,
        id: canon.id,
        name: canon.name,
        description: canon.description,
        status: existing.status || 'unconfigured',
        updatedAt: existing.updatedAt || null,
      };
    }

    const flowConfig = getStrategyFlow(canon.id);
    const flowSteps = flowConfig?.steps.filter(s => s.id !== 'FAILED') || [];

    return {
      id: canon.id,
      name: canon.name,
      description: canon.description,
      status: 'offline',
      progress: 0,
      currentStep: flowSteps[0]?.title || 'Filter / Initializing',
      steps: flowSteps.map((s, idx) => ({
        id: s.id,
        name: s.title,
        status: idx === 0 ? 'current' : 'awaiting'
      })),
      setupSnapshot: {},
      ruleResults: {},
      signal: null,
      freshness: 'live',
      updatedAt: null,
      errors: undefined
    };
  });
}
