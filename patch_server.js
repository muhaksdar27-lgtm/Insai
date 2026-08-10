const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/let pyProcess: ChildProcess \| null = null;/g, "let pyProcess: any = null;");

fs.writeFileSync('server.ts', code);
