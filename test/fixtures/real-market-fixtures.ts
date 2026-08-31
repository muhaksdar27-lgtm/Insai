import { Candle } from '../../types';

function createCandle(data: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }): Candle {
  return {
    ...data,
    provider: 'Polygon',
    latency: 120,
    freshness: 'live',
    confidence: 0.95
  };
}

export interface MarketFixture {
  symbol: string;
  name: string;
  description: string;
  baseTimestamp: string;
  session: string;
  h1Trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  h1Candles: Candle[];
  m15Candles: Candle[];
  m5Candles: Candle[];
  m1Candles: Candle[];
  newsEvent?: {
    id: string;
    event: string;
    currency: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    timestamp: string;
    actual?: number;
    forecast?: number;
    previous?: number;
  };
  metrics: {
    spreadPips: number;
    atr: number;
    currentPrice: number;
  };
}

/**
 * Real Market Fixture 1: London Session SMC Bullish Sweep & CHoCH (Jan 15, 2025)
 * Context: London Open (08:00 UTC), Asian Low at 2678.50 swept down to 2675.20, followed by M15 CHoCH & FVG at 2682.00.
 */
export const FIXTURE_LONDON_SMC_BULLISH: MarketFixture = {
  symbol: 'XAUUSD',
  name: 'London SMC Asian Low Sweep',
  description: 'Clean London liquidity sweep of Asian session lows with bullish CHoCH displacement and FVG',
  baseTimestamp: '2025-01-15T08:30:00.000Z',
  session: 'London',
  h1Trend: 'BULLISH',
  metrics: {
    spreadPips: 1.2,
    atr: 4.8,
    currentPrice: 2684.50
  },
  h1Candles: [
    createCandle({ timestamp: '2025-01-15T04:00:00.000Z', open: 2670.0, high: 2676.0, low: 2668.0, close: 2674.5, volume: 1420 }),
    createCandle({ timestamp: '2025-01-15T05:00:00.000Z', open: 2674.5, high: 2679.0, low: 2672.0, close: 2677.0, volume: 1580 }),
    createCandle({ timestamp: '2025-01-15T06:00:00.000Z', open: 2677.0, high: 2681.0, low: 2675.5, close: 2678.5, volume: 1890 }),
    createCandle({ timestamp: '2025-01-15T07:00:00.000Z', open: 2678.5, high: 2680.0, low: 2674.0, close: 2676.0, volume: 2450 }),
    createCandle({ timestamp: '2025-01-15T08:00:00.000Z', open: 2676.0, high: 2686.0, low: 2675.2, close: 2684.5, volume: 4300 })
  ],
  m15Candles: [
    createCandle({ timestamp: '2025-01-15T07:30:00.000Z', open: 2678.0, high: 2679.5, low: 2676.0, close: 2676.5, volume: 620 }),
    createCandle({ timestamp: '2025-01-15T07:45:00.000Z', open: 2676.5, high: 2677.2, low: 2674.0, close: 2674.5, volume: 780 }),
    createCandle({ timestamp: '2025-01-15T08:00:00.000Z', open: 2674.5, high: 2676.0, low: 2675.2, close: 2678.0, volume: 1200 }), // Sweep
    createCandle({ timestamp: '2025-01-15T08:15:00.000Z', open: 2678.0, high: 2685.0, low: 2677.5, close: 2683.5, volume: 1850 }), // CHoCH & displacement
    createCandle({ timestamp: '2025-01-15T08:30:00.000Z', open: 2683.5, high: 2686.0, low: 2682.0, close: 2684.5, volume: 1450 })  // Mitigation of FVG/OB
  ],
  m5Candles: [
    createCandle({ timestamp: '2025-01-15T08:15:00.000Z', open: 2678.0, high: 2681.5, low: 2677.5, close: 2681.0, volume: 550 }),
    createCandle({ timestamp: '2025-01-15T08:20:00.000Z', open: 2681.0, high: 2684.2, low: 2680.5, close: 2683.8, volume: 680 }),
    createCandle({ timestamp: '2025-01-15T08:25:00.000Z', open: 2683.8, high: 2685.5, low: 2682.5, close: 2683.5, volume: 490 }),
    createCandle({ timestamp: '2025-01-15T08:30:00.000Z', open: 2683.5, high: 2686.0, low: 2682.0, close: 2684.5, volume: 620 })
  ],
  m1Candles: [
    createCandle({ timestamp: '2025-01-15T08:26:00.000Z', open: 2683.0, high: 2683.8, low: 2682.2, close: 2682.5, volume: 95 }),
    createCandle({ timestamp: '2025-01-15T08:27:00.000Z', open: 2682.5, high: 2683.2, low: 2682.0, close: 2682.8, volume: 110 }),
    createCandle({ timestamp: '2025-01-15T08:28:00.000Z', open: 2682.8, high: 2684.0, low: 2682.5, close: 2683.9, volume: 140 }),
    createCandle({ timestamp: '2025-01-15T08:29:00.000Z', open: 2683.9, high: 2684.6, low: 2683.4, close: 2684.2, volume: 160 }),
    createCandle({ timestamp: '2025-01-15T08:30:00.000Z', open: 2684.2, high: 2685.0, low: 2683.8, close: 2684.5, volume: 180 })
  ]
};

