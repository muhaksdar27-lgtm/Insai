const fs = require('fs');
let content = fs.readFileSync('lib/observability/health-check.ts', 'utf-8');

const target = `        const externalUrl = getEnv("PYTHON_ENGINE_URL");
        if (!externalUrl && process.env.NODE_ENV === 'production') {
            this.updateServiceHealth('PythonEngine', 'DISABLED_BY_DESIGN', Date.now() - start, 'Disabled by design (no URL provided in production)');
        } else {
            const defaultPyPort = process.env.PYTHON_PORT || '8181';
            const pyUrl = externalUrl || \`http://127.0.0.1:\${defaultPyPort}\`;`;

const replacement = `        const externalUrl = getEnv("PYTHON_ENGINE_URL");
        {
            const defaultPyPort = process.env.PYTHON_PORT || '8181';
            const pyUrl = externalUrl || \`http://127.0.0.1:\${defaultPyPort}\`;`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('lib/observability/health-check.ts', content);
    console.log("Patched successfully");
} else {
    console.log("Target not found");
}
