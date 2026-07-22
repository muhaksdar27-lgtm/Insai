import { StateName, StepStatus } from '@/types';


export const STEPS = {
  IDLE: 'IDLE',
  WAIT_SESSION: 'WAIT_SESSION',
  WAIT_TREND: 'WAIT_TREND',
  WAIT_LEVEL: 'WAIT_LEVEL',
  WAIT_SWEEP: 'WAIT_SWEEP',
  WAIT_CONFIRMATION: 'WAIT_CONFIRMATION',
  WAIT_PATTERN: 'WAIT_PATTERN',
  WAIT_NEWS: 'WAIT_NEWS',
  WAIT_REJECTION: 'WAIT_REJECTION',
  WAIT_STRUCTURE: 'WAIT_STRUCTURE',
  WAIT_ZONE: 'WAIT_ZONE',
  WAIT_AI: 'WAIT_AI',
  SIGNAL_ACTIVE: 'SIGNAL_ACTIVE',
  FINISHED: 'FINISHED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SUPPRESSED: 'SUPPRESSED'
} as const;

export interface StrategyStepConfig {
  id: string; // matches StateName
  title: string;
  description: string;
  status: 'awaiting' | 'active' | 'terminal';
  next: string | null;
  rollback: string | null;
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

export const STRATEGY_FLOWS_CONFIG: StrategyFlowConfig[] = [
  {
    id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    description: 'SMC Strategy strictly for London session on M15 timeframe. Relies on Asia session liquidity sweep and M15 CHoCH.',
    version: '1.0',
    steps: [
      { id: 'IDLE', title: 'Scanning', description: 'Waiting for setup conditions', status: 'awaiting', next: 'WAIT_SESSION', rollback: null, timeout: 0 },
      { id: 'WAIT_SESSION', title: 'Session Check', description: 'Checking session overlap', status: 'awaiting', next: 'WAIT_TREND', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_TREND', title: 'Trend Check', description: 'Validating HTF Trend', status: 'awaiting', next: 'WAIT_SWEEP', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_SWEEP', title: 'Liquidity Sweep', description: 'Waiting for liquidity sweep', status: 'awaiting', next: 'WAIT_CONFIRMATION', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_CONFIRMATION', title: 'Confirmation', description: 'Waiting for CHoCH confirmation', status: 'awaiting', next: 'WAIT_AI', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_AI', title: 'AI Validation', description: 'AI checking confluence', status: 'awaiting', next: 'SIGNAL_ACTIVE', rollback: 'REJECTED', timeout: 0 },
      { id: 'SIGNAL_ACTIVE', title: 'Signal Active', description: 'Trade is active', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
      { id: 'FINISHED', title: 'Finished', description: 'Trade completed', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'EXPIRED', title: 'Expired', description: 'Setup expired', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'SUPPRESSED', title: 'Suppressed', description: 'Setup suppressed', status: 'terminal', next: null, rollback: null, timeout: 0 }
    ]
  },
  {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    description: 'Supply and Demand zones paired with moving average confluence and engulfing trigger.',
    version: '1.0',
    steps: [
      { id: 'IDLE', title: 'Scanning', description: 'Waiting for setup conditions', status: 'awaiting', next: 'WAIT_TREND', rollback: null, timeout: 0 },
      { id: 'WAIT_TREND', title: 'Trend Check', description: 'Validating HTF Trend', status: 'awaiting', next: 'WAIT_LEVEL', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_LEVEL', title: 'S&D Level Check', description: 'Waiting for price at zone', status: 'awaiting', next: 'WAIT_CONFIRMATION', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_CONFIRMATION', title: 'Confirmation', description: 'Waiting for confirmation pattern', status: 'awaiting', next: 'WAIT_AI', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_AI', title: 'AI Validation', description: 'AI checking confluence', status: 'awaiting', next: 'SIGNAL_ACTIVE', rollback: 'REJECTED', timeout: 0 },
      { id: 'SIGNAL_ACTIVE', title: 'Signal Active', description: 'Trade is active', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
      { id: 'FINISHED', title: 'Finished', description: 'Trade completed', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'EXPIRED', title: 'Expired', description: 'Setup expired', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'SUPPRESSED', title: 'Suppressed', description: 'Setup suppressed', status: 'terminal', next: null, rollback: null, timeout: 0 }
    ]
  },
  {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    description: 'Aggressive M1 scalping aligned with H1 trend, requiring liquidity sweep before double top/bottom structural formation.',
    version: '1.0',
    steps: [
      { id: 'IDLE', title: 'Scanning', description: 'Waiting for setup conditions', status: 'awaiting', next: 'WAIT_TREND', rollback: null, timeout: 0 },
      { id: 'WAIT_TREND', title: 'Trend Check', description: 'Validating Trend', status: 'awaiting', next: 'WAIT_PATTERN', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_PATTERN', title: 'Pattern Match', description: 'Waiting for momentum pattern', status: 'awaiting', next: 'WAIT_CONFIRMATION', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_CONFIRMATION', title: 'Confirmation', description: 'Waiting for confirmation', status: 'awaiting', next: 'WAIT_AI', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_AI', title: 'AI Validation', description: 'AI checking confluence', status: 'awaiting', next: 'SIGNAL_ACTIVE', rollback: 'REJECTED', timeout: 0 },
      { id: 'SIGNAL_ACTIVE', title: 'Signal Active', description: 'Trade is active', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
      { id: 'FINISHED', title: 'Finished', description: 'Trade completed', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'EXPIRED', title: 'Expired', description: 'Setup expired', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'SUPPRESSED', title: 'Suppressed', description: 'Setup suppressed', status: 'terminal', next: null, rollback: null, timeout: 0 }
    ]
  },
  {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    description: 'Trades the post-news liquidity sweep. Strictly avoids the initial news candle, waiting for structural reversal.',
    version: '1.0',
    steps: [
      { id: 'IDLE', title: 'Scanning', description: 'Waiting for setup conditions', status: 'awaiting', next: 'WAIT_NEWS', rollback: null, timeout: 0 },
      { id: 'WAIT_NEWS', title: 'News Event Check', description: 'Checking upcoming news', status: 'awaiting', next: 'WAIT_REJECTION', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_REJECTION', title: 'Rejection Check', description: 'Waiting for strong rejection', status: 'awaiting', next: 'WAIT_CONFIRMATION', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_CONFIRMATION', title: 'Confirmation', description: 'Waiting for structure break', status: 'awaiting', next: 'WAIT_AI', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_AI', title: 'AI Validation', description: 'AI checking confluence', status: 'awaiting', next: 'SIGNAL_ACTIVE', rollback: 'REJECTED', timeout: 0 },
      { id: 'SIGNAL_ACTIVE', title: 'Signal Active', description: 'Trade is active', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
      { id: 'FINISHED', title: 'Finished', description: 'Trade completed', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'EXPIRED', title: 'Expired', description: 'Setup expired', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'SUPPRESSED', title: 'Suppressed', description: 'Setup suppressed', status: 'terminal', next: null, rollback: null, timeout: 0 }
    ]
  },
  {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    description: 'High-probability confluence engine requiring overlaps between market structure, SD zones, and liquidity sweeps.',
    version: '1.0',
    steps: [
      { id: 'IDLE', title: 'Scanning', description: 'Waiting for setup conditions', status: 'awaiting', next: 'WAIT_STRUCTURE', rollback: null, timeout: 0 },
      { id: 'WAIT_STRUCTURE', title: 'Market Structure', description: 'Validating Market Structure', status: 'awaiting', next: 'WAIT_ZONE', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_ZONE', title: 'Zone Validation', description: 'Validating S&D Zone', status: 'awaiting', next: 'WAIT_SWEEP', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_SWEEP', title: 'Liquidity Sweep', description: 'Waiting for liquidity sweep', status: 'awaiting', next: 'WAIT_CONFIRMATION', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_CONFIRMATION', title: 'Confirmation', description: 'Waiting for confirmation', status: 'awaiting', next: 'WAIT_AI', rollback: 'IDLE', timeout: 0 },
      { id: 'WAIT_AI', title: 'AI Validation', description: 'AI checking confluence', status: 'awaiting', next: 'SIGNAL_ACTIVE', rollback: 'REJECTED', timeout: 0 },
      { id: 'SIGNAL_ACTIVE', title: 'Signal Active', description: 'Trade is active', status: 'active', next: 'FINISHED', rollback: null, timeout: 0 },
      { id: 'FINISHED', title: 'Finished', description: 'Trade completed', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'REJECTED', title: 'Rejected', description: 'Setup rejected', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'EXPIRED', title: 'Expired', description: 'Setup expired', status: 'terminal', next: null, rollback: null, timeout: 0 },
      { id: 'SUPPRESSED', title: 'Suppressed', description: 'Setup suppressed', status: 'terminal', next: null, rollback: null, timeout: 0 }
    ]
  }
];

export function getStrategyFlow(strategyId: string): StrategyFlowConfig | undefined {
  return STRATEGY_FLOWS_CONFIG.find(s => s.id === strategyId);
}

export function getStep(strategyId: string, stepId: string): StrategyStepConfig | undefined {
  const flow = getStrategyFlow(strategyId);
  return flow?.steps.find(s => s.id === stepId);
}

export function getNextStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const step = getStep(strategyId, currentStepId);
  if (step?.next) {
    return getStep(strategyId, step.next);
  }
  return undefined;
}

export function getPreviousStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const flow = getStrategyFlow(strategyId);
  if (!flow) return undefined;
  
  // Find the step that has 'next' pointing to currentStepId
  return flow.steps.find(s => s.next === currentStepId);
}

export function getCurrentProgress(strategyId: string, currentStepId: string): number {
  const flow = getStrategyFlow(strategyId);
  if (!flow) return 0;

  // Build sequential path to calculate progress
  const sequentialPath: string[] = [];
  let current: string | null = 'IDLE';
  
  while (current && !sequentialPath.includes(current)) {
    sequentialPath.push(current);
    const step = flow.steps.find(s => s.id === current);
    current = step?.next || null;
  }
  
  const stepConfig = getStep(strategyId, currentStepId);
  if (stepConfig?.status === 'terminal') {
      if (currentStepId === 'FINISHED') return 100;
  }

  const idx = sequentialPath.indexOf(currentStepId);
  if (idx === -1) return 100; 
  
  if (sequentialPath.length <= 1) return 100;
  return Math.round((idx / (sequentialPath.length - 1)) * 100);
}

export function getCurrentStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  return getStep(strategyId, currentStepId);
}

export function getStepDisplayName(strategyId: string, stepId: string): string {
  const step = getStep(strategyId, stepId);
  return step?.title || stepId.replace(/_/g, ' ');
}

export function isFinished(_strategyId: string, stepId: string): boolean {
  return stepId === 'FINISHED';
}

export function isWaiting(strategyId: string, stepId: string): boolean {
  const step = getStep(strategyId, stepId);
  return step?.status === 'awaiting';
}

export function isRejected(_strategyId: string, stepId: string): boolean {
  return ['REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(stepId);
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
    this.currentState = initialState;
  }

  public getCurrentState(): StateName {
    return this.currentState;
  }

  public getSignalKey(): string | undefined {
    return this.currentSignalKey;
  }

  public forceState(newState: StateName, reason: string, signalKey?: string, context?: any) {
    this.currentState = newState;
    if (signalKey) {
       this.currentSignalKey = signalKey;
    }
    if (newState === 'IDLE' || ['FINISHED', 'REJECTED', 'EXPIRED'].includes(newState)) {
       this.currentSignalKey = undefined; // reset on terminal or IDLE
    }
    
    const isTerm = ['FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(newState);
    
    const result: StrategyState = {
      stateName: this.currentState,
      timestamp: new Date().toISOString(),
      strategyId: this.strategyId,
      signalKey: this.currentSignalKey,
      currentStatus: isTerm ? (newState === 'REJECTED' ? 'rejected' : newState === 'EXPIRED' ? 'expired' : 'active') : 'active',
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
    const isTerm = ['FINISHED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(newState);
    
    // Allow transitioning to any valid state in the flow to support generic engine advancing
    const isStateInFlow = getStep(this.strategyId, newState) !== undefined;
    const isValidTransition = isStateInFlow || isTerm;
    
    if (isValidTransition) {
      this.currentState = newState;
    } else {
       // Also allow rollback transition
       const currentStepConfig = getStep(this.strategyId, this.currentState);
       if (currentStepConfig?.rollback === newState) {
           this.currentState = newState;
       } else {
           throw new Error(`Invalid transition: Cannot move from ${this.currentState} to ${newState}.`);
       }
    }

    if (this.currentState !== 'IDLE' && this.currentState === (getStep(this.strategyId, 'IDLE')?.next || '')) {
        // Generating initial signal key
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
      currentStatus: isTerm ? (newState === 'REJECTED' ? 'rejected' : newState === 'EXPIRED' ? 'expired' : 'active') : 'active',
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
