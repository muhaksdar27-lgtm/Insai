const fs = require('fs');
let code = fs.readFileSync('lib/db/client.ts', 'utf8');

code = code.replace(
  "WHERE s.status = 'SIGNAL_ACTIVE'",
  "WHERE s.status IN ('SIGNAL_ACTIVE', 'APPROVED', 'DISPATCHED', 'TAKE_PARTIAL')"
);
code = code.replace(
  "const cachedActive = Array.from(this.memorySignalsCache.values()).filter(s => s.status === 'SIGNAL_ACTIVE');",
  "const cachedActive = Array.from(this.memorySignalsCache.values()).filter(s => ['SIGNAL_ACTIVE', 'APPROVED', 'DISPATCHED', 'TAKE_PARTIAL'].includes(s.status));"
);

fs.writeFileSync('lib/db/client.ts', code);
