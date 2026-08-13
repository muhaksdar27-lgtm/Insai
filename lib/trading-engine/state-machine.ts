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

export const STRATEGY_1_STEPS: StrategyStepConfig[] = [
  { id: 'LONDON_FILTER' as StateName, title: 'Filter Sesi London', description: 'Memastikan waktu trading berada dalam jendela operasional Sesi London', status: 'awaiting', next: 'H1_TREND' as StateName, rollback: null, timeout: 0 },
  { id: 'H1_TREND' as StateName, title: 'Analisis Trend H1', description: 'Menyesuaikan bias utama struktur pasar H1 (Bullish / Bearish)', status: 'awaiting', next: 'ASIA_SWEEP' as StateName, rollback: 'LONDON_FILTER' as StateName, timeout: 0 },
  { id: 'ASIA_SWEEP' as StateName, title: 'Sweep Likuiditas Asia', description: 'Mendeteksi pengambilan likuiditas (sweep) pada High/Low Sesi Asia', status: 'awaiting', next: 'M15_CHOCH' as StateName, rollback: 'LONDON_FILTER' as StateName, timeout: 0 },
  { id: 'M15_CHOCH' as StateName, title: 'Konfirmasi CHoCH M15', description: 'Mencari struktur pembalikan Change of Character pada M15', status: 'awaiting', next: 'OB_FVG' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'OB_FVG' as StateName, title: 'OB & FVG Alignment', description: 'Validasi posisi Entry pada Order Block atau Fair Value Gap', status: 'awaiting', next: 'RISK_PARAMS' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'RISK_PARAMS' as StateName, title: 'Parameter Risiko & SL/TP', description: 'Kalkulasi jarak ATR 0.5x, Stop Loss, dan Take Profit (Min 1:2 R:R)', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Pemeriksaan verifikasi konfluen AI Gemini & Quality Gate', status: 'awaiting', next: 'DISPATCHED' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'DISPATCHED' as StateName, title: 'Signal Dispatched', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'FAILED' as StateName, title: 'Execution Failed', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_2_STEPS: StrategyStepConfig[] = [
  { id: 'MA_TREND' as StateName, title: 'MA Trend Alignment', description: 'Konfirmasi arah trend utama menggunakan Moving Average (D1/H1)', status: 'awaiting', next: 'SD_ZONE' as StateName, rollback: null, timeout: 0 },
  { id: 'SD_ZONE' as StateName, title: 'Identifikasi Zona S&D', description: 'Mendeteksi area Supply atau Demand utama yang belum murni ter-mitigasi', status: 'awaiting', next: 'ENGULFING_TRIGGER' as StateName, rollback: 'MA_TREND' as StateName, timeout: 0 },
  { id: 'ENGULFING_TRIGGER' as StateName, title: 'Engulfing Trigger Candle', description: 'Mencari konfirmasi candlestick Engulfing di dalam area S&D', status: 'awaiting', next: 'RISK_PARAMS' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'RISK_PARAMS' as StateName, title: 'Cek Spread & Parameter Risiko', description: 'Pengecekan ambang spread & penetapan rasio Risk:Reward (SL/TP)', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi konfluen AI Gemini & pemeriksaan konsistensi', status: 'awaiting', next: 'DISPATCHED' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'DISPATCHED' as StateName, title: 'Signal Dispatched', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'FAILED' as StateName, title: 'Execution Failed', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_3_STEPS: StrategyStepConfig[] = [
  { id: 'H1_TREND' as StateName, title: 'Analisis Trend H1', description: 'Memastikan alignment arah trend H1 untuk scalping aman', status: 'awaiting', next: 'M15_RETRACEMENT' as StateName, rollback: null, timeout: 0 },
  { id: 'M15_RETRACEMENT' as StateName, title: 'Retracement M15', description: 'Mendeteksi gelombang koreksi/retracement pada M15', status: 'awaiting', next: 'M1_M5_SWEEP' as StateName, rollback: 'H1_TREND' as StateName, timeout: 0 },
  { id: 'M1_M5_SWEEP' as StateName, title: 'Sweep Likuiditas Scalp', description: 'Deteksi sweep likuiditas mikro pada timeframe M1 / M5', status: 'awaiting', next: 'DOUBLE_TOP_BOTTOM' as StateName, rollback: 'H1_TREND' as StateName, timeout: 0 },
  { id: 'DOUBLE_TOP_BOTTOM' as StateName, title: 'Pola Double Top/Bottom', description: 'Konfirmasi formasi struktur Double Top / Double Bottom M1', status: 'awaiting', next: 'NECKLINE_BREAK' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'NECKLINE_BREAK' as StateName, title: 'Breakout Neckline', description: 'Konfirmasi penetrasi garis Neckline dengan momentum', status: 'awaiting', next: 'RISK_NEWS_FILTER' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'RISK_NEWS_FILTER' as StateName, title: 'News Filter & Parameter Risiko', description: 'Pengecekan ketiadaan berita besar & kalkulasi SL/TP cepat', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi AI cepat untuk validasi momentum scalping', status: 'awaiting', next: 'DISPATCHED' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'DISPATCHED' as StateName, title: 'Signal Dispatched', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'FAILED' as StateName, title: 'Execution Failed', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_4_STEPS: StrategyStepConfig[] = [
  { id: 'NEWS_WINDOW' as StateName, title: 'Jendela High-Impact News', description: 'Deteksi periode rilis berita berdampak tinggi (CPI, NFP, FOMC)', status: 'awaiting', next: 'SPREAD_NORMAL' as StateName, rollback: null, timeout: 0 },
  { id: 'SPREAD_NORMAL' as StateName, title: 'Normalisasi Spread', description: 'Memastikan spread broker telah kembali normal pasca lonjakan berita', status: 'awaiting', next: 'POST_NEWS_SWEEP' as StateName, rollback: 'NEWS_WINDOW' as StateName, timeout: 0 },
  { id: 'POST_NEWS_SWEEP' as StateName, title: 'Post-News Spike Sweep', description: 'Mendeteksi spike sweep likuiditas di mana harga mengambil High/Low', status: 'awaiting', next: 'WICK_REJECTION' as StateName, rollback: 'NEWS_WINDOW' as StateName, timeout: 0 },
  { id: 'WICK_REJECTION' as StateName, title: 'Candle Wick Rejection', description: 'Konfirmasi penolakan harga berupa ekor panjang (Wick Rejection)', status: 'awaiting', next: 'M1_BOS_REVERSAL' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'M1_BOS_REVERSAL' as StateName, title: 'M1 Reversal BOS', description: 'Konfirmasi pembalikan arah dengan Break of Structure M1', status: 'awaiting', next: 'RISK_PARAMS' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'RISK_PARAMS' as StateName, title: 'Parameter Risiko SL/TP', description: 'Kalkulasi Stop Loss di luar ekor spike & Take Profit rasio 1:2', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi konfluen AI Gemini khusus skenario volatilitas berita', status: 'awaiting', next: 'DISPATCHED' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'DISPATCHED' as StateName, title: 'Signal Dispatched', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'FAILED' as StateName, title: 'Execution Failed', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_5_STEPS: StrategyStepConfig[] = [
  { id: 'H1_M15_STRUCTURE' as StateName, title: 'Struktur H1 & M15', description: 'Alignment hirarki struktur pasar antara timeframe H1 dan M15', status: 'awaiting', next: 'SD_FIB_OVERLAP' as StateName, rollback: null, timeout: 0 },
  { id: 'SD_FIB_OVERLAP' as StateName, title: 'Overlap Zona S&D & Fib', description: 'Validasi minimal 2 dari 3 overlap (Supply/Demand, FVG, Fibonacci OTE)', status: 'awaiting', next: 'CONFLUENCE_SWEEP' as StateName, rollback: 'H1_M15_STRUCTURE' as StateName, timeout: 0 },
  { id: 'CONFLUENCE_SWEEP' as StateName, title: 'Confluence Level Sweep', description: 'Sweep likuiditas yang terjadi tepat pada level konfluen tinggi', status: 'awaiting', next: 'REJECTION_TRIGGER' as StateName, rollback: 'H1_M15_STRUCTURE' as StateName, timeout: 0 },
  { id: 'REJECTION_TRIGGER' as StateName, title: 'Trigger Rejection Candle', description: 'Konfirmasi candlestick Rejection / CHoCH pembalikan pada M5/M1', status: 'awaiting', next: 'MIN_RR_CALC' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'MIN_RR_CALC' as StateName, title: 'Kalkulasi Risiko (Min 1:2+ R:R)', description: 'Pemeriksaan rasio Risk:Reward minimal 1:2 dengan buffer ATR', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi konfluen AI Gemini & Quality Gate multivariat', status: 'awaiting', next: 'DISPATCHED' as StateName, rollback: 'FAILED' as StateName, timeout: 0 },
  { id: 'DISPATCHED' as StateName, title: 'Signal Dispatched', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'FAILED' as StateName, title: 'Execution Failed', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_FLOWS_CONFIG: StrategyFlowConfig[] = [
  {
    id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    description: 'SMC Strategy strictly for London session on M15 timeframe. Relies on Asia session liquidity sweep and M15 CHoCH.',
    version: '2.0',
    steps: STRATEGY_1_STEPS
  },
  {
    id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    description: 'Supply and Demand zones paired with moving average confluence and engulfing trigger.',
    version: '2.0',
    steps: STRATEGY_2_STEPS
  },
  {
    id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom',
    description: 'Aggressive M1 scalping aligned with H1 trend, requiring liquidity sweep before double top/bottom structural formation.',
    version: '2.0',
    steps: STRATEGY_3_STEPS
  },
  {
    id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    description: 'Trades the post-news liquidity sweep. Strictly avoids the initial news candle, waiting for structural reversal.',
    version: '2.0',
    steps: STRATEGY_4_STEPS
  },
  {
    id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    description: 'High-probability confluence engine requiring overlaps between market structure, SD zones, and liquidity sweeps.',
    version: '2.0',
    steps: STRATEGY_5_STEPS
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
  if (!stepId) return undefined;
  const flow = getStrategyFlow(strategyId);
  if (!flow || !flow.steps.length) return undefined;

  // 1. Direct match by exact step id
  let match = flow.steps.find(s => s.id === stepId);
  if (match) return match;

  // 2. Direct match by title (case insensitive)
  const lower = stepId.toLowerCase().trim();
  match = flow.steps.find(s => s.title.toLowerCase().trim() === lower);
  if (match) return match;

  // 3. Map normalized canonical state name (e.g. 'INITIALIZING', 'WAITING_MARKET', 'SCANNING', 'SETUP_FOUND', 'RULE_VALIDATION', 'RISK_VALIDATION', 'AI_VALIDATION', 'DISPATCHED', 'FAILED')
  const normId = normalizeStateName(stepId);

  const nonFailedSteps = flow.steps.filter(s => s.id !== 'FAILED');
  if (normId === 'FAILED') {
    return flow.steps.find(s => s.id === 'FAILED') || flow.steps[flow.steps.length - 1];
  }
  if (normId === 'INITIALIZING' || normId === 'WAITING_MARKET') {
    return nonFailedSteps[0];
  }
  if (normId === 'SCANNING') {
    return nonFailedSteps[Math.min(1, nonFailedSteps.length - 1)];
  }
  if (normId === 'SETUP_FOUND') {
    return nonFailedSteps[Math.min(2, nonFailedSteps.length - 1)];
  }
  if (normId === 'RULE_VALIDATION') {
    return nonFailedSteps[Math.min(3, nonFailedSteps.length - 1)];
  }
  if (normId === 'RISK_VALIDATION') {
    return nonFailedSteps[Math.max(0, nonFailedSteps.length - 3)];
  }
  if (normId === 'AI_VALIDATION') {
    return nonFailedSteps[Math.max(0, nonFailedSteps.length - 2)];
  }
  if (normId === 'SIGNAL_READY' || normId === 'DISPATCHED') {
    return nonFailedSteps[nonFailedSteps.length - 1];
  }

  return nonFailedSteps[0];
}

export function getNextStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const step = getStep(strategyId, currentStepId);
  if (step?.next) {
    return getStep(strategyId, step.next);
  }
  return undefined;
}

export function getPreviousStep(strategyId: string, currentStepId: string): StrategyStepConfig | undefined {
  const step = getStep(strategyId, currentStepId);
  const flow = getStrategyFlow(strategyId);
  if (!flow || !step) return undefined;
  return flow.steps.find(s => s.next === step.id);
}

export function getCurrentProgress(strategyId: string, currentStepId: string): number {
  const flow = getStrategyFlow(strategyId);
  if (!flow) return 0;

  const nonFailedSteps = flow.steps.filter(s => s.id !== 'FAILED');
  const step = getStep(strategyId, currentStepId);
  if (!step || step.id === 'FAILED') return 0;

  const idx = nonFailedSteps.findIndex(s => s.id === step.id);
  if (idx === -1) return 0;
  if (idx === nonFailedSteps.length - 1) return 100;

  return Math.round((idx / (nonFailedSteps.length - 1)) * 100);
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
    
    const currentStepConfig = getStep(this.strategyId, normCurrent);
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