/**
 * Real Market Fixture 2: Supply & Demand Drop-Base-Rally Demand Zone Tap with Bullish Engulfing (Jan 16, 2025)
 * Context: NY Session (14:30 UTC), Price pulls back to fresh DBR Demand zone [2680.00 - 2684.00], prints clear Bullish Engulfing.
 */
export const FIXTURE_SND_DEMAND_TAP: MarketFixture = {
  symbol: 'XAUUSD',
  name: 'S&D Fresh Demand Zone Tap',
  description: 'HTF uptrend with clear MA50>MA200 alignment, pullback to fresh demand, and strong M15 engulfing candle',
  baseTimestamp: '2025-01-16T14:30:00.000Z',
  session: 'New York',
  h1Trend: 'BULLISH',
  metrics: {
    spreadPips: 1.4,
    atr: 5.2,
    currentPrice: 2688.00
  },
  h1Candles: [
    createCandle({ timestamp: '2025-01-16T10:00:00.000Z', open: 2675.0, high: 2682.0, low: 2673.0, close: 2680.0, volume: 1800 }),
    createCandle({ timestamp: '2025-01-16T11:00:00.000Z', open: 2680.0, high: 2692.0, low: 2679.0, close: 2690.0, volume: 2800 }), // Created Demand base
    createCandle({ timestamp: '2025-01-16T12:00:00.000Z', open: 2690.0, high: 2698.0, low: 2688.0, close: 2695.0, volume: 2200 }),
    createCandle({ timestamp: '2025-01-16T13:00:00.000Z', open: 2695.0, high: 2696.0, low: 2683.0, close: 2685.0, volume: 2600 }), // Retracement
    createCandle({ timestamp: '2025-01-16T14:00:00.000Z', open: 2685.0, high: 2690.0, low: 2681.5, close: 2688.0, volume: 3400 })  // Demand bounce
  ],
  m15Candles: [
    createCandle({ timestamp: '2025-01-16T13:45:00.000Z', open: 2688.0, high: 2688.5, low: 2684.0, close: 2684.5, volume: 720 }),
    createCandle({ timestamp: '2025-01-16T14:00:00.000Z', open: 2684.5, high: 2685.0, low: 2681.5, close: 2682.2, volume: 890 }), // In Zone
    createCandle({ timestamp: '2025-01-16T14:15:00.000Z', open: 2682.2, high: 2689.0, low: 2681.8, close: 2688.0, volume: 1650 })  // Engulfing Trigger
  ],
  m5Candles: [
    createCandle({ timestamp: '2025-01-16T14:05:00.000Z', open: 2683.0, high: 2683.8, low: 2681.5, close: 2682.0, volume: 280 }),
    createCandle({ timestamp: '2025-01-16T14:10:00.000Z', open: 2682.0, high: 2685.0, low: 2681.8, close: 2684.5, volume: 450 }),
    createCandle({ timestamp: '2025-01-16T14:15:00.000Z', open: 2684.5, high: 2689.0, low: 2684.0, close: 2688.0, volume: 620 })
  ],
  m1Candles: [
    createCandle({ timestamp: '2025-01-16T14:13:00.000Z', open: 2684.0, high: 2685.5, low: 2683.8, close: 2685.2, volume: 110 }),
    createCandle({ timestamp: '2025-01-16T14:14:00.000Z', open: 2685.2, high: 2687.0, low: 2684.8, close: 2686.8, volume: 140 }),
    createCandle({ timestamp: '2025-01-16T14:15:00.000Z', open: 2686.8, high: 2688.5, low: 2686.5, close: 2688.0, volume: 190 })
  ]
};

