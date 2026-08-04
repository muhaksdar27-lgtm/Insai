import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export class YahooFinanceProvider implements PriceProvider {
  public name = 'YahooFinance';

  private formatSymbol(symbol: string): string {
    const norm = symbol.toUpperCase().trim();
    if (norm === 'XAUUSD') return 'GC=F';
    if (norm === 'DXY') return 'DX-Y.NYB';
    if (norm === 'US10Y') return '^TNX';
    return norm;
  }

  private mapTimeframe(tf: string): "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo" {
    const map: Record<string, "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk"> = {
      'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
      'H1': '60m', 'H4': '60m',
      'D1': '1d', 'W1': '1wk'
    };
    return map[tf.toUpperCase()] || '15m';
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    const formattedSymbol = this.formatSymbol(symbol);
    
    try {
      logger.info(`YahooFinance REST: Fetching live price (input: ${symbol}, mapped: ${formattedSymbol})`);
      
      const quote = await yahooFinance.quote(formattedSymbol) as any;
      
      if (!quote || !quote.regularMarketPrice) {
        throw new Error('Failed to fetch price from Yahoo Finance');
      }

      getProviderRegistry().reportSuccess(this.name);
      
      return {
        symbol,
        price: quote.regularMarketPrice,
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
      
      // Calculate period1 (start date) based on limit and interval
      const now = new Date();
      let period1 = new Date();
      
      if (interval === '1m' || interval === '5m') {
         period1.setDate(now.getDate() - 5); // Max 7 days for 1m
      } else if (interval === '15m' || interval === '30m' || interval === '60m') {
         period1.setDate(now.getDate() - 30); // Max 60 days
      } else {
         period1.setFullYear(now.getFullYear() - 2); 
      }

      const queryOptions = {
         period1: period1.toISOString(),
         interval: interval,
      };

      const startTime = Date.now();
      const chartResult = await yahooFinance.chart(formattedSymbol, queryOptions as any) as any;
      const latency = Date.now() - startTime;
      const result = chartResult?.quotes || [];
      
      if (!result || result.length === 0) {
        throw new Error('Failed to fetch candles from Yahoo Finance');
      }

      const candles: Candle[] = result.map((item: any) => ({
         timestamp: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
         open: item.open,
         high: item.high,
         low: item.low,
         close: item.close,
         volume: item.volume,
         provider: this.name,
         latency,
         freshness: 'live' as const,
         confidence: 0.95
      }));

      // Return the most recent 'limit' candles
      return candles.slice(-limit) as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
