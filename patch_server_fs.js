const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

if (!content.includes("import fs ")) {
    content = "import fs from 'fs';\n" + content;
    fs.writeFileSync('server.ts', content);
    console.log("Patched fs import successfully");
} else {
    console.log("Already has fs import");
}
