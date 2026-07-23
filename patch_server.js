const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');
content = content.replace("const pyScript = `../venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port ${pythonPort}`;", "const pyScript = process.env.NODE_ENV === 'production' ? `python3 -m uvicorn main:app --host 0.0.0.0 --port ${pythonPort}` : `python3 -m uvicorn main:app --host 0.0.0.0 --port ${pythonPort}`;");
fs.writeFileSync('server.ts', content);
