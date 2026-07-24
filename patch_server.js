const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const target = `    const pythonExecutable = fs.existsSync('/app/prod-env/bin/python3') ? '/app/prod-env/bin/python3' : 'python3';
    const pyScript = \`\${pythonExecutable} -m uvicorn main:app --host 127.0.0.1 --port \${pythonPort}\`;`;

const replacement = `    const pythonExecutable = process.env.PYTHON_PATH || 'python3';
    const pyScript = \`\${pythonExecutable} -m uvicorn main:app --host 127.0.0.1 --port \${pythonPort}\`;`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('server.ts', content);
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
