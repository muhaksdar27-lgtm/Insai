import { MarketSnapshot, Candle, NewsEvent, CalendarEvent } from '@/types';
import { TwelveDataProvider } from './providers/twelvedata';
import { NewsApiProvider } from './providers/newsapi';
import { YahooFinanceProvider } from './providers/yahoofinance';
import { BinanceProvider } from './providers/binance';
import { TwitterProvider } from './providers/twitter';
import { ForexFactoryProvider } from './providers/forexfactory';
import { getProviderRegistry } from './provider-registry';
import { logger } from '../utils/logger';
import { getQueueManager } from '../redis/queue';
import { FallbackChain } from './fallback-chain';
import { PriceProvider, NewsProvider, CalendarProvider } from './types';
import { dataValidator } from './data-validator';
import { metricsEngine } from '../observability/metrics-engine';
import { SessionEngine } from './session-engine';
import { toCanonicalSymbol } from './canonical-symbol';
import { getCandleProcessor } from './candle-processor';

export class MarketDataService {
  private priceChain: FallbackChain<PriceProvider>;
  private newsChain: FallbackChain<NewsProvider>;
  private calendarChain: FallbackChain<CalendarProvider>;

  // Cache
  private priceCache: Map<string, { data: MarketSnapshot, expiresAt: number }> = new Map();
  private readonly PRICE_CACHE_TTL_MS = 10000; // 10 seconds for price cache to ensure freshness

  constructor() {
    this.priceChain = new FallbackChain<PriceProvider>();
    this.newsChain = new FallbackChain<NewsProvider>();
    this.calendarChain = new FallbackChain<CalendarProvider>();

    // Fallback chain for price
    // 1. TwelveData (Primary - Real-time Spot XAU/USD)
    this.priceChain.addProvider(new TwelveDataProvider(), 'TwelveData');
    // 2. Binance (Secondary / High-precision Spot Gold proxy)
    this.priceChain.addProvider(new BinanceProvider(), 'Binance');
    // 3. Yahoo Finance (Tertiary / Index Fallback)
    this.priceChain.addProvider(new YahooFinanceProvider(), 'YahooFinance');

    // Fallback chain for news
    this.newsChain.addProvider(new NewsApiProvider(), 'NewsAPI');
    this.newsChain.addProvider(new TwitterProvider(), 'Twitter Bearer');
    
    // Fallback chain for calendar
    this.calendarChain.addProvider(new ForexFactoryProvider(), 'ForexFactory');
  }

  async getLatestPrice(symbol: string, freshnessWindowMs: number = 60000): Promise<MarketSnapshot> {
    const canonical = toCanonicalSymbol(symbol);
    const startTime = Date.now();
    const now = Date.now();
    let cachedData = null;

    // Try Redis cache first
    try {
      const redisCached = await getQueueManager().getCache<{ data: MarketSnapshot, expiresAt: number }>(`price:${canonical}`);
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached;
        metricsEngine.recordCacheAccess(true);
      }
    } catch (e) {
      // Ignore Redis error, fallback to local cache
    }

    // Fallback to local map if not found in Redis (or Redis failed)
    if (!cachedData) {
      const localCached = this.priceCache.get(canonical);
      if (localCached && localCached.expiresAt > now) {
        cachedData = localCached;
        metricsEngine.recordCacheAccess(true);
      } else {
        metricsEngine.recordCacheAccess(false);
      }
    }

    if (cachedData) {
      const snapshotTime = new Date(cachedData.data.timestamp).getTime();
      const ageMs = Math.max(0, now - snapshotTime);
      const sessionInfo = SessionEngine.getSessionInfo(now);
      
      let freshness = cachedData.data.freshness;
      let status: any = cachedData.data.status || 'OK';

      if (!sessionInfo.isOpen) {
        freshness = 'closed';
        status = 'CLOSED';
      } else if (ageMs > freshnessWindowMs) {
        freshness = 'stale';
        status = 'STALE';
      } else {
        freshness = 'cached';
      }

      metricsEngine.recordMarketDataLatency(Date.now() - startTime);
      return { 
        ...cachedData.data, 
        symbol: canonical,
        freshness,
        status,
        ageMs,
        session: sessionInfo.primarySession
      };
    }

    const snapshot = await this.priceChain.execute(
      (p) => p.getLatestPrice(canonical),
      `getLatestPrice(${canonical})`
    );

    metricsEngine.recordMarketDataLatency(Date.now() - startTime);

    // Gap detection / Freshness check based on market status & window
    const snapshotTime = new Date(snapshot.timestamp).getTime();
    const ageMs = Math.max(0, now - snapshotTime);
    const sessionInfo = SessionEngine.getSessionInfo(now);

