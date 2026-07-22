const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/engine.ts', 'utf8');

const imports = `import { consistencyEngine } from './validation-pipeline/consistency-engine';\nimport { qualityGate } from './validation-pipeline/quality-gate';\n`;

if (!code.includes('consistencyEngine')) {
    code = code.replace(/import \{ AIValidationOrchestrator \} from '\.\/validation-pipeline\/ai-orchestrator';/, 
      `import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';\n${imports}`);
}

const target = `        if (validationResult.decision !== 'APPROVED') {`;
const replacement = `
        const consResult = await consistencyEngine.evaluate(strategyId, validationState, ruleResults, validationResult, context);
        if (consResult.status === 'block') {
            logger.warn(\`Setup \${setup.id} rejected by Consistency Engine: \${consResult.reasoning}\`);
            this.setupDetector.transitionState(setup.id, 'expired', \`Consistency Rejected: \${consResult.reasoning}\`);
            await this.advanceStateMachine(sm, STEPS.REJECTED, consResult.reasoning, setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        const riskDecision = { status: 'pass' }; // Dummy risk decision as we don't have risk engine hooked here
        const qgResult = await qualityGate.evaluate(strategyId, validationState, context, ruleResults, validationResult, consResult, riskDecision);
        
        if (!qgResult.passed) {
            logger.warn(\`Setup \${setup.id} rejected by Quality Gate: \${qgResult.reason}\`);
            this.setupDetector.transitionState(setup.id, 'expired', \`Quality Gate Rejected: \${qgResult.reason}\`);
            await this.advanceStateMachine(sm, STEPS.REJECTED, qgResult.reason || 'Quality gate blocked', setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: 'REJECTED', direction, entryPrice, slPrice, tpPrice } });
            return;
        }

        if (validationResult.decision !== 'APPROVED') {`;

if (!code.includes('consistencyEngine.evaluate')) {
    code = code.replace(target, replacement);
}

fs.writeFileSync('/app/applet/lib/trading-engine/engine.ts', code);
console.log("Updated engine.ts with gates");
