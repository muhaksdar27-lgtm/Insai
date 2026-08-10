const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/setup-detector.ts', 'utf8');

code = code.replace(/setup\.symbol === symbol \|\| setup\.pair === symbol/g, "setup.symbol === symbol");

fs.writeFileSync('lib/trading-engine/setup-detector.ts', code);
