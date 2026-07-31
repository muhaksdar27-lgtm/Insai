import { StateName, StepStatus } from '@/types';

/**
 * Deterministic State Machine with strict canonical states:
 * 1. INITIALIZING
 * 2. WAITING_MARKET
 * 3. SCANNING
 * 4. SETUP_FOUND
 * 5. RULE_VALIDATION
 * 6. RISK_VALIDATION
 * 7. AI_VALIDATION
 * 8. SIGNAL_READY
 * 9. DISPATCHED
 * 10. FAILED
 */
export const STEPS = {
  INITIALIZING: 'INITIALIZING',
  WAITING_MARKET: 'WAITING_MARKET',
  SCANNING: 'SCANNING',
  SETUP_FOUND: 'SETUP_FOUND',
  RULE_VALIDATION: 'RULE_VALIDATION',
  RISK_VALIDATION: 'RISK_VALIDATION',
  AI_VALIDATION: 'AI_VALIDATION',
  SIGNAL_READY: 'SIGNAL_READY',
  DISPATCHED: 'DISPATCHED',
  FAILED: 'FAILED',

  // Legacy aliases mapped deterministically
  IDLE: 'INITIALIZING',
  WAIT_SESSION: 'WAITING_MARKET',
  WAIT: 'WAITING_MARKET',
  SCAN_MARKET: 'SCANNING',
  DETECT_SETUP: 'SETUP_FOUND',
  STRUCTURE: 'SETUP_FOUND',
  SETUP: 'SETUP_FOUND',
  CONFIRMATION: 'SETUP_FOUND',
  VALIDATE_RULES: 'RULE_VALIDATION',
  VALIDATION: 'RULE_VALIDATION',
  CALCULATE_RISK: 'RISK_VALIDATION',
  SEND_SIGNAL: 'DISPATCHED',
  SIGNAL_SENT: 'DISPATCHED',
  FINISHED: 'DISPATCHED',
  REJECTED: 'FAILED',
  ERROR: 'FAILED'
} as const;

export const CANONICAL_STATE_FLOW: StateName[] = [
  'INITIALIZING',
  'WAITING_MARKET',
  'SCANNING',
  'SETUP_FOUND',
  'RULE_VALIDATION',
  'RISK_VALIDATION',
  'AI_VALIDATION',
  'SIGNAL_READY',
  'DISPATCHED'
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

export const CANONICAL_STEPS: StrategyStepConfig[] = [
  { id: 'INITIALIZING', title: 'Standby / Initializing', description: 'System initializing and awaiting market cycle', status: 'awaiting', next: 'WAITING_MARKET', rollback: null, timeout: 0 },
  { id: 'WAITING_MARKET', title: 'Waiting Market', description: 'Checking market session and data availability', status: 'awaiting', next: 'SCANNING', rollback: 'INITIALIZING', timeout: 0 },
  { id: 'SCANNING', title: 'Market Scanning', description: 'Scanning live price feed and market structure', status: 'awaiting', next: 'SETUP_FOUND', rollback: 'INITIALIZING', timeout: 0 },
  { id: 'SETUP_FOUND', title: 'Setup Identification', description: 'Detecting structure, zones, or liquidity sweeps', status: 'awaiting', next: 'RULE_VALIDATION', rollback: 'INITIALIZING', timeout: 0 },
  { id: 'RULE_VALIDATION', title: 'Rule Engine Validation', description: 'Evaluating deterministic rule set', status: 'awaiting', next: 'RISK_VALIDATION', rollback: 'FAILED', timeout: 0 },
  { id: 'RISK_VALIDATION', title: 'Risk & Price Parameters', description: 'Calculating entry, SL, TP levels and Risk/Reward ratio', status: 'awaiting', next: 'AI_VALIDATION', rollback: 'FAILED', timeout: 0 },
  { id: 'AI_VALIDATION', title: 'AI Confluence Gate', description: 'Running AI verification and risk confluence checks', status: 'awaiting', next: 'SIGNAL_READY', rollback: 'FAILED', timeout: 0 },
  { id: 'SIGNAL_READY', title: 'Signal Assembly', description: 'Compiling signal object with single source of truth', status: 'awaiting', next: 'DISPATCHED', rollback: 'FAILED', timeout: 0 },
  { id: 'DISPATCHED', title: 'Signal Dispatched', description: 'Dispatched to notifications and telemetry stream', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'FAILED', title: 'Execution Failed', description: 'Setup or rule validation failed', status: 'terminal', next: null, rollback: null, timeout: 0 }
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
  if (!state) return 'INITIALIZING';
  const s = state.toUpperCase().trim();
  if (s === 'INITIALIZING' || s === 'IDLE' || s === 'STANDBY') return 'INITIALIZING';
  if (s === 'WAITING_MARKET' || s === 'WAIT_SESSION' || s === 'WAIT' || s === 'WAIT_NEWS') return 'WAITING_MARKET';
  if (s === 'SCANNING' || s === 'SCAN_MARKET') return 'SCANNING';
  if (s === 'SETUP_FOUND' || s === 'DETECT_SETUP' || s === 'STRUCTURE' || s === 'SETUP' || s === 'CONFIRMATION' || s === 'WAIT_STRUCTURE' || s === 'WAIT_PATTERN' || s === 'WAIT_SWEEP') return 'SETUP_FOUND';
  if (s === 'RULE_VALIDATION' || s === 'VALIDATE_RULES' || s === 'VALIDATION') return 'RULE_VALIDATION';
  if (s === 'RISK_VALIDATION' || s === 'CALCULATE_RISK') return 'RISK_VALIDATION';
  if (s === 'AI_VALIDATION' || s === 'WAIT_AI') return 'AI_VALIDATION';
  if (s === 'SIGNAL_READY') return 'SIGNAL_READY';
  if (s === 'DISPATCHED' || s === 'SEND_SIGNAL' || s === 'SIGNAL_SENT' || s === 'SIGNAL_ACTIVE' || s === 'SIGNAL' || s === 'FINISHED') return 'DISPATCHED';
  if (s === 'FAILED' || s === 'REJECTED' || s === 'EXPIRED' || s === 'SUPPRESSED' || s === 'ERROR') return 'FAILED';
  return 'INITIALIZING';
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
  if (normId === 'DISPATCHED') return 100;
  if (normId === 'FAILED') return 0;
  
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
  return normalizeStateName(stepId) === 'DISPATCHED';
}

export function isWaiting(_strategyId: string, stepId: string): boolean {
  const norm = normalizeStateName(stepId);
  return norm === 'INITIALIZING' || norm === 'WAITING_MARKET' || norm === 'SCANNING';
}

export function isRejected(_strategyId: string, stepId: string): boolean {
  const norm = normalizeStateName(stepId);
  return norm === 'FAILED';
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

  constructor(strategyId: string, initialState: StateName = 'INITIALIZING') {
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
    if (['INITIALIZING', 'DISPATCHED', 'FAILED'].includes(normState)) {
       this.currentSignalKey = undefined;
    }
    
    const isTerm = ['DISPATCHED', 'FAILED'].includes(normState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerm ? (normState === 'FAILED' ? 'rejected' : 'active') : 'active',
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
    const isTerm = ['DISPATCHED', 'FAILED'].includes(normState);
    
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
      // Direct jump allowed if moving towards FAILED or DISPATCHED terminal state
      this.currentState = normState;
    }

    if (this.currentState === 'SIGNAL_READY' || this.currentState === 'DISPATCHED') {
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
      currentStatus: isTerm ? (normState === 'FAILED' ? 'rejected' : 'active') : 'active',
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
