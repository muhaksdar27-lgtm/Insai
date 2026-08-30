import { Candle } from '@/types';
import { TradingParameters } from '../config/trading-parameters';

// Map: cacheKey -> Record<string, any>
const indicatorCache = new Map<string, Record<string, any>>();

function getCacheKey(candles: Candle[]): string {
  if (!candles || candles.length === 0) return 'empty';
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : last;
  // Use previous closed candle timestamp + array length + rounded last close (to nearest 0.1)
  // This reduces cache thrashing on micro-movements while still capturing significant changes
  const roundedClose = Math.round(last.close * 10) / 10;
  return `${prev.timestamp}_${candles.length}_${roundedClose}`;
}

function getCached<T>(candles: Candle[], key: string, calculator: () => T): T {
  const globalKey = getCacheKey(candles);
  
  if (globalKey === 'empty') return calculator();

  let itemCache = indicatorCache.get(globalKey);
  if (!itemCache) {
    itemCache = {};
    indicatorCache.set(globalKey, itemCache);
    
    // Prune cache more aggressively to prevent memory leaks in high-tick environments
    if (indicatorCache.size > 50) {
      const keysToDelete = Array.from(indicatorCache.keys()).slice(0, 25);
      keysToDelete.forEach(k => indicatorCache.delete(k));
    }
  }

  if (key in itemCache) {
    return itemCache[key] as T;
  }
  const result = calculator();
  itemCache[key] = result;
  return result;
}

export function calculateATR(candles: Candle[], period: number = 14): number | null {
  return getCached(candles, `atr_${period}`, () => {
    if (candles.length < period + 1) return null;
    let trSum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    return trSum / period;
  });
}

export function calculateAverageBodySize(candles: Candle[], period: number = 14): number | null {
  return getCached(candles, `avgBody_${period}`, () => {
    if (candles.length < period) return null;
    let bodySum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      bodySum += Math.abs(candles[i].close - candles[i].open);
    }
    return bodySum / period;
  });
}

export function calculateSMA(candles: Candle[], period: number): number | null {
  return getCached(candles, `sma_${period}`, () => {
    if (candles.length < period) return null;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      sum += candles[i].close;
    }
    return sum / period;
  });
}

export function calculateEMA(candles: Candle[], period: number): number | null {
  return getCached(candles, `ema_${period}`, () => {
    if (candles.length < period) return null;
    const k = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close * k) + (ema * (1 - k));
    }
    return ema;
  });
}

export function calculateRSI(candles: Candle[], period: number = 14): number | null {
  return getCached(candles, `rsi_${period}`, () => {
    if (candles.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const diff = candles[i].close - candles[i-1].close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    let rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  });
}

// Find Swing Highs and Swing Lows (Fractals)
export function findPivots(candles: Candle[], leftBar: number = 5, rightBar: number = 5) {
  return getCached(candles, `pivots_${leftBar}_${rightBar}`, () => {
    const highs = [];
    const lows = [];
    for (let i = leftBar; i < candles.length - rightBar; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = i - leftBar; j <= i + rightBar; j++) {
        if (i === j) continue;
        if (candles[j].high >= candles[i].high) isHigh = false;
        if (candles[j].low <= candles[i].low) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].timestamp });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].timestamp });
    }
    return { highs, lows };
  });
}

// FVG (Fair Value Gap)
export function findFVGs(candles: Candle[]) {
  return getCached(candles, `fvgs`, () => {
    const fvgs = [];
    const avgBody = calculateAverageBodySize(candles, 20) || 0.0001;
    
    for (let i = 20; i < candles.length - 2; i++) {
      const c1 = candles[i];
      const c2 = candles[i + 1];
      const c3 = candles[i + 2];
      
      // Displacement check: the middle candle must be a strong momentum candle
      const body2 = Math.abs(c2.close - c2.open);
      if (body2 < avgBody * 1.2) continue;
      
      const gapSizeBullish = c3.low - c1.high;
      const gapSizeBearish = c1.low - c3.high;
      const minGap = avgBody * 0.2;
      
      // Bullish FVG
      if (c2.close > c2.open && gapSizeBullish > minGap) {
        fvgs.push({ type: 'bullish', top: c3.low, bottom: c1.high, time: c2.timestamp });
      }
      // Bearish FVG
      if (c2.close < c2.open && gapSizeBearish > minGap) {
        fvgs.push({ type: 'bearish', top: c1.low, bottom: c3.high, time: c2.timestamp });
      }
    }
    return fvgs;
  });
}

