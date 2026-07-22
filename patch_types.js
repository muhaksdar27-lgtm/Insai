const fs = require('fs');

let svm = fs.readFileSync('/app/applet/lib/strategyViewModel.ts', 'utf8');
svm = svm.replace(/config.validationRules.map\(ruleName => \{/, 'config.validationRules.map((ruleName: string) => {');
svm = svm.replace(/const passedCount = rules.filter\(r => r.passed\).length;/, 'const passedCount = rules.filter((r: any) => r.passed).length;');
fs.writeFileSync('/app/applet/lib/strategyViewModel.ts', svm);

let sr = fs.readFileSync('/app/applet/lib/trading-engine/strategy-registry.ts', 'utf8');
sr = sr.replace(/extractCandidateRules: \(context, pyData\) => \{/g, 'extractCandidateRules: (_context, pyData) => {');
fs.writeFileSync('/app/applet/lib/trading-engine/strategy-registry.ts', sr);

console.log("Patched types");
