const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/engine.ts', 'utf8');

// Inside runDetectionCycle, after getting pyData:
const target = `const result = stratDef.extractCandidateRules(context, pyData);`;
const replacement = `
        const translatedSnapshot = this.setupDetector.translateMarketDataToSnapshot(strategyId, pyData);
        // Extend context or pass it into buildSetupSnapshot somehow?
        // Let's pass it in options.setupDetails or somewhere.
        const result = stratDef.extractCandidateRules(context, pyData);
`;

code = code.replace(target, replacement);

fs.writeFileSync('/app/applet/lib/trading-engine/engine.ts', code);
console.log("Updated engine.ts");
