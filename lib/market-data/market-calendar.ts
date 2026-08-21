import { MarketSnapshot } from '@/types';
import { SessionEngine, SessionDetails } from './session-engine';
import { toCanonicalSymbol } from './canonical-symbol';

export interface MarketCalendarStatus {
  isOpen: boolean;
  isFresh: boolean;
  isHealthy: boolean;
  isHardBlocked: boolean;
  blockReason: string | null;
  session: string;
  sessionDetails: SessionDetails;
  utcTime: string;
}

export class MarketCalendar {
  /**
   * Evaluates if XAUUSD/Forex market is open, fresh, and healthy.
   * Enforces hard blocks for market closed, stale data, and provider failures.
   */
  public static getMarketStatus(symbol: string = 'XAUUSD', marketContext?: any): MarketCalendarStatus {
    const canonical = toCanonicalSymbol(symbol);
    const sessionDetails = SessionEngine.getSessionInfo(marketContext?.timestamp);
    
    let isOpen = sessionDetails.isOpen;
    let blockReason: string | null = sessionDetails.blockReason;

    // 2. Data Freshness Check
    let isFresh = true;
    const priceSnapshot: MarketSnapshot | undefined = marketContext?.price;
    if (priceSnapshot) {
      const snapTime = priceSnapshot.timestamp ? new Date(priceSnapshot.timestamp).getTime() : 0;
      const ageMs = Date.now() - snapTime;
      // Stale threshold: 60s for XAUUSD, 300s for correlations/others
      const staleThresholdMs = canonical === 'XAUUSD' ? 60000 : 300000;
      if (snapTime > 0 && ageMs > staleThresholdMs) {
        isFresh = false;
        if (!blockReason) {
          blockReason = `Market price data for ${canonical} is stale (${Math.round(ageMs / 1000)}s old)`;
        }
      } else if (priceSnapshot.freshness === 'stale' && ageMs > 60000) {
        isFresh = false;
        if (!blockReason) {
          blockReason = `Market price data for ${canonical} is stale (${Math.round(ageMs / 1000)}s old)`;
        }
      }
    }

    // 3. Data Feed & Provider Health Check
    let isHealthy = true;
    if (marketContext?.health) {
      const healthObj = marketContext.health;
      if (
        healthObj['TwelveData']?.healthStatus === 'UNAVAILABLE' &&
        healthObj['YahooFinance']?.healthStatus === 'UNAVAILABLE' &&
        healthObj['Binance']?.healthStatus === 'UNAVAILABLE'
      ) {
        isHealthy = false;
        if (!blockReason) {
          blockReason = 'All market price data providers are unavailable';
        }
      }
    }

    // Only hard-block scan execution if providers are completely down and no valid price/candles are available
    const hasValidPrice = !!marketContext?.price?.price && marketContext.price.price > 0;
    const isHardBlocked = (!isHealthy && !hasValidPrice) || !isOpen;

    return {
      isOpen,
      isFresh,
      isHealthy,
      isHardBlocked,
      blockReason,
      session: sessionDetails.primarySession,
      sessionDetails,
      utcTime: sessionDetails.utcTime
    };
  }
}
