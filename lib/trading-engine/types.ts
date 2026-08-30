export type OfficialSetupState =
  | 'AWAITING'
  | 'DETECTED'
  | 'ACTIVE'
  | 'VALIDATED'
  | 'AI_PENDING'
  | 'APPROVED'
  | 'SIGNAL_ACTIVE'
  | 'REJECTED'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'ERROR';

export type StepState =
  | 'AWAITING'
  | 'DETECTED'
  | 'ACTIVE'
  | 'VALIDATED'
  | 'REJECTED'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'SKIPPED';

export type DetectionSourceEvent =
  | 'new_candle'
  | 'candle_update'
  | 'session_change'
  | 'price_crossing'
  | 'structure_change'
  | 'news_event'
  | 'invalidation'
  | 'expiry'
  | 'manual_scan'
  | 'system_init';

export interface StepEvidence {
  // Common Price & Structure
  source?: string;
  timestamp?: string;
  currentPrice?: number;
  entryPrice?: number;
  slPrice?: number;
  tp1Price?: number;
  tp2Price?: number;
  tp3Price?: number;
  riskReward?: number | string;
  atr14?: number;
  spreadPips?: number;
  timeframe?: string;
  session?: string;

  // Trend & Higher Timeframe
  trend?: string;
  h1Bias?: string;
  fastEma?: number;
  slowEma?: number;
  slope?: number;
  higherHighsCount?: number;
  higherLowsCount?: number;
  structure?: string;
  candleCount?: number;

  // Liquidity Sweeps
  level?: number;
  sweepPrice?: number;
  sweepType?: 'asian_high' | 'asian_low' | 'prev_session_high' | 'prev_session_low' | 'micro_sweep' | 'equal_highs' | 'equal_lows' | string;
  candleTimestamp?: string;
  rejectionWickSize?: number;
  rejectionRatio?: number;
  structureResponse?: string;

  // Market Structure: CHoCH & BOS
  chochPrice?: number;
  bosPrice?: number;
  swingHigh?: number;
  swingLow?: number;
  displacementRatio?: number;
  hasDisplacement?: boolean;
  displacementDirection?: string;
  idmTaken?: boolean;

  // S&D Zones & Order Blocks & FVGs
  zoneUpper?: number;
  zoneLower?: number;
  zoneType?: 'DEMAND_DBR' | 'DEMAND_RBR' | 'SUPPLY_RBD' | 'SUPPLY_DBD' | 'ORDER_BLOCK' | 'FVG' | 'DEMAND_ZONE' | 'SUPPLY_ZONE' | string;
  zoneFreshness?: 'FRESH' | 'TESTED' | 'MITIGATED' | string;
  fibLevel?: number;
  overlapCount?: number;
  mitigated?: boolean;

  // Candlestick Triggers
  engulfingType?: 'bullish_engulfing' | 'bearish_engulfing' | 'wick_rejection' | string;
  bodyRatio?: number;
  priorCandleRange?: number;
  wickRatio?: number;

  // Double Top / Bottom
  patternType?: string;
  peak1Price?: number;
  peak2Price?: number;
  necklinePrice?: number;
  necklineBreakPrice?: number;
  divergenceTolerance?: number;
  sweepValidated?: boolean;
  sweepConfirmedBeforePattern?: boolean;

  // News Event
  newsTitle?: string;
  newsImpact?: string;
  newsTime?: string;
  minutesPostNews?: number;
  preNewsHigh?: number;
  preNewsLow?: number;
  firstNewsCandle?: boolean;
  firstNewsCandlePassed?: boolean;
  spreadAcceptable?: boolean;

  // AI & Quality
  aiConfidence?: number;
  aiReasoning?: string;
  aiDecision?: string;

  [key: string]: any;
}

export interface StepTransitionRecord {
  from_state: StepState;
  to_state: StepState;
  timestamp: string;
  reason: string;
  evidence?: StepEvidence;
  source_event?: DetectionSourceEvent | string;
  details?: Record<string, any>;
}

export interface SetupStepRecord {
  step_id: string;
  step_order: number;
  strategy_id: string;
  rule_id: string;
  name: string;
  description: string;
  state: StepState;
  timestamp: string;
  first_detected_at: string;
  last_evaluated_at: string;
  last_evaluated_timestamp: string;
  timeframe?: string;
  data_source?: string;
  source_candle?: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  };
  evidence: StepEvidence;
  reason: string;
  invalidation: string;
  invalidation_condition: string;
  expiry?: string;
  expires_at?: string;
  transition_history: StepTransitionRecord[];
}

export interface SetupTransitionAudit {
  from_state: OfficialSetupState;
  to_state: OfficialSetupState;
  step_id?: string;
  timestamp: string;
  reason: string;
  source_event: DetectionSourceEvent;
  details?: Record<string, any>;
}

export interface StrategySetup {
  id: string;
  strategy_id: string;
  symbol: string;
  timeframe: string;
  direction?: 'buy' | 'sell';
  state: OfficialSetupState;
  current_step_id: string;
  current_step_order: number;
  steps: SetupStepRecord[];
  created_at: string;
  updated_at: string;
  first_detected_at?: string;
  last_evaluated_at: string;
  expires_at: string;
  entry_price?: number;
  sl_price?: number;
  tp1_price?: number;
  tp2_price?: number;
  tp3_price?: number;
  risk_reward?: number;
  market_states?: string[];
  confluence_score?: number;
  ai_decision?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WAIT';
  ai_reasoning?: string;
  validation_logs: SetupTransitionAudit[];
  is_duplicate?: boolean;
}
