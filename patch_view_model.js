const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/strategyViewModel.ts', 'utf8');

const replacement = `
export function getStrategyConfig(strategyId: string) {
  // We dynamically load it to avoid server/client issues, or we just import it if it's safe.
  // Actually, importing from strategy-registry is safe.
  const { getStrategyDefinition } = require("@/lib/trading-engine/strategy-registry");
  return getStrategyDefinition(strategyId) || null;
}

export function getAllStrategiesWithFallback(rawStrategies: StrategyResponse[]): StrategyResponse[] {
  const { getAllStrategies } = require("@/lib/trading-engine/strategy-registry");
  const defaultStrategies = getAllStrategies().map(cfg => {
    return {
      id: cfg.id,
      name: cfg.name,
      description: cfg.description,
      status: 'not configured',
      steps: [],
      currentStep: 'IDLE',
      progress: 0,
      setupSnapshot: {},
      ruleResults: {},
      updatedAt: new Date().toISOString(),
      freshness: 'stale'
    };
  });

  return defaultStrategies.map(def => {
    const found = rawStrategies.find(s => s.id === def.id);
    if (found) {
      return { ...def, ...found, name: def.name, description: def.description };
    }
    return def;
  });
}
`;

// Remove the old StrategyConfig, StrategyStepConfig, STRATEGY_CATALOG definitions.
code = code.replace(/export interface StrategyStepConfig \{[\s\S]*?\}\n/, '');
code = code.replace(/export interface StrategyConfig \{[\s\S]*?\}\n/, '');
code = code.replace(/export const STRATEGY_CATALOG: Record<string, StrategyConfig> = \{[\s\S]*?^export function getStrategyConfig/m, 'export function getStrategyConfig');

// Replace getStrategyConfig and getAllStrategiesWithFallback
code = code.replace(/export function getStrategyConfig\([\s\S]*?^export function getStrategyFlowConfig/m, replacement + '\nexport function getStrategyFlowConfig');
code = code.replace(/export function getAllStrategiesWithFallback\([\s\S]*?\n\}\n/m, '');

fs.writeFileSync('/app/applet/lib/strategyViewModel.ts', code);
console.log("Updated strategyViewModel.ts");
