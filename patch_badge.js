const fs = require('fs');
let code = fs.readFileSync('lib/utils.ts', 'utf8');

code = code.replace(
  "['active', 'validated', 'live', 'connected']",
  "['active', 'validated', 'live', 'connected', 'dispatched']"
);

fs.writeFileSync('lib/utils.ts', code);
