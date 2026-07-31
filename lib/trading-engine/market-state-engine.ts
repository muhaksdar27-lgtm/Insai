import { RuleEvaluationContext } from '@/types';
import { getAllStrategies } from './strategy-registry';

export enum MarketState {
  TRENDING = 'TRENDING',
  RANGING = 'RANGING',
  EXPANSION = 'EXPANSION',
  COMPRESSION = 'COMPRESSION',
  HIGH_VOLATILITY = 'HIGH_VOLATILITY',
  LOW_VOLATILITY = 'LOW_VOLATILITY',
  NEWS_MODE = 'NEWS_MODE',
  SESSION_TRANSITION = 'SESSION_TRANSITION',
  LIQUIDITY_HUNT = 'LIQUIDITY_HUNT'
}

export class MarketStateEngine {

  constructor() {}

  public classifyState(context: RuleEvaluationContext): MarketState[] {
    const states: MarketState[] = [];
    const candles = context.candles || context.marketData?.candles || [];
    const timestamp = context.timestamp || Date.now();
    const currentHour = new Date(timestamp).getUTCHours();

    // 1. Session classification
    const isLondon = currentHour >= 7 && currentHour < 16;
    const isNewYork = currentHour >= 12 && currentHour < 21;
    const isOverlap = isLondon && isNewYork;

    if (isOverlap || currentHour === 7 || currentHour === 12) {
      states.push(MarketState.SESSION_TRANSITION);
    }

    // 2. High impact news detection
    const calendarEvents = context.marketData?.calendar || [];
    const nowTime = new Date(timestamp).getTime();
    let isNewsActive = false;
    for (const evt of calendarEvents) {
      if (evt.impact === 'high' && (evt.country === 'USD' || evt.currency === 'USD')) {
        const evtTime = new Date(evt.time || evt.timestamp || nowTime).getTime();
        const diffMins = Math.abs(evtTime - nowTime) / (1000 * 60);
        if (diffMins <= 30) {
          isNewsActive = true;
          break;
        }
      }
    }

    if (isNewsActive) {
      states.push(MarketState.NEWS_MODE);
      states.push(MarketState.HIGH_VOLATILITY);
    }

    // 3. Candle Volatility & Trend Analysis
    if (candles.length >= 10) {
      const recentCandles = candles.slice(-10);
      const closes = recentCandles.map((c: any) => c.close);
      const highs = recentCandles.map((c: any) => c.high);
      const lows = recentCandles.map((c: any) => c.low);

      const atr = context.indicators?.atr || context.marketData?.atr || (highs[highs.length - 1] - lows[lows.length - 1]) || 4.0;
      const priceRange = Math.max(...highs) - Math.min(...lows);

      if (atr > 6.0 || priceRange > 12.0) {
        if (!states.includes(MarketState.HIGH_VOLATILITY)) states.push(MarketState.HIGH_VOLATILITY);
        states.push(MarketState.EXPANSION);
      } else if (atr < 3.0 || priceRange < 4.0) {
        states.push(MarketState.LOW_VOLATILITY);
        states.push(MarketState.COMPRESSION);
      }

      const netMove = closes[closes.length - 1] - closes[0];
      if (Math.abs(netMove) > priceRange * 0.5) {
        states.push(MarketState.TRENDING);
      } else {
        states.push(MarketState.RANGING);
      }
    } else {
      states.push(MarketState.TRENDING);
      states.push(MarketState.HIGH_VOLATILITY);
    }

    // Default fallback if empty
    if (states.length === 0) {
      states.push(MarketState.TRENDING, MarketState.HIGH_VOLATILITY);
    }

    return states;
  }

  public getRelevantStrategies(states: MarketState[]): { active: string[], inactive: { id: string, reason: string }[] } {
    const allStrategies = getAllStrategies().sort((a, b) => b.priority - a.priority);
    const active: string[] = [];
    const inactive: { id: string, reason: string }[] = [];

    for (const strat of allStrategies) {
        if (strat.isRelevantForStates(states)) {
            active.push(strat.id);
        } else {
            inactive.push({ id: strat.id, reason: 'Market conditions not suitable (State mismatch)' });
        }
    }

    // Fallback: if no specific state maps well, run highest priority ones
    if (active.length === 0) {
        if (states.includes(MarketState.TRENDING)) {
            active.push('strategy-1-smc', 'strategy-2-snd');
            inactive.splice(inactive.findIndex(x => x.id === 'strategy-1-smc'), 1);
            inactive.splice(inactive.findIndex(x => x.id === 'strategy-2-snd'), 1);
        } else {
            active.push('strategy-3-scalping');
            inactive.splice(inactive.findIndex(x => x.id === 'strategy-3-scalping'), 1);
        }
    }

    return { active, inactive };
  }
}
