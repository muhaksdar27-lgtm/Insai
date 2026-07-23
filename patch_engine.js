const fs = require('fs');

let content = fs.readFileSync('lib/trading-engine/engine.ts', 'utf-8');

if (!content.includes('import { PyWSClient }')) {
    content = content.replace("import { MarketStateEngine }", "import { PyWSClient } from './py-ws-client';\nimport { MarketStateEngine }");
}

const target = `
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
            logger.warn(\`Python Engine returned \${pyRes.status}\`);
        }
`;

const replacement = `
        const payload = { H1: { candles: h1 }, M15: { candles: m15, atr: 4.5 }, M5: { candles: m5 }, M1: { candles: m1 } };
        
        try {
            const wsClient = PyWSClient.getInstance(pyUrl);
            commonPyData = await wsClient.analyze(payload);
        } catch (wsErr: any) {
            logger.warn(\`WebSocket failed, falling back to HTTP: \${wsErr.message}\`);
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
                logger.warn(\`Python Engine returned \${pyRes.status}\`);
            }
        }
`;

if (content.includes("fetch(\`${pyUrl}/v1/analyze\`")) {
    content = content.replace(target.trim(), replacement.trim());
}

fs.writeFileSync('lib/trading-engine/engine.ts', content);
