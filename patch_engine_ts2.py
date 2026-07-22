import re

with open('lib/trading-engine/engine.ts', 'r') as f:
    content = f.read()

python_fetch_logic = """
        // --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---
        let pyData: any = {};
        try {
            logger.info(`Delegating technical analysis to Python Engine for ${strategyId}`);
            const pyPort = process.env.PYTHON_PORT || '8181';
            const externalUrl = process.env.PYTHON_ENGINE_URL;
            const pyUrl = externalUrl || `http://127.0.0.1:${pyPort}`;
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
            const pyRes = await fetch(`${pyUrl}/v1/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (pyRes.ok) {
                pyData = await pyRes.json();
            } else {
                logger.warn(`Python Engine returned ${pyRes.status}`);
            }
        } catch (e: any) {
"""

# Extract the block manually using regex
match = re.search(r"(\s*// --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---.*?)if \(e\.message\.includes", content, re.DOTALL)
if match:
    fetch_block = match.group(1)
    # Define common block to insert BEFORE Promise.allSettled
    common_block = """
    let commonPyData: any = {};
    try {
        logger.info(`Delegating technical analysis to Python Engine for ${context.symbol}`);
        const pyPort = process.env.PYTHON_PORT || '8181';
        const externalUrl = process.env.PYTHON_ENGINE_URL;
        const pyUrl = externalUrl || `http://127.0.0.1:${pyPort}`;
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
        const pyRes = await fetch(`${pyUrl}/v1/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (pyRes.ok) {
            commonPyData = await pyRes.json();
        } else {
            logger.warn(`Python Engine returned ${pyRes.status}`);
        }
    } catch (e: any) {
        logger.error(`Failed to reach Python Engine: ${e.message}`);
    }
    """
    
    # Replace the fetch block inside the loop with just using commonPyData
    new_inner_block = """
        // --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---
        let pyData: any = commonPyData;
        try {
        } catch (e: any) {
"""
    content = content.replace(fetch_block, new_inner_block)
    
    # Insert common_block before Promise.allSettled
    promise_str = "    // Process all active strategies concurrently\n    await Promise.allSettled(relevantStrategies.map(async (strategyId) => {"
    content = content.replace(promise_str, common_block + "\n" + promise_str)
    
    with open('lib/trading-engine/engine.ts', 'w') as f:
        f.write(content)
    print("Patched!")
else:
    print("Could not find fetch block")
