const fs = require('fs');

let setupDetector = fs.readFileSync('/app/applet/lib/trading-engine/setup-detector.ts', 'utf8');
setupDetector = setupDetector.replace(/public translateMarketDataToSnapshot\(strategyId: string, pyData: any\)/, 'public translateMarketDataToSnapshot(_strategyId: string, pyData: any)');
fs.writeFileSync('/app/applet/lib/trading-engine/setup-detector.ts', setupDetector);

let strategyRegistry = fs.readFileSync('/app/applet/lib/trading-engine/strategy-registry.ts', 'utf8');
strategyRegistry = strategyRegistry.replace(/context\.symbol/g, '_context.symbol');
fs.writeFileSync('/app/applet/lib/trading-engine/strategy-registry.ts', strategyRegistry);

let types = fs.readFileSync('/app/applet/types/index.ts', 'utf8');
types = types.replace(/export interface Setup \{/, 'export interface Setup {\n  setupSnapshot?: any;');
fs.writeFileSync('/app/applet/types/index.ts', types);

console.log("Fixed final types");
