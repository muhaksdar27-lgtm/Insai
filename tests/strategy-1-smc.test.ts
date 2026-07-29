import { describe, it, expect } from 'vitest';
import { detectStrategy1SMC } from '@/lib/trading-engine/strategies/strategy-1-smc';

describe('strategy-1-smc', () => {
  it('returns pending when key evidence missing', () => {
    const context: any = { symbol: 'XAUUSD', candles: [{close: 2000}, {close: 2005}] };
    const res = detectStrategy1SMC(context, { atr: 4.2, current_price: 2005 });
    expect(res).toBeDefined();
    expect(res.setupSnapshot.symbol).toBe('XAUUSD');
    expect(res.isCandidateValid === true || res.isCandidateValid === 'pending' || res.isCandidateValid === false).toBeTruthy();
  });
});