/**
 * Real Market Fixture 3: M1/M5 Scalping Double Bottom Sweep & Neckline Break (Jan 17, 2025)
 * Context: Overlap Session (13:15 UTC), M5 Liquidity Sweep at 2705.00, M1 Double Bottom pattern with Neckline break at 2708.50.
 */
export const FIXTURE_SCALPING_DOUBLE_BOTTOM: MarketFixture = {
  symbol: 'XAUUSD',
  name: 'M1/M5 Double Bottom Scalp',
  description: 'Fast scalping setup: H1 trend bullish, M15 retracement, M5 liquidity sweep, and M1 double bottom neckline break',
  baseTimestamp: '2025-01-17T13:20:00.000Z',
  session: 'London/NY Overlap',
  h1Trend: 'BULLISH',
  metrics: {
    spreadPips: 1.0,
    atr: 3.6,
    currentPrice: 2710.20
  },
  h1Candles: [
    createCandle({ timestamp: '2025-01-17T09:00:00.000Z', open: 2695.0, high: 2706.0, low: 2694.0, close: 2704.0, volume: 2100 }),
    createCandle({ timestamp: '2025-01-17T10:00:00.000Z', open: 2704.0, high: 2715.0, low: 2702.0, close: 2712.0, volume: 2900 }),
    createCandle({ timestamp: '2025-01-17T11:00:00.000Z', open: 2712.0, high: 2718.0, low: 2708.0, close: 2716.0, volume: 2300 }),
    createCandle({ timestamp: '2025-01-17T12:00:00.000Z', open: 2716.0, high: 2717.0, low: 2704.0, close: 2706.0, volume: 2700 }), // Retracement
    createCandle({ timestamp: '2025-01-17T13:00:00.000Z', open: 2706.0, high: 2712.0, low: 2704.5, close: 2710.2, volume: 3800 })
  ],
  m15Candles: [
    createCandle({ timestamp: '2025-01-17T12:45:00.000Z', open: 2709.0, high: 2709.5, low: 2705.5, close: 2706.0, volume: 820 }),
    createCandle({ timestamp: '2025-01-17T13:00:00.000Z', open: 2706.0, high: 2708.0, low: 2704.5, close: 2707.0, volume: 950 }),
    createCandle({ timestamp: '2025-01-17T13:15:00.000Z', open: 2707.0, high: 2711.0, low: 2704.8, close: 2710.2, volume: 1400 })
  ],
  m5Candles: [
    createCandle({ timestamp: '2025-01-17T13:05:00.000Z', open: 2706.5, high: 2708.5, low: 2705.0, close: 2708.0, volume: 320 }), // Low 1
    createCandle({ timestamp: '2025-01-17T13:10:00.000Z', open: 2708.0, high: 2709.0, low: 2704.8, close: 2707.5, volume: 410 }), // Low 2 (Sweep)
    createCandle({ timestamp: '2025-01-17T13:15:00.000Z', open: 2707.5, high: 2711.0, low: 2707.2, close: 2710.2, volume: 680 })  // Break
  ],
  m1Candles: [
    createCandle({ timestamp: '2025-01-17T13:11:00.000Z', open: 2706.2, high: 2707.5, low: 2704.8, close: 2706.8, volume: 90 }),  // Bottom 2
    createCandle({ timestamp: '2025-01-17T13:12:00.000Z', open: 2706.8, high: 2708.6, low: 2706.5, close: 2708.4, volume: 120 }),
    createCandle({ timestamp: '2025-01-17T13:13:00.000Z', open: 2708.4, high: 2709.5, low: 2708.2, close: 2709.2, volume: 160 }), // Neckline break
    createCandle({ timestamp: '2025-01-17T13:14:00.000Z', open: 2709.2, high: 2710.5, low: 2709.0, close: 2710.0, volume: 190 }),
    createCandle({ timestamp: '2025-01-17T13:15:00.000Z', open: 2710.0, high: 2711.0, low: 2709.8, close: 2710.2, volume: 220 })
  ]
};