// Break of Structure (BOS)
export function findBOS(candles: Candle[]) {
  return getCached(candles, `bos`, () => {
    const { highs, lows } = findPivots(candles, 8, 8);
    const bos = [];
    const atr = calculateATR(candles, 20) || 0.0001;
    
    for (let i = 20; i < candles.length; i++) {
      const c = candles[i];
      const prevC = candles[i-1];
      
      // Bullish BOS: Candle closes decisively above a previous significant swing high
      const relevantHighs = highs.filter(h => h.index < i && h.index > i - 50);
      if (relevantHighs.length > 0) {
        const lastHigh = relevantHighs[relevantHighs.length - 1];
        if (c.close > lastHigh.price + (atr * 0.1) && prevC.close <= lastHigh.price) {
          // Must be a bullish candle
          if (c.close > c.open) {
            bos.push({ type: 'bullish', price: lastHigh.price, time: c.timestamp, pivotTime: lastHigh.time });
          }
        }
      }

      // Bearish BOS: Candle closes decisively below a previous significant swing low
      const relevantLows = lows.filter(l => l.index < i && l.index > i - 50);
      if (relevantLows.length > 0) {
        const lastLow = relevantLows[relevantLows.length - 1];
        if (c.close < lastLow.price - (atr * 0.1) && prevC.close >= lastLow.price) {
          // Must be a bearish candle
          if (c.close < c.open) {
            bos.push({ type: 'bearish', price: lastLow.price, time: c.timestamp, pivotTime: lastLow.time });
          }
        }
      }
    }
    return bos;
  });
}

// Change of Character (CHOCH)
export function detectMSS(candles: Candle[]) {
  return getCached(candles, `mss`, () => {
    const bosEvents = findBOS(candles);
    if (bosEvents.length < 2) return null;
    
    // Look for a recent BOS that goes against the previous BOS direction
    for (let i = bosEvents.length - 1; i >= 1; i--) {
      const last = bosEvents[i];
      const prev = bosEvents[i - 1];
      
      // Check if the shift is recent (within last 20 candles)
      const lastIndex = candles.findIndex(c => c.timestamp === last.time);
      if (lastIndex > -1 && candles.length - lastIndex <= 20) {
         if (last.type !== prev.type) {
           return { type: `${last.type}_mss`, price: last.price, time: last.time };
         }
      }
    }
    return null;
  });
}

