const fs = require('fs');
let code = fs.readFileSync('lib/utils/logger.ts', 'utf8');

code = code.replace(
  /export const requestContext = \{([\s\S]*?)getStore: \(\) => \(\{ correlationId: undefined \}\)\n\};/,
  "export const requestContext = {\n  getStore: () => ({ correlationId: undefined }),\n  run: (store, callback) => callback()\n};"
);

fs.writeFileSync('lib/utils/logger.ts', code);
