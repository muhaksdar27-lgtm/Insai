const fs = require('fs');
let content = fs.readFileSync('lib/trading-engine/engine.ts', 'utf-8');

const target = `        if (!pyData || Object.keys(pyData).length === 0) {
            logger.warn(\`Python Engine delegation failed or no data for \${strategyId}\`);
        }`;

const replacement = `        if (!pyData || Object.keys(pyData).length === 0) {
            logger.warn(\`Python Engine delegation failed or no data for \${strategyId}\`);
            this.setupDetector.transitionState(setup.id, 'expired', 'Python Engine unreachable');
            await this.advanceStateMachine(sm, STEPS.SUPPRESSED, 'Python Engine unreachable', setup.id, context, { marketStates });
            return;
        }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('lib/trading-engine/engine.ts', content);
} else {
    console.log("Target not found");
}