// Order Block (OB)
export function findOrderBlocks(candles: Candle[]) {
  return getCached(candles, `order_blocks`, () => {
    const obs = [];
    const bosEvents = findBOS(candles);
    const fvgs = findFVGs(candles);

    for (const bos of bosEvents) {
      const bosIndex = candles.findIndex(c => c.timestamp === bos.time);
      if (bosIndex === -1) continue;

      if (bos.type === 'bullish') {
        // Find the lowest bearish candle before the bullish BOS and FVG
        let obCandle = null;
        let lowestLow = Infinity;
        // Scan backwards from BOS
        for (let i = bosIndex - 1; i >= Math.max(0, bosIndex - 20); i--) {
          const c = candles[i];
          if (c.close < c.open) { // bearish candle
             if (c.low < lowestLow) {
               lowestLow = c.low;
               obCandle = c;
             }
          }
        }
        if (obCandle) {
          // Check if there is an FVG created after this OB
          const relatedFVG = fvgs.find(f => f.type === 'bullish' && new Date(f.time).getTime() > new Date(obCandle!.timestamp).getTime() && new Date(f.time).getTime() <= new Date(bos.time).getTime());
          if (relatedFVG) {
            obs.push({ type: 'bullish', top: obCandle.high, bottom: obCandle.low, time: obCandle.timestamp });
          }
        }
      } else {
        // Find the highest bullish candle before the bearish BOS
        let obCandle = null;
        let highestHigh = -Infinity;
        for (let i = bosIndex - 1; i >= Math.max(0, bosIndex - 20); i--) {
          const c = candles[i];
          if (c.close > c.open) { // bullish candle
             if (c.high > highestHigh) {
               highestHigh = c.high;
               obCandle = c;
             }
          }
        }
        if (obCandle) {
          const relatedFVG = fvgs.find(f => f.type === 'bearish' && new Date(f.time).getTime() > new Date(obCandle!.timestamp).getTime() && new Date(f.time).getTime() <= new Date(bos.time).getTime());
          if (relatedFVG) {
            obs.push({ type: 'bearish', top: obCandle.high, bottom: obCandle.low, time: obCandle.timestamp });
          }
        }
      }
    }
    return obs;
  });
}

// Liquidity Sweeps
export function findSweeps(candles: Candle[]) {
  return getCached(candles, `sweeps`, () => {
    const { highs, lows } = findPivots(candles, 10, 10);
    const sweeps = [];
    const atr = calculateATR(candles, 20) || 0.0001;
    
    for (let i = 20; i < candles.length; i++) {
      const candle = candles[i];
      
      // Sweep High: Wick goes above old high, but closes below it.
      const relevantHighs = highs.filter(h => h.index < i && (i - h.index) > 10);
      for (const h of relevantHighs) {
        const wickAbove = candle.high - Math.max(candle.open, candle.close);
        if (candle.high > h.price && candle.close < h.price) {
          // Require significant wick
          if (wickAbove > atr * 0.2) {
            sweeps.push({ type: 'high_sweep', price: h.price, time: candle.timestamp });
          }
        }
      }
      // Sweep Low: Wick goes below old low, but closes above it.
      const relevantLows = lows.filter(l => l.index < i && (i - l.index) > 10);
      for (const l of relevantLows) {
        const wickBelow = Math.min(candle.open, candle.close) - candle.low;
        if (candle.low < l.price && candle.close > l.price) {
          if (wickBelow > atr * 0.2) {
            sweeps.push({ type: 'low_sweep', price: l.price, time: candle.timestamp });
          }
        }
      }
    }
    return sweeps;
  });
}

export function determineRange(candles: Candle[]) {
  return getCached(candles, `range`, () => {
    if (candles.length < 50) return 'unknown';
    const sma20 = calculateSMA(candles, 20);
    const sma50 = calculateSMA(candles, 50);
    if (!sma20 || !sma50) return 'unknown';
    const diff = Math.abs(sma20 - sma50) / sma50;
    if (diff < 0.0005) return 'ranging';
    return sma20 > sma50 ? 'trending_up' : 'trending_down';
  });
}

export function detectEngulfing(candles: Candle[]) {
  return getCached(candles, `engulfing`, () => {
    if (candles.length < 2) return null;
    const curr = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    const isPrevBullish = prev.close > prev.open;
    const isCurrBearish = curr.close < curr.open;
    const isPrevBearish = prev.close < prev.open;
    const isCurrBullish = curr.close > curr.open;
    
    const currBody = Math.abs(curr.close - curr.open);
    const prevBody = Math.abs(prev.close - prev.open);
    
    if (currBody < prevBody * 1.2) return null; // Current body must be at least 20% larger
    
    if (isPrevBullish && isCurrBearish && curr.open >= prev.close && curr.close < prev.open) {
        return 'bearish_engulfing';
    }
    if (isPrevBearish && isCurrBullish && curr.open <= prev.close && curr.close > prev.open) {
        return 'bullish_engulfing';
    }
    return null;
  });
}

