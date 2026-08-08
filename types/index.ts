export * from './core';

export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  ERROR = 'error',
  SUCCESS = 'success',
  FINISHED = 'finished',
  FAILED = 'failed',
  AWAITING = 'awaiting',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  STOPPED = 'stopped',
  DISABLED = 'disabled',
  NOT_CONFIGURED = 'not configured',
  APPROVED = 'approved',
  VALIDATED = 'validated',
  CURRENT = 'current'
}

export enum StepType {
  CONDITION = 'condition',
  ACTION = 'action',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown'
}

export enum SignalDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
  BUY = 'BUY',
  SELL = 'SELL',
  WAIT = 'WAIT'
}

export enum ValidationStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  PENDING = 'PENDING',
  ERROR = 'ERROR',
  VALID = 'valid',
  INVALID = 'invalid',
  SUPPRESSED = 'suppressed'
}

export type IntegrationStatus = 'active' | 'not configured' | 'placeholder' | 'disabled' | 'unavailable' | 'needs verification';

export type StepStatus = 'awaiting' | 'active' | 'validated' | 'approved' | 'rejected' | 'expired' | 'pending' | 'failed' | 'current';

export type HealthStatus = 'ONLINE' | 'NOT CONFIGURED' | 'DISABLED' | 'UNAVAILABLE' | 'OFFLINE' | 'RATE LIMITED' | 'DEGRADED' | 'QUOTA_EXCEEDED' | 'LOCKED' | 'PROVIDER_ERROR' | 'CACHE_TIMEOUT' | 'INVALID_KEY';

export type AIDecision = 'APPROVED' | 'REJECTED' | 'WAIT' | 'INVALIDATED' | 'FAILED' | 'PENDING' | 'AI OFFLINE';

export interface ProviderStatus {
  status?: string;
  available?: boolean;
  reason?: string;
}

export interface AIChecklistItem {
  rule: string;
  status: 'PASS' | 'FAIL' | 'WAIT' | 'INVALIDATED';
  evidence: string;
  reason: string;
}

export interface AIValidation {
  strategyName: string;
  decision: AIDecision;
  checklist: AIChecklistItem[];
  reasoning: string;
  missingFactors?: string[];
  riskNotes?: string;
  recommendedAction?: string;
}

export interface Signal {
  correlationId?: string;
  signalKey: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  session: string;
  direction: 'buy' | 'sell';
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  aiDecision: AIDecision;
  aiReasoning?: string;
  aiEvidence?: string;
  aiRulesChecked?: string[];
  aiRulesPassed?: string[];
  aiRulesFailed?: string[];
  aiConflicts?: string;
  aiChecklist?: AIChecklistItem[];
  status: 'SIGNAL_ACTIVE' | 'TAKE_PARTIAL' | 'FINISHED' | 'REJECTED' | 'EXPIRED' | 'SUPPRESSED';
  createdAt: string;
}

export type SetupStatus = 
  | 'scanning'
  | 'candidate'
  | 'validation'
  | 'confirmation'
  | 'ready'
  | 'signal'
  | 'expired'
  | 'archived';

export interface StrategyConfig {
  id: string;
  name: string;
  description?: string;
  canonicalFlow: StateName[];
  stepDisplayNames: Partial<Record<StateName, string>>;
}

export interface SetupSnapshot {
  entryPrice?: number;
  slPrice?: number;
  tp1Price?: number;
  tp2Price?: number;
  tp3Price?: number;
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  tpPrice?: number;
  rr?: number | string;
  bias?: string;
  marketStructure?: string;
  direction?: SignalDirection | string;
  timeframe?: string;
  session?: string;
  marketBias?: string;
  marketStates?: string[];
  validationLogSummary?: string;
  confirmation?: string | boolean;
  sweepStatus?: string;
  chochStatus?: string;
  atr14?: number | string;
  atrBuffer50Pct?: string;
  aiDecision?: string;
  lastState?: string;
  confidence?: number | string;
  aiConfidence?: number | string;
  aiReasoning?: string;
}

export interface RuleValidation {
  passed?: boolean;
  status?: ValidationStatus | string;
  details?: Record<string, string | number | boolean>;
}

export interface EngineState {
  id: string;
  name: string;
  status: Status | string;
  lastUpdate: string;
}

export interface StrategyProgress {
  currentStep: string;
  percentage: number;
}

export interface DashboardCard {
  id: string;
  name: string;
  description: string;
  currentStep: string;
  progress: number;
  status: Status | string;
  bias: string;
  session: string;
  direction: SignalDirection | string;
  validationScore: string;
  rr: string;
  entry: number | string;
  sl: number | string;
  tp: number | string;
  passedCount: number;
  rulesCount: number;
  pair: string;
  updatedAt?: string | null;
}

