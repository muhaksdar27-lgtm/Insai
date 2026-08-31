import { StrategyResponse, DashboardCard, StrategyStep } from "@/types";
import { getStrategyFlow, getStepDisplayName as getSMStepDisplayName } from "@/lib/trading-engine/state-machine";
import { getStrategyDefinition } from "@/lib/trading-engine/strategy-registry";
import { 
  CANONICAL_STRATEGY_DEFINITIONS, 
  CANONICAL_STRATEGY_IDS 
} from "@/lib/trading-engine/strategies/definitions";
import { transformCandidateRules, RuleValidationResult } from "@/lib/utils/rule-transformer";

export const CANONICAL_STRATEGIES = CANONICAL_STRATEGY_IDS.map(id => ({
  id: CANONICAL_STRATEGY_DEFINITIONS[id].id,
  name: CANONICAL_STRATEGY_DEFINITIONS[id].name,
  description: CANONICAL_STRATEGY_DEFINITIONS[id].description
}));

export function normalizeStrategy(strategy: StrategyResponse) {
  const steps = buildTimeline(strategy);
  const validatedCount = steps.filter((s: StrategyStep) => s.status === 'validated' || s.status === 'approved').length;
  const progress = steps.length > 0 ? Math.round((validatedCount / steps.length) * 100) : (strategy.progress || 0);
  
  // UI strictly reflects canonical persisted state from backend/engine without forged calculations
  const rawStatus = (strategy.status || '').trim();
  const rawStatusUpper = rawStatus.toUpperCase();

  let setupStatus = rawStatus || 'UNKNOWN';
  if (!rawStatus || rawStatusUpper === 'UNKNOWN') {
    setupStatus = 'UNKNOWN';
  } else if (rawStatusUpper === 'DATABASE_UNAVAILABLE' || rawStatusUpper === 'NOT_CONFIGURED') {
    setupStatus = 'DATABASE_UNAVAILABLE';
  } else if (rawStatusUpper === 'AI_PENDING') {
    setupStatus = 'AI_PENDING';
  } else if (rawStatusUpper === 'AWAITING' || rawStatusUpper === 'WAITING_MARKET' || rawStatusUpper === 'INITIALIZING') {
    setupStatus = 'AWAITING';
  } else if (rawStatusUpper === 'DETECTED') {
    setupStatus = 'DETECTED';
  } else if (rawStatusUpper === 'ACTIVE') {
    setupStatus = 'ACTIVE';
  } else if (rawStatusUpper === 'VALIDATED') {
    setupStatus = 'VALIDATED';
  } else if (rawStatusUpper === 'APPROVED') {
    setupStatus = 'APPROVED';
  } else if (rawStatusUpper === 'SIGNAL_ACTIVE' || rawStatusUpper === 'DISPATCHED') {
    setupStatus = 'SIGNAL_ACTIVE';
  } else if (rawStatusUpper === 'REJECTED' || rawStatusUpper === 'FAILED') {
    setupStatus = 'REJECTED';
  } else if (rawStatusUpper === 'INVALIDATED' || rawStatusUpper === 'SUPPRESSED') {
    setupStatus = 'INVALIDATED';
  } else if (rawStatusUpper === 'EXPIRED') {
    setupStatus = 'EXPIRED';
  } else if (rawStatusUpper === 'COMPLETED' || rawStatusUpper === 'FINISHED') {
    setupStatus = 'COMPLETED';
  } else if (rawStatusUpper === 'ERROR') {
    setupStatus = 'ERROR';
  } else if (rawStatusUpper === 'DISABLED' || rawStatusUpper === 'STOPPED') {
    setupStatus = 'disabled';
  }

  const activeStep = steps.find(s => s.status === 'active' || s.status === 'awaiting') || steps[steps.length - 1];
  const currentStep = strategy.currentStep || activeStep?.name || 'Awaiting';
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
  const sequentialSteps = flow.filter(s => s.id !== 'FAILED' && s.id !== 'REJECTED');

  // Case 1: Backend provides canonical steps directly in strategy.steps
  if (Array.isArray(strategy.steps) && strategy.steps.length > 0) {
    return strategy.steps.map((st: any, idx: number) => {
      const canonicalStep = sequentialSteps[idx] || sequentialSteps.find(s => s.id === st.id || s.title === st.name);
      const rawStatus = String(st.status || st.state || '').toLowerCase();
      let status: 'awaiting' | 'active' | 'validated' | 'approved' | 'rejected' | 'expired' = 'awaiting';
      if (rawStatus === 'validated') status = 'validated';
      else if (rawStatus === 'approved') status = 'approved';
      else if (rawStatus === 'active' || rawStatus === 'detected' || rawStatus === 'current') status = 'active';
      else if (rawStatus === 'rejected' || rawStatus === 'failed' || rawStatus === 'invalidated') status = 'rejected';
      else if (rawStatus === 'expired') status = 'expired';
      else status = 'awaiting';

      return {
        id: st.id || canonicalStep?.id || `step-${idx + 1}`,
        name: st.name || canonicalStep?.title || `Step ${idx + 1}`,
        status
      };
    });
  }

  if (!flow.length) return [];

  // Case 2: Read canonical step state records from setupSnapshot (persisted setupObject)
  const setupObj = (strategy.setupSnapshot as any)?.setupObject;
  const canonicalStepsFromSnapshot: any[] = setupObj?.steps || (strategy as any)?.setupSteps || [];
  const rules = strategy.ruleResults || {};

  return sequentialSteps.map((stepConfig, idx) => {
    // 1:1 Match with canonical step record
    const recordedStep = canonicalStepsFromSnapshot.find(
      (s: any) => s.step_id === stepConfig.id || s.step_order === idx + 1 || s.name === stepConfig.title
    );

    if (recordedStep) {
      const stUpper = String(recordedStep.state || recordedStep.status || '').toUpperCase();
      let status: 'awaiting' | 'active' | 'validated' | 'approved' | 'rejected' | 'expired' = 'awaiting';
      if (stUpper === 'VALIDATED') status = 'validated';
      else if (stUpper === 'APPROVED') status = 'approved';
      else if (stUpper === 'ACTIVE' || stUpper === 'DETECTED') status = 'active';
      else if (stUpper === 'REJECTED' || stUpper === 'INVALIDATED' || stUpper === 'FAILED') status = 'rejected';
      else if (stUpper === 'EXPIRED') status = 'expired';
      else status = 'awaiting';

      return {
        id: stepConfig.id,
        name: stepConfig.title,
        status
      };
    }

    // 1:1 Match with direct rule result
    const directRule = rules[stepConfig.id] || Object.values(rules).find((r: any) => r.ruleId === stepConfig.id);
    if (directRule) {
      const stUpper = String(directRule.status || '').toUpperCase();
      if (stUpper === 'PASS' || stUpper === 'VALID' || stUpper === 'VALIDATED' || stUpper === 'APPROVED') {
        return { id: stepConfig.id, name: stepConfig.title, status: 'validated' };
      }
      if (stUpper === 'FAIL' || stUpper === 'INVALID' || stUpper === 'REJECTED') {
        return { id: stepConfig.id, name: stepConfig.title, status: 'rejected' };
      }
    }

    // Default: awaiting / unknown
    return {
      id: stepConfig.id,
      name: stepConfig.title,
      status: 'awaiting'
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
  const h1Trend = snap.h1Bias ?? snap.marketBias ?? snap.bias ?? snap.h1Trend ?? snap.trend_h1 ?? snap.trend ?? "--";
  const biasUpper = h1Trend !== "--" ? String(h1Trend).toUpperCase() : "--";
  
  const dir = snap.direction || snap.signal_direction || snap.signalDirection || (biasUpper === 'BULLISH' ? 'BUY' : (biasUpper === 'BEARISH' ? 'SELL' : '--'));
  const dirUpper = String(dir).toUpperCase();
  const normalizedDirection = (dirUpper === 'BUY' || dirUpper === 'LONG') ? 'BUY' : ((dirUpper === 'SELL' || dirUpper === 'SHORT') ? 'SELL' : '--');

  const atrVal = snap.atr14 ?? snap.atr;
  const hasAtr = typeof atrVal === 'number' && atrVal > 0;

  // Base fields
  const base = {
    pair: snap.pair || snap.symbol || "XAUUSD",
    session: snap.session || snap.current_session || "--",
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
    atr14: hasAtr ? atrVal : "--",
    atrBuffer50Pct: hasAtr ? `${(Number(atrVal) * 0.5 * 10).toFixed(1)} pips` : (snap.atrBuffer50Pct ?? "--"),
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
      status: 'DATABASE_UNAVAILABLE',
      progress: 0,
      currentStep: 'Database Unavailable',
      steps: flowSteps.map((s) => ({
        id: s.id,
        name: s.title,
        status: 'awaiting'
      })),
      setupSnapshot: {},
      ruleResults: {},
      signal: null,
      freshness: 'stale',
      updatedAt: null,
      errors: ['State unavailable']
    };
  });
}
