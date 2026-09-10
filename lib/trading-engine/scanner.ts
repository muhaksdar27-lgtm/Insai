import { getDatabaseClient } from "../db/client";
import { healthCheckEngine, ServiceHealthStatus } from "../observability/health-check";
import { TradingEngine } from './engine';
import { StrategyContextBuilder } from './strategy-context-builder';
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
        if (now - this.lastScanTime > 5000) { // 5s throttle per tick scan for fast responsiveness
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
    
    // Fallback interval (every 10 seconds) in case WebSocket/Redis is quiet
    this.timer = setInterval(() => {
      if (!this.isRunning || this.isScanning) return;
      const now = Date.now();
      if (now - this.lastScanTime > 10000) {
        this.lastScanTime = now;
        this.scan();
      }
    }, 10000);
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

  // Distributed lock TTL: 60 seconds safely covers multi-timeframe fetching,
  // calendar validation, active signal checks, and multi-strategy execution pipeline (C-02).
  private static readonly SCAN_LOCK_TTL_SECONDS = 60;

  public async scan(force: boolean = false): Promise<boolean> {
    // C-01: Prevent overlapping scans in the same process regardless of force flag
    if (this.isScanning) {
      logger.info('Market scan already in progress on this instance, skipping overlapping scan request.');
      return false;
    }
    
    // C-01 & C-02: Acquire distributed lock with safe 60s TTL. Never bypass distributed lock even if force is true.
    const lockAcquired = await getQueueManager().acquireLock('market_scan_xauusd', MarketScanner.SCAN_LOCK_TTL_SECONDS);
    if (!lockAcquired) {
      logger.info('Distributed lock market_scan_xauusd held by another instance/process, skipping concurrent scan.');
      return false;
    }
    
    this.isScanning = true;
    healthCheckEngine.updateServiceHealth('MarketScanner', 'SCAN_IN_PROGRESS', 0, 'Scan in progress');
    const startTime = Date.now();
    let serviceStatus: ServiceHealthStatus = 'ONLINE';
    let statusMessage = 'Scan completed';

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
             const activeStrats = strats.filter(s => Boolean(s.enabled));
             activeCount = activeStrats.length;
             activeStrategyIds = activeStrats.map(s => s.id);
             if (activeCount > 0) {
               logger.info(`Found ${strats.length} strategies in database, ${activeCount} active.`);
             } else {
               // C-05: User explicitly disabled all strategies. Never silently force default strategies on!
               logger.info(`All ${strats.length} database strategies are disabled by user configuration.`);
             }
           } else {
             // C-05: Database returned empty or non-array strategies. Do not silently enable default strategies.
             activeStrategyIds = [];
             activeCount = 0;
             logger.warn('No strategies found in database. Market scan will be skipped.');
           }

           const cacheEntry = { activeCount, activeIds: activeStrategyIds, expiresAt: now + this.STRATEGIES_CACHE_TTL };
           this.strategiesCache = cacheEntry;
           getQueueManager().setCache('active_strategies_data', cacheEntry, Math.ceil(this.STRATEGIES_CACHE_TTL / 1000)).catch(() => {});
         } catch (e: any) {
           // C-05: Database strategy fetch failed. Do not silently enable default strategies.
           activeStrategyIds = [];
           activeCount = 0;
           logger.error(`Failed to load strategies from database: ${e.message}. Market scan will be skipped.`);
         }
      }
      
      if (activeCount === 0) {
        logger.info('No active strategies enabled, skipping market scan.');
        serviceStatus = 'ONLINE';
        statusMessage = 'Scan skipped: No active strategies enabled';
        return false;
      }
      
      // Get the current M1 candle block (1 minute = 60000 ms) for high precision
      const currentCandleBlock = Math.floor(Date.now() / 60000) * 60000;
      
      // Fetch latest price (leveraging the cache)
      const latestPriceSnapshot = await getMarketDataService().getLatestPrice("XAUUSD");
      const currentPrice = latestPriceSnapshot?.price ?? 0;
      
      if (!currentPrice) {
         logger.warn('Market price for XAUUSD is currently unavailable. Skipping scan.');
         serviceStatus = 'DEGRADED';
         statusMessage = 'Scan skipped: Market price for XAUUSD unavailable';
         return false;
      }
      
      const isNewCandle = currentCandleBlock !== this.lastScannedCandleBlock;
      const isSignificantPriceChange = Math.abs(currentPrice - this.lastScannedPrice) >= 0.05;
      const isHeartbeatDue = (now - this.lastScanTime) >= 30000;
      
      if (!force && !isNewCandle && !isSignificantPriceChange && !isHeartbeatDue && this.lastScannedPrice > 0) {
         // Skip scan to preserve TwelveData/YahooFinance API quota!
         serviceStatus = 'ONLINE';
         statusMessage = 'Scan throttled: Price and candle unchanged';
         return false;
      }

      logger.info('Running market scan for XAUUSD (triggered by real-time WebSocket/throttle)...');
      
      // 2. Build multi-timeframe StrategyMarketContext
      const globalContext = await StrategyContextBuilder.buildGlobalMarketContext('XAUUSD');
      const correlationId = crypto.randomUUID();
      globalContext.correlationId = correlationId;

      // 2b. Hard Gate: Check Market Calendar & Data Freshness
      const baseContext = {
        symbol: 'XAUUSD',
        timeframe: 'M15',
        timestamp: globalContext.currentTimestamp,
        price: { price: globalContext.currentPrice, provider: globalContext.provider, freshness: globalContext.dataFreshness },
        candles: globalContext.M15?.candles || [],
        correlationId
      };

      const marketStatus = MarketCalendar.getMarketStatus("XAUUSD", baseContext);
      if (marketStatus.isHardBlocked) {
        logger.info(`[HARD_BLOCK_SCAN_SKIPPED] Market scan skipped for XAUUSD: ${marketStatus.blockReason}`);
        serviceStatus = 'ONLINE';
        statusMessage = `Market scan skipped for XAUUSD: ${marketStatus.blockReason}`;
        return false;
      }

      // 2c. Monitor Active Signals for SL/TP hits
      try {
        const activeSignals = await getDatabaseClient().getActiveSignals();
        if (activeSignals && activeSignals.length > 0) {
          const pricesCache = new Map<string, number>();
          pricesCache.set("XAUUSD", currentPrice);

          // C-07: Executable statuses only - strictly exclude PENDING, REJECTED, EXPIRED, etc.
          const EXECUTABLE_STATUSES = new Set(['APPROVED', 'SIGNAL_ACTIVE', 'ACTIVE', 'TAKE_PARTIAL']);

          for (const signal of activeSignals) {
             const rawStatus = String(signal.status || '').trim().toUpperCase();
             if (!EXECUTABLE_STATUSES.has(rawStatus)) {
               logger.debug(`[ACTIVE_SIGNAL_MONITOR] Skipping signal ${signal.signal_key}: status '${signal.status}' is not executable (e.g. PENDING)`);
               continue;
             }

             const symbol = signal.symbol || 'XAUUSD';
             let sigPrice = pricesCache.get(symbol);
             if (sigPrice === undefined) {
                 const snap = await getMarketDataService().getLatestPrice(symbol);
                 sigPrice = snap?.price ?? 0;
                 pricesCache.set(symbol, sigPrice);
             }
             if (sigPrice <= 0) continue;

             // C-06: Strictly validate direction - reject/skip malformed signals instead of defaulting to BUY
             const rawDir = String(signal.direction || '').trim().toUpperCase();
             let dir: 'BUY' | 'SELL' | null = null;
             if (rawDir === 'BUY' || rawDir === 'LONG') {
               dir = 'BUY';
             } else if (rawDir === 'SELL' || rawDir === 'SHORT') {
               dir = 'SELL';
             }

             if (!dir) {
               logger.warn(`[ACTIVE_SIGNAL_MONITOR] Skipping signal ${signal.signal_key}: invalid or missing direction '${signal.direction}'`);
               continue;
             }

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

      // 3. Pass StrategyMarketContext to engine for true multi-timeframe strategy isolation
      await this.engine.processStrategyMarketContext('XAUUSD', globalContext, activeStrategyIds);
      
      // C-03: Update lastScannedPrice and lastScannedCandleBlock ONLY after pipeline completes successfully!
      this.lastScannedPrice = currentPrice;
      this.lastScannedCandleBlock = currentCandleBlock;
      this.lastScanTime = Date.now();
      serviceStatus = 'ONLINE';
      statusMessage = `Scan completed successfully (${activeStrategyIds.length} strategies evaluated)`;
      return true;

    } catch (error: any) {
      if (error.message?.includes('not configured')) {
        serviceStatus = 'NOT CONFIGURED';
        statusMessage = `Market scan skipped: ${error.message}`;
        logger.warn(statusMessage);
      } else if (error.message?.includes('DATA_VALIDATION_ERROR')) {
        serviceStatus = 'DEGRADED';
        statusMessage = `Pipeline stopped by Data Validation Layer: ${error.message}`;
        logger.error(statusMessage);
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
        serviceStatus = 'RUNTIME_ERROR';
        statusMessage = `Market scan failed: ${error.message}`;
        errorTracker.trackError({
          component: 'MarketScanner',
          error: error,
          severity: 'high'
        });
        logger.error(statusMessage);
      }
      return false;
    } finally {
      this.isScanning = false;
      const duration = Date.now() - startTime;
      // C-04: Accurately report real health status instead of unconditionally marking ONLINE
      healthCheckEngine.updateServiceHealth('MarketScanner', serviceStatus, duration, statusMessage);
      metricsEngine.recordScannerDuration(duration);
      await getQueueManager().releaseLock('market_scan_xauusd');
    }
  }
}

// Singleton for app-wide usage if needed
export function getMarketScanner(): MarketScanner {
  if (!(globalThis as any).__marketScanner) {
    (globalThis as any).__marketScanner = new MarketScanner();
  }
  return (globalThis as any).__marketScanner;
}
