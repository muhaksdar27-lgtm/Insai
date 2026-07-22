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

  public classifyState(_context: RuleEvaluationContext): MarketState[] {
    return [MarketState.TRENDING, MarketState.HIGH_VOLATILITY];
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
