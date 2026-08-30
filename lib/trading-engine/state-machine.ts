import { StateName, StepStatus } from '@/types';
import { OfficialSetupState } from './types';
import { 
  CANONICAL_STRATEGY_DEFINITIONS, 
  CANONICAL_STRATEGY_IDS, 
  CanonicalStrategyId 
} from './strategies/definitions';

/**
 * Official Setup State Machine:
 * 1. AWAITING
 * 2. DETECTED
 * 3. ACTIVE
 * 4. VALIDATED
 * 5. AI_PENDING
 * 6. APPROVED
 * 7. SIGNAL_ACTIVE
 * 8. REJECTED
 * 9. INVALIDATED
 * 10. EXPIRED
 * 11. COMPLETED
 * 12. ERROR
 */
export const STEPS = {
  AWAITING: 'AWAITING',
  DETECTED: 'DETECTED',
  ACTIVE: 'ACTIVE',
  VALIDATED: 'VALIDATED',
  AI_PENDING: 'AI_PENDING',
  APPROVED: 'APPROVED',
  SIGNAL_ACTIVE: 'SIGNAL_ACTIVE',
  REJECTED: 'REJECTED',
  INVALIDATED: 'INVALIDATED',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',

  // Canonical pipeline step aliases mapped deterministically
  INITIALIZING: 'AWAITING',
  WAITING_MARKET: 'AWAITING',
  SCANNING: 'AWAITING',
  SETUP_FOUND: 'DETECTED',
  RULE_VALIDATION: 'VALIDATED',
  RISK_VALIDATION: 'VALIDATED',
  AI_VALIDATION: 'AI_PENDING',
  SIGNAL_READY: 'APPROVED',
  DISPATCHED: 'SIGNAL_ACTIVE',
  FAILED: 'REJECTED',

  // Legacy aliases
  IDLE: 'AWAITING',
  WAIT_SESSION: 'AWAITING',
  WAIT: 'AWAITING',
  SCAN_MARKET: 'AWAITING',
  DETECT_SETUP: 'DETECTED',
  STRUCTURE: 'DETECTED',
  SETUP: 'DETECTED',
  CONFIRMATION: 'ACTIVE',
  VALIDATE_RULES: 'VALIDATED',
  VALIDATION: 'VALIDATED',
  CALCULATE_RISK: 'VALIDATED',
  SEND_SIGNAL: 'SIGNAL_ACTIVE',
  SIGNAL_SENT: 'SIGNAL_ACTIVE',
  FINISHED: 'COMPLETED',
  SUPPRESSED: 'INVALIDATED'
} as const;

export const OFFICIAL_SETUP_STATES: OfficialSetupState[] = [
  'AWAITING',
  'DETECTED',
  'ACTIVE',
  'VALIDATED',
  'AI_PENDING',
  'APPROVED',
  'SIGNAL_ACTIVE',
  'REJECTED',
  'INVALIDATED',
  'EXPIRED',
  'COMPLETED',
  'ERROR'
];

export interface StrategyStepConfig {
  id: StateName;
  title: string;
  description: string;
  status: 'awaiting' | 'active' | 'terminal';
  next: StateName | null;
  rollback: StateName | null;
  timeout: number;
}

export interface StrategyFlowConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: StrategyStepConfig[];
}

function buildStepsFromCanonical(strategyId: CanonicalStrategyId): StrategyStepConfig[] {
  const def = CANONICAL_STRATEGY_DEFINITIONS[strategyId];
  const steps: StrategyStepConfig[] = def.steps.map(s => ({
    id: s.step_id as StateName,
    title: s.name,
    description: s.description,
    status: s.status || 'awaiting',
    next: s.next || null,
    rollback: s.rollback || null,
    timeout: s.timeout || 0
  }));

  // Append active terminal step and rejected terminal step for state machine completeness
  steps.push({
    id: 'SIGNAL_ACTIVE' as StateName,
    title: 'Signal Active',
    description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram',
    status: 'active',
    next: null,
    rollback: null,
    timeout: 0
  });

  steps.push({
    id: 'REJECTED' as StateName,
    title: 'Rejected / Invalidated',
    description: 'Gagal pada evaluasi aturan atau konfluen AI',
    status: 'terminal',
    next: null,
    rollback: null,
    timeout: 0
  });

  return steps;
}

