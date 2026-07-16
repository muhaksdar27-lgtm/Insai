import { TradingEngine } from './engine';
import { getMarketDataService } from '../market-data/market-data-service';
import { logger } from '../utils/logger';
import crypto from "crypto";
import { getQueueManager } from '../redis/queue';
import { MarketSnapshot } from '@/types';
import { metricsEngine } from '../observability/metrics-engine';
import { errorTracker } from '../observability/error-tracker';

// Default 5 core strategies
const DEFAULT_STRATEGIES = [
  'strategy-1-smc',
  'strategy-2-snd',
  'strategy-3-scalping',
  'strategy-4-news',
  'strategy-5-smc-sd-confluence'
];

export class MarketScanner {
  private engine: TradingEngine;
  private isRunning: boolean = false;
  private isScanning: boolean = false;
  private lastScanTime: number = 0;
  private marketUpdateHandler: ((msg: any) => Promise<void>) | null = null;
  
  // High-performance quant tracking to limit redundant full scans
  private lastScannedPrice: number = 0;
  private lastScannedCandleBlock: number = 0;
  
  // Cache strategies to avoid DB bottlenecks in hot path
  private strategiesCache: { activeCount: number, activeIds: string[], expiresAt: number } | null = null;
  private readonly STRATEGIES_CACHE_TTL = 300000; // 5 minutes

  constructor() {
    this.engine = new TradingEngine();
  }

  private timer: NodeJS.Timeout | null = null;

  public async start() {
    if (this.isRunning) return;
    
    await this.engine.init();
    
    this.isRunning = true;
    logger.info(`Market Scanner started in WebSocket real-time mode with fallback interval`);
    
    // Subscribe to real-time market updates
    this.marketUpdateHandler = async (msg: any) => {
      if (!this.isRunning) return;
      
      const snapshot = msg.payload as MarketSnapshot;
      if (snapshot.symbol === 'XAUUSD') {
        const now = Date.now();
        if (now - this.lastScanTime > 1000) {
          this.lastScanTime = now;
          this.scan();
        }
      }
    };
    getQueueManager().streamSubscribeGroup('market_stream:XAUUSD', 'scanner-group', 'scanner-' + Math.random().toString(36).substring(7), this.marketUpdateHandler as any);
    
    // Initial scan
    this.scan();
    
    // Fallback interval (every 15 seconds) in case WebSocket/Redis is down
    this.timer = setInterval(() => {
      if (!this.isRunning) return;
      const now = Date.now();
      if (now - this.lastScanTime > 1000) {
        this.lastScanTime = now;
        this.scan();
      }
    }, 15000);
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.marketUpdateHandler) {
      // getQueueManager().unsubscribe('market-updates', this.marketUpdateHandler); // Stream polling stops when isRunning=false
      this.marketUpdateHandler = null;
    }

