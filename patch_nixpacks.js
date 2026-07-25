const fs = require('fs');

const nixpacks = `providers = ["node"]

[phases.setup]
nixPkgs = ["nodejs_20", "python311", "gcc", "bash", "coreutils"]

[variables]
PYTHONUNBUFFERED = "1"
PYTHON_PORT = "8181"
NODE_ENV = "production"

[phases.install]
cmds = [
    "npm install --no-audit --prefer-offline --no-fund --legacy-peer-deps",
    "python3 -m venv /app/venv",
    "/app/venv/bin/pip install --upgrade pip",
    "/app/venv/bin/pip install -r python-engine/requirements.txt"
]

[phases.build]
cmds = [
    "npm run build",
    "rm -rf server.pid pyenv python-engine/venv python-engine/__pycache__ patch.sh fix.sh"
]
cacheDirectories = ["node_modules/.cache", ".next/cache", "/root/.npm", "/root/.cache/pip"]

[start]
cmd = "npm run start"
`;

fs.writeFileSync('nixpacks.toml', nixpacks);
console.log("Patched nixpacks.toml successfully");
