import { describe, expect, it } from 'vitest';
import {
  inferDirection,
  isDirectionallyValid,
  resolveCandidateValidity,
} from '@/lib/trading-engine/strategies/strategy-signal-guards';

describe('strategy signal guards', () => {
  it('does not guess a direction when evidence is neutral or conflicting', () => {
    expect(inferDirection({ bullish: false, bearish: false, h1Trend: 'neutral' })).toBeNull();
    expect(inferDirection({ bullish: true, bearish: true })).toBeNull();
  });

  it('accepts explicit direction only when it is a supported value', () => {
    expect(inferDirection({ explicit: 'LONG', bullish: false, bearish: false })).toBe('buy');
    expect(inferDirection({ explicit: 'unknown', bullish: false, bearish: true })).toBe('sell');
  });

  it('never marks an empty rule set as a valid candidate', () => {
    expect(resolveCandidateValidity(0, 0, false, false, 'buy')).toBe(false);
    expect(resolveCandidateValidity(3, 3, false, false, null)).toBe(false);
    expect(resolveCandidateValidity(3, 2, false, true, 'buy')).toBe('pending');
  });

  it('enforces directional entry, stop, and minimum 1.5R geometry', () => {
    expect(isDirectionallyValid('buy', 2000, 1990, 2015)).toBe(true);
    expect(isDirectionallyValid('sell', 2000, 2010, 1985)).toBe(true);
    expect(isDirectionallyValid('buy', 2000, 2010, 2015)).toBe(false);
    expect(isDirectionallyValid('buy', 2000, 1990, 2005)).toBe(false);
  });
});
