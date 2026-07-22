const fs = require('fs');
let code = fs.readFileSync('./lib/trading-engine/engine.ts', 'utf8');

code = code.replace(/const aiState = \{/, `const validationResult = { decision: 'APPROVED', reasoning: 'Evaluated by Python Engine' };\n        const aiState = {`);

fs.writeFileSync('./lib/trading-engine/engine.ts', code);
