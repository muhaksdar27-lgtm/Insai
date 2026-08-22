export interface StrategyExecutionResult {
  isCandidateValid: boolean | 'pending';
  direction: 'buy' | 'sell';
  candidateRules: Record<string, any>;
  confluenceScore: number;
  confirmationStatus: string;
  setupSnapshot: Record<string, any>;
}

export interface StrategyRuleDefinition {
  rule_id: string;
  name: string;
  mandatory: boolean;
  timeframe: string;
  description: string;
  evaluation_logic: string;
  invalidation_condition: string;
}

export interface StrategySpecification {
  strategy_id: string;
  name: string;
  version: string;
  status: 'ACTIVE' | 'UNDEFINED / SAME RULESET AS PRD';
  description: string;
  timeframe: {
    htf: string;
    ltf: string;
    execution: string;
    intermediate?: string;
  };
  session_requirement: {
    allowedSessions: string[];
    utcWindow?: string;
    description: string;
  };
  setup_sequence: {
    step_id: string;
    step_order: number;
    rule_id: string;
    name: string;
    description: string;
    invalidation: string;
    defaultExpiryMinutes: number;
  }[];
  rule_definition: StrategyRuleDefinition[];
  entry_rule: {
    type: 'LIMIT' | 'MARKET' | 'STOP';
    trigger: string;
    description: string;
  };
  sl_rule: {
    bufferFormula: string;
    anchor: string;
    description: string;
  };
  tp_rule: {
    tp1: string;
    tp2: string;
    tp3?: string;
    minRR: number;
    description: string;
  };
  filter: {
    spreadMaxPips: number;
    newsRestriction: string;
    sessionFilter: boolean;
    cooldownCandles?: number;
  };
  invalidation_rule: {
    conditions: string[];
    action: string;
  };
  expiry_rule: {
    maxDurationMinutes: number;
    condition: string;
  };
  evidence_model: {
    requiredFields: string[];
    description: string;
  };
}

export interface SignalIdentityComponents {
  strategy_id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  setup_instance: string;
  event_context: string;
}

export function buildSignalKey(
  componentsOrStrategyId: SignalIdentityComponents | string,
  symbol?: string,
  direction?: 'BUY' | 'SELL' | 'buy' | 'sell',
  setup_instance?: string,
  event_context?: string
): string {
  if (typeof componentsOrStrategyId === 'object') {
    const { strategy_id, symbol: sym, direction: dir, setup_instance: inst, event_context: ctx } = componentsOrStrategyId;
    return `sig::${strategy_id}::${sym}::${(dir || 'BUY').toUpperCase()}::${inst}::${ctx || 'candle_closed'}`;
  }
  return `sig::${componentsOrStrategyId}::${symbol}::${(direction || 'BUY').toUpperCase()}::${setup_instance}::${event_context || 'candle_closed'}`;
}

export function parseSignalKey(key: string): SignalIdentityComponents | null {
  if (!key.startsWith('sig')) return null;

  if (key.includes('::')) {
    const parts = key.replace(/^sig::/, '').split('::');
    if (parts.length < 5) return null;
    return {
      strategy_id: parts[0],
      symbol: parts[1],
      direction: parts[2] as 'BUY' | 'SELL',
      setup_instance: parts[3],
      event_context: parts[4]
    };
  }

  // Fallback for underscore format
  const raw = key.replace(/^sig_/, '');
  const parts = raw.split('_');
  if (parts.length < 5) return null;
  return {
    strategy_id: parts[0],
    symbol: parts[1],
    direction: parts[2] as 'BUY' | 'SELL',
    setup_instance: parts[3],
    event_context: parts.slice(4).join('_')
  };
}
