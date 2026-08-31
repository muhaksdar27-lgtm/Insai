import { PriceProvider } from '../types';
import { MarketSnapshot, Candle, ProviderStatus } from '@/types';
import { getProviderRegistry } from '../provider-registry';
import { logger } from '../../utils/logger';
import { fetchWithRetry } from '../../utils/fetch-retry';
import { getQueueManager } from '../../redis/queue';
import { getEnv } from '../../utils/env';
import { toCanonicalSymbol, toProviderSymbol, isSymbolSupportedByProvider } from '../canonical-symbol';

export class TwelveDataProvider implements PriceProvider {
  public name = 'TwelveData';
  private apiKey: string | undefined;
  private ws: any = null;
  private reconnectAttempts = 0;
  private latestPrices: Map<string, MarketSnapshot> = new Map();
  private wsStarted: boolean = false;
  private wsDisabled: boolean = false;

  public supportsSymbol(symbol: string): boolean {
    return isSymbolSupportedByProvider(symbol, this.name);
  }

  private get currentApiKey(): string | undefined {
    const key = getEnv('TWELVEDATA_API_KEY') || this.apiKey;
    if (!key || key === 'undefined' || key === 'MY_TWELVEDATA_API_KEY' || key.trim() === '') {
      return undefined;
    }
    return key;
  }