export function detectDoubleTopBottom(candles: Candle[]) {
  return getCached(candles, `double_top_bottom`, () => {
    const { highs, lows } = findPivots(candles, 5, 5);
    const symmetryTolerance = (TradingParameters.doublePatternSymmetryTolerance?.value as any)?.tolerancePips ? ((TradingParameters.doublePatternSymmetryTolerance?.value as any).tolerancePips / 10000) : 0.0005;
    
    if (highs.length >= 2) {
        const h1 = highs[highs.length - 2];
        const h2 = highs[highs.length - 1];
        const indexDiff = h2.index - h1.index;
        // Second peak must be recent (within last 10 candles)
        if (candles.length - h2.index <= 10 && indexDiff > 10 && Math.abs(h1.price - h2.price) / h1.price < symmetryTolerance) {
            return 'double_top';
        }
    }
    if (lows.length >= 2) {
        const l1 = lows[lows.length - 2];
        const l2 = lows[lows.length - 1];
        const indexDiff = l2.index - l1.index;
        if (candles.length - l2.index <= 10 && indexDiff > 10 && Math.abs(l1.price - l2.price) / l1.price < symmetryTolerance) {
            return 'double_bottom';
        }
    }
    return null;
  });
}

export function detectEqualHighLow(candles: Candle[]) {
  return getCached(candles, `equal_high_low`, () => {
    const { highs, lows } = findPivots(candles, 5, 5);
    const eqh = [];
    const eql = [];
    const tolerance = 0.0002;
    for (let i = 0; i < highs.length - 1; i++) {
        for (let j = i + 1; j < highs.length; j++) {
            const indexDiff = highs[j].index - highs[i].index;
            if (candles.length - highs[j].index <= 10 && indexDiff > 10 && Math.abs(highs[i].price - highs[j].price) / highs[i].price < tolerance) {
                eqh.push({ price: highs[i].price, time1: highs[i].time, time2: highs[j].time });
            }
        }
    }
    for (let i = 0; i < lows.length - 1; i++) {
        for (let j = i + 1; j < lows.length; j++) {
            const indexDiff = lows[j].index - lows[i].index;
            if (candles.length - lows[j].index <= 10 && indexDiff > 10 && Math.abs(lows[i].price - lows[j].price) / lows[i].price < tolerance) {
                eql.push({ price: lows[i].price, time1: lows[i].time, time2: lows[j].time });
            }
        }
    }
    return { eqh, eql };
  });
}

export function findBreakerBlocks(candles: Candle[]) {
  return getCached(candles, `breaker_blocks`, () => {
    const obs = findOrderBlocks(candles);
    const breakers = [];
    for (const ob of obs) {
        const obIndex = candles.findIndex(c => c.timestamp === ob.time);
        if (obIndex === -1) continue;
        
        for (let i = obIndex + 1; i < candles.length; i++) {
            const c = candles[i];
            if (ob.type === 'bullish' && c.close < ob.bottom) {
                breakers.push({ type: 'bearish_breaker', top: ob.top, bottom: ob.bottom, time: c.timestamp });
                break;
            } else if (ob.type === 'bearish' && c.close > ob.top) {
                breakers.push({ type: 'bullish_breaker', top: ob.top, bottom: ob.bottom, time: c.timestamp });
                break;
            }
        }
    }
    return breakers;
  });
}

export function findMitigationBlocks(candles: Candle[]) {
  return getCached(candles, `mitigation_blocks`, () => {
    return findBreakerBlocks(candles).map(b => ({
        ...b,
        type: b.type.replace('breaker', 'mitigation')
    }));
  });
}

export function detectRejectionBlock(candles: Candle[]) {
  return getCached(candles, `rejection_block`, () => {
    const blocks = [];
    for (const c of candles) {
        const bodySize = Math.abs(c.close - c.open);
        const upperWick = c.high - Math.max(c.close, c.open);
        const lowerWick = Math.min(c.close, c.open) - c.low;
        if (upperWick > bodySize * 3) {
            blocks.push({ type: 'bearish_rejection', top: c.high, bottom: Math.max(c.close, c.open), time: c.timestamp });
        }
        if (lowerWick > bodySize * 3) {
            blocks.push({ type: 'bullish_rejection', top: Math.min(c.close, c.open), bottom: c.low, time: c.timestamp });
        }
    }
    return blocks;
  });
}

