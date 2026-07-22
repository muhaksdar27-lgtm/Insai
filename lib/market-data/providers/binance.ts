import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { fetchWithRetry } from '../../utils/fetch-retry';

export class BinanceProvider implements PriceProvider {
  public name = 'Binance';

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
      'H1': '1h', 'H4': '4h', 'D1': '1d', 'W1': '1w'
    };
    return map[tf.toUpperCase()] || '15m';
  }

  private formatSymbol(symbol: string): string {
    const norm = symbol.toUpperCase().replace('/', '');
    if (norm === 'XAUUSD') return 'PAXGUSDT'; // Use PAX Gold as a proxy for Gold
    if (norm === 'BTCUSD') return 'BTCUSDT';
    if (norm === 'ETHUSD') return 'ETHUSDT';
    
    // Binance doesn't support forex/indices natively, but we map common ones or fallback
    if (norm === 'DXY' || norm === 'US10Y') {
        throw new Error(`Symbol ${norm} not supported by Binance`);
    }
    return norm;
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    const formattedSymbol = this.formatSymbol(symbol);
    
    try {
      const res = await fetchWithRetry(`https://api.binance.com/api/v3/ticker/price?symbol=${formattedSymbol}`, {
          timeoutMs: 1500,
          retries: 1
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      if (res.status !== 200) {
        throw new Error(`Binance API error: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (!data.price) {
        throw new Error('Failed to fetch price from Binance');
      }

      getProviderRegistry().reportSuccess(this.name);
      
      return {
        symbol,
        price: parseFloat(data.price),
        timestamp: new Date().toISOString(),
        provider: this.name,
        freshness: 'live'
      };
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[] & ProviderStatus> {
    const formattedSymbol = this.formatSymbol(symbol);
    
    try {
      const interval = this.mapTimeframe(timeframe);
      const res = await fetchWithRetry(`https://api.binance.com/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`, {
          timeoutMs: 1500,
          retries: 1
      });
      if (res.status === 429) throw new Error('Rate Limited (429)');
      if (res.status !== 200) {
        throw new Error(`Binance API error: ${res.statusText}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Failed to fetch candles from Binance');
      }

      const candles = data.map((v: any[]) => ({
        timestamp: new Date(v[0]).toISOString(),
        open: parseFloat(v[1]),
        high: parseFloat(v[2]),
        low: parseFloat(v[3]),
        close: parseFloat(v[4]),
        volume: parseFloat(v[5])
      }));

      // Binance returns oldest first, which matches our system's expected ascending order
      return candles as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