export const STRATEGY_1_STEPS: StrategyStepConfig[] = buildStepsFromCanonical('strategy-1-smc');
export const STRATEGY_2_STEPS: StrategyStepConfig[] = buildStepsFromCanonical('strategy-2-snd');
export const STRATEGY_3_STEPS: StrategyStepConfig[] = buildStepsFromCanonical('strategy-3-scalping');
export const STRATEGY_4_STEPS: StrategyStepConfig[] = buildStepsFromCanonical('strategy-4-news');
export const STRATEGY_5_STEPS: StrategyStepConfig[] = buildStepsFromCanonical('strategy-5-smc-sd-confluence');

export const STRATEGY_FLOWS_CONFIG: StrategyFlowConfig[] = CANONICAL_STRATEGY_IDS.map(id => {
  const def = CANONICAL_STRATEGY_DEFINITIONS[id];
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    steps: buildStepsFromCanonical(id)
  };
});

export function normalizeStateName(state: string): StateName {
  if (!state) return 'AWAITING';
  const s = state.toUpperCase().trim();
  if (s === 'AWAITING' || s === 'INITIALIZING' || s === 'IDLE' || s === 'WAITING_MARKET' || s === 'SCANNING' || s === 'WAIT_SESSION' || s === 'WAIT') return 'AWAITING';
  if (s === 'DETECTED' || s === 'SETUP_FOUND' || s === 'DETECT_SETUP' || s === 'STRUCTURE' || s === 'SETUP') return 'DETECTED';
  if (s === 'ACTIVE' || s === 'CONFIRMATION') return 'ACTIVE';
  if (s === 'VALIDATED' || s === 'RULE_VALIDATION' || s === 'RISK_VALIDATION' || s === 'VALIDATE_RULES' || s === 'CALCULATE_RISK') return 'VALIDATED';
  if (s === 'AI_PENDING' || s === 'AI_VALIDATION' || s === 'WAIT_AI') return 'AI_PENDING';
  if (s === 'APPROVED' || s === 'SIGNAL_READY') return 'APPROVED';
  if (s === 'SIGNAL_ACTIVE' || s === 'DISPATCHED' || s === 'SEND_SIGNAL' || s === 'SIGNAL_SENT') return 'SIGNAL_ACTIVE';
  if (s === 'REJECTED' || s === 'FAILED') return 'REJECTED';
  if (s === 'INVALIDATED' || s === 'SUPPRESSED') return 'INVALIDATED';
  if (s === 'EXPIRED') return 'EXPIRED';
  if (s === 'COMPLETED' || s === 'FINISHED') return 'COMPLETED';
  if (s === 'ERROR') return 'ERROR';
  return 'AWAITING';
}

export function getStrategyFlow(strategyId: string): StrategyFlowConfig | undefined {
  const found = STRATEGY_FLOWS_CONFIG.find(s => s.id === strategyId);
  if (!found) {
    throw new Error(`[CANONICAL_ERROR] Unknown strategy ID: "${strategyId}". Fallback to Strategy 1 is strictly forbidden.`);
  }
  return found;
}

export function tryGetStrategyFlow(strategyId: string): StrategyFlowConfig | undefined {
  return STRATEGY_FLOWS_CONFIG.find(s => s.id === strategyId);
}

