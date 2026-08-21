import { Candle } from '@/types';
import { toCanonicalSymbol } from './canonical-symbol';

export type CandleEventType =
  | 'NEW_CANDLE'
  | 'UPDATED_CANDLE'
  | 'UNCHANGED_CANDLE'
  | 'STALE_CANDLE'
  | 'INVALID_CANDLE';

export interface CandleProcessResult {
  type: CandleEventType;
  symbol: string;
  timeframe: string;
  candle: Candle;
  previousCandle?: Candle | null;
  isActionable: boolean;
  reason?: string;
}

export interface CandleProcessorOptions {
  checkStale?: boolean;
  staleThresholdMs?: number;
}

export class CandleProcessor {
  // Map of `${canonicalSymbol}_${timeframe}` -> latest Candle
  private latestCandles: Map<string, Candle> = new Map();

  /**
   * Process an incoming candle and classify its state change.
   */
  public processCandle(
    rawSymbol: string,
    timeframe: string,
    candle: Candle,
    options?: CandleProcessorOptions
  ): CandleProcessResult {
    const symbol = toCanonicalSymbol(rawSymbol);
    const key = `${symbol}_${timeframe.toUpperCase()}`;

    // 1. Basic structural validity
    if (!candle || !candle.timestamp || typeof candle.open !== 'number' || typeof candle.close !== 'number') {
      return {
        type: 'INVALID_CANDLE',
        symbol,
        timeframe,
        candle,
        isActionable: false,
        reason: 'Candle missing required OHLCV properties or timestamp.'
      };
    }

    if (candle.high < candle.low || candle.open < 0 || candle.close < 0) {
      return {
        type: 'INVALID_CANDLE',
        symbol,
        timeframe,
        candle,
        isActionable: false,
        reason: `Invalid price boundaries: High (${candle.high}) < Low (${candle.low}) or negative price.`
      };
    }

    const candleTime = new Date(candle.timestamp).getTime();
    if (isNaN(candleTime)) {
      return {
        type: 'INVALID_CANDLE',
        symbol,
        timeframe,
        candle,
        isActionable: false,
        reason: `Invalid timestamp format: ${candle.timestamp}`
      };
    }

    // 2. Staleness check (only if checkStale is explicitly enabled)
    if (options?.checkStale) {
      const now = Date.now();
      const defaultStale = this.getDefaultStaleThreshold(timeframe);
      const staleThresholdMs = options?.staleThresholdMs ?? defaultStale;

      if (now - candleTime > staleThresholdMs) {
        return {
          type: 'STALE_CANDLE',
          symbol,
          timeframe,
          candle,
          isActionable: false,
          reason: `Candle is older than maximum tolerance (${Math.round((now - candleTime) / 60000)}m ago > ${Math.round(staleThresholdMs / 60000)}m).`
        };
      }
    }

    const prev = this.latestCandles.get(key);

    // If no previous candle, this is our initial reference -> NEW_CANDLE
    if (!prev) {
      this.latestCandles.set(key, { ...candle });
      return {
        type: 'NEW_CANDLE',
        symbol,
        timeframe,
        candle,
        previousCandle: null,
        isActionable: true
      };
    }

    const prevTime = new Date(prev.timestamp).getTime();

    // 3. New Candle: Timestamp moved forward
    if (candleTime > prevTime) {
      const previousCandle = { ...prev };
      this.latestCandles.set(key, { ...candle });
      return {
        type: 'NEW_CANDLE',
        symbol,
        timeframe,
        candle,
        previousCandle,
        isActionable: true
      };
    }

    // 4. Same Timestamp: Check if price/volume updated (Live forming bar)
    if (candleTime === prevTime) {
      const isUnchanged =
        prev.open === candle.open &&
        prev.high === candle.high &&
        prev.low === candle.low &&
        prev.close === candle.close &&
        prev.volume === candle.volume;

      if (isUnchanged) {
        return {
          type: 'UNCHANGED_CANDLE',
          symbol,
          timeframe,
          candle,
          previousCandle: prev,
          isActionable: false
        };
      }

      // Updated live bar
      const previousCandle = { ...prev };
      this.latestCandles.set(key, { ...candle });
      return {
        type: 'UPDATED_CANDLE',
        symbol,
        timeframe,
        candle,
        previousCandle,
        isActionable: true
      };
    }

    // 5. Historical/Out-of-Order Candle (Older than latest known)
    return {
      type: 'UNCHANGED_CANDLE',
      symbol,
      timeframe,
      candle,
      previousCandle: prev,
      isActionable: false,
      reason: 'Out-of-order historical candle timestamp received.'
    };
  }

  /**
   * Deduplicates and orders an array of candles chronologically.
   */
  public deduplicateAndOrder(candles: Candle[]): Candle[] {
    if (!candles || candles.length === 0) return [];

    const map = new Map<string, Candle>();
    for (const c of candles) {
      if (!c || !c.timestamp) continue;
      const iso = new Date(c.timestamp).toISOString();
      map.set(iso, { ...c, timestamp: iso });
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  public getLatest(symbol: string, timeframe: string): Candle | null {
    const key = `${toCanonicalSymbol(symbol)}_${timeframe.toUpperCase()}`;
    return this.latestCandles.get(key) || null;
  }

  public reset(symbol?: string, timeframe?: string) {
    if (symbol && timeframe) {
      const key = `${toCanonicalSymbol(symbol)}_${timeframe.toUpperCase()}`;
      this.latestCandles.delete(key);
    } else {
      this.latestCandles.clear();
    }
  }

  private getDefaultStaleThreshold(timeframe: string): number {
    const tf = timeframe.toUpperCase();
    switch (tf) {
      case 'M1': return 5 * 60 * 1000;
      case 'M5': return 15 * 60 * 1000;
      case 'M15': return 45 * 60 * 1000;
      case 'M30': return 90 * 60 * 1000;
      case 'H1': return 3 * 3600 * 1000;
      case 'H4': return 12 * 3600 * 1000;
      case 'D1': return 48 * 3600 * 1000;
      default: return 60 * 60 * 1000;
    }
  }
}

let _processorInstance: CandleProcessor | null = null;
export function getCandleProcessor(): CandleProcessor {
  if (!_processorInstance) {
    _processorInstance = new CandleProcessor();
  }
  return _processorInstance;
}
