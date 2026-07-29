import { getSupabaseClient } from "../supabase/client";
import { healthCheckEngine } from "../observability/health-check";
import { TradingEngine } from './engine';
import { getMarketDataService } from '../market-data/market-data-service';
import { logger } from '../utils/logger';
import crypto from "crypto";
import { getQueueManager } from '../redis/queue';
import { MarketSnapshot } from '@/types';
import { metricsEngine } from '../observability/metrics-engine';
import { errorTracker } from '../observability/error-tracker';

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
      if (!this.isRunning || this.isScanning) return;
      
      const snapshot = msg.payload as MarketSnapshot;
      if (snapshot.symbol === 'XAUUSD') {
        const now = Date.now();
        if (now - this.lastScanTime > 3000) { // 3s throttle per tick scan
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
      if (!this.isRunning || this.isScanning) return;
      const now = Date.now();
      if (now - this.lastScanTime > 10000) {
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
      this.marketUpdateHandler = null;
    }

    logger.info('Market Scanner stopped');
  }

  public async scan() {
    if (this.isScanning) {
       return;
    }
    
    // Acquire distributed lock for scanning (10 seconds to prevent overlapping scans from same or other instances)
    const lockAcquired = await getQueueManager().acquireLock('market_scan_xauusd', 10);
    if (!lockAcquired) {
       return;
    }
    
    this.isScanning = true;
    healthCheckEngine.updateServiceHealth('MarketScanner', 'SCAN_IN_PROGRESS', 0, 'Scan in progress');
    const startTime = Date.now();
    try {
      // 1. Check if any strategies are active before fetching data
      let activeCount = 0;
      let activeStrategyIds: string[] = [];
      const now = Date.now();
      
      let cachedData = null;
      try {
        const redisCached = await getQueueManager().getCache<{ activeCount: number, activeIds: string[], expiresAt: number }>('active_strategies_data');
        if (redisCached && redisCached.expiresAt > now) {
          cachedData = redisCached;
          metricsEngine.recordCacheAccess(true);
        } else {
          metricsEngine.recordCacheAccess(false);
        }
      } catch (e) {
        // Ignore error, fallback to local cache
      }

      if (!cachedData) {
        if (this.strategiesCache && this.strategiesCache.expiresAt > now) {
          cachedData = this.strategiesCache as { activeCount: number, activeIds: string[], expiresAt: number };
          metricsEngine.recordCacheAccess(true);
        }
      }

      if (cachedData) {
         activeCount = cachedData.activeCount;
         activeStrategyIds = cachedData.activeIds || [];
      } else {
         try {
           
           const strats = await getSupabaseClient().getStrategies();
           if (Array.isArray(strats) && strats.length > 0) {
             const activeStrats = strats.filter(s => s.enabled);
             if (activeStrats.length > 0) {
               activeCount = activeStrats.length;
               activeStrategyIds = activeStrats.map(s => s.id);
               logger.info(`Found ${strats.length} strategies, ${activeCount} active.`);
             } else {
               activeStrategyIds = [
                 'strategy-1-smc',
                 'strategy-2-snd',
                 'strategy-3-scalping',
                 'strategy-4-news',
                 'strategy-5-smc-sd-confluence'
               ];
               activeCount = activeStrategyIds.length;
               logger.info(`Database strategies disabled. Falling back to default ${activeCount} active strategies.`);
             }
           } else {
             activeStrategyIds = [
               'strategy-1-smc',
               'strategy-2-snd',
               'strategy-3-scalping',
               'strategy-4-news',
               'strategy-5-smc-sd-confluence'
             ];
             activeCount = activeStrategyIds.length;
             if ((strats as any)?.status !== 'not_configured') {
               logger.warn(`getStrategies returned empty or non-array. Falling back to default ${activeCount} active strategies.`);
             }
           }
         } catch (e: any) {
           activeStrategyIds = [
             'strategy-1-smc',
             'strategy-2-snd',
             'strategy-3-scalping',
             'strategy-4-news',
             'strategy-5-smc-sd-confluence'
           ];
           activeCount = activeStrategyIds.length;
           logger.warn(`Failed to check active strategies. Falling back to default ${activeCount} active strategies. Error: ${e.message}`);
         }
         const cacheEntry = { activeCount, activeIds: activeStrategyIds, expiresAt: now + this.STRATEGIES_CACHE_TTL };
         this.strategiesCache = cacheEntry;
         getQueueManager().setCache('active_strategies_data', cacheEntry, Math.ceil(this.STRATEGIES_CACHE_TTL / 1000)).catch(() => {});
      }
      
      if (activeCount === 0) {
        logger.info('No active strategies, skipping market scan.');
        return;
      }
      
      // Get the current M15 candle block (15 minutes = 900000 ms)
      const currentCandleBlock = Math.floor(Date.now() / 900000) * 900000;
      
      // Fetch latest price (leveraging the newly extended 30-sec cache)
      const latestPriceSnapshot = await getMarketDataService().getLatestPrice("XAUUSD");
      const currentPrice = latestPriceSnapshot?.price ?? 0;
      
      if (!currentPrice) {
         logger.warn('Market price for XAUUSD is currently unavailable. Skipping scan.');
         return;
      }
      
      const isNewCandle = currentCandleBlock !== this.lastScannedCandleBlock;
      const isSignificantPriceChange = Math.abs(currentPrice - this.lastScannedPrice) >= 0.1;
      
      if (!isNewCandle && !isSignificantPriceChange && this.lastScannedPrice > 0) {
         // Skip scan to preserve TwelveData/YahooFinance API quota!
         return;
      }
      
      this.lastScannedPrice = currentPrice;
      this.lastScannedCandleBlock = currentCandleBlock;

      logger.info('Running market scan for XAUUSD (triggered by real-time WebSocket/throttle)...');
      
      // 2. Get Context
      const baseContext = await getMarketDataService().getContextData("XAUUSD", "M15");
      const correlationId = crypto.randomUUID();
      const context = { ...baseContext, correlationId };
      
      // 3. Pass to engine
      await this.engine.processMarketData('XAUUSD', 'M15', context, activeStrategyIds);
      
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
      healthCheckEngine.updateServiceHealth('MarketScanner', 'ONLINE', Date.now() - startTime, 'Scan completed');
      metricsEngine.recordScannerDuration(Date.now() - startTime);
      await getQueueManager().releaseLock('market_scan_xauusd');
    }
  }
}

// Singleton for app-wide usage if needed
let _marketScanner: MarketScanner | null = null;
export function getMarketScanner(): MarketScanner {
  if (!_marketScanner) _marketScanner = new MarketScanner();
  return _marketScanner;
}
