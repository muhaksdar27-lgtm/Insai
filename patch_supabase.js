const fs = require('fs');
let content = fs.readFileSync('lib/supabase/client.ts', 'utf-8');

const target1 = `if (err.message && err.message.includes('schema cache')) {`;
const target2 = `logger.warn(\`Supabase fetch active warn: \${err.message}\`);`;

content = content.replace(/if \(err\.message && err\.message\.includes\('schema cache'\)\) {/g, `if (err.message && (err.message.includes('schema cache') || err.message.includes('AbortError'))) {`);

fs.writeFileSync('lib/supabase/client.ts', content);
console.log("Patched supabase client successfully");
