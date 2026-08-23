import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { toCanonicalSymbol, toProviderSymbol, isSymbolSupportedByProvider } from '../canonical-symbol';

export class BinanceProvider implements PriceProvider {
  public name = 'Binance';

  public supportsSymbol(symbol: string): boolean {
    return isSymbolSupportedByProvider(symbol, this.name);
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
      'H1': '1h', 'H4': '4h', 'D1': '1d', 'W1': '1w'
    };
    return map[tf.toUpperCase()] || '15m';
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    const canonicalSymbol = toCanonicalSymbol(symbol);
    const formattedSymbol = toProviderSymbol(canonicalSymbol, this.name);
    
    try {
      const res = await fetchWithRetry(`https://api.binance.com/api/v3/ticker/price?symbol=${formattedSymbol}`, {
          timeoutMs: 2000,
          retries: 1
      });
      if (res.status === 429) throw new Error('Binance Rate Limited (429)');
      if (res.status !== 200) {
        throw new Error(`Binance API error: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (!data.price) {
        throw new Error('Failed to fetch price from Binance');
      }

      const receivedAt = new Date().toISOString();
      const priceVal = parseFloat(data.price);

      getProviderRegistry().reportSuccess(this.name);
      
      return {
        symbol: canonicalSymbol,
        price: priceVal,
        timestamp: receivedAt,
        provider: this.name,
        freshness: 'live',
        providerTimestamp: receivedAt,
        receivedAt,
        ageMs: 0,
        status: 'OK'
      };
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[] & ProviderStatus> {
    const canonicalSymbol = toCanonicalSymbol(symbol);
    const formattedSymbol = toProviderSymbol(canonicalSymbol, this.name);
    
    try {
      const startTime = Date.now();
      const interval = this.mapTimeframe(timeframe);
      const res = await fetchWithRetry(`https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`, {
          timeoutMs: 2500,
          retries: 1
      });
      if (res.status === 429) throw new Error('Binance Rate Limited (429)');
      if (res.status !== 200) {
        throw new Error(`Binance API error: ${res.statusText}`);
      }

      const data = await res.json();
      const latency = Date.now() - startTime;
      if (!Array.isArray(data)) {
        throw new Error('Failed to fetch candles from Binance');
      }

      const now = Date.now();
      const candles: Candle[] = data.map((v: any[]) => {
        const isoDate = new Date(v[0]).toISOString();
        const candleAgeMs = now - v[0];
        const freshness = candleAgeMs > 4 * 60 * 60 * 1000 ? 'stale' as const : 'live' as const;

        return {
          timestamp: isoDate,
          open: parseFloat(v[1]) || 0,
          high: parseFloat(v[2]) || 0,
          low: parseFloat(v[3]) || 0,
          close: parseFloat(v[4]) || 0,
          volume: parseFloat(v[5]) || 0,
          provider: this.name,
          latency,
          freshness,
          confidence: 0.90
        };
      });

      getProviderRegistry().reportSuccess(this.name);
      return candles as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
