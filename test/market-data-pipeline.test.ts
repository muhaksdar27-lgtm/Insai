import { describe, it, expect, beforeEach } from 'vitest';
import { toCanonicalSymbol, toProviderSymbol, CANONICAL_XAUUSD } from '../lib/market-data/canonical-symbol';
import { getCandleProcessor, CandleProcessor } from '../lib/market-data/candle-processor';
import { SessionEngine } from '../lib/market-data/session-engine';
import { MarketCalendar } from '../lib/market-data/market-calendar';
import { HTFTrendAnalyzer } from '../lib/trading-engine/htf-trend-analyzer';
import { DataValidator } from '../lib/market-data/data-validator';
import { Candle } from '../types';

describe('Market Data Pipeline - Prompt 2 Specification', () => {

  describe('1. Canonical Symbol Layer', () => {
    it('normalizes all variants of Gold to XAUUSD', () => {
      const variants = [
        'XAUUSD', 'xauusd', 'XAU/USD', 'xau/usd', 'XAU-USD', 'xau_usd',
        'GOLD', 'gold', 'GC=F', 'gc=f', 'GC', 'PAXGUSDT', 'paxgusdt',
        'C:XAUUSD', 'FOREX:XAUUSD', 'SPOT:XAUUSD'
      ];
      for (const v of variants) {
        expect(toCanonicalSymbol(v)).toBe(CANONICAL_XAUUSD);
      }
    });

    it('maps canonical XAUUSD to exact provider formats', () => {
      expect(toProviderSymbol('XAUUSD', 'TwelveData')).toBe('XAU/USD');
      expect(toProviderSymbol('XAUUSD', 'YahooFinance')).toBe('GC=F');
      expect(toProviderSymbol('XAUUSD', 'Binance')).toBe('PAXGUSDT');
      expect(toProviderSymbol('XAUUSD', 'Polygon')).toBe('C:XAUUSD');
    });

    it('maps macro indices to appropriate providers', () => {
      expect(toCanonicalSymbol('DX-Y.NYB')).toBe('DXY');
      expect(toCanonicalSymbol('^TNX')).toBe('US10Y');
      expect(toProviderSymbol('DXY', 'YahooFinance')).toBe('DX-Y.NYB');
      expect(toProviderSymbol('US10Y', 'YahooFinance')).toBe('^TNX');
    });
  });

  describe('2. Candle Processor & Event Classification', () => {
    let processor: CandleProcessor;

    beforeEach(() => {
      processor = new CandleProcessor();
      processor.reset();
    });

    it('classifies first candle as NEW_CANDLE', () => {
      const candle: Candle = {
        timestamp: '2025-02-20T10:00:00.000Z',
        open: 2700,
        high: 2705,
        low: 2695,
        close: 2702,
        volume: 100
      };

      const result = processor.processCandle('XAU/USD', 'M15', candle);
      expect(result.type).toBe('NEW_CANDLE');
      expect(result.symbol).toBe('XAUUSD');
      expect(result.timeframe).toBe('M15');
      expect(result.isActionable).toBe(true);
    });

    it('classifies subsequent higher timestamp as NEW_CANDLE', () => {
      const candle1: Candle = {
        timestamp: '2025-02-20T10:00:00.000Z',
        open: 2700, high: 2705, low: 2695, close: 2702, volume: 100
      };
      const candle2: Candle = {
        timestamp: '2025-02-20T10:15:00.000Z',
        open: 2702, high: 2710, low: 2701, close: 2708, volume: 120
      };

      processor.processCandle('XAUUSD', 'M15', candle1);
      const result = processor.processCandle('XAUUSD', 'M15', candle2);

      expect(result.type).toBe('NEW_CANDLE');
      expect(result.isActionable).toBe(true);
      expect(result.previousCandle?.close).toBe(2702);
    });

    it('classifies same timestamp and identical OHLCV as UNCHANGED_CANDLE', () => {
      const candle: Candle = {
        timestamp: '2025-02-20T10:00:00.000Z',
        open: 2700, high: 2705, low: 2695, close: 2702, volume: 100
      };

      processor.processCandle('XAUUSD', 'M15', candle);
      const result = processor.processCandle('XAUUSD', 'M15', candle);

      expect(result.type).toBe('UNCHANGED_CANDLE');
      expect(result.isActionable).toBe(false);
    });

    it('classifies same timestamp with modified close as UPDATED_CANDLE', () => {
      const candle1: Candle = {
        timestamp: '2025-02-20T10:00:00.000Z',
        open: 2700, high: 2705, low: 2695, close: 2702, volume: 100
      };
      const candle2: Candle = {
        timestamp: '2025-02-20T10:00:00.000Z',
        open: 2700, high: 2708, low: 2695, close: 2707, volume: 150
      };

      processor.processCandle('XAUUSD', 'M15', candle1);
      const result = processor.processCandle('XAUUSD', 'M15', candle2);

      expect(result.type).toBe('UPDATED_CANDLE');
      expect(result.isActionable).toBe(true);
      expect(result.previousCandle?.close).toBe(2702);
      expect(result.candle.close).toBe(2707);
    });

    it('rejects invalid candles with high < low as INVALID_CANDLE', () => {
      const invalidCandle: Candle = {
        timestamp: '2025-02-20T10:00:00.000Z',
        open: 2700, high: 2690, low: 2710, close: 2702, volume: 100
      };

      const result = processor.processCandle('XAUUSD', 'M15', invalidCandle);
      expect(result.type).toBe('INVALID_CANDLE');
      expect(result.isActionable).toBe(false);
    });
  });

  describe('3. Session Engine & Single Source of Truth', () => {
    it('detects Asian session (00:00 - 08:00 UTC)', () => {
      const date = new Date('2025-02-19T03:30:00.000Z'); // Wednesday 03:30 UTC
      const info = SessionEngine.getSessionInfo(date);

      expect(info.isOpen).toBe(true);
      expect(info.isAsian).toBe(true);
      expect(info.isLondon).toBe(false);
      expect(info.primarySession).toBe('Asian');
      expect(info.isAsianKillzone).toBe(true);
    });

    it('detects London session & London Open Killzone (07:00 - 10:00 UTC)', () => {
      const date = new Date('2025-02-19T08:15:00.000Z'); // Wednesday 08:15 UTC
      const info = SessionEngine.getSessionInfo(date);

      expect(info.isOpen).toBe(true);
      expect(info.isLondon).toBe(true);
      expect(info.isLondonKillzone).toBe(true);
      expect(info.primarySession).toBe('London');
    });

    it('detects London / New York Overlap (12:00 - 16:00 UTC)', () => {
      const date = new Date('2025-02-19T13:30:00.000Z'); // Wednesday 13:30 UTC
      const info = SessionEngine.getSessionInfo(date);

      expect(info.isOpen).toBe(true);
      expect(info.isOverlap).toBe(true);
      expect(info.isLondon).toBe(true);
      expect(info.isNewYork).toBe(true);
      expect(info.isNYKillzone).toBe(true);
      expect(info.primarySession).toBe('London/NY Overlap');
    });

    it('detects Weekend Market Closure (Saturday and Sunday pre-22:00 UTC)', () => {
      const sat = new Date('2025-02-22T14:00:00.000Z'); // Saturday
      const satInfo = SessionEngine.getSessionInfo(sat);
      expect(satInfo.isOpen).toBe(false);
      expect(satInfo.primarySession).toBe('Market Closed');

      const sun = new Date('2025-02-23T15:00:00.000Z'); // Sunday 15:00 UTC
      const sunInfo = SessionEngine.getSessionInfo(sun);
      expect(sunInfo.isOpen).toBe(false);
      expect(sunInfo.primarySession).toBe('Market Closed');
    });
  });

  describe('4. HTF Trend Analyzer', () => {
    it('returns INSUFFICIENT_DATA when candle count < 15', () => {
      const candles: Candle[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.now() - (10 - i) * 3600000).toISOString(),
        open: 2700 + i, high: 2705 + i, low: 2695 + i, close: 2702 + i, volume: 100
      }));

      const result = HTFTrendAnalyzer.analyzeTrend(candles, 'H1');
      expect(result.direction).toBe('INSUFFICIENT_DATA');
      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(result.confidence).toBe(0);
    });

    it('detects BULLISH trend on consistently rising candles with higher highs and higher lows', () => {
      const candles: Candle[] = [];
      let base = 2650;
      for (let i = 0; i < 30; i++) {
        base += 2.5;
        candles.push({
          timestamp: new Date(Date.now() - (30 - i) * 3600000).toISOString(),
          open: base,
          high: base + 4,
          low: base - 1,
          close: base + 3,
          volume: 500
        });
      }

      const result = HTFTrendAnalyzer.analyzeTrend(candles, 'H1');
      expect(result.direction).toBe('BULLISH');
      expect(result.status).toBe('VALID');
      expect(result.confidence).toBeGreaterThanOrEqual(0.65);
      expect(result.evidence.ema20).toBeGreaterThan(result.evidence.ema50);
      expect(result.evidence.priceVsEma).toBe('ABOVE');
    });

    it('detects BEARISH trend on consistently declining candles with lower highs and lower lows', () => {
      const candles: Candle[] = [];
      let base = 2750;
      for (let i = 0; i < 30; i++) {
        base -= 2.5;
        candles.push({
          timestamp: new Date(Date.now() - (30 - i) * 3600000).toISOString(),
          open: base,
          high: base + 1,
          low: base - 4,
          close: base - 3,
          volume: 500
        });
      }

      const result = HTFTrendAnalyzer.analyzeTrend(candles, 'H1');
      expect(result.direction).toBe('BEARISH');
      expect(result.status).toBe('VALID');
      expect(result.confidence).toBeGreaterThanOrEqual(0.65);
      expect(result.evidence.ema20).toBeLessThan(result.evidence.ema50);
      expect(result.evidence.priceVsEma).toBe('BELOW');
    });
  });

  describe('5. Data Validator & Feed Integrity', () => {
    const validator = new DataValidator();

    it('validates correct series of candles', () => {
      const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(1700000000000 + i * 900000).toISOString(), // M15 steps
        open: 2700, high: 2705, low: 2695, close: 2702, volume: 100
      }));

      const res = validator.validateCandles(candles, 'XAUUSD', 'M15');
      expect(res.isValid).toBe(true);
    });

    it('detects high < low violations', () => {
      const candles: Candle[] = [
        { timestamp: new Date(1700000000000).toISOString(), open: 2700, high: 2690, low: 2710, close: 2702, volume: 100 }
      ];
      const res = validator.validateCandles(candles, 'XAUUSD', 'M15');
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('High < Low');
    });

    it('validates spread tolerances', () => {
      expect(validator.validateSpread(2700.00, 2700.50, 2.0).isValid).toBe(true);
      expect(validator.validateSpread(2700.00, 2703.50, 2.0).isValid).toBe(false);
      expect(validator.validateSpread(2701.00, 2700.00, 2.0).isValid).toBe(false);
    });
  });

  describe('6. MarketCalendar Hard Blocks', () => {
    it('blocks market scans during weekend close', () => {
      const weekendContext = {
        timestamp: '2025-02-22T12:00:00.000Z', // Saturday
        price: { price: 2700, timestamp: '2025-02-22T12:00:00.000Z', freshness: 'closed' }
      };

      const status = MarketCalendar.getMarketStatus('XAUUSD', weekendContext);
      expect(status.isOpen).toBe(false);
      expect(status.isHardBlocked).toBe(true);
      expect(status.session).toBe('Market Closed');
    });
  });
});
