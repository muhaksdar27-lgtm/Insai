import { Candle } from '@/types';
import { calculateEMA, calculateSMA, calculateATR, findPivots, findBOS, detectMSS } from './indicators';

export type HTFTrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'INSUFFICIENT_DATA' | 'ANALYSIS_ERROR';

export interface HTFTrendEvidence {
  currentPrice: number;
  ema20: number;
  ema50: number;
  sma200?: number;
  emaSlope: number;
  priceVsEma: 'ABOVE' | 'BELOW' | 'AT';
  swingStructure: 'HIGHER_HIGHS_HIGHER_LOWS' | 'LOWER_HIGHS_LOWER_LOWS' | 'RANGING' | 'INDETERMINATE';
  recentSwingHighs: number[];
  recentSwingLows: number[];
  atr: number;
  bosBullCount: number;
  bosBearCount: number;
  mssState: string;
}

export interface HTFTrendResult {
  direction: HTFTrendDirection;
  timeframe: string;
  timestamp: string;
  evidence: HTFTrendEvidence;
  structureBasis: string;
  confidence: number; // 0.0 to 1.0 (auditable mathematical confluence)
  status: 'VALID' | 'INSUFFICIENT_DATA' | 'ANALYSIS_ERROR';
  error?: string;
}

export class HTFTrendAnalyzer {
  /**
   * Deterministically calculates HTF trend based on multi-MA alignment and swing structure.
   */
  public static analyzeTrend(candles: Candle[], timeframe: string = 'H1'): HTFTrendResult {
    const tf = timeframe.toUpperCase();

    // 1. Check data sufficiency (minimum 15 candles for H1/H4 structure)
    if (!candles || !Array.isArray(candles) || candles.length < 15) {
      return {
        direction: 'INSUFFICIENT_DATA',
        timeframe: tf,
        timestamp: candles && candles.length > 0 ? candles[candles.length - 1].timestamp : new Date().toISOString(),
        evidence: {
          currentPrice: candles && candles.length > 0 ? candles[candles.length - 1].close : 0,
          ema20: 0,
          ema50: 0,
          emaSlope: 0,
          priceVsEma: 'AT',
          swingStructure: 'INDETERMINATE',
          recentSwingHighs: [],
          recentSwingLows: [],
          atr: 0,
          bosBullCount: 0,
          bosBearCount: 0,
          mssState: 'NONE'
        },
        structureBasis: `Insufficient historical candles (found ${candles ? candles.length : 0}, requires >= 15)`,
        confidence: 0.0,
        status: 'INSUFFICIENT_DATA',
        error: `Insufficient candles for ${tf} trend analysis`
      };
    }

    try {
      const lastCandle = candles[candles.length - 1];
      const currentPrice = lastCandle.close;
      const timestamp = lastCandle.timestamp;

      // 2. Compute Moving Averages
      const ema20 = calculateEMA(candles, Math.min(20, candles.length)) || currentPrice;
      const ema50 = calculateEMA(candles, Math.min(50, candles.length)) || ema20;
      const sma200 = candles.length >= 100 ? calculateSMA(candles, Math.min(200, candles.length)) : undefined;

      // 3. Compute EMA Slope (over last 5 bars)
      const lookbackIndex = Math.max(0, candles.length - 6);
      const pastCandles = candles.slice(0, lookbackIndex + 1);
      const pastEma20 = pastCandles.length > 0 ? (calculateEMA(pastCandles, Math.min(20, pastCandles.length)) || ema20) : ema20;
      const emaSlope = Number((ema20 - pastEma20).toFixed(4));

      // 4. Price vs Moving Average
      let priceVsEma: 'ABOVE' | 'BELOW' | 'AT' = 'AT';
      if (currentPrice > ema20 * 1.0005) priceVsEma = 'ABOVE';
      else if (currentPrice < ema20 * 0.9995) priceVsEma = 'BELOW';

      // 5. Volatility (ATR)
      const atr = calculateATR(candles, Math.min(14, candles.length)) || 0;

      // 6. Swing Structure Analysis (Pivots)
      const pivots = findPivots(candles, 3, 3);
      const recentHighs = pivots.highs.slice(-4).map(p => p.price);
      const recentLows = pivots.lows.slice(-4).map(p => p.price);

      let swingStructure: 'HIGHER_HIGHS_HIGHER_LOWS' | 'LOWER_HIGHS_LOWER_LOWS' | 'RANGING' | 'INDETERMINATE' = 'INDETERMINATE';
      let structureScore = 0; // +1 for bullish structure, -1 for bearish

      if (recentHighs.length >= 2 && recentLows.length >= 2) {
        const lastH = recentHighs[recentHighs.length - 1];
        const prevH = recentHighs[recentHighs.length - 2];
        const lastL = recentLows[recentLows.length - 1];
        const prevL = recentLows[recentLows.length - 2];

        const isHH = lastH > prevH;
        const isHL = lastL > prevL;
        const isLH = lastH < prevH;
        const isLL = lastL < prevL;

        if (isHH && isHL) {
          swingStructure = 'HIGHER_HIGHS_HIGHER_LOWS';
          structureScore = 2;
        } else if (isLH && isLL) {
          swingStructure = 'LOWER_HIGHS_LOWER_LOWS';
          structureScore = -2;
        } else if (isHH && isLL) {
          swingStructure = 'RANGING'; // Expanding range
          structureScore = 0;
        } else {
          swingStructure = 'RANGING';
          structureScore = isHH ? 1 : (isLL ? -1 : 0);
        }
      }

      // 7. Break of Structure (BOS) & Market Structure Shift (MSS)
      const bosEvents = findBOS(candles);
      const recentBOS = bosEvents.slice(-5);
      const bosBullCount = recentBOS.filter(b => b.type === 'bullish').length;
      const bosBearCount = recentBOS.filter(b => b.type === 'bearish').length;

      const mss = detectMSS(candles);
      const mssState = mss ? mss.type : 'NONE';

      // 8. Deterministic Weighted Trend Confluence Calculation
      let bullishPoints = 0;
      let bearishPoints = 0;
      const totalPossiblePoints = 100;

      // MA Alignment & Slope (45 points)
      if (currentPrice >= ema20 && ema20 >= ema50) {
        bullishPoints += 35;
        if (emaSlope > 0) bullishPoints += 10;
        if (sma200 && currentPrice >= sma200) bullishPoints += 5;
      } else if (currentPrice <= ema20 && ema20 <= ema50) {
        bearishPoints += 35;
        if (emaSlope < 0) bearishPoints += 10;
        if (sma200 && currentPrice <= sma200) bearishPoints += 5;
      } else if (currentPrice >= ema20) {
        bullishPoints += 20;
        if (emaSlope > 0) bullishPoints += 5;
      } else if (currentPrice <= ema20) {
        bearishPoints += 20;
        if (emaSlope < 0) bearishPoints += 5;
      }

      // Macro Candle Linear Progression (15 points)
      if (candles.length >= 10) {
        const firstQuarterClose = candles[Math.floor(candles.length / 4)].close;
        const lastQuarterClose = candles[candles.length - 1].close;
        if (lastQuarterClose > firstQuarterClose) {
          bullishPoints += 15;
        } else if (lastQuarterClose < firstQuarterClose) {
          bearishPoints += 15;
        }
      }

      // Swing Structure (25 points)
      if (structureScore > 0) {
        bullishPoints += structureScore === 2 ? 25 : 15;
      } else if (structureScore < 0) {
        bearishPoints += structureScore === -2 ? 25 : 15;
      }

      // BOS / MSS (15 points)
      if (bosBullCount > bosBearCount) {
        bullishPoints += 10;
      } else if (bosBearCount > bosBullCount) {
        bearishPoints += 10;
      }
      if (mssState.includes('bullish')) bullishPoints += 5;
      if (mssState.includes('bearish')) bearishPoints += 5;

      let direction: HTFTrendDirection = 'NEUTRAL';
      let structureBasis = '';
      let confidence = 0.5;

      if (bullishPoints >= 50 && bullishPoints > bearishPoints + 15) {
        direction = 'BULLISH';
        confidence = Math.min(0.98, Math.max(0.65, bullishPoints / totalPossiblePoints));
        structureBasis = `${tf} Trend Bullish: Price (${currentPrice.toFixed(2)}) > EMA20 (${ema20.toFixed(2)}) > EMA50 (${ema50.toFixed(2)}), structure ${swingStructure}`;
      } else if (bearishPoints >= 50 && bearishPoints > bullishPoints + 15) {
        direction = 'BEARISH';
        confidence = Math.min(0.98, Math.max(0.65, bearishPoints / totalPossiblePoints));
        structureBasis = `${tf} Trend Bearish: Price (${currentPrice.toFixed(2)}) < EMA20 (${ema20.toFixed(2)}) < EMA50 (${ema50.toFixed(2)}), structure ${swingStructure}`;
      } else {
        direction = 'NEUTRAL';
        confidence = 0.50;
        structureBasis = `${tf} Trend Neutral: Mixed signals (Bullish: ${bullishPoints} pts, Bearish: ${bearishPoints} pts), structure ${swingStructure}`;
      }

      return {
        direction,
        timeframe: tf,
        timestamp,
        evidence: {
          currentPrice,
          ema20: Number(ema20.toFixed(2)),
          ema50: Number(ema50.toFixed(2)),
          sma200: sma200 ? Number(sma200.toFixed(2)) : undefined,
          emaSlope,
          priceVsEma,
          swingStructure,
          recentSwingHighs: recentHighs.map(h => Number(h.toFixed(2))),
          recentSwingLows: recentLows.map(l => Number(l.toFixed(2))),
          atr: Number(atr.toFixed(2)),
          bosBullCount,
          bosBearCount,
          mssState
        },
        structureBasis,
        confidence: Number(confidence.toFixed(2)),
        status: 'VALID'
      };
    } catch (err: any) {
      return {
        direction: 'ANALYSIS_ERROR',
        timeframe: tf,
        timestamp: candles && candles.length > 0 ? candles[candles.length - 1].timestamp : new Date().toISOString(),
        evidence: {
          currentPrice: candles && candles.length > 0 ? candles[candles.length - 1].close : 0,
          ema20: 0,
          ema50: 0,
          emaSlope: 0,
          priceVsEma: 'AT',
          swingStructure: 'INDETERMINATE',
          recentSwingHighs: [],
          recentSwingLows: [],
          atr: 0,
          bosBullCount: 0,
          bosBearCount: 0,
          mssState: 'ERROR'
        },
        structureBasis: `HTF Trend Analysis Error: ${err.message}`,
        confidence: 0.0,
        status: 'ANALYSIS_ERROR',
        error: err.message
      };
    }
  }
}
