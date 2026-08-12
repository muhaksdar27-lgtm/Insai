const fs = require('fs');
let code = fs.readFileSync('app/live-signals/page.tsx', 'utf8');

code = code.replace(
  "return !['CLOSED', 'WIN', 'LOSS', 'FINISHED', 'EXPIRED', 'SL HIT', 'TP3 HIT'].includes(st);",
  "return ['APPROVED', 'DISPATCHED'].includes(st);"
);

fs.writeFileSync('app/live-signals/page.tsx', code);
