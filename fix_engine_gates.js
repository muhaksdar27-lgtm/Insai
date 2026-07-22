const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/engine.ts', 'utf8');

code = code.replace(/const consResult = await consistencyEngine\.evaluate\(strategyId, validationState, ruleResults, validationResult, context\);/, 
  `validationState.context = { ...(validationState.context || {}), direction, entryPrice, slPrice, tpPrice, tp1Price: tpPrice };\n        const consResult = await consistencyEngine.evaluate(strategyId, validationState, ruleResults, validationResult, context);`);

fs.writeFileSync('/app/applet/lib/trading-engine/engine.ts', code);
console.log("Fixed engine gates state");
