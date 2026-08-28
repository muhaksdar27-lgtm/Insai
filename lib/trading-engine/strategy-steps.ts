import { SetupStepRecord } from './types';
import { 
  CANONICAL_STRATEGY_DEFINITIONS, 
  CanonicalStepDefinition,
  CanonicalStrategyId,
  getCanonicalStrategy 
} from './strategies/definitions';

export interface StrategyStepBlueprint {
  step_id: string;
  step_order: number;
  rule_id: string;
  name: string;
  description: string;
  invalidation: string;
  defaultExpiryMinutes: number;
}

export const STRATEGY_BLUEPRINTS: Record<string, StrategyStepBlueprint[]> = Object.entries(
  CANONICAL_STRATEGY_DEFINITIONS
).reduce((acc, [stratId, def]) => {
  acc[stratId] = def.steps.map((s: CanonicalStepDefinition) => ({
    step_id: s.step_id,
    step_order: s.step_order,
    rule_id: s.rule_id,
    name: s.name,
    description: s.description,
    invalidation: s.invalidation,
    defaultExpiryMinutes: s.defaultExpiryMinutes
  }));
  return acc;
}, {} as Record<string, StrategyStepBlueprint[]>);

export function instantiateStrategySteps(strategyId: string, timestamp: string = new Date().toISOString()): SetupStepRecord[] {
  const stratDef = getCanonicalStrategy(strategyId) || CANONICAL_STRATEGY_DEFINITIONS['strategy-1-smc'];
  const blueprints = stratDef.steps;
  
  return blueprints.map((bp) => ({
    step_id: bp.step_id,
    step_order: bp.step_order,
    strategy_id: strategyId,
    rule_id: bp.rule_id,
    name: bp.name,
    description: bp.description,
    state: 'AWAITING',
    timestamp,
    evidence: {},
    reason: 'Initial setup step registered, awaiting sequential condition evaluation',
    invalidation: bp.invalidation,
    expiry: new Date(new Date(timestamp).getTime() + bp.defaultExpiryMinutes * 60 * 1000).toISOString(),
    last_evaluated_timestamp: timestamp
  }));
}
