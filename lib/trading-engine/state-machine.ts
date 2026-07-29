import { StateName, StepStatus } from '@/types';

/**
 * Strict set of 12 allowed states across all trading strategies.
 * State machine is the single source of truth for setup progression.
 */
export const STEPS = {
  WAIT: 'WAIT',
  SCANNING: 'SCANNING',
  STRUCTURE: 'STRUCTURE',
  SETUP: 'SETUP',
  CONFIRMATION: 'CONFIRMATION',
  VALIDATION: 'VALIDATION',
  AI_VALIDATION: 'AI_VALIDATION',
  SIGNAL_READY: 'SIGNAL_READY',
  SIGNAL_SENT: 'SIGNAL_SENT',
  FINISHED: 'FINISHED',
  REJECTED: 'REJECTED',
  ERROR: 'ERROR'
} as const;

export const CANONICAL_STATE_FLOW: StateName[] = [
  'WAIT',
  'SCANNING',
  'STRUCTURE',
  'SETUP',
  'CONFIRMATION',
  'VALIDATION',
  'AI_VALIDATION',
  'SIGNAL_READY',
  'SIGNAL_SENT',
  'FINISHED'
];

export interface StrategyStepConfig {
  id: StateName;
  title: string;
  description: string;
  status: 'awaiting' | 'active' | 'terminal';
  next: StateName | null;
  rollback: StateName | null;
  timeout: number;
  validator?: string;
}

export interface StrategyFlowConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: StrategyStepConfig[];
  validators?: any[];
  setupFields?: any[];
  ui?: any;
}

/**
 * Canonical 12-state step framework required for every strategy.
 * Every strategy follows the identical state sequence frame with its own rule set.
 */
