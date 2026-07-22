const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/validation-pipeline/ai-orchestrator.ts', 'utf8');

// The runPipeline function starts around line 78. Let's just find the start and end of it.
// Actually, let's just write a regex to replace everything from `// 1. Kumpulkan hasil semua validator` down to `if (criticalFail) {`

const startTag = `// 1. Kumpulkan hasil semua validator independen dan prioritaskan rule kritikal`;
const endTag = `// 3. Optional: Jalankan Scoring Engine (deterministic layer)`;

let idxStart = code.indexOf(startTag);
let idxEnd = code.indexOf(endTag);

if (idxStart !== -1 && idxEnd !== -1) {
    const newBlock = `    // 1. Kumpulkan hasil semua validator independen
    const stratDef = getStrategyDefinition(strategyId);
    const activeRules = stratDef ? stratDef.validationRules : Object.keys(ruleResults);
    
    const validatorResults = [];
    let criticalFail = false;
    let failedRules: string[] = [];
    
    // 2. Evaluasi semua rule dari ruleResults
    for (const ruleId of activeRules) {
      const res = ruleResults[ruleId];
      if (res) {
         const status = res.status === 'valid' ? 'PASS' : (res.status === 'invalid' ? 'FAIL' : 'WAIT');
         validatorResults.push({
           rule: ruleId,
           status: status,
           reason: res.evidence ? JSON.stringify(res.evidence) : 'No evidence',
           isCritical: true, // assume all strategy rules are critical unless marked otherwise
           evidence: res.evidence ? JSON.stringify(res.evidence) : ''
         });
         if (status === 'FAIL') {
             failedRules.push(ruleId);
             criticalFail = true;
         }
      } else {
         validatorResults.push({
           rule: ruleId,
           status: 'WAIT',
           reason: 'Rule not evaluated',
           isCritical: true,
           evidence: ''
         });
      }
    }

    if (criticalFail) {
      logger.warn(\`Validation failed early on critical rules: \${failedRules.join(', ')}\`);
      return {
         strategyName: strategyId,
         decision: 'REJECTED',
         checklist: validatorResults,
         reasoning: \`Critical rules failed: \${failedRules.join(', ')}\`,
         evidence: 'Early exit during critical validation',
         riskNotes: 'Blocked early',
         missingFactors: [],
         recommendedAction: 'block',
         scores: {}
      };
    }
    
    `;
    code = code.substring(0, idxStart) + newBlock + code.substring(idxEnd);
}

fs.writeFileSync('/app/applet/lib/trading-engine/validation-pipeline/ai-orchestrator.ts', code);
console.log("Fixed ai-orchestrator function");
