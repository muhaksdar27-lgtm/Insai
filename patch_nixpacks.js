const fs = require('fs');

const nixpacks = `[phases.setup]
nixPkgs = ["nodejs_22", "python311", "python311Packages.pip", "gcc", "bash", "coreutils"]

[variables]
PYTHONUNBUFFERED = "1"
PYTHON_PORT = "8181"
NODE_ENV = "production"

[phases.install]
cmds = [
    "npm install --no-audit --prefer-offline --no-fund --legacy-peer-deps",
    "python3 -m pip install --upgrade pip --break-system-packages",
    "python3 -m pip install -r python-engine/requirements.txt --break-system-packages"
]
cacheDirectories = ["/root/.npm", "/root/.cache/pip"]

[phases.build]
cmds = [
    "npm run build",
    "rm -rf server.pid pyenv python-engine/venv python-engine/__pycache__ patch.sh fix.sh"
]
cacheDirectories = ["node_modules/.cache", ".next/cache"]

[start]
cmd = "npm run start"
`;

fs.writeFileSync('nixpacks.toml', nixpacks);
console.log("Patched nixpacks.toml successfully");