export const CANONICAL_STEPS: StrategyStepConfig[] = [
  { id: 'WAIT', title: 'Session & Timing Check', description: 'Checking session overlap and timing filters', status: 'awaiting', next: 'SCANNING', rollback: null, timeout: 0 },
  { id: 'SCANNING', title: 'Market Scanning', description: 'Scanning live price action and candle feed', status: 'awaiting', next: 'STRUCTURE', rollback: 'WAIT', timeout: 0 },
  { id: 'STRUCTURE', title: 'Market Structure', description: 'Validating HTF bias and market structure alignment', status: 'awaiting', next: 'SETUP', rollback: 'WAIT', timeout: 0 },
  { id: 'SETUP', title: 'Setup Identification', description: 'Detecting key S&D zone, level, or liquidity sweep', status: 'awaiting', next: 'CONFIRMATION', rollback: 'WAIT', timeout: 0 },
  { id: 'CONFIRMATION', title: 'Trigger & Confirmation', description: 'Verifying CHoCH, engulfing, or structural trigger', status: 'awaiting', next: 'VALIDATION', rollback: 'WAIT', timeout: 0 },
  { id: 'VALIDATION', title: 'Rule Set Validation', description: 'Evaluating deterministic rule engine checklist', status: 'awaiting', next: 'AI_VALIDATION', rollback: 'REJECTED', timeout: 0 },
  { id: 'AI_VALIDATION', title: 'AI Confluence Gate', description: 'Running AI verification and risk validation', status: 'awaiting', next: 'SIGNAL_READY', rollback: 'REJECTED', timeout: 0 },
  { id: 'SIGNAL_READY', title: 'Signal Assembly & Pricing', description: 'Compiling entry, SL, TPs, and RR parameters', status: 'awaiting', next: 'SIGNAL_SENT', rollback: 'REJECTED', timeout: 0 },
  { id: 'SIGNAL_SENT', title: 'Signal Dispatched', description: 'Signal active and dispatched to monitoring pipeline', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
  { id: 'FINISHED', title: 'Finished', description: 'Strategy execution cycle completed successfully', status: 'terminal', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected by rule or validation engine', status: 'terminal', next: null, rollback: null, timeout: 0 },
  { id: 'ERROR', title: 'Execution Error', description: 'System or data exception encountered during scan', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_FLOWS_CONFIG: StrategyFlowConfig[] = [
  {
    id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    description: 'SMC Strategy strictly for London session on M15 timeframe. Relies on Asia session liquidity sweep and M15 CHoCH.',
    version: '2.0',
    steps: CANONICAL_STEPS
  },
  {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    description: 'Supply and Demand zones paired with moving average confluence and engulfing trigger.',
    version: '2.0',
    steps: CANONICAL_STEPS
  },
  {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    description: 'Aggressive M1 scalping aligned with H1 trend, requiring liquidity sweep before double top/bottom structural formation.',
    version: '2.0',
    steps: CANONICAL_STEPS
  },
  {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    description: 'Trades the post-news liquidity sweep. Strictly avoids the initial news candle, waiting for structural reversal.',
    version: '2.0',
    steps: CANONICAL_STEPS
  },
  {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    description: 'High-probability confluence engine requiring overlaps between market structure, SD zones, and liquidity sweeps.',
    version: '2.0',
    steps: CANONICAL_STEPS
  }
];

export function normalizeStateName(state: string): StateName {
  if (!state) return 'WAIT';
  const s = state.toUpperCase().trim();
  if (s === 'IDLE' || s === 'WAIT_SESSION' || s === 'WAIT_NEWS') return 'WAIT';
  if (s === 'SCANNING') return 'SCANNING';
  if (s === 'WAIT_TREND' || s === 'WAIT_STRUCTURE' || s === 'STRUCTURE') return 'STRUCTURE';
  if (s === 'WAIT_LEVEL' || s === 'WAIT_SWEEP' || s === 'WAIT_PATTERN' || s === 'WAIT_REJECTION' || s === 'WAIT_ZONE' || s === 'SETUP') return 'SETUP';
  if (s === 'WAIT_CONFIRMATION' || s === 'CONFIRMATION') return 'CONFIRMATION';
  if (s === 'VALIDATION') return 'VALIDATION';
  if (s === 'WAIT_AI' || s === 'AI_VALIDATION') return 'AI_VALIDATION';
  if (s === 'SIGNAL_READY') return 'SIGNAL_READY';
  if (s === 'SIGNAL_ACTIVE' || s === 'SIGNAL' || s === 'SIGNAL_SENT') return 'SIGNAL_SENT';
  if (s === 'FINISHED') return 'FINISHED';
  if (s === 'REJECTED' || s === 'EXPIRED' || s === 'SUPPRESSED') return 'REJECTED';
  if (s === 'ERROR') return 'ERROR';
  return 'WAIT';
}

export function getStrategyFlow(strategyId: string): StrategyFlowConfig | undefined {
  return STRATEGY_FLOWS_CONFIG.find(s => s.id === strategyId) || STRATEGY_FLOWS_CONFIG[0];
}

export function getStep(strategyId: string, stepId: string): StrategyStepConfig | undefined {
  const normId = normalizeStateName(stepId);
  const flow = getStrategyFlow(strategyId);
  return flow?.steps.find(s => s.id === normId);
}

export function getNextStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const normId = normalizeStateName(currentStepId);
  const step = getStep(strategyId, normId);
  if (step?.next) {
    return getStep(strategyId, step.next);
  }
  return undefined;
}

export function getPreviousStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const normId = normalizeStateName(currentStepId);
  const flow = getStrategyFlow(strategyId);
  if (!flow) return undefined;
  return flow.steps.find(s => s.next === normId);
}

export function getCurrentProgress(_strategyId: string, currentStepId: string): number {
  const normId = normalizeStateName(currentStepId);
  if (normId === 'FINISHED') return 100;
  if (normId === 'REJECTED' || normId === 'ERROR') return 0;
  
  const idx = CANONICAL_STATE_FLOW.indexOf(normId);
  if (idx === -1) return 0;
  return Math.round((idx / (CANONICAL_STATE_FLOW.length - 1)) * 100);
}

export function getCurrentStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  return getStep(strategyId, currentStepId);
}

export function getStepDisplayName(strategyId: string, stepId: string): string {
  const step = getStep(strategyId, stepId);
  return step?.title || stepId.replace(/_/g, ' ');
}

export function isFinished(_strategyId: string, stepId: string): boolean {
  return normalizeStateName(stepId) === 'FINISHED';
}

export function isWaiting(_strategyId: string, stepId: string): boolean {
  const norm = normalizeStateName(stepId);
  return norm === 'WAIT' || norm === 'SCANNING';
}

export function isRejected(_strategyId: string, stepId: string): boolean {
  const norm = normalizeStateName(stepId);
  return norm === 'REJECTED' || norm === 'ERROR';
}

export interface StrategyState {
  stateName: StateName;
  timestamp: string;
  strategyId: string;
  signalKey?: string;
  currentStatus: StepStatus;
  reason: string;
  nextExpectedState: StateName | null;
  context?: {
    direction?: 'buy' | 'sell';
    entryPrice?: number;
    slPrice?: number;
    tp1Price?: number;
    tp2Price?: number;
    tp3Price?: number;
    positionSize?: number;
    pipsRealized?: number;
  };
}

export class StateMachine {
  private currentState: StateName;
  private strategyId: string;
  private currentSignalKey: string | undefined;
  public lastTransitionState: StrategyState | null = null;

  constructor(strategyId: string, initialState: StateName = 'WAIT') {
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
    if (['WAIT', 'FINISHED', 'REJECTED', 'ERROR'].includes(normState)) {
       this.currentSignalKey = undefined;
    }
    
    const isTerm = ['FINISHED', 'REJECTED', 'ERROR'].includes(normState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerm ? (normState === 'REJECTED' || normState === 'ERROR' ? 'rejected' : 'active') : 'active',
      reason,
      nextExpectedState: getNextStep(this.strategyId, this.currentState)?.id as StateName || null,
      context
    };
    
    this.lastTransitionState = result;
    return result;
  }

  public getNextExpectedState(): StateName | null {
    return getNextStep(this.strategyId, this.currentState)?.id as StateName || null;
  }

  private generateSignalKey(_context?: any): string {
     const timeStr = new Date().getTime().toString(16);
     return `${this.strategyId}_key_${timeStr}`;
  }

  public transition(newState: StateName, reason: string, signalKey?: string, context?: any): StrategyState {
    const normState = normalizeStateName(newState);
    const isTerm = ['FINISHED', 'REJECTED', 'ERROR'].includes(normState);
    
    const isStateInFlow = getStep(this.strategyId, normState) !== undefined;
    const currentStepConfig = getStep(this.strategyId, this.currentState);
    const isRollback = currentStepConfig?.rollback === normState;
    const isValidTransition = isStateInFlow || isTerm || isRollback;
    
    if (isValidTransition) {
      this.currentState = normState;
    } else {
      throw new Error(`Invalid transition: Cannot move from ${this.currentState} to ${normState}.`);
    }

    if (this.currentState === 'SIGNAL_READY' || this.currentState === 'SIGNAL_SENT') {
        this.currentSignalKey = signalKey || this.generateSignalKey(context);
    } else if (signalKey) {
        this.currentSignalKey = signalKey;
    }

    const nextExpected = getNextStep(this.strategyId, this.currentState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerm ? (normState === 'REJECTED' || normState === 'ERROR' ? 'rejected' : 'active') : 'active',
      reason,
      nextExpectedState: nextExpected ? nextExpected.id as StateName : null,
      context
    };
    
    if (isTerm) {
        this.currentSignalKey = undefined;
    }
    
    this.lastTransitionState = result;
    return result;
  }
}
