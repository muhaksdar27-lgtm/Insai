import { Candle, NewsEvent, CalendarEvent } from '@/types';

export type TimeframeId = 'D1' | 'H4' | 'H1' | 'M15' | 'M5' | 'M1';

export interface TimeframeContext {
  timeframe: TimeframeId;
  candles: Candle[];
  timestamp: string;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  freshness: 'live' | 'cached' | 'stale' | 'closed';
  sourceProvider: string;
  completeness: boolean; // true if minimum required candle count is met
  candleCount: number;
  ageMs: number;
}

export interface StrategyMarketContext {
  symbol: string;
  currentPrice: number;
  currentTimestamp: string;
  session: string;
  D1?: TimeframeContext;
  H4?: TimeframeContext;
  H1?: TimeframeContext;
  M15?: TimeframeContext;
  M5?: TimeframeContext;
  M1?: TimeframeContext;
  spread: {
    spreadPips: number;
    isAcceptable: boolean;
    timestamp: string;
  };
  news: {
    activeEvents: NewsEvent[];
    calendarEvents: CalendarEvent[];
    hasHighImpactNewsActive: boolean;
    minutesToNextHighImpact: number | null;
  };
  provider: string;
  dataFreshness: 'live' | 'cached' | 'stale' | 'closed';
  correlationId?: string;
  correlations?: {
    dxy?: any;
    us10y?: any;
    cotData?: any;
  };
}

export interface StrategyTimeframeRequirement {
  bias: TimeframeId[];
  context?: TimeframeId[];
  setup: TimeframeId[];
  trigger: TimeframeId[];
  execution: TimeframeId[];
}

export const CANONICAL_STRATEGY_TIMEFRAME_MAP: Record<string, StrategyTimeframeRequirement> = {
  'strategy-1-smc': {
    bias: ['H1'],
    context: ['M15'],
    setup: ['M15'],
    trigger: ['M15'],
    execution: ['M15']
  },
  'strategy-2-snd': {
    bias: ['D1', 'H4', 'H1'],
    context: ['H1', 'M15'],
    setup: ['M15', 'M5'],
    trigger: ['M15', 'M5'],
    execution: ['M15', 'M5']
  },
  'strategy-3-scalping': {
    bias: ['H1'],
    context: ['M15'],
    setup: ['M5', 'M1'],
    trigger: ['M1'],
    execution: ['M1']
  },
  'strategy-4-news': {
    bias: ['M15'],
    context: ['M5'],
    setup: ['M5'],
    trigger: ['M1'],
    execution: ['M1']
  },
  'strategy-5-smc-sd-confluence': {
    bias: ['H1'],
    context: ['M15'],
    setup: ['M15', 'M5'],
    trigger: ['M5', 'M1'],
    execution: ['M5', 'M1']
  }
};