    logger.info('Market Scanner stopped');
  }

  /**
   * Fetch active strategies from database.
   * Includes comprehensive error handling and graceful fallback.
   */
  private async getActiveStrategies(): Promise<string[]> {
    const now = Date.now();
    
    // Check Redis cache first
    try {
      const redisCached = await getQueueManager().getCache<{ activeCount: number, activeIds: string[], expiresAt: number }>('active_strategies_data');
      if (redisCached && redisCached.expiresAt > now) {
        metricsEngine.recordCacheAccess(true);
        logger.info(`Strategies loaded from Redis cache: ${redisCached.activeIds.length} active`);
        return redisCached.activeIds;
      }
    } catch (e) {
      logger.warn(`Redis cache lookup failed: ${(e as any).message}, falling back to local cache`);
    }

    // Check local cache second
    if (this.strategiesCache && this.strategiesCache.expiresAt > now) {
      metricsEngine.recordCacheAccess(true);
      logger.info(`Strategies loaded from local cache: ${this.strategiesCache.activeIds.length} active`);
      return this.strategiesCache.activeIds;
    }

    metricsEngine.recordCacheAccess(false);

    // Try database
    try {
      const { getSupabaseClient } = await import('../supabase/client');
      const strats = await getSupabaseClient().getStrategies();
      
      if (!Array.isArray(strats)) {
        logger.error(`getStrategies() returned non-array (${typeof strats}). This is a critical bug.`, { result: strats });
        throw new Error('getStrategies() returned non-array result');
      }
      
      if (strats.length === 0) {
        logger.warn(`getStrategies() returned empty array. No strategies configured in database. Falling back to DEFAULT_STRATEGIES.`);
        return DEFAULT_STRATEGIES;
      }

      const activeStrats = strats.filter(s => s.enabled);
      if (activeStrats.length === 0) {
        logger.warn(`Database has ${strats.length} strategies, but NONE are enabled (all disabled=true). Falling back to DEFAULT_STRATEGIES.`);
        return DEFAULT_STRATEGIES;
      }

      const activeIds = activeStrats.map(s => s.id);
      logger.info(`Loaded ${strats.length} strategies from database, ${activeIds.length} are active (enabled=true)`);
      
      // Cache the result
      const cacheEntry = { activeCount: activeIds.length, activeIds, expiresAt: now + this.STRATEGIES_CACHE_TTL };
      this.strategiesCache = cacheEntry;
      getQueueManager().setCache('active_strategies_data', cacheEntry, Math.ceil(this.STRATEGIES_CACHE_TTL / 1000)).catch(() => {});
      
      return activeIds;
    } catch (e: any) {
      logger.error(`Failed to fetch strategies from database: ${e.message}. Falling back to DEFAULT_STRATEGIES.`, { error: e });
      
      // In production, always have a fallback
      return DEFAULT_STRATEGIES;
    }
  }

  public async scan() {
    if (this.isScanning) {
       logger.debug('Scan already in progress, skipping.');
       return;
    }
    
    // Acquire distributed lock for scanning with timeout
    let lockAcquired = false;
    try {
      lockAcquired = await getQueueManager().acquireLock('market_scan_xauusd', 10);
    } catch (e: any) {
      logger.warn(`Failed to acquire scan lock: ${e.message}. Skipping this scan.`);
      return;
    }

    if (!lockAcquired) {
       logger.debug('Another instance is currently scanning. Skipping.');
       return;
    }
    
    this.isScanning = true;
    const startTime = Date.now();
    try {
      // 1. Get active strategies (with comprehensive fallback)
      let activeStrategyIds: string[] = [];
      try {
        activeStrategyIds = await this.getActiveStrategies();
      } catch (e: any) {
        logger.error(`Critical error fetching strategies: ${e.message}`);
        activeStrategyIds = DEFAULT_STRATEGIES;
      }

      // Sanity check: never allow empty strategy list in production
      if (activeStrategyIds.length === 0) {
        logger.error(`Strategy list is empty after all fallbacks! This should never happen. Using DEFAULT_STRATEGIES as last resort.`);
        activeStrategyIds = DEFAULT_STRATEGIES;
      }
      
      const activeCount = activeStrategyIds.length;
      logger.info(`Market scan will process ${activeCount} active strategies: ${activeStrategyIds.join(', ')}`);
      
      // 2. Get the current M15 candle block (15 minutes = 900000 ms)
      const currentCandleBlock = Math.floor(Date.now() / 900000) * 900000;
      
      // 3. Fetch latest price (leveraging the newly extended 30-sec cache)
      let latestPriceSnapshot: MarketSnapshot | null = null;
      try {
        latestPriceSnapshot = await getMarketDataService().getLatestPrice("XAUUSD");
      } catch (e: any) {
        logger.error(`Failed to fetch latest price for XAUUSD: ${e.message}`);
        latestPriceSnapshot = null;
      }

      const currentPrice = latestPriceSnapshot?.price ?? 0;
      
      if (!currentPrice || currentPrice === 0) {
         logger.warn('Market price for XAUUSD is currently unavailable. Skipping scan.');
         return;
      }
      
      const isNewCandle = currentCandleBlock !== this.lastScannedCandleBlock;
      const isSignificantPriceChange = Math.abs(currentPrice - this.lastScannedPrice) >= 0.1;
      
      if (!isNewCandle && !isSignificantPriceChange && this.lastScannedPrice > 0) {
         // Skip scan to preserve TwelveData/YahooFinance API quota!
         logger.debug(`Skipping scan: no new candle and price change < $0.10 (price: ${currentPrice})`);
         return;
      }
      
      this.lastScannedPrice = currentPrice;
      this.lastScannedCandleBlock = currentCandleBlock;

      logger.info('Running market scan for XAUUSD (triggered by real-time WebSocket/throttle)...');
      
      // 4. Get Context
      const baseContext = await getMarketDataService().getContextData("XAUUSD", "M15");
      const correlationId = crypto.randomUUID();
      const context = { ...baseContext, correlationId };
      
      // 5. Pass to engine
      this.engine.processMarketData('XAUUSD', 'M15', context, activeStrategyIds);
      
    } catch (error: any) {
      if (error.message.includes('not configured')) {
        logger.warn(`Market scan skipped: ${error.message}`);
      } else if (error.message.includes('DATA_VALIDATION_ERROR')) {
        logger.error(`Pipeline stopped by Data Validation Layer: ${error.message}`);
        import('../observability/audit-logger').then(({ auditLogger }) => {
           auditLogger.log({
             action: 'DATA_VALIDATION_FAILED',
             entity: 'market_data',
             entity_id: 'XAUUSD',
             status: 'failure',
             details: { reason: error.message }
           });
        });
      } else {
        errorTracker.trackError({
          component: 'MarketScanner',
          error: error,
          severity: 'high'
        });
        logger.error(`Market scan failed: ${error.message}`);
      }
    } finally {
      this.isScanning = false;
      metricsEngine.recordScannerDuration(Date.now() - startTime);
      
      // Release lock with error handling
      try {
        await getQueueManager().releaseLock('market_scan_xauusd');
      } catch (e: any) {
        logger.warn(`Failed to release scan lock: ${e.message}`);
      }
    }
  }
}

// Singleton for app-wide usage if needed
let _marketScanner: MarketScanner | null = null;
export function getMarketScanner(): MarketScanner {
  if (!_marketScanner) _marketScanner = new MarketScanner();
  return _marketScanner;
}

