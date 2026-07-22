const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/validation-pipeline/ai-orchestrator.ts', 'utf8');

code = code.replace(/import \{ ALL_VALIDATORS, ValidatorResult \} from '\.\/validators';/, `import { getStrategyDefinition } from '../strategy-registry';\nimport { ValidatorResult } from './validators';`);

// Remove STRATEGY_VALIDATORS
code = code.replace(/const STRATEGY_VALIDATORS: Record<string, string\[\]> = \{[\s\S]*?\};\n/, '');

// Fix runPipeline to use ruleResults keys directly
const oldLogic = `    // 1. Kumpulkan hasil semua validator independen dan prioritaskan rule kritikal
    const activeValidators = [...STRATEGY_VALIDATORS[strategyId] || ['Trend Validator', 'Risk Validator']];
    
    // Sort: Critical rules first for faster early exit
    activeValidators.sort((a, b) => {
       const vA = ALL_VALIDATORS[a];
       const vB = ALL_VALIDATORS[b];
       if (vA?.isCritical && !vB?.isCritical) return -1;
       if (!vA?.isCritical && vB?.isCritical) return 1;
       return 0;
    });

    const validatorResults: AIChecklistItem[] = [];
    
    // 2. Evaluasi semua rule
    for (const vName of activeValidators) {
      const v = ALL_VALIDATORS[vName];
      if (v) {
         try {
           const res = v.validate(marketContext, ruleResults);
           validatorResults.push({
             rule: vName,
             status: res.status === 'valid' ? 'PASS' : (res.status === 'invalid' ? 'FAIL' : 'WAIT'),
             reason: res.reason,
             isCritical: v.isCritical
           });
           
           if (v.isCritical && res.status === 'invalid') {
               logger.warn(\`Critical validation failed on \${vName}\`);
               // We don't abort immediately, let AI see it, or deterministic fallback handle it
           }
         } catch (err: any) {
             logger.error(\`Validator \${vName} crashed: \${err.message}\`);
             validatorResults.push({
                 rule: vName,
                 status: 'WAIT',
                 reason: \`Validator crashed: \${err.message}\`,
                 isCritical: v.isCritical
             });
         }
      }
    }`;

const newLogic = `    // 1. Kumpulkan hasil semua validator independen
    const stratDef = getStrategyDefinition(strategyId);
    const activeRules = stratDef ? stratDef.validationRules : Object.keys(ruleResults);
    
    const validatorResults: AIChecklistItem[] = [];
    
    // 2. Evaluasi semua rule dari ruleResults (yang sudah diset di engine.ts lewat extractCandidateRules)
    for (const ruleId of activeRules) {
      const res = ruleResults[ruleId];
      if (res) {
         const status = res.status === 'valid' ? 'PASS' : (res.status === 'invalid' ? 'FAIL' : 'WAIT');
         validatorResults.push({
           rule: ruleId,
           status: status,
           reason: res.evidence ? JSON.stringify(res.evidence) : 'No evidence',
           isCritical: true // assume all strategy rules are critical unless marked otherwise
         });
      } else {
         validatorResults.push({
           rule: ruleId,
           status: 'WAIT',
           reason: 'Rule not evaluated',
           isCritical: true
         });
      }
    }`;

code = code.replace(oldLogic, newLogic);
code = code.replace(/const totalCount = activeValidators\.length;/g, 'const totalCount = activeRules.length;');

fs.writeFileSync('/app/applet/lib/trading-engine/validation-pipeline/ai-orchestrator.ts', code);
console.log("Updated ai-orchestrator.ts");
