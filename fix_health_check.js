const fs = require('fs');
let code = fs.readFileSync('lib/observability/health-check.ts', 'utf8');

// I will just put the supabase check back
code = code.replace(/\/\/ Check Supabase\s+try \{\s+const start = Date\.now\(\);\s+const providers = getProviderRegistry\(\)\.getAllHealth\(\);/, `// Check Supabase
    try {
        const start = Date.now();
        const client = getSupabaseClient();
        if (client.isConnected()) {
            this.updateServiceHealth('Supabase', 'ONLINE', Date.now() - start);
        } else {
            this.updateServiceHealth('Supabase', 'NOT CONFIGURED', Date.now() - start, 'Not configured or unavailable');
        }
    } catch (e: any) {
        this.updateServiceHealth('Supabase', 'UNAVAILABLE', 0, e.message);
    }
    
    // Check Market Data
    try {
        const start = Date.now();
        const providers = getProviderRegistry().getAllHealth();`);

fs.writeFileSync('lib/observability/health-check.ts', code);
