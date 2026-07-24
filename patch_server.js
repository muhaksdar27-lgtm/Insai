const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const target = `    const pyScript = process.env.NODE_ENV === 'production' ? \`python3 -m uvicorn main:app --host 0.0.0.0 --port \${pythonPort}\` : \`python3 -m uvicorn main:app --host 0.0.0.0 --port \${pythonPort}\`;
    pyProcess = spawn('bash', ['-c', pyScript], {
      cwd: path.join(process.cwd(), 'python-engine'),
      stdio: 'inherit',
      env: { ...process.env, PYTHON_PORT: pythonPort, PYTHONPATH: '.' }
    });`;

const replacement = `    const pythonExecutable = fs.existsSync('/app/prod-env/bin/python3') ? '/app/prod-env/bin/python3' : 'python3';
    const pyScript = \`\${pythonExecutable} -m uvicorn main:app --host 127.0.0.1 --port \${pythonPort}\`;
    logger.info(\`Spawning Python Engine with: \${pyScript}\`);
    pyProcess = spawn('bash', ['-c', pyScript], {
      cwd: path.join(process.cwd(), 'python-engine'),
      stdio: 'inherit',
      env: { ...process.env, PYTHON_PORT: pythonPort, PYTHONPATH: '.' }
    });`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('server.ts', content);
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
