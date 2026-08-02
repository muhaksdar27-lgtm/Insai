import { MarketSnapshot, Candle, NewsEvent, CalendarEvent } from '@/types';
import { TwelveDataProvider } from './providers/twelvedata';
import { NewsApiProvider } from './providers/newsapi';
import { YahooFinanceProvider } from './providers/yahoofinance';
import { TwitterProvider } from './providers/twitter';
import { ForexFactoryProvider } from './providers/forexfactory';
import { getProviderRegistry } from './provider-registry';
import { logger } from '../utils/logger';
import { getQueueManager } from '../redis/queue';
import { FallbackChain } from './fallback-chain';
import { PriceProvider, NewsProvider, CalendarProvider } from './types';
import { dataValidator } from './data-validator';

import { MarketCalendar } from './market-calendar';

export class MarketDataService {
  private priceChain: FallbackChain<PriceProvider>;
  private newsChain: FallbackChain<NewsProvider>;
  private calendarChain: FallbackChain<CalendarProvider>;

  // Cache
  private priceCache: Map<string, { data: MarketSnapshot, expiresAt: number }> = new Map();
  private readonly PRICE_CACHE_TTL_MS = 30000; // 30 seconds for price cache

  constructor() {
    this.priceChain = new FallbackChain<PriceProvider>();
    this.newsChain = new FallbackChain<NewsProvider>();
    this.calendarChain = new FallbackChain<CalendarProvider>();

    // Fallback chain for price
    // 1. TwelveData (Primary - with WebSocket for XAUUSD)
    this.priceChain.addProvider(new TwelveDataProvider(), 'TwelveData');
    // 2. Yahoo Finance (Secondary/Fallback)
    this.priceChain.addProvider(new YahooFinanceProvider(), 'YahooFinance');

    // Fallback chain for news
    this.newsChain.addProvider(new NewsApiProvider(), 'NewsAPI');
    this.newsChain.addProvider(new TwitterProvider(), 'Twitter Bearer');
    
    // Fallback chain for calendar
    this.calendarChain.addProvider(new ForexFactoryProvider(), 'ForexFactory');
  }

  async getLatestPrice(symbol: string, freshnessWindowMs: number = 15000): Promise<MarketSnapshot> {
    const now = Date.now();
    let cachedData = null;

    // Try Redis cache first
    try {
      const redisCached = await getQueueManager().getCache<{ data: MarketSnapshot, expiresAt: number }>(`price:${symbol}`);
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached;
      }
    } catch (e) {
      // Ignore Redis error, fallback to local cache
    }

    // Fallback to local map if not found in Redis (or Redis failed)
    if (!cachedData) {
      const localCached = this.priceCache.get(symbol);
      if (localCached && localCached.expiresAt > now) {
        cachedData = localCached;
      }
    }

    if (cachedData) {
      // Re-evaluate freshness based on the requested window
      const snapshotTime = new Date(cachedData.data.timestamp).getTime();
      const marketStatus = MarketCalendar.getMarketStatus(symbol);
      let freshness = cachedData.data.freshness;
      if (!marketStatus.isOpen) {
        freshness = 'closed';
      } else {
        freshness = (now - snapshotTime > freshnessWindowMs) ? 'stale' : 'cached';
      }
      return { ...cachedData.data, freshness };
    }

    const snapshot = await this.priceChain.execute(
      (p) => p.getLatestPrice(symbol),
      `getLatestPrice(${symbol})`,
      {
        symbol,
        price: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        timestamp: new Date().toISOString(),
        provider: 'fallback',
        freshness: 'stale',
        status: 'not_configured'
      } as any
    );

    // Gap detection / Freshness check based on market status & window
    const snapshotTime = new Date(snapshot.timestamp).getTime();
    const marketStatus = MarketCalendar.getMarketStatus(symbol);
    if (!marketStatus.isOpen) {
      snapshot.freshness = 'closed';
    } else if (now - snapshotTime > freshnessWindowMs) {
      logger.warn(`Data gap detected for ${symbol} from ${snapshot.provider}. Data is stale (> ${freshnessWindowMs}ms).`);
      snapshot.freshness = 'stale';
    } else {
      snapshot.freshness = 'live';
    }
    
    const currentHour = new Date().getUTCHours();
    const session = currentHour >= 13 && currentHour < 22 ? "New York" : currentHour >= 8 && currentHour < 16 ? "London" : currentHour >= 0 && currentHour < 9 ? "Tokyo" : "Sydney";
    snapshot.session = session;
    if (!snapshot.bias) {
      snapshot.bias = "NEUTRAL";
    }

    const cacheEntry = {
      data: snapshot,
      expiresAt: now + this.PRICE_CACHE_TTL_MS
    };

    this.priceCache.set(symbol, cacheEntry);
    getQueueManager().setCache(`price:${symbol}`, cacheEntry, Math.ceil(this.PRICE_CACHE_TTL_MS / 1000)).catch(() => {});

