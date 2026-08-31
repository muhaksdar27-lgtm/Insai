import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { toCanonicalSymbol, toProviderSymbol, isSymbolSupportedByProvider } from '../canonical-symbol';

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export class YahooFinanceProvider implements PriceProvider {
  public name = 'YahooFinance';

  public supportsSymbol(symbol: string): boolean {
    return isSymbolSupportedByProvider(symbol, this.name);
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      'M1': '1m', 'M5': '5m', 'M15': '15m', 'M30': '30m',
      'H1': '60m', 'H4': '60m',
      'D1': '1d', 'W1': '1wk'
    };
    return map[tf.toUpperCase()] || '15min';
  }

  private async fetchChartApi(formattedSymbol: string, interval: string = '1m', range: string = '1d'): Promise<any> {
    const endpoints = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(formattedSymbol)}?interval=${interval}&range=${range}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(formattedSymbol)}?interval=${interval}&range=${range}`
    ];

    let lastError: any = null;
    for (const url of endpoints) {
      try {
        const res = await fetchWithRetry(url, {
          headers: YAHOO_HEADERS,
          timeoutMs: 4000,
          retries: 1
        });
        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (result) {
          return result;
        }
        if (json?.chart?.error) {
          throw new Error(json.chart.error.description || 'Yahoo API Error');
        }
      } catch (e: any) {
        lastError = e;
      }
    }
    throw lastError || new Error(`Failed to fetch Yahoo chart data for ${formattedSymbol}`);
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    const canonicalSymbol = toCanonicalSymbol(symbol);
    const formattedSymbol = toProviderSymbol(canonicalSymbol, this.name);
    
    try {
      logger.info(`YahooFinance REST: Fetching price (canonical: ${canonicalSymbol}, provider: ${formattedSymbol})`);
      
      const chartResult = await this.fetchChartApi(formattedSymbol, '1m', '1d');
      const meta = chartResult.meta;
      const price = meta.regularMarketPrice || meta.chartPreviousClose;
      
      if (typeof price !== 'number' || isNaN(price) || price <= 0) {
        throw new Error(`Invalid price received from Yahoo Finance: ${price}`);
      }

      const receivedAt = new Date().toISOString();
      const providerTs = new Date(meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()).toISOString();
      const ageMs = Math.max(0, Date.now() - new Date(providerTs).getTime());
      const freshness = ageMs > 60000 ? 'stale' as const : 'live' as const;

      getProviderRegistry().reportSuccess(this.name);
      
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const change = typeof prevClose === 'number' && prevClose > 0 ? Number((price - prevClose).toFixed(2)) : undefined;
      const changePercent = typeof prevClose === 'number' && prevClose > 0 ? Number((((price - prevClose) / prevClose) * 100).toFixed(2)) : undefined;
      const high24h = meta.regularMarketDayHigh || meta.dayHigh || undefined;
      const low24h = meta.regularMarketDayLow || meta.dayLow || undefined;
      const bid = meta.bid || undefined;
      const ask = meta.ask || undefined;
      const spread = bid && ask ? Number((ask - bid).toFixed(2)) : 0.25;

      return {
        symbol: canonicalSymbol,
        price,
        timestamp: providerTs,
        provider: this.name,
        freshness,
        providerTimestamp: providerTs,
        receivedAt,
        ageMs,
        status: freshness === 'live' ? 'OK' : 'STALE',
        change,
        changePercent,
        high24h,
        low24h,
        previousClose: prevClose,
        bid,
        ask,
        spread
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
      const interval = this.mapTimeframe(timeframe);
      let range = '5d';
      if (interval === '1d' || interval === '1wk') {
        range = '1y';
      } else if (interval === '60m' || interval === '30m') {
        range = '1mo';
      }

      const startTime = Date.now();
      const chartResult = await this.fetchChartApi(formattedSymbol, interval, range);
      const latency = Date.now() - startTime;
      
      const timestamps = chartResult.timestamp || [];
      const quote = chartResult.indicators?.quote?.[0] || {};
      const opens = quote.open || [];
      const highs = quote.high || [];
      const lows = quote.low || [];
      const closes = quote.close || [];
      const volumes = quote.volume || [];

      if (!timestamps || timestamps.length === 0) {
        throw new Error(`No candle quotes received from Yahoo Finance for ${formattedSymbol}`);
      }

      const now = Date.now();
      const candles: Candle[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined && !isNaN(closes[i])) {
          const tsMs = timestamps[i] * 1000;
          const isoDate = new Date(tsMs).toISOString();
          const candleAgeMs = now - tsMs;
          const freshness = candleAgeMs > 4 * 60 * 60 * 1000 ? 'stale' as const : 'live' as const;

          candles.push({
            timestamp: isoDate,
            open: opens[i] ?? closes[i],
            high: highs[i] ?? closes[i],
            low: lows[i] ?? closes[i],
            close: closes[i],
            volume: volumes[i] ?? 0,
            provider: this.name,
            latency,
            freshness,
            confidence: 0.95
          });
        }
      }

      if (candles.length === 0) {
        throw new Error('All candle points from Yahoo Finance were invalid or null');
      }

      getProviderRegistry().reportSuccess(this.name);
      return candles.slice(-limit) as any;
    } catch (e: any) {
      getProviderRegistry().reportError(this.name, e.message);
      throw e;
    }
  }
}
