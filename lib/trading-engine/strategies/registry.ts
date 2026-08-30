import { StrategySpecification } from './types';
import { 
  CANONICAL_STRATEGY_IDS, 
  getCanonicalStrategy 
} from './definitions';

function buildSpecificationFromCanonical(id: string): StrategySpecification {
  const def = getCanonicalStrategy(id);
  return {
    strategy_id: def.id,
    name: def.name,
    version: def.version,
    status: def.status,
    description: def.description,
    timeframe: {
      htf: def.timeframes.bias,
      ltf: def.timeframes.entry,
      execution: def.timeframes.execution,
      intermediate: def.timeframes.intermediate
    },
    session_requirement: {
      allowedSessions: def.sessionRequirement.allowedSessions,
      utcWindow: def.sessionRequirement.utcWindow,
      description: def.sessionRequirement.description
    },
    setup_sequence: def.steps.map(s => ({
      step_id: s.step_id,
      step_order: s.step_order,
      rule_id: s.rule_id,
      name: s.name,
      description: s.description,
      invalidation: s.invalidation,
      defaultExpiryMinutes: s.defaultExpiryMinutes
    })),
    rule_definition: def.rule_definition,
    entry_rule: def.entry_rule,
    sl_rule: def.sl_rule,
    tp_rule: def.tp_rule,
    filter: def.filter,
    invalidation_rule: def.invalidation_rule,
    expiry_rule: def.expiry_rule,
    evidence_model: def.evidence_model
  };
}

export const STRATEGY_MANIFESTS: Record<string, StrategySpecification> = CANONICAL_STRATEGY_IDS.reduce((acc, id) => {
  acc[id] = buildSpecificationFromCanonical(id);
  return acc;
}, {} as Record<string, StrategySpecification>);

export function getStrategyManifest(strategyId: string): StrategySpecification {
  const manifest = STRATEGY_MANIFESTS[strategyId];
  if (!manifest) {
    throw new Error(`[CANONICAL_ERROR] Unknown strategy ID: "${strategyId}". Fallback to Strategy 1 is strictly forbidden.`);
  }
  return manifest;
}

export function tryGetStrategyManifest(strategyId: string): StrategySpecification | undefined {
  return STRATEGY_MANIFESTS[strategyId];
}

export function getAllStrategyManifests(): StrategySpecification[] {
  return CANONICAL_STRATEGY_IDS.map(id => STRATEGY_MANIFESTS[id]);
}