export function analyzeStructure(candles: Candle[], leftBar: number, rightBar: number) {
  return getCached(candles, `structure_${leftBar}_${rightBar}`, () => {
    const { highs, lows } = findPivots(candles, leftBar, rightBar);
    let trend = 'ranging';
    if (highs.length >= 2 && lows.length >= 2) {
        const h1 = highs[highs.length - 2].price;
        const h2 = highs[highs.length - 1].price;
        const l1 = lows[lows.length - 2].price;
        const l2 = lows[lows.length - 1].price;
        if (h2 > h1 && l2 > l1) trend = 'bullish';
        else if (h2 < h1 && l2 < l1) trend = 'bearish';
    }
    return { trend, highs, lows };
  });
}

export function detectKillzone(timestamp: string) {
  const date = new Date(timestamp);
  const h = date.getUTCHours();
  if (h >= 7 && h < 10) return 'london';
  if (h >= 13 && h < 16) return 'newyork';
  if (h >= 0 && h < 4) return 'tokyo';
  if (h >= 21 && h <= 23) return 'sydney';
  return 'none';
}

export function detectSessionBias(candles: Candle[], timestamp: string) {
  return getCached(candles, `session_bias_${timestamp}`, () => {
    const zone = detectKillzone(timestamp);
    if (zone === 'none' || candles.length < 20) return 'neutral';
    const sma = calculateSMA(candles.slice(-20), 10);
    const prevSma = calculateSMA(candles.slice(-30, -10), 10);
    if (!sma || !prevSma) return 'neutral';
    if (sma > prevSma) return 'bullish';
    if (sma < prevSma) return 'bearish';
    return 'neutral';
  });
}

// -----------------------------------------------------------------------------
// INSTITUTIONAL / PROP-DESK ENHANCED INDICATORS
// -----------------------------------------------------------------------------

/**
 * 1. Premium vs Discount Matrix (Dealing Range)
 * Calculates the current dealing range from significant swing pivots
 * and evaluates whether price is in Discount (< 50%) for BUY or Premium (> 50%) for SELL.
 */
export interface DealingRangeResult {
  swingHigh: number;
  swingLow: number;
  equilibrium: number;
  rangeSize: number;
  fibLevel: number; // 0 (Low) to 1 (High)
  zone: 'DEEP_DISCOUNT' | 'DISCOUNT' | 'EQUILIBRIUM' | 'PREMIUM' | 'DEEP_PREMIUM' | 'UNDEFINED';
  isDiscountForBuy: boolean; // True if price < 0.50 (favorable for BUY)
  isPremiumForSell: boolean; // True if price > 0.50 (favorable for SELL)
  oteZone: boolean; // Optimal Trade Entry zone (0.618 - 0.786)
}

