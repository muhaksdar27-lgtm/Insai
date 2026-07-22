const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/validation-pipeline/ai-orchestrator.ts', 'utf8');

code = code.replace(/const totalCount = activeValidators\.length;/g, 'const totalCount = activeRules.length;');
code = code.replace(/setupScores/g, '{}'); // Just pass an empty object for scores, or remove it.

fs.writeFileSync('/app/applet/lib/trading-engine/validation-pipeline/ai-orchestrator.ts', code);
console.log("Fixed ai-orchestrator fallback");
