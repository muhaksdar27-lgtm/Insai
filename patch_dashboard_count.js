const fs = require('fs');
let code = fs.readFileSync('components/dashboard/executive-summary-panel.tsx', 'utf8');

code = code.replace(
  "const activeSignalsCount = Array.isArray(signals) ? signals.length : 0;",
  "const activeSignalsCount = Array.isArray(signals) ? signals.filter(s => ['APPROVED', 'DISPATCHED'].includes((s.status || s.baseStatus || '').toUpperCase())).length : 0;"
);

fs.writeFileSync('components/dashboard/executive-summary-panel.tsx', code);
