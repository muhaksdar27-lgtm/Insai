import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarketScanner } from '../lib/trading-engine/scanner';
import { getQueueManager } from '../lib/redis/queue';
import { getDatabaseClient } from '../lib/db/client';
import { getMarketDataService } from '../lib/market-data/market-data-service';
import { StrategyContextBuilder } from '../lib/trading-engine/strategy-context-builder';
import { healthCheckEngine } from '../lib/observability/health-check';

describe('MarketScanner Deep Audit & Remediation Tests (C-01 to C-07)', () => {
  let scanner: MarketScanner;

  beforeEach(() => {
    vi.restoreAllMocks();
    scanner = new MarketScanner();
  });

  afterEach(() => {
    scanner.stop();
    vi.restoreAllMocks();
  });

  describe('C-01 & C-02: Overlapping Scan & Distributed Lock Protection', () => {
    it('C-01: prevents overlapping scans even when force=true if isScanning is already true', async () => {
      const queueManager = getQueueManager();
      const acquireLockSpy = vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);

      // Simulate an active scan in progress by setting internal isScanning
      (scanner as any).isScanning = true;

      const result = await scanner.scan(true);

      expect(result).toBe(false);
      // Lock should not even be requested because isScanning was already true
      expect(acquireLockSpy).not.toHaveBeenCalled();
    });

    it('C-01: halts scan and does not proceed if distributed lock cannot be acquired, even if force=true', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(false);

      const result = await scanner.scan(true);

      expect(result).toBe(false);
      expect((scanner as any).isScanning).toBe(false);
    });

    it('C-02: uses a safe 60s TTL for distributed lock instead of 10s', async () => {
      const queueManager = getQueueManager();
      const acquireSpy = vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(false);

      await scanner.scan(false);

      expect(acquireSpy).toHaveBeenCalledWith('market_scan_xauusd', 60);
    });
  });

  describe('C-03: lastScannedPrice and lastScannedCandleBlock Integrity', () => {
    it('C-03: does NOT update lastScannedPrice or lastScannedCandleBlock if pipeline throws an error', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true, status: 'active' } as any
      ]);

      const marketDataService = getMarketDataService();
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2750.50,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      // Pipeline fails during context building
      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockRejectedValue(
        new Error('Network error fetching candles')
      );

      const result = await scanner.scan(true);

      expect(result).toBe(false);
      // Price and candle block must NOT be updated
      expect((scanner as any).lastScannedPrice).toBe(0);
      expect((scanner as any).lastScannedCandleBlock).toBe(0);
    });

    it('C-03: updates lastScannedPrice and lastScannedCandleBlock only upon successful pipeline completion', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true, status: 'active' } as any
      ]);
      vi.spyOn(dbClient, 'getActiveSignals').mockResolvedValue([]);

      const marketDataService = getMarketDataService();
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2750.50,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockResolvedValue({
        currentPrice: 2750.50,
        provider: 'twelvedata',
        dataFreshness: 1000,
        currentTimestamp: new Date().toISOString(),
        M15: { candles: [{ open: 2748, high: 2752, low: 2747, close: 2750.50, timestamp: new Date().toISOString(), volume: 100 }] }
      } as any);

      vi.spyOn((scanner as any).engine, 'processStrategyMarketContext').mockResolvedValue(undefined);

      const result = await scanner.scan(true);

      expect(result).toBe(true);
      expect((scanner as any).lastScannedPrice).toBe(2750.50);
      expect((scanner as any).lastScannedCandleBlock).toBeGreaterThan(0);
    });
  });

  describe('C-04: Accurate Health Reporting on Failures', () => {
    it('C-04: accurately reports RUNTIME_ERROR status instead of masking with ONLINE on scan exception', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const healthSpy = vi.spyOn(healthCheckEngine, 'updateServiceHealth');

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true, status: 'active' } as any
      ]);

      const marketDataService = getMarketDataService();
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2750.50,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockRejectedValue(
        new Error('Unexpected DB fatal error')
      );

      await scanner.scan(true);

      // Verify health was updated to RUNTIME_ERROR, NOT ONLINE
      const lastHealthCall = healthSpy.mock.calls[healthSpy.mock.calls.length - 1];
      expect(lastHealthCall[0]).toBe('MarketScanner');
      expect(lastHealthCall[1]).toBe('RUNTIME_ERROR');
      expect(lastHealthCall[3]).toContain('Market scan failed: Unexpected DB fatal error');
    });

    it('C-04: accurately reports DEGRADED status when DATA_VALIDATION_ERROR occurs', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const healthSpy = vi.spyOn(healthCheckEngine, 'updateServiceHealth');

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true, status: 'active' } as any
      ]);

      const marketDataService = getMarketDataService();
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2750.50,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockRejectedValue(
        new Error('DATA_VALIDATION_ERROR: Candle timestamps stale')
      );

      await scanner.scan(true);

      const lastHealthCall = healthSpy.mock.calls[healthSpy.mock.calls.length - 1];
      expect(lastHealthCall[0]).toBe('MarketScanner');
      expect(lastHealthCall[1]).toBe('DEGRADED');
      expect(lastHealthCall[3]).toContain('Pipeline stopped by Data Validation Layer');
    });
  });

  describe('C-05: Strategy Isolation & Disabling Without Silent Fallback', () => {
    it('C-05: skips scan and does NOT silently activate default strategies when all database strategies are disabled', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      // User disabled all 5 strategies in DB
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: false },
        { id: 'strategy-2-snd', name: 'SND', enabled: false },
        { id: 'strategy-3-scalping', name: 'Scalping', enabled: false },
        { id: 'strategy-4-news', name: 'News', enabled: false },
        { id: 'strategy-5-smc-sd-confluence', name: 'Confluence', enabled: false }
      ] as any);

      const engineSpy = vi.spyOn((scanner as any).engine, 'processStrategyMarketContext');

      const result = await scanner.scan(true);

      expect(result).toBe(false);
      // Engine must never be invoked
      expect(engineSpy).not.toHaveBeenCalled();
    });

    it('C-05: skips scan and does NOT silently activate default strategies when database returns empty array', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([]);

      const engineSpy = vi.spyOn((scanner as any).engine, 'processStrategyMarketContext');

      const result = await scanner.scan(true);

      expect(result).toBe(false);
      expect(engineSpy).not.toHaveBeenCalled();
    });

    it('C-05: executes only explicitly enabled strategies', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true },
        { id: 'strategy-2-snd', name: 'SND', enabled: false },
        { id: 'strategy-3-scalping', name: 'Scalping', enabled: true }
      ] as any);
      vi.spyOn(dbClient, 'getActiveSignals').mockResolvedValue([]);

      const marketDataService = getMarketDataService();
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2750.50,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockResolvedValue({
        currentPrice: 2750.50,
        provider: 'twelvedata',
        dataFreshness: 1000,
        currentTimestamp: new Date().toISOString(),
        M15: { candles: [{ open: 2748, high: 2752, low: 2747, close: 2750.50, timestamp: new Date().toISOString(), volume: 100 }] }
      } as any);

      const engineSpy = vi.spyOn((scanner as any).engine, 'processStrategyMarketContext').mockResolvedValue(undefined);

      await scanner.scan(true);

      expect(engineSpy).toHaveBeenCalledWith('XAUUSD', expect.anything(), ['strategy-1-smc', 'strategy-3-scalping']);
    });
  });

  describe('C-06 & C-07: Safe Active Signal Monitoring for SL/TP Hits', () => {
    it('C-06: skips active signals with missing or invalid direction without defaulting to BUY', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true } as any
      ]);

      // Active signal with invalid/empty direction
      const malformedSignal = {
        signal_key: 'sig_malformed_1',
        symbol: 'XAUUSD',
        status: 'ACTIVE',
        direction: '', // empty direction
        entry_price: '2750.00',
        sl_price: '2745.00',
        tp1_price: '2760.00'
      };

      vi.spyOn(dbClient, 'getActiveSignals').mockResolvedValue([malformedSignal as any]);
      const archiveSpy = vi.spyOn(dbClient, 'archiveToHistory').mockResolvedValue({} as any);

      const marketDataService = getMarketDataService();
      // Price drops to 2740 (which would hit SL if defaulted to BUY)
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2740.00,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockResolvedValue({
        currentPrice: 2740.00,
        provider: 'twelvedata',
        dataFreshness: 1000,
        currentTimestamp: new Date().toISOString(),
        M15: { candles: [{ open: 2745, high: 2745, low: 2739, close: 2740, timestamp: new Date().toISOString(), volume: 100 }] }
      } as any);

      vi.spyOn((scanner as any).engine, 'processStrategyMarketContext').mockResolvedValue(undefined);

      await scanner.scan(true);

      // archiveToHistory must NOT be called for the malformed signal!
      expect(archiveSpy).not.toHaveBeenCalled();
    });

    it('C-07: strictly skips PENDING signals from SL/TP hit monitoring', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true } as any
      ]);

      // Signal has status PENDING (not yet approved/executed)
      const pendingSignal = {
        signal_key: 'sig_pending_1',
        symbol: 'XAUUSD',
        status: 'PENDING',
        direction: 'BUY',
        entry_price: '2750.00',
        sl_price: '2745.00',
        tp1_price: '2760.00'
      };

      vi.spyOn(dbClient, 'getActiveSignals').mockResolvedValue([pendingSignal as any]);
      const archiveSpy = vi.spyOn(dbClient, 'archiveToHistory').mockResolvedValue({} as any);

      const marketDataService = getMarketDataService();
      // Price is 2740.00, below SL
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2740.00,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockResolvedValue({
        currentPrice: 2740.00,
        provider: 'twelvedata',
        dataFreshness: 1000,
        currentTimestamp: new Date().toISOString(),
        M15: { candles: [{ open: 2745, high: 2745, low: 2739, close: 2740, timestamp: new Date().toISOString(), volume: 100 }] }
      } as any);

      vi.spyOn((scanner as any).engine, 'processStrategyMarketContext').mockResolvedValue(undefined);

      await scanner.scan(true);

      // PENDING signal must NEVER be archived as WIN or LOSS
      expect(archiveSpy).not.toHaveBeenCalled();
    });

    it('C-07: evaluates approved and active executable signals properly', async () => {
      const queueManager = getQueueManager();
      vi.spyOn(queueManager, 'acquireLock').mockResolvedValue(true);
      vi.spyOn(queueManager, 'releaseLock').mockResolvedValue(undefined);
      vi.spyOn(queueManager, 'getCache').mockResolvedValue(null);
      const publishSpy = vi.spyOn(queueManager, 'publish').mockResolvedValue(true);

      const dbClient = getDatabaseClient();
      vi.spyOn(dbClient, 'getStrategies').mockResolvedValue([
        { id: 'strategy-1-smc', name: 'SMC', enabled: true } as any
      ]);

      const approvedSignal = {
        signal_key: 'sig_approved_1',
        symbol: 'XAUUSD',
        status: 'APPROVED',
        direction: 'BUY',
        entry_price: '2750.00',
        sl_price: '2745.00',
        tp1_price: '2760.00'
      };

      vi.spyOn(dbClient, 'getActiveSignals').mockResolvedValue([approvedSignal as any]);
      const archiveSpy = vi.spyOn(dbClient, 'archiveToHistory').mockResolvedValue({} as any);

      const marketDataService = getMarketDataService();
      // Price hit TP at 2765.00
      vi.spyOn(marketDataService, 'getLatestPrice').mockResolvedValue({
        price: 2765.00,
        provider: 'twelvedata',
        timestamp: new Date().toISOString()
      } as any);

      vi.spyOn(StrategyContextBuilder, 'buildGlobalMarketContext').mockResolvedValue({
        currentPrice: 2765.00,
        provider: 'twelvedata',
        dataFreshness: 1000,
        currentTimestamp: new Date().toISOString(),
        M15: { candles: [{ open: 2750, high: 2766, low: 2749, close: 2765, timestamp: new Date().toISOString(), volume: 100 }] }
      } as any);

      vi.spyOn((scanner as any).engine, 'processStrategyMarketContext').mockResolvedValue(undefined);

      await scanner.scan(true);

      // Approved signal should be closed as TAKE_PROFIT
      expect(archiveSpy).toHaveBeenCalledWith('sig_approved_1', 'TAKE_PROFIT', expect.any(Number), 'WIN');
      expect(publishSpy).toHaveBeenCalledWith('events', {
        type: 'SIGNAL_CLOSED',
        signalKey: 'sig_approved_1',
        reason: 'TAKE_PROFIT'
      });
    });
  });
});