  constructor() {
    this.apiKey = getEnv('TWELVEDATA_API_KEY');
    logger.info('TwelveData Provider Initialized with Canonical Symbol Mapping');
  }

  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  private cleanupWebSocket() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      try {
        if (this.ws.readyState === 1 || this.ws.readyState === 0) {
          this.ws.close();
        }
      } catch (e: any) {
        logger.debug(`TwelveData WS close error during cleanup: ${e?.message || e}`);
      }
      this.ws = null;
    }
  }

  private initWebSocket() {
    this.cleanupWebSocket();

    if (this.wsDisabled) {
      return;
    }

    const key = this.currentApiKey;
    if (!key || key === 'undefined') {
      logger.warn('TwelveData WS: API key is empty. Skipping WS init.');
      this.wsStarted = false;
      this.reconnectAttempts = 0;
      return;
    }
    
    // Do not start WS if we are inside Next.js build or edge runtime
    if (process.env.NEXT_PHASE || process.env.NEXT_RUNTIME) {
       return;
    }

    logger.info('TwelveData WS: Initializing real-time stream...');
    try {
      this.ws = new (globalThis as any).WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${key}`);
      
      this.ws.addEventListener('open', () => {
        this.reconnectAttempts = 0;
        logger.info('TwelveData WebSocket connected');
        this.ws?.send(JSON.stringify({
          "action": "subscribe",
          "params": {
            "symbols": "XAU/USD"
          }
        }));
      });

      this.ws.addEventListener('message', (event: any) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.status === 'error') {
            logger.warn(`TwelveData WS Message: ${msg.message}`);
            if (msg.message && msg.message.toLowerCase().includes('api key')) {
                getProviderRegistry().reportError(this.name, msg.message);
                this.apiKey = undefined;
            }
            return;
          }
          
          if (msg.event === 'price' && msg.symbol) {
            const canonicalSymbol = toCanonicalSymbol(msg.symbol);
            const receivedAt = new Date().toISOString();
            const providerTs = new Date(msg.timestamp * 1000).toISOString();
            const ageMs = Math.max(0, Date.now() - (msg.timestamp * 1000));
            const freshness = ageMs > 60000 ? 'stale' as const : 'live' as const;

            const snapshot: MarketSnapshot = {
              symbol: canonicalSymbol,
              price: parseFloat(msg.price),
              timestamp: providerTs,
              provider: this.name,
              freshness,
              providerTimestamp: providerTs,
              receivedAt,
              ageMs,
              status: freshness === 'live' ? 'OK' : 'STALE'
            };
            this.latestPrices.set(canonicalSymbol, snapshot);
            
            // Broadcast market update with deduplication across instances
            const dedupKey = `tick_${canonicalSymbol}_${msg.timestamp}`;
            getQueueManager().deduplicate(dedupKey, 2).then(isNew => {
              if (isNew) {
                getQueueManager().streamPublish(`market_stream:${canonicalSymbol}`, {
                  id: `tick-${Date.now()}`,
                  type: 'MARKET_TICK',
                  payload: snapshot,
                  timestamp: snapshot.timestamp,
                  retryCount: 0
                });
              }
            });
          }
        } catch (e) {
           // ignore parse errors
        }
      });

      this.ws.addEventListener('close', () => {
        if (!this.apiKey) {
          logger.warn('TwelveData WebSocket disconnected due to invalid API key. Pausing reconnect for 60s.');
          this.reconnectTimeout = setTimeout(() => this.initWebSocket(), 60000);
        } else {
          this.reconnectAttempts++;
          if (this.reconnectAttempts >= 2) {
            this.wsDisabled = true;
            logger.info('TwelveData WebSocket unavailable (requires WebSocket-enabled Pro plan). Switching seamlessly to REST polling.');
          } else {
            const backoff = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 10000);
            logger.warn(`TwelveData WebSocket closed. Retrying in ${backoff}ms...`);
            this.reconnectTimeout = setTimeout(() => this.initWebSocket(), backoff);
          }
        }
      });
      
      this.ws.addEventListener('error', (event: any) => {
        logger.warn(`TwelveData WebSocket connection notification: ${event?.message || 'WebSocket handshake not accepted or network unavailable'}`);
      });
    } catch (err: any) {
      logger.warn(`TwelveData WS Init Info: ${err.message}. Falling back to REST.`);
      this.wsDisabled = true;
    }
  }

  private mapTimeframe(tf: string): string {
    const map: Record<string, string> = {
      'M1': '1min', 'M5': '5min', 'M15': '15min', 'M30': '30min',
      'H1': '1h', 'H4': '4h', 'D1': '1day', 'W1': '1week'
    };
    return map[tf.toUpperCase()] || '15min';
  }

  async getLatestPrice(symbol: string): Promise<MarketSnapshot> {
    const canonicalSymbol = toCanonicalSymbol(symbol);

    if (!this.currentApiKey) {
      throw new Error('TwelveData API key is not configured');
    }
    
    if (!this.wsStarted && !this.ws) {
      this.wsStarted = true;
      this.initWebSocket();
    }
    
    const formattedSymbol = toProviderSymbol(canonicalSymbol, this.name);
    
    // Check WS cache first
    const cached = this.latestPrices.get(canonicalSymbol);
    if (cached) {
      const ageMs = Date.now() - new Date(cached.timestamp).getTime();
      if (ageMs < 15000) {
        return cached;
      }
    }

    // Fallback to HTTP Polling
    try {
      logger.info(`TwelveData REST: Fetching price (canonical: ${canonicalSymbol}, provider: ${formattedSymbol})`);
      const res = await fetchWithRetry(`https://api.twelvedata.com/price?symbol=${formattedSymbol}&apikey=${this.currentApiKey}`, {
          timeoutMs: 2000,
          retries: 0
      });
      if (res.status === 429) throw new Error('TwelveData Rate Limited (429)');
      const data = await res.json();
      
      if (data.code || !data.price) {
        throw new Error(data.message || 'Failed to fetch price from TwelveData');
      }

      const receivedAt = new Date().toISOString();
      const priceVal = parseFloat(data.price);
      if (isNaN(priceVal) || priceVal <= 0) {
        throw new Error(`Invalid price value received from TwelveData: ${data.price}`);
      }

      getProviderRegistry().reportSuccess(this.name);
      const freshSnapshot: MarketSnapshot = {
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
      this.latestPrices.set(canonicalSymbol, freshSnapshot);
      return freshSnapshot;
    } catch (e: any) {
      if (!e.message?.includes('not provide direct index')) {
        getProviderRegistry().reportError(this.name, e.message);
      }
      throw e;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[] & ProviderStatus> {
    const canonicalSymbol = toCanonicalSymbol(symbol);
    const key = this.currentApiKey;
    if (!key) {
      throw new Error('TwelveData API key is not configured');
    }
    
    const formattedSymbol = toProviderSymbol(canonicalSymbol, this.name);
    
    try {
      const startTime = Date.now();
      const interval = this.mapTimeframe(timeframe);
      const res = await fetchWithRetry(`https://api.twelvedata.com/time_series?symbol=${formattedSymbol}&interval=${interval}&outputsize=${limit}&apikey=${key}`, {
          timeoutMs: 3000,
          retries: 0
      });
      if (res.status === 429) throw new Error('TwelveData Rate Limited (429)');
      const data = await res.json();
      const latency = Date.now() - startTime;

      if (data.code || !data.values || !Array.isArray(data.values)) {
        throw new Error(data.message || 'Failed to fetch candles from TwelveData');
      }

      const now = Date.now();
      const candles: Candle[] = data.values.map((v: any) => {
        // TwelveData returns datetime in UTC string like "2025-02-20 15:30:00"
        const rawDate = v.datetime;
        const isoDate = new Date(rawDate.includes('Z') || rawDate.includes('+') ? rawDate : rawDate.replace(' ', 'T') + 'Z').toISOString();
        const candleAgeMs = now - new Date(isoDate).getTime();
        const freshness = candleAgeMs > 4 * 60 * 60 * 1000 ? 'stale' as const : 'live' as const;

        return {
          timestamp: isoDate,
          open: parseFloat(v.open) || 0,
          high: parseFloat(v.high) || 0,
          low: parseFloat(v.low) || 0,
          close: parseFloat(v.close) || 0,
          volume: parseFloat(v.volume) || 0,
          provider: this.name,
          latency,
          freshness,
          confidence: 1.0
        };
      });

      // TwelveData returns newest first -> reverse to ascending chronological order
      candles.reverse();

      getProviderRegistry().reportSuccess(this.name);
      return candles as any;
    } catch (e: any) {
      if (!e.message?.includes('not provide direct index')) {
        getProviderRegistry().reportError(this.name, e.message);
      }
      throw e;
    }
  }
}