export function calculateDealingRange(candles: Candle[], currentPrice?: number): DealingRangeResult {
  return getCached(candles, `dealing_range_${currentPrice || 0}`, () => {
    if (!candles || candles.length < 20) {
      const price = currentPrice || (candles && candles.length > 0 ? candles[candles.length - 1].close : 0);
      return {
        swingHigh: price,
        swingLow: price,
        equilibrium: price,
        rangeSize: 0,
        fibLevel: 0.5,
        zone: 'UNDEFINED',
        isDiscountForBuy: false,
        isPremiumForSell: false,
        oteZone: false
      };
    }

    const { highs, lows } = findPivots(candles, 8, 8);
    const price = currentPrice || candles[candles.length - 1].close;

    // Use recent high and low from past 60 candles
    const recentHighs = highs.slice(-5);
    const recentLows = lows.slice(-5);

    const swingHigh = recentHighs.length > 0 ? Math.max(...recentHighs.map(h => h.price)) : Math.max(...candles.slice(-40).map(c => c.high));
    const swingLow = recentLows.length > 0 ? Math.min(...recentLows.map(l => l.price)) : Math.min(...candles.slice(-40).map(c => c.low));

    const rangeSize = Math.max(0.001, swingHigh - swingLow);
    const equilibrium = swingLow + (rangeSize * 0.5);
    const fibLevel = Math.max(0, Math.min(1, (price - swingLow) / rangeSize));

    let zone: DealingRangeResult['zone'] = 'EQUILIBRIUM';
    if (fibLevel < 0.382) zone = 'DEEP_DISCOUNT';
    else if (fibLevel < 0.50) zone = 'DISCOUNT';
    else if (fibLevel <= 0.52 && fibLevel >= 0.48) zone = 'EQUILIBRIUM';
    else if (fibLevel <= 0.618) zone = 'PREMIUM';
    else zone = 'DEEP_PREMIUM';

    const isDiscountForBuy = fibLevel <= 0.52; // At or below equilibrium
    const isPremiumForSell = fibLevel >= 0.48; // At or above equilibrium

    // OTE is 61.8% - 78.6% retracement from the origin
    const oteZone = (fibLevel >= 0.618 && fibLevel <= 0.786) || (fibLevel >= 0.214 && fibLevel <= 0.382);

    return {
      swingHigh,
      swingLow,
      equilibrium,
      rangeSize,
      fibLevel: Number(fibLevel.toFixed(3)),
      zone,
      isDiscountForBuy,
      isPremiumForSell,
      oteZone
    };
  });
}

/**
 * 2. Displacement Detection
 * Identifies institutional momentum candles: Body >= 1.25x ATR and small wicks (< 25% total range).
 */
export interface DisplacementResult {
  hasDisplacement: boolean;
  direction: 'bullish' | 'bearish' | 'none';
  bodyRatio: number;
  candleIndex: number;
  timestamp: string;
}

export function detectDisplacement(candles: Candle[]): DisplacementResult {
  return getCached(candles, 'displacement', () => {
    if (candles.length < 5) {
      return { hasDisplacement: false, direction: 'none', bodyRatio: 1, candleIndex: -1, timestamp: '' };
    }

    const atr = calculateATR(candles, 14) || 2.0;
    // Check last 5 closed candles, ignore the forming candle
    const closedCandles = candles.slice(0, candles.length - 1);
    const recentCandles = closedCandles.slice(-5);

    for (let i = recentCandles.length - 1; i >= 0; i--) {
      const c = recentCandles[i];
      const totalRange = c.high - c.low;
      const body = Math.abs(c.close - c.open);
      
      if (totalRange <= 0) continue;

      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const bodyRatio = body / atr;

      // Displacement criteria: Body > 1.15x ATR and closing near high/low
      if (body >= atr * 1.15) {
        if (c.close > c.open && upperWick / totalRange < 0.28) {
          return {
            hasDisplacement: true,
            direction: 'bullish',
            bodyRatio: Number(bodyRatio.toFixed(2)),
            candleIndex: candles.length - (recentCandles.length - i),
            timestamp: c.timestamp
          };
        } else if (c.close < c.open && lowerWick / totalRange < 0.28) {
          return {
            hasDisplacement: true,
            direction: 'bearish',
            bodyRatio: Number(bodyRatio.toFixed(2)),
            candleIndex: candles.length - (recentCandles.length - i),
            timestamp: c.timestamp
          };
        }
      }
    }

    return { hasDisplacement: false, direction: 'none', bodyRatio: 1, candleIndex: -1, timestamp: '' };
  });
}

/**
 * 3. Inducement (IDM) Detection
 * Validates whether the first minor internal pullback (IDM) was taken out before confirming a True Break of Structure (BOS).
 */
export interface InducementResult {
  hasIdmTaken: boolean;
  idmType: 'bullish_idm' | 'bearish_idm' | 'none';
  idmPrice: number;
  timestamp: string;
}

