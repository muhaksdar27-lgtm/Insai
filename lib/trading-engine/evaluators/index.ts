import { IStrategyEvaluator } from './types';
import { Strategy1SMCEvaluator } from './strategy-1-smc-evaluator';
import { Strategy2SNDEvaluator } from './strategy-2-snd-evaluator';
import { Strategy3ScalpingEvaluator } from './strategy-3-scalping-evaluator';
import { Strategy4NewsEvaluator } from './strategy-4-news-evaluator';
import { Strategy5ConfluenceEvaluator } from './strategy-5-confluence-evaluator';

export * from './types';
export * from './common-helpers';
export * from './strategy-1-smc-evaluator';
export * from './strategy-2-snd-evaluator';
export * from './strategy-3-scalping-evaluator';
export * from './strategy-4-news-evaluator';
export * from './strategy-5-confluence-evaluator';

const evaluatorRegistry: Record<string, IStrategyEvaluator> = {
  'strategy-1-smc': new Strategy1SMCEvaluator(),
  'strategy-2-snd': new Strategy2SNDEvaluator(),
  'strategy-3-scalping': new Strategy3ScalpingEvaluator(),
  'strategy-4-news': new Strategy4NewsEvaluator(),
  'strategy-5-smc-sd-confluence': new Strategy5ConfluenceEvaluator(),
  'strategy-5-confluence': new Strategy5ConfluenceEvaluator()
};

export function getStrategyEvaluator(strategyId: string): IStrategyEvaluator {
  const normId = String(strategyId).toLowerCase().trim();
  if (evaluatorRegistry[normId]) {
    return evaluatorRegistry[normId];
  }

  // Fallbacks for number identifiers
  if (normId.includes('1') || normId.includes('london')) return evaluatorRegistry['strategy-1-smc'];
  if (normId.includes('2') || normId.includes('snd') || normId.includes('supply')) return evaluatorRegistry['strategy-2-snd'];
  if (normId.includes('3') || normId.includes('scalp')) return evaluatorRegistry['strategy-3-scalping'];
  if (normId.includes('4') || normId.includes('news')) return evaluatorRegistry['strategy-4-news'];
  if (normId.includes('5') || normId.includes('confluence')) return evaluatorRegistry['strategy-5-smc-sd-confluence'];

  // Default fallback to strategy-1-smc
  return evaluatorRegistry['strategy-1-smc'];
}
