import { StrategyResponse, DashboardCard, StrategyStep } from "@/types";
import { getStrategyFlow, getStepDisplayName as getSMStepDisplayName } from "@/lib/trading-engine/state-machine";
import { getStrategyDefinition } from "@/lib/trading-engine/strategy-registry";

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
        setupStatus = 'failed';
        if (s.currentStep?.toLowerCase().includes('expired')) setupStatus = 'expired';
        if (s.currentStep?.toLowerCase().includes('suppress')) setupStatus = 'suppressed';
     } else if (s.progress === 100) {
        setupStatus = 'finished';
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
  // Use canonical flow to build the timeline and update status based on current progress
  const canonical = getStrategyFlow(strategy.id);
  if (!canonical) return strategy.steps || [];

  const currentStep = strategy.currentStep || 'IDLE';
  const flow = canonical.steps;
  
  // Build sequential path to determine past/current/future steps
  const sequentialPath: string[] = [];
  let current: string | null = 'IDLE';
  while (current && !sequentialPath.includes(current)) {
    sequentialPath.push(current);
    const step = flow.find(s => s.id === current);
    current = step?.next || null;
  }

  const currentIdx = sequentialPath.indexOf(currentStep);
  const isTerminal = ['FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(currentStep);

  return flow.filter(s => s.status !== 'terminal' || s.id === currentStep).map(step => {
    const idx = sequentialPath.indexOf(step.id);
    let status = 'awaiting';
    
    if (step.id === currentStep) {
      status = isTerminal ? 'failed' : 'active';
      if (currentStep === 'FINISHED') status = 'finished';
    } else if (idx !== -1 && currentIdx !== -1 && idx < currentIdx) {
      status = 'finished';
    } else if (isTerminal) {
       // if terminal and this is not the terminal step, but it was in the path
       if (idx !== -1 && idx < sequentialPath.indexOf(currentStep)) {
           status = 'finished';
       } else {
           status = 'awaiting';
       }
    }

    return {
      name: step.title,
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
  
  // Base fields
  const base = {
    pair: snap.pair || snap.symbol || "--",
    session: snap.session || "--",
    timeframe: snap.timeframe || "--",
    
    // Core attributes
    h1Bias: snap.h1Bias ?? snap.marketBias ?? snap.bias ?? "--",
    bias: snap.bias ?? snap.marketBias ?? snap.h1Bias ?? "--",
    m15Bias: snap.m15Bias ?? "--",
    m5Bias: snap.m5Bias ?? "--",
    m1Trigger: snap.m1Trigger ?? "--",
    
    // Pricing
    atr14: snap.atr14 ?? "--",
    atrBuffer50Pct: snap.atrBuffer50Pct ?? "--",
    entry: snap.entry ?? snap.entryPrice ?? "--",
    sl: snap.sl ?? snap.slPrice ?? "--",
    tp1: snap.tp1 ?? snap.tp1Price ?? snap.tpPrice ?? "--",
    tp2: snap.tp2 ?? "--",
    tp3: snap.tp3 ?? "--",
    rr: snap.rr ?? "--",
    
    // Validation flags
    sweepStatus: snap.sweepStatus ?? "--",
    confirmationStatus: snap.confirmationStatus ?? "--",
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

export function buildRuleResults(strategyId: string, context: any) {
  const config = getStrategyConfig(strategyId);
  if (!config) return [];
  
  const rules = context || {};
  
  return config.validationRules.map((ruleName: string) => {
    const matchedRule = rules[ruleName] || Object.values(rules).find((r: any) => r.ruleId === ruleName || r.name === ruleName);
    
    return {
      ruleId: ruleName,
      status: matchedRule ? (matchedRule.status || (matchedRule.passed ? 'valid' : 'invalid')) : "pending",
      passed: matchedRule ? (matchedRule.passed || matchedRule.status === 'valid') : false,
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
  if (!rawStrategies || !Array.isArray(rawStrategies)) return [];

  return rawStrategies.map((found: StrategyResponse) => {
    const cfg = getStrategyConfig(found.id);
    return {
      ...found,
      name: cfg?.name || found.name || found.id,
      description: cfg?.description || found.description || "",
      updatedAt: found.updatedAt || null
    };
  });
}
