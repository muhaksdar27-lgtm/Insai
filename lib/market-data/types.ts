import { Candle, MarketSnapshot, NewsEvent, CalendarEvent, ProviderStatus } from '@/types';

export interface PriceProvider {
  name: string;
  supportsSymbol?(symbol: string): boolean;
  getLatestPrice(symbol: string): Promise<MarketSnapshot>;
  getCandles(symbol: string, timeframe: string, limit?: number): Promise<Candle[] & ProviderStatus>;
}

export interface NewsProvider {
  name: string;
  getLatestNews(): Promise<NewsEvent[] & ProviderStatus>;
}

export interface CalendarProvider {
  name: string;
  getCalendarEvents(): Promise<CalendarEvent[] & ProviderStatus>;
}
