const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/rule-engine.ts', 'utf8');

code = code.replace(/engulfActive,\n/g, "engulfActive ? true : 'WAIT',\n");
code = code.replace(/patternActive,\n/g, "patternActive ? true : 'WAIT',\n");
code = code.replace(/'No engulfing candlestick trigger found'/g, "'Waiting for engulfing candlestick trigger'");
code = code.replace(/'No scalp structural pattern detected'/g, "'Waiting for scalp structural pattern'");
code = code.replace(/spreadAcceptable,/g, "spreadAcceptable ? true : 'WAIT',");
code = code.replace(/'Market spread exceeds threshold limit'/g, "'Waiting for acceptable spread limit'");

fs.writeFileSync('lib/trading-engine/rule-engine.ts', code);
