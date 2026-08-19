import { StrategyResponse, DashboardCard, StrategyStep } from "@/types";
import { getStrategyFlow, getStep, getStepDisplayName as getSMStepDisplayName, normalizeStateName } from "@/lib/trading-engine/state-machine";
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
  const s = strategy;
  let setupStatus = s.status || 'inactive';
  const steps = s.steps || [];
  
  if (s.status === 'stopped' || s.status === 'disabled') {
     setupStatus = 'disabled';
  } else if (s.status === 'error' || (s.errors && s.errors.length > 0)) {
     setupStatus = 'error';
  } else if (!steps || steps.length === 0) {
     setupStatus = s.status || 'inactive';
  } else {
     const isRejected = steps.some((st: StrategyStep) => st.status === 'failed' || st.status === 'rejected');
     if (isRejected) {
        setupStatus = 'rejected';
        if (s.currentStep?.toLowerCase().includes('expired')) setupStatus = 'expired';
        if (s.currentStep?.toLowerCase().includes('suppress')) setupStatus = 'suppressed';
     } else if (s.progress === 100) {
        setupStatus = 'approved';
     } else if (s.currentStep === 'Scanning' || s.currentStep === 'IDLE' || s.currentStep === 'Idle') {
        setupStatus = 'scanning';
     } else if (s.currentStep === 'Signal Active' || s.currentStep === 'Signal') {
        setupStatus = 'approved';
     } else {
        setupStatus = 'active';
     }
  }
  
  return {
    ...strategy,
    setupStatus,
    progress: strategy.progress || 0,
    steps: strategy.steps || [],
    currentStep: strategy.currentStep || '',
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
  const sequentialIds = sequentialSteps.map(s => s.id);

  const currentStep = strategy.currentStep || 'INITIALIZING';
  const currentStepObj = getStep(strategy.id, currentStep);
  let targetStepId = currentStepObj ? currentStepObj.id : currentStep;

  // Clean prefix if any
  if (typeof targetStepId === 'string' && (targetStepId.startsWith('Wait: ') || targetStepId.startsWith('Failed: '))) {
    const cleaned = targetStepId.replace(/^(Wait:\s*|Failed:\s*)/i, '');
    const foundStep = getStep(strategy.id, cleaned);
    if (foundStep) targetStepId = foundStep.id;
  }

  const normCurrent = normalizeStateName(targetStepId);
  const isFailed = normCurrent === 'FAILED' || targetStepId === 'FAILED' || (strategy.errors && strategy.errors.length > 0) || strategy.status === 'error' || strategy.status === 'failed' || strategy.status === 'rejected';
  
  // Strict status mapping
  let setupStatus = 'active';
  if (isFailed) {
      if (strategy.currentStep?.toLowerCase().includes('expired') || (strategy as any).setupStatus === 'expired') setupStatus = 'expired';
      else setupStatus = 'rejected';
  } else if (normCurrent === 'DISPATCHED' || targetStepId === 'DISPATCHED' || (strategy as any).setupStatus === 'approved' || strategy.status === 'finished') {
      setupStatus = 'approved';
  }

  let currentIdx = sequentialIds.indexOf(targetStepId as any);
  if (currentIdx === -1) {
    if (normCurrent === 'DISPATCHED' || setupStatus === 'approved') {
      currentIdx = sequentialIds.length - 1;
    } else if (normCurrent === 'SETUP_FOUND' || normCurrent === 'RULE_VALIDATION') {
      // Advance to structural confirmation trigger step (Step 3 or 4)
      currentIdx = Math.min(3, sequentialIds.length - 1);
    } else if (normCurrent === 'RISK_VALIDATION' || normCurrent === 'AI_VALIDATION') {
      currentIdx = Math.min(5, sequentialIds.length - 1);
    } else if (normCurrent === 'SIGNAL_READY') {
      currentIdx = sequentialIds.length - 2;
    } else {
      // Check if trend and pair are validated in ruleResults
      const rules = strategy.ruleResults || {};
      const hasTrend = rules['rule_h1_trend']?.status === 'PASS' || rules['rule_h1_trend']?.passed;
      if (hasTrend) {
        currentIdx = Math.min(2, sequentialIds.length - 1);
      } else {
        currentIdx = 0;
      }
    }
  }

  return sequentialSteps.map((stepConfig) => {
    const idx = sequentialIds.indexOf(stepConfig.id);
    let status = 'awaiting';
    
    if (setupStatus === 'expired' || setupStatus === 'rejected') {
      if (idx < currentIdx) status = 'validated';
      else if (idx === currentIdx) status = setupStatus;
      else status = 'awaiting';
    } else if (setupStatus === 'approved') {
      status = 'validated';
      if (idx === sequentialIds.length - 1) status = 'approved';
    } else {
      if (idx < currentIdx) status = 'validated';
      else if (idx === currentIdx) status = 'active';
      else status = 'awaiting';
    }

    return {
      id: stepConfig.id,
      name: stepConfig.title,
      status: status
    };
  });
}

export function buildRules(strategy: StrategyResponse) {
  return buildRuleResults(strategy.id, strategy.ruleResults || {});
}

export function buildSetupSnapshot(strategyId: string, context: any) {
  const config = getStrategyConfig(strategyId);
  if (!config) return null;

  const snap = context || {};
  const h1Trend = snap.h1Bias ?? snap.marketBias ?? snap.bias ?? snap.trend_h1 ?? snap.trend ?? "--";
  const biasUpper = h1Trend !== "--" ? String(h1Trend).toUpperCase() : "--";
  
  // Base fields
  const base = {
    pair: snap.pair || snap.symbol || "XAUUSD",
    session: snap.session || "London",
    timeframe: snap.timeframe || "M15",
    
    // Core attributes
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
    tp1: snap.tp1 ?? snap.tp1Price ?? snap.tpPrice ?? "--",
    tp2: snap.tp2 ?? snap.tp2Price ?? "--",
    tp3: snap.tp3 ?? snap.tp3Price ?? "--",
    rr: snap.rr ?? "--",
    
    // Validation flags
    sweepStatus: snap.sweepStatus ?? snap.liq_sweep_status ?? "--",
    confirmationStatus: snap.confirmationStatus ?? snap.confirmation_status ?? snap.chochStatus ?? "--",
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
      
      const directionRaw = typeof strategy.setupSnapshot?.direction === 'string' ? strategy.setupSnapshot.direction.toUpperCase() : '';
      if (strategy.setupSnapshot?.direction === 'buy' || directionRaw === 'LONG' || directionRaw === 'BUY') {
         risk = entry - sl;
         reward = tp1 - entry;
      } else if (strategy.setupSnapshot?.direction === 'sell' || directionRaw === 'SHORT' || directionRaw === 'SELL') {
         risk = sl - entry;
         reward = entry - tp1;
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
        const d = typeof strategy.setupSnapshot?.direction === 'string' ? strategy.setupSnapshot.direction.toUpperCase() : '';
        if (d === 'LONG' || d === 'BUY') return 'BUY';
        if (d === 'SHORT' || d === 'SELL') return 'SELL';
        return d && d !== '--' ? d : '--';
      })(),
      entry: formatPrice(snap?.entry),
      sl: formatPrice(snap?.sl),
      tp: formatPrice(snap?.tp1),
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
