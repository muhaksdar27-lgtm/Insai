import { StateName, StepStatus } from '@/types';

/**
 * Strict set of 10 sequential execution flow states + terminal states.
 * Deterministic state machine is the single source of truth for setup progression.
 */
export const STEPS = {
  IDLE: 'IDLE',
  WAIT_SESSION: 'WAIT_SESSION',
  SCAN_MARKET: 'SCAN_MARKET',
  DETECT_SETUP: 'DETECT_SETUP',
  VALIDATE_RULES: 'VALIDATE_RULES',
  CALCULATE_RISK: 'CALCULATE_RISK',
  AI_VALIDATION: 'AI_VALIDATION',
  SIGNAL_READY: 'SIGNAL_READY',
  SEND_SIGNAL: 'SEND_SIGNAL',
  FINISHED: 'FINISHED',
  REJECTED: 'REJECTED',
  ERROR: 'ERROR',

  // Legacy aliases for backward compatibility
  WAIT: 'WAIT_SESSION',
  SCANNING: 'SCAN_MARKET',
  STRUCTURE: 'DETECT_SETUP',
  SETUP: 'DETECT_SETUP',
  CONFIRMATION: 'DETECT_SETUP',
  VALIDATION: 'VALIDATE_RULES',
  SIGNAL_SENT: 'SEND_SIGNAL'
} as const;

export const CANONICAL_STATE_FLOW: StateName[] = [
  'IDLE',
  'WAIT_SESSION',
  'SCAN_MARKET',
  'DETECT_SETUP',
  'VALIDATE_RULES',
  'CALCULATE_RISK',
  'AI_VALIDATION',
  'SIGNAL_READY',
  'SEND_SIGNAL',
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
 * Deterministic 10-step canonical flow required for every strategy.
 * Allowed flow: IDLE -> WAIT_SESSION -> SCAN_MARKET -> DETECT_SETUP -> VALIDATE_RULES -> CALCULATE_RISK -> AI_VALIDATION -> SIGNAL_READY -> SEND_SIGNAL -> FINISHED
 * Terminal rejection: REJECTED / ERROR (allowed from any state)
 */
export const CANONICAL_STEPS: StrategyStepConfig[] = [
  { id: 'IDLE', title: 'Standby / Initializing', description: 'System idle and awaiting market cycle', status: 'awaiting', next: 'WAIT_SESSION', rollback: null, timeout: 0 },
  { id: 'WAIT_SESSION', title: 'Session & Timing Check', description: 'Checking market session and macroeconomic news filters', status: 'awaiting', next: 'SCAN_MARKET', rollback: 'IDLE', timeout: 0 },
  { id: 'SCAN_MARKET', title: 'Market Scanning', description: 'Scanning live market price action and candles', status: 'awaiting', next: 'DETECT_SETUP', rollback: 'IDLE', timeout: 0 },
  { id: 'DETECT_SETUP', title: 'Setup Identification', description: 'Detecting market structure, S&D zone, or liquidity sweep', status: 'awaiting', next: 'VALIDATE_RULES', rollback: 'IDLE', timeout: 0 },
  { id: 'VALIDATE_RULES', title: 'Rule Engine Validation', description: 'Evaluating deterministic rule checklist', status: 'awaiting', next: 'CALCULATE_RISK', rollback: 'REJECTED', timeout: 0 },
  { id: 'CALCULATE_RISK', title: 'Risk & Price Parameters', description: 'Calculating entry, SL, TP levels and Risk/Reward ratio', status: 'awaiting', next: 'AI_VALIDATION', rollback: 'REJECTED', timeout: 0 },
  { id: 'AI_VALIDATION', title: 'AI Confluence Gate', description: 'Running AI verification and risk confluence checks', status: 'awaiting', next: 'SIGNAL_READY', rollback: 'REJECTED', timeout: 0 },
  { id: 'SIGNAL_READY', title: 'Signal Assembly', description: 'Compiling signal object with single source of truth', status: 'awaiting', next: 'SEND_SIGNAL', rollback: 'REJECTED', timeout: 0 },
  { id: 'SEND_SIGNAL', title: 'Signal Dispatched', description: 'Dispatched to notifications and telemetry stream', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
  { id: 'FINISHED', title: 'Finished', description: 'Strategy execution cycle completed successfully', status: 'terminal', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected by rule or validation engine', status: 'terminal', next: null, rollback: null, timeout: 0 },
  { id: 'ERROR', title: 'Execution Error', description: 'System or data exception encountered', status: 'terminal', next: null, rollback: null, timeout: 0 }
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
  if (!state) return 'IDLE';
  const s = state.toUpperCase().trim();
  if (s === 'IDLE' || s === 'STANDBY') return 'IDLE';
  if (s === 'WAIT_SESSION' || s === 'WAIT' || s === 'WAIT_NEWS') return 'WAIT_SESSION';
  if (s === 'SCAN_MARKET' || s === 'SCANNING') return 'SCAN_MARKET';
  if (s === 'DETECT_SETUP' || s === 'STRUCTURE' || s === 'SETUP' || s === 'CONFIRMATION' || s === 'WAIT_STRUCTURE' || s === 'WAIT_PATTERN' || s === 'WAIT_SWEEP') return 'DETECT_SETUP';
  if (s === 'VALIDATE_RULES' || s === 'VALIDATION') return 'VALIDATE_RULES';
  if (s === 'CALCULATE_RISK') return 'CALCULATE_RISK';
  if (s === 'AI_VALIDATION' || s === 'WAIT_AI') return 'AI_VALIDATION';
  if (s === 'SIGNAL_READY') return 'SIGNAL_READY';
  if (s === 'SEND_SIGNAL' || s === 'SIGNAL_SENT' || s === 'SIGNAL_ACTIVE' || s === 'SIGNAL') return 'SEND_SIGNAL';
  if (s === 'FINISHED') return 'FINISHED';
  if (s === 'REJECTED' || s === 'EXPIRED' || s === 'SUPPRESSED' || s === 'FAILED') return 'REJECTED';
  if (s === 'ERROR') return 'ERROR';
  return 'IDLE';
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
  return norm === 'IDLE' || norm === 'WAIT_SESSION' || norm === 'SCAN_MARKET';
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

  constructor(strategyId: string, initialState: StateName = 'IDLE') {
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
    if (['IDLE', 'FINISHED', 'REJECTED', 'ERROR'].includes(normState)) {
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
    const normCurrent = normalizeStateName(this.currentState);
    const isTerm = ['FINISHED', 'REJECTED', 'ERROR'].includes(normState);
    
    const currentStepConfig = CANONICAL_STEPS.find(s => s.id === normCurrent);
    const expectedNext = currentStepConfig?.next;
    
    const isValidTransition = 
      normState === normCurrent ||
      isTerm ||
      normState === expectedNext ||
      (currentStepConfig?.rollback === normState);
    
    if (isValidTransition) {
      this.currentState = normState;
    } else {
      throw new Error(`Invalid state transition: Cannot move from ${normCurrent} to ${normState}. Expected next state: ${expectedNext || 'terminal'}.`);
    }

    if (this.currentState === 'SIGNAL_READY' || this.currentState === 'SEND_SIGNAL') {
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
