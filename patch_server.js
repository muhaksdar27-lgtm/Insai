const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace("const pyScript = `python3 -m uvicorn main:app --host 0.0.0.0 --port ${pythonPort}`;", "const pyScript = `../venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port ${pythonPort}`;");
fs.writeFileSync('server.ts', content);
