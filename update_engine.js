const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/engine.ts', 'utf8');

// The section to replace starts at:
// const stratDef = getStrategyDefinition(strategyId);
// and ends around:
// if (strategyId === 'strategy-5-smc-sd-confluence' || ...)

// Actually, we can use regex to replace the evaluation logic.
// We need to fetch python /v1/analyze first, then evaluate stratDef.

const newEvaluationLogic = `
        const stratDef = getStrategyDefinition(strategyId);
        if (!stratDef) {
            logger.warn(\`Strategy definition not found for \${strategyId}\`);
            return;
        }

        // --- FETCH TECHNICAL ANALYSIS FROM PYTHON ---
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
                logger.warn(\`Python Engine returned \${pyRes.status}\`);
            }
        } catch (e: any) {
            if (e.message.includes('Market Data Error')) {
                logger.error(\`Data Error for \${strategyId}: \${e.message}\`);
                this.setupDetector.transitionState(setup.id, 'expired', \`Data Error: \${e.message}\`);
                await this.advanceStateMachine(sm, STEPS.SUPPRESSED, \`Data Error: \${e.message}\`, setup.id, context, { marketStates });
                return;
            } else {
                logger.warn(\`Python Engine delegation failed for \${strategyId}: \${e.message}\`);
            }
        }

        const result = stratDef.extractCandidateRules(context, pyData);
        let isCandidateValid = result.isCandidateValid;
        let direction = result.direction;
        let candidateRules = result.candidateRules;
        
        // Ensure no invalid rules
        let failedRule = null;
        for (const [ruleId, ruleRes] of Object.entries(candidateRules)) {
            if ((ruleRes as any).status === 'invalid') {
                isCandidateValid = false;
                failedRule = ruleId;
                break;
            }
        }

        if (isCandidateValid === 'pending') {
            this.setupDetector.transitionState(setup.id, 'candidate', 'Waiting for more data/Pending rules');
            await this.advanceStateMachine(sm, STEPS.IDLE, 'Pending missing data', setup.id, context, { marketStates });
            return;
        }

        if (!isCandidateValid) {
            const failReason = failedRule ? \`Failed \${failedRule}\` : 'Failed candidate evaluation (low confluence or invalid rule)';
            this.setupDetector.transitionState(setup.id, 'expired', failReason);
            await this.advanceStateMachine(sm, STEPS.EXPIRED, failReason, setup.id, context, { marketStates });
            return;
        }
        
        setup = this.setupDetector.transitionState(setup.id, 'validation', 'Passed candidate pattern matching');
        await this.advanceStateMachine(sm, STEPS.WAIT_CONFIRMATION, 'Passed structural/volatility validation', setup.id, context, { marketStates });
        
        setup = this.setupDetector.transitionState(setup.id, 'confirmation', 'Passed structural validation');

        let entryPrice = pyData.current_price || context.candles![context.candles!.length - 1].close;
        const atr = pyData.atr || 4.5;
        const slDistance = atr * 0.5; // Rule: SL = 50% ATR
        
        let slPrice = direction === 'buy' ? entryPrice - slDistance : entryPrice + slDistance;
        let tpPrice = direction === 'buy' ? entryPrice + (slDistance * 2) : entryPrice - (slDistance * 2);
`;

const lines = code.split('\n');
const startIndex = lines.findIndex(l => l.includes('const stratDef = getStrategyDefinition(strategyId);'));
const endIndex = lines.findIndex(l => l.includes('this.setupDetector.updateSetupDetails(setup.id, { direction, entryPrice, slPrice, tpPrice, marketStates });'));

if (startIndex !== -1 && endIndex !== -1) {
    const before = lines.slice(0, startIndex).join('\n');
    const after = lines.slice(endIndex).join('\n');
    fs.writeFileSync('lib/trading-engine/engine.ts', before + '\n' + newEvaluationLogic + '\n        ' + after);
    console.log("Successfully updated engine.ts");
} else {
    console.error("Could not find boundaries in engine.ts");
    console.error("startIndex", startIndex, "endIndex", endIndex);
}
