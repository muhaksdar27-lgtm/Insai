const fs = require('fs');
let content = fs.readFileSync('lib/supabase/client.ts', 'utf-8');

const target = `const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout`;
const replacement = `const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('lib/supabase/client.ts', content);
    console.log("Patched supabase timeout successfully");
} else {
    console.log("Target not found");
}