    return snapshot;
  }

  private candleCache: Map<string, { data: Candle[], expiresAt: number }> = new Map();
  private readonly CANDLE_CACHE_TTL_MS = 300000; // 5 minutes (300 seconds) for candles, M15 doesn't close that fast

  async getCandles(symbol: string, timeframe: string, limit: number = 250): Promise<Candle[]> {
    const cacheKey = `${symbol}-${timeframe}`;
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

    // Fallback to local map if not found in Redis (or Redis failed)
    if (!cachedData) {
      const localCached = this.candleCache.get(cacheKey);
      if (localCached && localCached.expiresAt > now) {
        cachedData = localCached.data;
      }
    }

    if (cachedData) {
      return cachedData.slice(-limit);
    }

    // Always fetch a consistent larger limit to maximize cache hits across different consumers
    const fetchLimit = Math.max(limit, 250);
    const data = await this.priceChain.execute(
      (p) => p.getCandles(symbol, timeframe, fetchLimit),
      `getCandles(${symbol}, ${timeframe})`,
      [] as any
    );

    if (!data.status || data.status !== 'not_configured') {
      const cacheEntry = {
        data,
        expiresAt: now + this.CANDLE_CACHE_TTL_MS
      };
      this.candleCache.set(cacheKey, cacheEntry);
      getQueueManager().setCache(`candles:${cacheKey}`, cacheEntry, Math.ceil(this.CANDLE_CACHE_TTL_MS / 1000)).catch(() => {});
    }

    return Array.isArray(data) ? data.slice(-limit) : data;
  }

  private newsCache: { data: NewsEvent[], expiresAt: number } | null = null;
  private readonly NEWS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  async getLatestNews(): Promise<NewsEvent[]> {
    const now = Date.now();
    let cachedData = null;

    try {
      const redisCached = await getQueueManager().getCache<{ data: NewsEvent[], expiresAt: number }>('latest_news');
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached.data;
      }
    } catch (e) {
      // Ignore Redis error, fallback to local cache
    }

    // Fallback to local map if not found in Redis (or Redis failed)
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

    // Fetch from all news providers in parallel
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
      logger.warn(`Market Data Warning: No available providers for getLatestNews()`);
      // Return empty array
      return [];
    }
    
    // Dedup and sort
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
  private readonly CALENDAR_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const now = Date.now();
    let cachedData = null;

    try {
      const redisCached = await getQueueManager().getCache<{ data: CalendarEvent[], expiresAt: number }>('calendar_events');
      if (redisCached && redisCached.expiresAt > now) {
        cachedData = redisCached.data;
      }
    } catch (e) {
      // Ignore Redis error, fallback to local cache
    }

    // Fallback to local map if not found in Redis (or Redis failed)
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
      'getCalendarEvents',
      [] as any
    );
    
    // Only cache if it's an actual successful array (no status field)
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

  async getContextData(symbol: string, timeframe: string, freshnessWindowMs: number = 15000) {
    const [price, news, calendar, candles, dxy, us10y] = await Promise.all([
      this.getLatestPrice(symbol, freshnessWindowMs),
      this.getLatestNews(),
      this.getCalendarEvents(),
      this.getCandles(symbol, timeframe, 250),
      this.getLatestPrice('DXY', 300000).catch(() => ({ status: 'error', reason: 'Failed to fetch DXY' })),
      this.getLatestPrice('US10Y', 300000).catch(() => ({ status: 'error', reason: 'Failed to fetch US10Y' }))
    ]);
    
    // COT Data - Requires CFTC API or Premium Data Provider (e.g., Quandl)
    const cotData = {
      status: 'not_configured',
      available: false,
      reason: 'COT data requires premium provider integration (CFTC / Quandl)'
    };
    
    // VALIDATION LAYER
    if (candles && Array.isArray(candles) && !candles.hasOwnProperty('status')) {
       const candleValidation = dataValidator.validateCandles(candles, symbol, timeframe);
       if (!candleValidation.isValid) {
         logger.warn(`Data Validation Failed for ${symbol} ${timeframe}: ${candleValidation.reason}`);
         throw new Error(`DATA_VALIDATION_ERROR: ${candleValidation.reason}`);
       }
    }
    
    if (price && price.price !== null && candles && Array.isArray(candles) && candles.length > 0 && !candles.hasOwnProperty('status')) {
       // Update last candle with latest price for real-time responsiveness without destroying its identity
       const lastCandle = candles[candles.length - 1];
       lastCandle.close = price.price;
       if (price.price > lastCandle.high) lastCandle.high = price.price;
       if (price.price < lastCandle.low) lastCandle.low = price.price;
       
       // DO NOT overwrite lastCandle.timestamp here! 
       // Keeping the original timeframe open time ensures caching works correctly.
    }

    return {
      symbol,
      timeframe,
      timestamp: new Date().toISOString(),
      price,
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
