const fs = require('fs');
const content = fs.readFileSync('lib/trading-engine/engine.ts', 'utf8');

// We need to move the Python analysis fetch outside the Promise.allSettled(relevantStrategies.map(...))
const oldCode = `    // Pre-calculate common rules to avoid duplicate validation across strategies
        
    // Process all active strategies concurrently
    await Promise.allSettled(relevantStrategies.map(async (strategyId) => {`;

const newCode = `    // Pre-calculate common rules to avoid duplicate validation across strategies
    let commonPyData = {};
    try {
        logger.info(\`Delegating technical analysis to Python Engine for \${context.symbol}\`);
        const pyPort = process.env.PYTHON_PORT || '8181';
        const externalUrl = process.env.PYTHON_ENGINE_URL;
        const pyUrl = externalUrl || \`http://127.0.0.1:\${pyPort}\`;
        const mds = getMarketDataService();
        
        const [h1, m15, m5, m1] = await Promise.all([
            mds.getCandles(context.symbol, 'H1', 100),
            context.timeframe === 'M15' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M15', 100),
            mds.getCandles(context.symbol, 'M5', 100),
            mds.getCandles(context.symbol, 'M1', 100)
        ]);
        
        const payload = { H1: { candles: h1 }, M15: { candles: m15, atr: 4.5 }, M5: { candles: m5 }, M1: { candles: m1 } };
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const pyRes = await fetch(\`\${pyUrl}/v1/analyze\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (pyRes.ok) {
            commonPyData = await pyRes.json();
        } else {
            logger.error(\`Python Engine Error: \${pyRes.statusText}\`);
        }
    } catch (e) {
        logger.error(\`Failed to reach Python Engine: \${e.message}\`);
    }
        
    // Process all active strategies concurrently
    await Promise.allSettled(relevantStrategies.map(async (strategyId) => {`;

let modifiedContent = content.replace(oldCode, newCode);

const oldFetchBlock = `        // --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---
        let pyData: any = {};
        try {
            logger.info(\`Delegating technical analysis to Python Engine for \${strategyId}\`);
            const pyPort = process.env.PYTHON_PORT || '8181';
            const externalUrl = process.env.PYTHON_ENGINE_URL;
            const pyUrl = externalUrl || \`http://127.0.0.1:\${pyPort}\`;
            const mds = getMarketDataService();
            
            const [h1, m15, m5, m1] = await Promise.all([
                mds.getCandles(context.symbol, 'H1', 100),
                context.timeframe === 'M15' && context.candles ? Promise.resolve(context.candles) : mds.getCandles(context.symbol, 'M15', 100),
                mds.getCandles(context.symbol, 'M5', 100),
                mds.getCandles(context.symbol, 'M1', 100)
            ]);
            
            const payload = { H1: { candles: h1 }, M15: { candles: m15, atr: 4.5 }, M5: { candles: m5 }, M1: { candles: m1 } };
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const pyRes = await fetch(\`\${pyUrl}/v1/analyze\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (pyRes.ok) {
                pyData = await pyRes.json();
            } else {
                logger.error(\`Python Engine Error: \${pyRes.statusText}\`);
            }
        } catch (e: any) {
            logger.error(\`Failed to reach Python Engine: \${e.message}\`);
        }`;

modifiedContent = modifiedContent.replace(oldFetchBlock, `        // --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---
        let pyData: any = commonPyData;`);

fs.writeFileSync('lib/trading-engine/engine.ts', modifiedContent);
console.log("Patched lib/trading-engine/engine.ts");