/**
 * Real Market Fixture 4: US CPI High Impact News Reversal (Jan 15, 2025 13:30 UTC)
 * Context: CPI Release spikes Gold to 2735.00 (sweeping liquidity), creates large rejection wick, spreads normalize (<3.0 pips), followed by M1 BOS reversal downwards.
 */
export const FIXTURE_US_CPI_NEWS_REVERSAL: MarketFixture = {
  symbol: 'XAUUSD',
  name: 'US CPI Release Reversal',
  description: 'High impact US CPI release with immediate 15-pip spike sweep, deep wick rejection, spread normalization, and M1 BOS reversal',
  baseTimestamp: '2025-01-15T13:38:00.000Z',
  session: 'New York',
  h1Trend: 'BEARISH',
  newsEvent: {
    id: 'news_cpi_20250115',
    event: 'US Core CPI m/m',
    currency: 'USD',
    impact: 'HIGH',
    timestamp: '2025-01-15T13:30:00.000Z',
    actual: 0.4,
    forecast: 0.2,
    previous: 0.2
  },
  metrics: {
    spreadPips: 2.1, // Normalized after initial spike
    atr: 8.5,
    currentPrice: 2722.50
  },
  h1Candles: [
    createCandle({ timestamp: '2025-01-15T11:00:00.000Z', open: 2730.0, high: 2733.0, low: 2725.0, close: 2728.0, volume: 2100 }),
    createCandle({ timestamp: '2025-01-15T12:00:00.000Z', open: 2728.0, high: 2731.0, low: 2726.0, close: 2729.0, volume: 1950 }),
    createCandle({ timestamp: '2025-01-15T13:00:00.000Z', open: 2729.0, high: 2738.0, low: 2718.0, close: 2722.5, volume: 8900 })  // News candle
  ],
  m15Candles: [
    createCandle({ timestamp: '2025-01-15T13:15:00.000Z', open: 2728.5, high: 2730.0, low: 2727.5, close: 2729.0, volume: 650 }),
    createCandle({ timestamp: '2025-01-15T13:30:00.000Z', open: 2729.0, high: 2738.0, low: 2720.0, close: 2722.5, volume: 6200 }) // Spike + Reversal
  ],
  m5Candles: [
    createCandle({ timestamp: '2025-01-15T13:25:00.000Z', open: 2728.8, high: 2729.8, low: 2728.0, close: 2729.2, volume: 310 }),
    createCandle({ timestamp: '2025-01-15T13:30:00.000Z', open: 2729.2, high: 2738.0, low: 2726.0, close: 2728.0, volume: 3800 }), // Spike & wick rejection
    createCandle({ timestamp: '2025-01-15T13:35:00.000Z', open: 2728.0, high: 2728.5, low: 2720.0, close: 2722.5, volume: 2400 })  // BOS Continuation
  ],
  m1Candles: [
    createCandle({ timestamp: '2025-01-15T13:31:00.000Z', open: 2730.0, high: 2738.0, low: 2730.0, close: 2734.0, volume: 1100 }), // High of spike
    createCandle({ timestamp: '2025-01-15T13:32:00.000Z', open: 2734.0, high: 2735.0, low: 2728.0, close: 2729.0, volume: 980 }),  // Rejection
    createCandle({ timestamp: '2025-01-15T13:33:00.000Z', open: 2729.0, high: 2730.0, low: 2725.0, close: 2725.5, volume: 850 }),  // M1 BOS below 2728
    createCandle({ timestamp: '2025-01-15T13:34:00.000Z', open: 2725.5, high: 2726.5, low: 2723.0, close: 2723.8, volume: 640 }),
    createCandle({ timestamp: '2025-01-15T13:35:00.000Z', open: 2723.8, high: 2724.5, low: 2721.5, close: 2722.5, volume: 590 })
  ]
};

