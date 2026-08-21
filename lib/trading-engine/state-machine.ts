import { StateName, StepStatus } from '@/types';
import { OfficialSetupState } from './types';

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

export const STRATEGY_1_STEPS: StrategyStepConfig[] = [
  { id: 'LONDON_FILTER' as StateName, title: 'Filter Sesi London', description: 'Memastikan waktu trading berada dalam jendela operasional Sesi London', status: 'awaiting', next: 'H1_TREND' as StateName, rollback: null, timeout: 0 },
  { id: 'H1_TREND' as StateName, title: 'Analisis Trend H1', description: 'Menyesuaikan bias utama struktur pasar H1 (Bullish / Bearish)', status: 'awaiting', next: 'ASIA_SWEEP' as StateName, rollback: 'LONDON_FILTER' as StateName, timeout: 0 },
  { id: 'ASIA_SWEEP' as StateName, title: 'Sweep Likuiditas Asia', description: 'Mendeteksi pengambilan likuiditas (sweep) pada High/Low Sesi Asia', status: 'awaiting', next: 'M15_CHOCH' as StateName, rollback: 'LONDON_FILTER' as StateName, timeout: 0 },
  { id: 'M15_CHOCH' as StateName, title: 'Konfirmasi CHoCH M15', description: 'Mencari struktur pembalikan Change of Character pada M15', status: 'awaiting', next: 'OB_FVG' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'OB_FVG' as StateName, title: 'OB & FVG Alignment', description: 'Validasi posisi Entry pada Order Block atau Fair Value Gap', status: 'awaiting', next: 'RISK_PARAMS' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'RISK_PARAMS' as StateName, title: 'Parameter Risiko & SL/TP', description: 'Kalkulasi jarak ATR 0.5x, Stop Loss, dan Take Profit (Min 1:2 R:R)', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Pemeriksaan verifikasi konfluen AI Gemini & Quality Gate', status: 'awaiting', next: 'SIGNAL_ACTIVE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'SIGNAL_ACTIVE' as StateName, title: 'Signal Active', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED' as StateName, title: 'Rejected / Invalidated', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_2_STEPS: StrategyStepConfig[] = [
  { id: 'MA_TREND' as StateName, title: 'MA Trend Alignment', description: 'Konfirmasi arah trend utama menggunakan Moving Average (D1/H1)', status: 'awaiting', next: 'SD_ZONE' as StateName, rollback: null, timeout: 0 },
  { id: 'SD_ZONE' as StateName, title: 'Identifikasi Zona S&D', description: 'Mendeteksi area Supply atau Demand utama yang belum murni ter-mitigasi', status: 'awaiting', next: 'ENGULFING_TRIGGER' as StateName, rollback: 'MA_TREND' as StateName, timeout: 0 },
  { id: 'ENGULFING_TRIGGER' as StateName, title: 'Engulfing Trigger Candle', description: 'Mencari konfirmasi candlestick Engulfing di dalam area S&D', status: 'awaiting', next: 'RISK_PARAMS' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'RISK_PARAMS' as StateName, title: 'Cek Spread & Parameter Risiko', description: 'Pengecekan ambang spread & penetapan rasio Risk:Reward (SL/TP)', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi konfluen AI Gemini & pemeriksaan konsistensi', status: 'awaiting', next: 'SIGNAL_ACTIVE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'SIGNAL_ACTIVE' as StateName, title: 'Signal Active', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED' as StateName, title: 'Rejected / Invalidated', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_3_STEPS: StrategyStepConfig[] = [
  { id: 'H1_TREND' as StateName, title: 'Analisis Trend H1', description: 'Memastikan alignment arah trend H1 untuk scalping aman', status: 'awaiting', next: 'M15_RETRACEMENT' as StateName, rollback: null, timeout: 0 },
  { id: 'M15_RETRACEMENT' as StateName, title: 'Retracement M15', description: 'Mendeteksi gelombang koreksi/retracement pada M15', status: 'awaiting', next: 'M1_M5_SWEEP' as StateName, rollback: 'H1_TREND' as StateName, timeout: 0 },
  { id: 'M1_M5_SWEEP' as StateName, title: 'Sweep Likuiditas Scalp', description: 'Deteksi sweep likuiditas mikro pada timeframe M1 / M5', status: 'awaiting', next: 'DOUBLE_TOP_BOTTOM' as StateName, rollback: 'H1_TREND' as StateName, timeout: 0 },
  { id: 'DOUBLE_TOP_BOTTOM' as StateName, title: 'Pola Double Top/Bottom', description: 'Konfirmasi formasi struktur Double Top / Double Bottom M1', status: 'awaiting', next: 'NECKLINE_BREAK' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'NECKLINE_BREAK' as StateName, title: 'Breakout Neckline', description: 'Konfirmasi penetrasi garis Neckline dengan momentum', status: 'awaiting', next: 'RISK_NEWS_FILTER' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'RISK_NEWS_FILTER' as StateName, title: 'News Filter & Parameter Risiko', description: 'Pengecekan ketiadaan berita besar & kalkulasi SL/TP cepat', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi AI cepat untuk validasi momentum scalping', status: 'awaiting', next: 'SIGNAL_ACTIVE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'SIGNAL_ACTIVE' as StateName, title: 'Signal Active', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED' as StateName, title: 'Rejected / Invalidated', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_4_STEPS: StrategyStepConfig[] = [
  { id: 'NEWS_WINDOW' as StateName, title: 'Jendela High-Impact News', description: 'Deteksi periode rilis berita berdampak tinggi (CPI, NFP, FOMC)', status: 'awaiting', next: 'SPREAD_NORMAL' as StateName, rollback: null, timeout: 0 },
  { id: 'SPREAD_NORMAL' as StateName, title: 'Normalisasi Spread', description: 'Memastikan spread broker telah kembali normal pasca lonjakan berita', status: 'awaiting', next: 'POST_NEWS_SWEEP' as StateName, rollback: 'NEWS_WINDOW' as StateName, timeout: 0 },
  { id: 'POST_NEWS_SWEEP' as StateName, title: 'Post-News Spike Sweep', description: 'Mendeteksi spike sweep likuiditas di mana harga mengambil High/Low', status: 'awaiting', next: 'WICK_REJECTION' as StateName, rollback: 'NEWS_WINDOW' as StateName, timeout: 0 },
  { id: 'WICK_REJECTION' as StateName, title: 'Candle Wick Rejection', description: 'Konfirmasi penolakan harga berupa ekor panjang (Wick Rejection)', status: 'awaiting', next: 'M1_BOS_REVERSAL' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'M1_BOS_REVERSAL' as StateName, title: 'M1 Reversal BOS', description: 'Konfirmasi pembalikan arah dengan Break of Structure M1', status: 'awaiting', next: 'RISK_PARAMS' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'RISK_PARAMS' as StateName, title: 'Parameter Risiko SL/TP', description: 'Kalkulasi Stop Loss di luar ekor spike & Take Profit rasio 1:2', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi konfluen AI Gemini khusus skenario volatilitas berita', status: 'awaiting', next: 'SIGNAL_ACTIVE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'SIGNAL_ACTIVE' as StateName, title: 'Signal Active', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED' as StateName, title: 'Rejected / Invalidated', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_5_STEPS: StrategyStepConfig[] = [
  { id: 'H1_M15_STRUCTURE' as StateName, title: 'Struktur H1 & M15', description: 'Alignment hirarki struktur pasar antara timeframe H1 dan M15', status: 'awaiting', next: 'SD_FIB_OVERLAP' as StateName, rollback: null, timeout: 0 },
  { id: 'SD_FIB_OVERLAP' as StateName, title: 'Overlap Zona S&D & Fib', description: 'Validasi minimal 2 dari 3 overlap (Supply/Demand, FVG, Fibonacci OTE)', status: 'awaiting', next: 'CONFLUENCE_SWEEP' as StateName, rollback: 'H1_M15_STRUCTURE' as StateName, timeout: 0 },
  { id: 'CONFLUENCE_SWEEP' as StateName, title: 'Confluence Level Sweep', description: 'Sweep likuiditas yang terjadi tepat pada level konfluen tinggi', status: 'awaiting', next: 'REJECTION_TRIGGER' as StateName, rollback: 'H1_M15_STRUCTURE' as StateName, timeout: 0 },
  { id: 'REJECTION_TRIGGER' as StateName, title: 'Trigger Rejection Candle', description: 'Konfirmasi candlestick Rejection / CHoCH pembalikan pada M5/M1', status: 'awaiting', next: 'MIN_RR_CALC' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'MIN_RR_CALC' as StateName, title: 'Kalkulasi Risiko (Min 1:2+ R:R)', description: 'Pemeriksaan rasio Risk:Reward minimal 1:2 dengan buffer ATR', status: 'awaiting', next: 'AI_GATE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'AI_GATE' as StateName, title: 'AI Confluence Gate', description: 'Verifikasi konfluen AI Gemini & Quality Gate multivariat', status: 'awaiting', next: 'SIGNAL_ACTIVE' as StateName, rollback: 'REJECTED' as StateName, timeout: 0 },
  { id: 'SIGNAL_ACTIVE' as StateName, title: 'Signal Active', description: 'Sinyal disetujui & dipublikasikan ke Dashboard & Telegram', status: 'active', next: null, rollback: null, timeout: 0 },
  { id: 'REJECTED' as StateName, title: 'Rejected / Invalidated', description: 'Gagal pada evaluasi aturan atau konfluen AI', status: 'terminal', next: null, rollback: null, timeout: 0 }
];

export const STRATEGY_FLOWS_CONFIG: StrategyFlowConfig[] = [
  { id: 'strategy-1-smc', name: 'STRATEGI 1 — SMC + Sesi London + M15', description: 'SMC Strategy strictly for London session on M15 timeframe.', version: '3.0', steps: STRATEGY_1_STEPS },
  { id: 'strategy-2-snd', name: 'STRATEGI 2 — Supply & Demand + Engulfing', description: 'Supply and Demand zones paired with moving average confluence.', version: '3.0', steps: STRATEGY_2_STEPS },
  { id: 'strategy-3-scalping', name: 'STRATEGI 3 — Scalping SMC + Micro Sweep', description: 'Aggressive M1 scalping aligned with H1 trend.', version: '3.0', steps: STRATEGY_3_STEPS },
  { id: 'strategy-4-news', name: 'STRATEGI 4 — News Liquidity Sweep Reversal', description: 'Trades the post-news liquidity sweep.', version: '3.0', steps: STRATEGY_4_STEPS },
  { id: 'strategy-5-smc-sd-confluence', name: 'STRATEGI 5 — SMC-SD Pattern Confluence', description: 'High-probability confluence engine.', version: '3.0', steps: STRATEGY_5_STEPS }
];

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
  return STRATEGY_FLOWS_CONFIG.find(s => s.id === strategyId) || STRATEGY_FLOWS_CONFIG[0];
}

export function getStep(strategyId: string, stepId: string): StrategyStepConfig | undefined {
  if (!stepId) return undefined;
  const flow = getStrategyFlow(strategyId);
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
