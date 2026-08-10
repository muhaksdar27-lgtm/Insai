const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/rule-engine.ts', 'utf8');

// Normalize fields at the beginning of evaluateStrategyRules
const normalizeCode = `
    // Normalize Python / TS field names
    pyData.session = pyData.current_session || pyData.session || 'London';
    pyData.trend = pyData.trend_h1 || pyData.trend || 'neutral';
    pyData.entry_price = pyData.entry_price || pyData.current_price || context.candles?.[context.candles.length - 1]?.close || 0;
    
    const currentSession = pyData.session;
`;

// Replace const currentSession = ... with normalizeCode
code = code.replace(/const currentSession = [^\n]+;\n/, normalizeCode);

fs.writeFileSync('lib/trading-engine/rule-engine.ts', code);
