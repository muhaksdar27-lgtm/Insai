import { getDatabaseClient } from "../db/client";
import { healthCheckEngine } from "../observability/health-check";
import { TradingEngine } from './engine';
import { getMarketDataService } from '../market-data/market-data-service';
import { MarketCalendar } from '../market-data/market-calendar';
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

  private streamUnsubscribe: (() => void) | null = null;
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
        if (now - this.lastScanTime > 20000) { // 20s throttle per tick scan to prevent spamming
          this.lastScanTime = now;
          this.scan();
        }
      }
    };
    
    this.streamUnsubscribe = await getQueueManager().streamSubscribeGroup(
      'market_stream:XAUUSD',
      'scanner-group',
      'scanner-' + crypto.randomUUID(),
      this.marketUpdateHandler as any
    );
    
    // Initial scan
    this.scan();
    
    // Fallback interval (every 30 seconds) in case WebSocket/Redis is quiet
    this.timer = setInterval(() => {
      if (!this.isRunning || this.isScanning) return;
      const now = Date.now();
      if (now - this.lastScanTime > 30000) {
        this.lastScanTime = now;
        this.scan();
      }
    }, 30000);
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.streamUnsubscribe) {
      this.streamUnsubscribe();
      this.streamUnsubscribe = null;
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
           
           const strats = await getDatabaseClient().getStrategies();
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
      
      // Get the current M1 candle block (1 minute = 60000 ms) for high precision
      const currentCandleBlock = Math.floor(Date.now() / 60000) * 60000;
      
      // Fetch latest price (leveraging the newly extended 30-sec cache)
      const latestPriceSnapshot = await getMarketDataService().getLatestPrice("XAUUSD");
      const currentPrice = latestPriceSnapshot?.price ?? 0;
      
      if (!currentPrice) {
         logger.warn('Market price for XAUUSD is currently unavailable. Skipping scan.');
         return;
      }
      
      const isNewCandle = currentCandleBlock !== this.lastScannedCandleBlock;
      const isSignificantPriceChange = Math.abs(currentPrice - this.lastScannedPrice) >= 0.05;
      
      if (!isNewCandle && !isSignificantPriceChange && this.lastScannedPrice > 0) {
         // Skip scan to preserve TwelveData/YahooFinance API quota!
         return;
      }
      
      this.lastScannedPrice = currentPrice;
      this.lastScannedCandleBlock = currentCandleBlock;

      logger.info('Running market scan for XAUUSD (triggered by real-time WebSocket/throttle)...');
      
      // 2. Get Context (Use M15 for precise institutional structure & trend evaluation)
      const baseContext = await getMarketDataService().getContextData("XAUUSD", "M15");
      const correlationId = crypto.randomUUID();
      const context = { ...baseContext, correlationId };

      // 2b. Hard Gate: Check Market Calendar & Data Freshness
      const marketStatus = MarketCalendar.getMarketStatus("XAUUSD", context);
      if (marketStatus.isHardBlocked) {
        logger.info(`[HARD_BLOCK_SCAN_SKIPPED] Market scan skipped for XAUUSD: ${marketStatus.blockReason}`);
        return;
      }

      // 2c. Monitor Active Signals for SL/TP hits
      try {
        const activeSignals = await getDatabaseClient().getActiveSignals();
        if (activeSignals && activeSignals.length > 0) {
          const pricesCache = new Map<string, number>();
          pricesCache.set("XAUUSD", currentPrice);

          for (const signal of activeSignals) {
             const symbol = signal.symbol || 'XAUUSD';
             let sigPrice = pricesCache.get(symbol);
             if (sigPrice === undefined) {
                 const snap = await getMarketDataService().getLatestPrice(symbol);
                 sigPrice = snap?.price ?? 0;
                 pricesCache.set(symbol, sigPrice);
             }
             if (sigPrice <= 0) continue;

             const dir = (signal.direction || 'BUY').toUpperCase();
             const sl = parseFloat(signal.sl_price || signal.slPrice || '0');
             const tp = parseFloat(signal.tp1_price || signal.tp1Price || signal.tp_price || signal.tpPrice || '0');
             const ep = parseFloat(signal.entry_price || signal.entryPrice || '0');
             const pipMultiplier = symbol.includes('JPY') ? 100 : symbol === 'XAUUSD' ? 10 : 10000;
             
             if (dir === 'BUY') {
               if (sl > 0 && sigPrice <= sl) {
                 await getDatabaseClient().archiveToHistory(signal.signal_key, 'STOP_LOSS', -(Math.abs(ep - sl) * pipMultiplier), 'LOSS');
                 logger.info(`[STOP LOSS] Signal ${signal.signal_key} hit SL at ${sigPrice}`);
                 getQueueManager().publish('events', { type: 'SIGNAL_CLOSED', signalKey: signal.signal_key, reason: 'STOP_LOSS' });
               } else if (tp > 0 && sigPrice >= tp) {
                 await getDatabaseClient().archiveToHistory(signal.signal_key, 'TAKE_PROFIT', (Math.abs(tp - ep) * pipMultiplier), 'WIN');
                 logger.info(`[TAKE PROFIT] Signal ${signal.signal_key} hit TP at ${sigPrice}`);
                 getQueueManager().publish('events', { type: 'SIGNAL_CLOSED', signalKey: signal.signal_key, reason: 'TAKE_PROFIT' });
               }
             } else if (dir === 'SELL') {
               if (sl > 0 && sigPrice >= sl) {
                 await getDatabaseClient().archiveToHistory(signal.signal_key, 'STOP_LOSS', -(Math.abs(sl - ep) * pipMultiplier), 'LOSS');
                 logger.info(`[STOP LOSS] Signal ${signal.signal_key} hit SL at ${sigPrice}`);
                 getQueueManager().publish('events', { type: 'SIGNAL_CLOSED', signalKey: signal.signal_key, reason: 'STOP_LOSS' });
               } else if (tp > 0 && sigPrice <= tp) {
                 await getDatabaseClient().archiveToHistory(signal.signal_key, 'TAKE_PROFIT', (Math.abs(ep - tp) * pipMultiplier), 'WIN');
                 logger.info(`[TAKE PROFIT] Signal ${signal.signal_key} hit TP at ${sigPrice}`);
                 getQueueManager().publish('events', { type: 'SIGNAL_CLOSED', signalKey: signal.signal_key, reason: 'TAKE_PROFIT' });
               }
             }
          }
        }
      } catch (e: any) {
         logger.error(`Error monitoring active signals: ${e.message}`);
      }

      const candles = context.candles || [];
      if (candles.length > 0) {
        const latestCandleTime = new Date(candles[candles.length - 1].timestamp).getTime();
        const now = Date.now();
        // Allow up to 60 minutes for fallback feeds (e.g. Yahoo Finance) to prevent lockouts
        if (now - latestCandleTime > 60 * 60 * 1000) {
          logger.warn(`[STALE_DATA_SCAN_SKIPPED] Market scan skipped for XAUUSD: Latest candle timestamp (${candles[candles.length - 1].timestamp}) is older than 60 mins.`);
          return;
        }
      }

      // 3. Pass to engine with M15 timeframe for institutional strategy evaluation
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
