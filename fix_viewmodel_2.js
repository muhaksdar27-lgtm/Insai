const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/strategyViewModel.ts', 'utf8');

// Replace the old getAllStrategiesWithFallback entirely
code = code.replace(/export function getAllStrategiesWithFallback[\s\S]*?(?=export function|$)/, `
export function getAllStrategiesWithFallback(rawStrategies: StrategyResponse[]): StrategyResponse[] {
  const { getAllStrategies } = require("@/lib/trading-engine/strategy-registry");
  const defaultStrategies = getAllStrategies().map((cfg: any) => {
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

  return defaultStrategies.map((def: any) => {
    const found = rawStrategies.find(s => s.id === def.id);
    if (found) {
      return { ...def, ...found, name: def.name, description: def.description };
    }
    return def;
  });
}
`);

fs.writeFileSync('/app/applet/lib/strategyViewModel.ts', code);
console.log("Fixed strategyViewModel.ts");