export interface SignalResult {
  id: string;
  direction: SignalDirection | string;
  entry: number | string;
  sl: number | string;
  tp: number | string;
  tp2?: number | string;
  tp3?: number | string;
}

export interface ValidationSummary {
  passedCount: number;
  rulesCount: number;
  score: string;
  riskReward: string;
}

export interface StrategyStep {
  id?: string;
  name: string;
  status: Status | string;
  type?: StepType;
}

export interface Strategy {
  id: string;
  name: string;
  description?: string;
  currentStep?: string;
  progress?: number;
  status?: Status | string;
  setupSnapshot?: SetupSnapshot;
  ruleResults?: Record<string, RuleValidation>;
  steps?: StrategyStep[];
  aiDecision?: string;
}

export interface StrategyResponse {
  id: string;
  name: string;
  description?: string;
  status: string;
  steps: StrategyStep[];
  currentStep: string;
  progress: number;
  setupSnapshot: SetupSnapshot;
  ruleResults: Record<string, RuleValidation>;
  aiDecision?: AIDecision | string | null;
  signal?: string | null;
  errors?: string[];
  updatedAt?: string | null;
  freshness: string;
  assumptions_flagged?: string;
}

export interface Setup {
  setupSnapshot?: any;
  id: string; // e.g., uuid
  timestamp: string; // strict timestamp
  sourceStrategy: string;
  status: SetupStatus;
  symbol: string;
  timeframe: string;
  direction?: 'buy' | 'sell';
  entryPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  marketStates?: string[];
  validationLog: {
    timestamp: string;
    action: string;
    details: string;
    status: 'success' | 'failure';
  }[];
  isDuplicate?: boolean;
}

export type StateName = string;

export type RuleStatus = 'valid' | 'invalid' | 'suppressed' | 'unknown' | 'pending' | ValidationStatus;

export interface RuleResult {
  ruleId: string;
  status: RuleStatus;
  evidence: Record<string, string | number | boolean>;
  invalidations: string[];
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export interface ProviderHealth {
  providerName: string;
  category: 'price' | 'news' | 'calendar' | 'sentiment' | 'ai';
  healthStatus: HealthStatus;
  lastSuccessAt: string | null;
  lastError: string | null;
  circuitBreakerStatus: 'closed' | 'open' | 'half_open';
}

export interface MarketSnapshot extends ProviderStatus {
  symbol: string;
  price: number | null;
  timestamp: string;
  provider: string;
  freshness: 'live' | 'cached' | 'stale' | 'closed';
  session?: string;
  bias?: string;
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  latency: number;
  freshness: 'live' | 'cached' | 'stale';
  confidence: number;
}

export interface NewsEvent {
  id: string;
  title: string;
  source: string;
  impact: 'low' | 'medium' | 'high';
  publishedAt: string;
  url?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  country: string;
  impact: 'low' | 'medium' | 'high';
  time: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface DashboardSnapshotEngine {
  status: 'running' | 'idle' | 'paused' | 'error' | 'active';
  activeStrategyCount: number;
  currentStep: string;
  currentPair: string;
  currentSession: string;
  lastSignalAt: string | null;
  nextScanAt: string | null;
  queueSize: number;
  latencyMs: number;
  processingTimeMs: number;
}

export interface DashboardSnapshotSystem {
  status: 'healthy' | 'warning' | 'critical' | 'offline' | 'error';
  services: Array<{ serviceName: string; status: string; message?: string }>;
  mcp: Array<{ name: string; status: string }>;
  connections: {
    market: boolean;
    database?: boolean;
    redis: boolean;
    realtimeChannel: boolean;
  };
}

export interface DashboardSnapshotPerformance {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  avgRr: number;
  winCount: number;
  lossCount: number;
}

export interface DashboardSnapshot {
  timestamp: string;
  market: MarketSnapshot | null;
  strategies: StrategyResponse[];
  signals: Signal[];
  history: any[];
  engine: DashboardSnapshotEngine;
  system: DashboardSnapshotSystem;
  performance: DashboardSnapshotPerformance;
  news: {
    active_events: NewsEvent[] | any[];
    status?: string;
  };
}

export interface RuleEvaluationContext {
  symbol: string;
  timeframe: string;
  timestamp: string;
  candles?: Candle[];
  marketData?: any;
  indicators?: any;
  context?: any;
  correlationId?: string;
}
