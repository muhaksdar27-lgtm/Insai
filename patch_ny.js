const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/rule-engine.ts', 'utf8');

code = code.replace(/const isNYHours = currentHour >= 12 && currentHour < 21;/g, "");

fs.writeFileSync('lib/trading-engine/rule-engine.ts', code);