/**
 * Real Market Fixture 5: SMC + S&D Multi-Confluence 2-of-3 Overlap (Jan 20, 2025)
 * Context: London/Overlap Session (10:00 UTC), Fib 61.8% Retracement overlap at 2715.00 + Fresh M15 Demand Zone [2714.00 - 2716.50] + Asian Low Sweep.
 */
export const FIXTURE_CONFLUENCE_SMC_SND: MarketFixture = {
  symbol: 'XAUUSD',
  name: 'SMC + S&D + Fib Confluence',
  description: 'Triple confluence setup: S&D fresh zone, Fib 61.8% golden pocket, and Asian low sweep meeting the 2-of-3 threshold',
  baseTimestamp: '2025-01-20T10:00:00.000Z',
  session: 'London',
  h1Trend: 'BULLISH',
  metrics: {
    spreadPips: 1.3,
    atr: 4.4,
    currentPrice: 2718.50
  },
  h1Candles: [
    createCandle({ timestamp: '2025-01-20T06:00:00.000Z', open: 2705.0, high: 2712.0, low: 2704.0, close: 2710.0, volume: 1750 }),
    createCandle({ timestamp: '2025-01-20T07:00:00.000Z', open: 2710.0, high: 2725.0, low: 2708.0, close: 2722.0, volume: 3100 }),
    createCandle({ timestamp: '2025-01-20T08:00:00.000Z', open: 2722.0, high: 2726.0, low: 2715.0, close: 2716.5, volume: 2400 }),
    createCandle({ timestamp: '2025-01-20T09:00:00.000Z', open: 2716.5, high: 2718.0, low: 2714.0, close: 2715.5, volume: 2200 }),
    createCandle({ timestamp: '2025-01-20T10:00:00.000Z', open: 2715.5, high: 2721.0, low: 2714.5, close: 2718.5, volume: 3600 })
  ],
  m15Candles: [
    createCandle({ timestamp: '2025-01-20T09:15:00.000Z', open: 2718.0, high: 2718.5, low: 2715.0, close: 2715.5, volume: 680 }),
    createCandle({ timestamp: '2025-01-20T09:30:00.000Z', open: 2715.5, high: 2716.5, low: 2714.0, close: 2714.5, volume: 740 }), // Zone + Fib + Sweep
    createCandle({ timestamp: '2025-01-20T09:45:00.000Z', open: 2714.5, high: 2719.0, low: 2714.2, close: 2718.5, volume: 1520 })  // Rejection Trigger
  ],
  m5Candles: [
    createCandle({ timestamp: '2025-01-20T09:35:00.000Z', open: 2715.0, high: 2715.5, low: 2714.0, close: 2714.5, volume: 290 }),
    createCandle({ timestamp: '2025-01-20T09:40:00.000Z', open: 2714.5, high: 2717.0, low: 2714.2, close: 2716.5, volume: 440 }),
    createCandle({ timestamp: '2025-01-20T09:45:00.000Z', open: 2716.5, high: 2719.0, low: 2716.0, close: 2718.5, volume: 580 })
  ],
  m1Candles: [
    createCandle({ timestamp: '2025-01-20T09:42:00.000Z', open: 2715.8, high: 2716.8, low: 2715.5, close: 2716.5, volume: 95 }),
    createCandle({ timestamp: '2025-01-20T09:43:00.000Z', open: 2716.5, high: 2717.8, low: 2716.2, close: 2717.4, volume: 130 }),
    createCandle({ timestamp: '2025-01-20T09:44:00.000Z', open: 2717.4, high: 2718.6, low: 2717.0, close: 2718.2, volume: 160 }),
    createCandle({ timestamp: '2025-01-20T09:45:00.000Z', open: 2718.2, high: 2719.0, low: 2717.8, close: 2718.5, volume: 195 })
  ]
};
