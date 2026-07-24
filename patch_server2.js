const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const target = `    const pythonExecutable = process.env.PYTHON_PATH || 'python3';
    const pyScript = \`\${pythonExecutable} -m uvicorn main:app --host 127.0.0.1 --port \${pythonPort}\`;
    logger.info(\`Spawning Python Engine with: \${pyScript}\`);`;

const replacement = `    const pyScript = \`python3 -m uvicorn main:app --host 127.0.0.1 --port \${pythonPort}\`;
    logger.info(\`Spawning Python Engine with: \${pyScript}\`);`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('server.ts', content);
    console.log("Patched server.ts successfully");
} else {
    console.log("Target not found in server.ts");
}