    if (!sessionInfo.isOpen) {
      snapshot.freshness = 'closed';
      snapshot.status = 'CLOSED';
    } else if (ageMs > freshnessWindowMs) {
      logger.warn(`Data gap detected for ${canonical} from ${snapshot.provider}. Data is stale (${ageMs}ms > ${freshnessWindowMs}ms).`);
      snapshot.freshness = 'stale';
      snapshot.status = 'STALE';
    } else {
      snapshot.freshness = 'live';
      snapshot.status = 'OK';
    }
    
    snapshot.symbol = canonical;
    snapshot.session = sessionInfo.primarySession;
    snapshot.receivedAt = new Date(now).toISOString();
    snapshot.ageMs = ageMs;

    if (!snapshot.bias) {
      snapshot.bias = "NEUTRAL";
    }

    const cacheEntry = {
      data: snapshot,
      expiresAt: now + this.PRICE_CACHE_TTL_MS
    };

    this.priceCache.set(canonical, cacheEntry);
    getQueueManager().setCache(`price:${canonical}`, cacheEntry, Math.ceil(this.PRICE_CACHE_TTL_MS / 1000)).catch(() => {});

    return snapshot;
  }

  private candleCache: Map<string, { data: Candle[], expiresAt: number }> = new Map();
  private readonly CANDLE_CACHE_TTL_MS = 300000;

  async getCandles(symbol: string, timeframe: string, limit: number = 250): Promise<Candle[]> {
    const canonical = toCanonicalSymbol(symbol);
    const tf = timeframe.toUpperCase();
    const cacheKey = `${canonical}-${tf}`;
    const now = Date.now();
    let cachedData = null;

    try {
      const redisCached = await getQueueManager().getCache<{ data: Candle[], expiresAt: number }>(`candles:${cacheKey}`);
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached.data;
      }
    } catch (e) {
      // Ignore Redis error, fallback to local cache
    }

    if (!cachedData) {
      const localCached = this.candleCache.get(cacheKey);
      if (localCached && localCached.expiresAt > now) {
        cachedData = localCached.data;
      }
    }

    if (cachedData) {
      return cachedData.slice(-limit);
    }

    const fetchLimit = Math.max(limit, 250);
    const data = await this.priceChain.execute(
      (p) => p.getCandles(canonical, tf, fetchLimit),
      `getCandles(${canonical}, ${tf})`
    );

    if (Array.isArray(data) && data.length > 0 && !data.hasOwnProperty('status')) {
      // Validate candles integrity
      const validation = dataValidator.validateCandles(data, canonical, tf);
      if (!validation.isValid) {
        logger.warn(`Candle validation warning for ${canonical} ${tf}: ${validation.reason}`);
      }

      // Process latest candle through CandleProcessor
      const latest = data[data.length - 1];
      getCandleProcessor().processCandle(canonical, tf, latest);

      let ttlMs = this.CANDLE_CACHE_TTL_MS;
      if (tf === 'M1') ttlMs = 15000;
      else if (tf === 'M5') ttlMs = 60000;
      else if (tf === 'M15') ttlMs = 300000;
      else if (tf === 'H1') ttlMs = 900000;

      const cacheEntry = {
        data,
        expiresAt: now + ttlMs
      };
      this.candleCache.set(cacheKey, cacheEntry);
      getQueueManager().setCache(`candles:${cacheKey}`, cacheEntry, Math.ceil(ttlMs / 1000)).catch(() => {});
    }

    return Array.isArray(data) ? data.slice(-limit) : data;
  }

  private newsCache: { data: NewsEvent[], expiresAt: number } | null = null;
  private readonly NEWS_CACHE_TTL_MS = 30 * 60 * 1000;

  async getLatestNews(): Promise<NewsEvent[]> {
    const now = Date.now();
    let cachedData = null;

    try {
      const redisCached = await getQueueManager().getCache<{ data: NewsEvent[], expiresAt: number }>('latest_news');
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached.data;
      }
    } catch (e: any) {
      logger.debug(`Redis cache lookup error for latest_news: ${e?.message || e}`);
    }

    if (!cachedData) {
      if (this.newsCache && this.newsCache.expiresAt > now) {
        cachedData = this.newsCache.data;
      }
    }

    if (cachedData) {
      return cachedData;
    }

    const executeProvider = async (provider: any) => {
       const health = getProviderRegistry().getProviderHealth(provider.name);
       if ((health?.healthStatus === 'UNAVAILABLE' || health?.healthStatus === 'RATE LIMITED') && health?.circuitBreakerStatus === 'open') {
          throw new Error(`Circuit breaker open for ${provider.name}`);
       }
       return await provider.getLatestNews();
    };

    const newsApiProvider = new NewsApiProvider();
    const twitterProvider = new TwitterProvider();
    
    const results = await Promise.allSettled([
      executeProvider(newsApiProvider),
      executeProvider(twitterProvider)
    ]);
    
    let allNews: NewsEvent[] = [];
    if (results[0].status === 'fulfilled' && !results[0].value.hasOwnProperty('status')) {
      allNews.push(...results[0].value);
    }
    if (results[1].status === 'fulfilled' && !results[1].value.hasOwnProperty('status')) {
      allNews.push(...results[1].value);
    }
    
    if (allNews.length === 0) {
      return [];
    }
    
    const seen = new Set();
    allNews = allNews.filter(n => {
      const key = n.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const cacheEntry = {
        data: allNews,
        expiresAt: now + this.NEWS_CACHE_TTL_MS
    };
    this.newsCache = cacheEntry;
    getQueueManager().setCache('latest_news', cacheEntry, Math.ceil(this.NEWS_CACHE_TTL_MS / 1000)).catch(() => {});
    
    return allNews;
  }

  private calendarCache: { data: CalendarEvent[], expiresAt: number } | null = null;
  private readonly CALENDAR_CACHE_TTL_MS = 30 * 60 * 1000;

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const now = Date.now();
    let cachedData = null;

    try {
      const redisCached = await getQueueManager().getCache<{ data: CalendarEvent[], expiresAt: number }>('calendar_events');
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached.data;
      }
    } catch (e: any) {
      logger.debug(`Redis cache lookup error for calendar_events: ${e?.message || e}`);
    }

    if (!cachedData) {
      if (this.calendarCache && this.calendarCache.expiresAt > now) {
        cachedData = this.calendarCache.data;
      }
    }

    if (cachedData) {
      return cachedData;
    }

    const data = await this.calendarChain.execute(
      (p) => p.getCalendarEvents(),
      'getCalendarEvents'
    );
    
    if (!data.hasOwnProperty('status')) {
        const cacheEntry = {
            data,
            expiresAt: now + this.CALENDAR_CACHE_TTL_MS
        };
        this.calendarCache = cacheEntry;
        getQueueManager().setCache('calendar_events', cacheEntry, Math.ceil(this.CALENDAR_CACHE_TTL_MS / 1000)).catch(() => {});
    }
    
    return data;
  }

  async getContextData(symbol: string, timeframe: string, freshnessWindowMs: number = 60000) {
    const canonical = toCanonicalSymbol(symbol);
    const tf = timeframe.toUpperCase();

    const [price, news, calendar, candles, dxy, us10y] = await Promise.all([
      this.getLatestPrice(canonical, freshnessWindowMs),
      this.getLatestNews(),
      this.getCalendarEvents(),
      this.getCandles(canonical, tf, 250),
      this.getLatestPrice('DXY', 3600000).catch(() => ({ symbol: 'DXY', status: 'error', reason: 'Failed to fetch DXY', price: null, timestamp: new Date().toISOString(), provider: 'None', freshness: 'stale' as const })),
      this.getLatestPrice('US10Y', 3600000).catch(() => ({ symbol: 'US10Y', status: 'error', reason: 'Failed to fetch US10Y', price: null, timestamp: new Date().toISOString(), provider: 'None', freshness: 'stale' as const }))
    ]);
    
    const cotData = {
      status: 'not_configured',
      available: false,
      reason: 'COT data requires CFTC API integration'
    };
    
    // VALIDATION LAYER
    if (candles && Array.isArray(candles) && !candles.hasOwnProperty('status')) {
       const candleValidation = dataValidator.validateCandles(candles, canonical, tf);
       if (!candleValidation.isValid) {
         logger.warn(`Data Validation Alert for ${canonical} ${tf}: ${candleValidation.reason}`);
       }
    }
    
    if (price && price.price !== null && candles && Array.isArray(candles) && candles.length > 0 && !candles.hasOwnProperty('status')) {
       const lastCandle = candles[candles.length - 1];
       const lastCandleTime = new Date(lastCandle.timestamp).getTime();
       const timeDiff = Date.now() - lastCandleTime;

       lastCandle.close = price.price;
       if (price.price > lastCandle.high) lastCandle.high = price.price;
       if (price.price < lastCandle.low) lastCandle.low = price.price;

       if (timeDiff > 2 * 60 * 1000 && timeDiff < 60 * 60 * 1000) {
         lastCandle.timestamp = new Date().toISOString();
       }
    }

    const sessionInfo = SessionEngine.getSessionInfo(Date.now());

    return {
      symbol: canonical,
      timeframe: tf,
      timestamp: new Date().toISOString(),
      price,
      session: sessionInfo.primarySession,
      sessionDetails: sessionInfo,
      news,
      calendar,
      candles,
      correlations: {
          dxy,
          us10y,
          cotData
      },
      health: getProviderRegistry().getAllHealth()
    };
  }
}

let _marketDataService: MarketDataService | null = null;
export function getMarketDataService(): MarketDataService {
  if (!_marketDataService) _marketDataService = new MarketDataService();
  return _marketDataService;
}
