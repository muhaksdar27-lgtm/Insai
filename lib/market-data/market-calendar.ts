import { MarketSnapshot } from '@/types';
import { logger } from '../utils/logger';

export interface MarketCalendarStatus {
  isOpen: boolean;
  isFresh: boolean;
  isHealthy: boolean;
  isHardBlocked: boolean;
  blockReason: string | null;
  session: string;
  utcTime: string;
}

export class MarketCalendar {
  /**
   * Evaluates if XAUUSD/Forex market is open, fresh, and healthy.
   * Enforces hard blocks for market closed, stale data, and provider failures.
   */
  public static getMarketStatus(symbol: string = 'XAUUSD', marketContext?: any): MarketCalendarStatus {
    const now = new Date();
    const utcDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const utcHour = now.getUTCHours();
    const utcTimeStr = now.toISOString();

    let isOpen = true;
    let blockReason: string | null = null;

    // 1. Weekend Check (Gold/Forex market closes Friday 22:00 UTC and opens Sunday 22:00 UTC)
    if (utcDay === 6) { // Saturday
      isOpen = false;
      blockReason = 'Forex/XAUUSD market is closed (Saturday)';
    } else if (utcDay === 5 && utcHour >= 22) { // Friday after 22:00 UTC
      isOpen = false;
      blockReason = 'Forex/XAUUSD market is closed (Friday weekend close)';
    } else if (utcDay === 0 && utcHour < 22) { // Sunday before 22:00 UTC
      isOpen = false;
      blockReason = 'Forex/XAUUSD market is closed (Sunday pre-open)';
    } else if (utcDay >= 1 && utcDay <= 4 && utcHour === 22) { // Daily maintenance break (22:00 - 23:00 UTC)
      isOpen = false;
      blockReason = 'Forex/XAUUSD daily market maintenance break (22:00-23:00 UTC)';
    }

    // Determine Active Trading Session
    let session = 'Off-Session';
    if (isOpen) {
      if (utcHour >= 7 && utcHour < 12) session = 'London';
      else if (utcHour >= 12 && utcHour < 16) session = 'London/NY Overlap';
      else if (utcHour >= 16 && utcHour < 21) session = 'New York';
      else if (utcHour >= 21 || utcHour < 7) session = 'Asian';
    } else {
      session = 'Market Closed';
    }

    // 2. Data Freshness Check
    let isFresh = true;
    const priceSnapshot: MarketSnapshot | undefined = marketContext?.price;
    if (priceSnapshot) {
      const snapTime = priceSnapshot.timestamp ? new Date(priceSnapshot.timestamp).getTime() : 0;
      const ageMs = Date.now() - snapTime;
      // Stale if older than 30 seconds or explicitly marked as stale
      if (priceSnapshot.freshness === 'stale' || (snapTime > 0 && ageMs > 30000)) {
        isFresh = false;
        if (!blockReason) {
          blockReason = `Market price data for ${symbol} is stale (${Math.round(ageMs / 1000)}s old)`;
        }
      }
    }

    // 3. Data Feed & Provider Health Check
    let isHealthy = true;
    if (marketContext?.health) {
      const healthObj = marketContext.health;
      if (healthObj['TwelveData']?.healthStatus === 'UNAVAILABLE' && healthObj['YahooFinance']?.healthStatus === 'UNAVAILABLE') {
        isHealthy = false;
        if (!blockReason) {
          blockReason = 'All market price data providers are unavailable';
        }
      }
    }

    const isHardBlocked = !isOpen || !isFresh || !isHealthy;

    if (isHardBlocked && blockReason) {
      logger.warn(`[MARKET_HARD_BLOCK] Symbol: ${symbol} | Reason: ${blockReason}`);
    }

    return {
      isOpen,
      isFresh,
      isHealthy,
      isHardBlocked,
      blockReason,
      session,
      utcTime: utcTimeStr
    };
  }
}