export function getStep(strategyId: string, stepId: string): StrategyStepConfig | undefined {
  if (!strategyId || !stepId) return undefined;
  const flow = tryGetStrategyFlow(strategyId);
  if (!flow || !flow.steps.length) return undefined;

  let match = flow.steps.find(s => s.id === stepId);
  if (match) return match;

  const lower = stepId.toLowerCase().trim();
  match = flow.steps.find(s => s.title.toLowerCase().trim() === lower);
  if (match) return match;

  const normId = normalizeStateName(stepId);
  const nonTerminalSteps = flow.steps.filter(s => s.id !== 'REJECTED');
  
  if (normId === 'REJECTED' || normId === 'INVALIDATED' || normId === 'EXPIRED' || normId === 'ERROR') {
    return flow.steps.find(s => s.id === 'REJECTED') || flow.steps[flow.steps.length - 1];
  }
  if (normId === 'AWAITING') return nonTerminalSteps[0];
  if (normId === 'DETECTED') return nonTerminalSteps[Math.min(1, nonTerminalSteps.length - 1)];
  if (normId === 'ACTIVE') return nonTerminalSteps[Math.min(2, nonTerminalSteps.length - 1)];
  if (normId === 'VALIDATED') return nonTerminalSteps[Math.min(3, nonTerminalSteps.length - 1)];
  if (normId === 'AI_PENDING') return nonTerminalSteps[Math.max(0, nonTerminalSteps.length - 2)];
  if (normId === 'APPROVED' || normId === 'SIGNAL_ACTIVE' || normId === 'COMPLETED') return nonTerminalSteps[nonTerminalSteps.length - 1];

  return nonTerminalSteps[0];
}

export function getNextStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const step = getStep(strategyId, currentStepId);
  if (step?.next) {
    return getStep(strategyId, step.next);
  }
  return undefined;
}

export function getStepDisplayName(strategyId: string, stepId: string): string {
  const step = getStep(strategyId, stepId);
  return step?.title || stepId.replace(/_/g, ' ');
}

export interface StrategyState {
  stateName: StateName;
  timestamp: string;
  strategyId: string;
  signalKey?: string;
  currentStatus: StepStatus;
  reason: string;
  nextExpectedState: StateName | null;
  context?: any;
}

export class StateMachine {
  private currentState: StateName;
  private strategyId: string;
  private currentSignalKey: string | undefined;
  public lastTransitionState: StrategyState | null = null;

  constructor(strategyId: string, initialState: StateName = 'AWAITING') {
    this.strategyId = strategyId;
    this.currentState = normalizeStateName(initialState);
  }

  public getCurrentState(): StateName {
    return this.currentState;
  }

  public getSignalKey(): string | undefined {
    return this.currentSignalKey;
  }

  public forceState(newState: StateName, reason: string, signalKey?: string, context?: any) {
    const normState = normalizeStateName(newState);
    this.currentState = normState;
    if (signalKey) {
      this.currentSignalKey = signalKey;
    }
    
    const isTerm = ['SIGNAL_ACTIVE', 'REJECTED', 'INVALIDATED', 'EXPIRED', 'COMPLETED', 'ERROR'].includes(normState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerm ? (normState === 'REJECTED' || normState === 'INVALIDATED' || normState === 'EXPIRED' ? 'rejected' : 'active') : 'active',
      reason,
      nextExpectedState: getNextStep(this.strategyId, this.currentState)?.id as StateName || null,
      context
    };
    
    this.lastTransitionState = result;
    return result;
  }

  public transition(newState: StateName, reason: string, signalKey?: string, context?: any): StrategyState {
    const normState = normalizeStateName(newState);
    this.currentState = normState;

    if (this.currentState === 'APPROVED' || this.currentState === 'SIGNAL_ACTIVE') {
      this.currentSignalKey = signalKey || `${this.strategyId}_sig_${Date.now().toString(16)}`;
    } else if (signalKey) {
      this.currentSignalKey = signalKey;
    }

    const nextExpected = getNextStep(this.strategyId, this.currentState);
    const isTerm = ['SIGNAL_ACTIVE', 'REJECTED', 'INVALIDATED', 'EXPIRED', 'COMPLETED', 'ERROR'].includes(normState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerm ? (normState === 'REJECTED' || normState === 'INVALIDATED' || normState === 'EXPIRED' ? 'rejected' : 'active') : 'active',
      reason,
      nextExpectedState: nextExpected ? nextExpected.id as StateName : null,
      context
    };
    
    this.lastTransitionState = result;
    return result;
  }
}
