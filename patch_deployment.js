const fs = require('fs');
let content = fs.readFileSync('lib/mcp/engines/deployment.ts', 'utf-8');

const target = `            const externalUrl = getEnv("PYTHON_ENGINE_URL");
            
            if (!externalUrl && process.env.NODE_ENV === 'production') {
                const result = { status: 'DISABLED_BY_DESIGN', message: 'Disabled in production unless URL provided' };
                this.lastCheck = now;
                this.lastResult = result;
                return result;
            }`;

const replacement = `            const externalUrl = getEnv("PYTHON_ENGINE_URL");`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('lib/mcp/engines/deployment.ts', content);
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
