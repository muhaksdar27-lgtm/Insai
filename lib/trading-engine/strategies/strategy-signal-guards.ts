export type SignalDirection = 'buy' | 'sell';
export type CandidateValidity = boolean | 'pending';

export interface DirectionEvidence {
  explicit?: unknown;
  bullish: boolean;
  bearish: boolean;
  h1Trend?: unknown;
}

/**
 * Direction is a required fact, not a default. A neutral market must remain
 * neutral and be held by the sequential setup detector rather than emitting a
 * guessed BUY signal.
 */
export function inferDirection(evidence: DirectionEvidence): SignalDirection | null {
  const explicit = typeof evidence.explicit === 'string' ? evidence.explicit.toLowerCase() : '';
  if (explicit === 'buy' || explicit === 'long') return 'buy';
  if (explicit === 'sell' || explicit === 'short') return 'sell';

  const bullish = Boolean(evidence.bullish);
  const bearish = Boolean(evidence.bearish);
  if (bullish === bearish) return null;

  return bullish ? 'buy' : 'sell';
}

/**
 * A candidate cannot be valid with zero evaluated rules or with no directional
 * evidence. Pending means data is incomplete; false means a mandatory rule
 * failed. This distinction is consumed by the live-signal pipeline.
 */
export function resolveCandidateValidity(
  totalRules: number,
  passedRules: number,
  hasCriticalInvalid: boolean,
  hasPending: boolean,
  direction: SignalDirection | null,
  minimumScore = 80,
): CandidateValidity {
  if (!direction || totalRules <= 0) return hasPending ? 'pending' : false;
  if (hasCriticalInvalid) return false;
  if (hasPending) return 'pending';
  return passedRules / totalRules >= minimumScore / 100;
}

export function validPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isDirectionallyValid(
  direction: SignalDirection | null,
  entry: unknown,
  sl: unknown,
  tp: unknown,
): boolean {
  if (!direction || !validPrice(entry) || !validPrice(sl) || !validPrice(tp)) return false;
  if (direction === 'buy' && !(sl < entry && tp > entry)) return false;
  if (direction === 'sell' && !(sl > entry && tp < entry)) return false;
  const risk = Math.abs(entry - sl);
  return risk > 0 && Math.abs(tp - entry) / risk >= 1.5;
}

export function neutralSnapshot(symbol: string, strategyId: string, timeframe: string) {
  return {
    strategyId,
    symbol,
    timeframe,
    direction: null,
    bias: 'NEUTRAL',
    marketBias: 'NEUTRAL',
    confirmationStatus: 'Awaiting directional confirmation',
  };
}