export function detectInducement(candles: Candle[]): InducementResult {
  return getCached(candles, 'idm', () => {
    if (candles.length < 15) {
      return { hasIdmTaken: false, idmType: 'none', idmPrice: 0, timestamp: '' };
    }

    const { highs, lows } = findPivots(candles, 3, 3); // minor micro pivots
    const lastCandle = candles[candles.length - 1];

    // Check recent minor lows swept for bullish inducement
    const recentMinorLows = lows.slice(-4);
    for (const ml of recentMinorLows) {
      if (lastCandle.low < ml.price && lastCandle.close >= ml.price) {
        return {
          hasIdmTaken: true,
          idmType: 'bullish_idm',
          idmPrice: ml.price,
          timestamp: lastCandle.timestamp
        };
      }
    }

    // Check recent minor highs swept for bearish inducement
    const recentMinorHighs = highs.slice(-4);
    for (const mh of recentMinorHighs) {
      if (lastCandle.high > mh.price && lastCandle.close <= mh.price) {
        return {
          hasIdmTaken: true,
          idmType: 'bearish_idm',
          idmPrice: mh.price,
          timestamp: lastCandle.timestamp
        };
      }
    }

    return { hasIdmTaken: false, idmType: 'none', idmPrice: 0, timestamp: '' };
  });
}

/**
 * 4. Supply & Demand Classification (DBR, RBD, RBR, DBD) & Freshness / Mitigation Tracking
 */
export interface SDZoneStructure {
  type: 'supply' | 'demand';
  pattern: 'DBR' | 'RBR' | 'RBD' | 'DBD';
  top: number;
  bottom: number;
  freshness: 'FRESH' | 'TESTED_1' | 'TESTED_2' | 'BREACHED';
  taps: number;
  departureStrength: number; // in ATR multiples
  time: string;
}

export function findSDZoneStructures(candles: Candle[]): SDZoneStructure[] {
  return getCached(candles, 'sd_structures', () => {
    if (candles.length < 15) return [];

    const zones: SDZoneStructure[] = [];
    const atr = calculateATR(candles, 14);
    if (!atr || atr <= 0) return [];

    // Scan for Base structures (1 to 3 base candles followed by explosive departure)
    for (let i = 5; i < candles.length - 3; i++) {
      const prevMove = candles[i - 1].close - candles[i - 2].open;
      const baseCandle = candles[i];
      const departureCandle = candles[i + 1];

      const departureMove = departureCandle.close - departureCandle.open;
      const departureStrength = Math.abs(departureMove) / atr;

      // Only consider explosive moves (Departure > 1.1x ATR)
      if (departureStrength < 1.1) continue;

      let pattern: SDZoneStructure['pattern'] | null = null;
      let type: SDZoneStructure['type'] = 'demand';
      let top = 0;
      let bottom = 0;

      if (departureMove > 0) {
        // Bullish departure -> Demand Zone
        type = 'demand';
        top = Math.max(baseCandle.open, baseCandle.close);
        bottom = baseCandle.low;
        pattern = prevMove < 0 ? 'DBR' : 'RBR';
      } else {
        // Bearish departure -> Supply Zone
        type = 'supply';
        top = baseCandle.high;
        bottom = Math.min(baseCandle.open, baseCandle.close);
        pattern = prevMove > 0 ? 'RBD' : 'DBD';
      }

      // Calculate subsequent taps/mitigations
      let taps = 0;
      let breached = false;

      for (let j = i + 2; j < candles.length; j++) {
        const testCandle = candles[j];
        if (type === 'demand') {
          if (testCandle.low <= top && testCandle.high >= bottom) {
            taps++;
          }
          if (testCandle.close < bottom) {
            breached = true;
            break;
          }
        } else {
          if (testCandle.high >= bottom && testCandle.low <= top) {
            taps++;
          }
          if (testCandle.close > top) {
            breached = true;
            break;
          }
        }
      }

      if (!breached) {
        const freshness: SDZoneStructure['freshness'] = taps === 0 ? 'FRESH' : (taps === 1 ? 'TESTED_1' : 'TESTED_2');
        zones.push({
          type,
          pattern: pattern || 'DBR',
          top,
          bottom,
          freshness,
          taps,
          departureStrength: Number(departureStrength.toFixed(2)),
          time: baseCandle.timestamp
        });
      }
    }

    return zones.slice(-8); // Keep the most recent 8 valid zones
  });
}

