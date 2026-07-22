const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/engine.ts', 'utf8');

const importStr = `import { AIValidationOrchestrator } from './validation-pipeline/ai-orchestrator';\n`;
if (!code.includes('AIValidationOrchestrator')) {
    code = code.replace(/import { SetupDetector, SetupLifecycleError } from '.\/setup-detector';/, 
      importStr + `import { SetupDetector, SetupLifecycleError } from './setup-detector';`);
}

// In constructor, initialize aiOrchestrator
if (!code.includes('this.aiOrchestrator = new AIValidationOrchestrator()')) {
    code = code.replace(/private marketStateEngine: MarketStateEngine;/, `private marketStateEngine: MarketStateEngine;\n  private aiOrchestrator: AIValidationOrchestrator;`);
    code = code.replace(/this\.marketStateEngine = new MarketStateEngine\(\);/, `this.marketStateEngine = new MarketStateEngine();\n    this.aiOrchestrator = new AIValidationOrchestrator();`);
}

// In runDetectionCycle, wire it
const target = `const validationResult = { decision: 'APPROVED', reasoning: 'Evaluated by Python Engine' };`;
const replacement = `
        const validationState = sm.lastTransitionState || { stateName: STEPS.WAIT_AI } as any;
        const validationResult = await this.aiOrchestrator.runPipeline(strategyId, validationState, ruleResults, context);
`;
code = code.replace(target, replacement);

// Wait, validationResult.decision might be APPROVED, REJECTED, or WAIT.
// Also, it's AIValidationDecision from ai-orchestrator.

fs.writeFileSync('/app/applet/lib/trading-engine/engine.ts', code);
console.log("Updated engine.ts with ai-orchestrator");
