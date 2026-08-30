import { SetupStepRecord } from './types';
import { 
  CANONICAL_STRATEGY_DEFINITIONS, 
  CanonicalStepDefinition,
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
  const stratDef = getCanonicalStrategy(strategyId);
  const blueprints = stratDef.steps;
  const executionTimeframe = stratDef.timeframes?.execution || stratDef.timeframes?.entry || 'M15';
  
  return blueprints.map((bp) => {
    const expiryIso = new Date(new Date(timestamp).getTime() + bp.defaultExpiryMinutes * 60 * 1000).toISOString();
    const stepTimeframe = bp.step_id.includes('M1_') || bp.step_id.includes('M1') ? 'M1' : (bp.step_id.includes('M5_') || bp.step_id.includes('M5') ? 'M5' : (bp.step_id.includes('H1_') || bp.step_id.includes('H1') ? 'H1' : executionTimeframe));

    return {
      step_id: bp.step_id,
      step_order: bp.step_order,
      strategy_id: strategyId,
      rule_id: bp.rule_id,
      name: bp.name,
      description: bp.description,
      state: 'AWAITING',
      timestamp,
      first_detected_at: timestamp,
      last_evaluated_at: timestamp,
      last_evaluated_timestamp: timestamp,
      timeframe: stepTimeframe,
      data_source: 'MarketDataService',
      evidence: {},
      reason: 'Initial setup step registered, awaiting sequential condition evaluation',
      invalidation: bp.invalidation,
      invalidation_condition: bp.invalidation,
      expiry: expiryIso,
      expires_at: expiryIso,
      transition_history: [
        {
          from_state: 'AWAITING',
          to_state: 'AWAITING',
          timestamp,
          reason: 'Initial setup step registered in canonical AWAITING state',
          source_event: 'system_init'
        }
      ]
    };
  });
}