/**
 * 5. Session Liquidity Pools (Asian Range, Previous Session, Previous Day High/Low)
 */
export interface SessionPoolsResult {
  asianHigh: number | null;
  asianLow: number | null;
  prevSessionHigh: number | null;
  prevSessionLow: number | null;
  sweepAsianHigh: boolean;
  sweepAsianLow: boolean;
  sweepPrevSessionHigh: boolean;
  sweepPrevSessionLow: boolean;
}

export function detectSessionPools(candles: Candle[]): SessionPoolsResult {
  return getCached(candles, 'session_pools', () => {
    if (candles.length < 30) {
      return {
        asianHigh: null,
        asianLow: null,
        prevSessionHigh: null,
        prevSessionLow: null,
        sweepAsianHigh: false,
        sweepAsianLow: false,
        sweepPrevSessionHigh: false,
        sweepPrevSessionLow: false
      };
    }

    // Check against the last closed candle and the current forming candle
    const lastClosed = candles[candles.length - 2];
    const currentCandle = candles[candles.length - 1];

    // Filter Asian session candles (00:00 to 07:00 UTC)
    const asianCandles = candles.filter(c => {
      const h = new Date(c.timestamp).getUTCHours();
      return h >= 0 && h < 7;
    });

    let asianHigh: number | null = null;
    let asianLow: number | null = null;
    let sweepAsianHigh = false;
    let sweepAsianLow = false;

    if (asianCandles.length > 0) {
      const recentAsian = asianCandles.slice(-30);
      asianHigh = Math.max(...recentAsian.map(c => c.high));
      asianLow = Math.min(...recentAsian.map(c => c.low));

      // Check if current or last closed candle swept Asian High (wick above, close below)
      if ((currentCandle.high > asianHigh && currentCandle.close <= asianHigh) || (lastClosed.high > asianHigh && lastClosed.close <= asianHigh)) {
        sweepAsianHigh = true;
      }
      // Check if current or last closed candle swept Asian Low (wick below, close above)
      if ((currentCandle.low < asianLow && currentCandle.close >= asianLow) || (lastClosed.low < asianLow && lastClosed.close >= asianLow)) {
        sweepAsianLow = true;
      }
    }

    // Previous Session Pool (past 40 bars prior to last 5 bars)
    const prevSessionCandles = candles.slice(-50, -5);
    let prevSessionHigh: number | null = null;
    let prevSessionLow: number | null = null;
    let sweepPrevSessionHigh = false;
    let sweepPrevSessionLow = false;

    if (prevSessionCandles.length > 0) {
      prevSessionHigh = Math.max(...prevSessionCandles.map(c => c.high));
      prevSessionLow = Math.min(...prevSessionCandles.map(c => c.low));

      if ((currentCandle.high > prevSessionHigh && currentCandle.close <= prevSessionHigh) || (lastClosed.high > prevSessionHigh && lastClosed.close <= prevSessionHigh)) {
        sweepPrevSessionHigh = true;
      }
      if ((currentCandle.low < prevSessionLow && currentCandle.close >= prevSessionLow) || (lastClosed.low < prevSessionLow && lastClosed.close >= prevSessionLow)) {
        sweepPrevSessionLow = true;
      }
    }

    return {
      asianHigh,
      asianLow,
      prevSessionHigh,
      prevSessionLow,
      sweepAsianHigh,
      sweepAsianLow,
      sweepPrevSessionHigh,
      sweepPrevSessionLow
    };
  });
}

