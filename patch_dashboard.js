const fs = require('fs');
let content = fs.readFileSync('app/api/dashboard/snapshot/route.ts', 'utf8');

// replace the strategy loading code block
const stratCodeBlockRegex = /\(async \(\) => \{\n\s*const allStrats = getAllStrategies\(\);.*?return normalizedList;\n\s*\}\)\(\)/s;

if (stratCodeBlockRegex.test(content)) {
    content = content.replace(stratCodeBlockRegex, 'getStrategiesData()');
    content = `import { getStrategiesData } from '@/lib/services/api-service';\n` + content;
    fs.writeFileSync('app/api/dashboard/snapshot/route.ts', content);
    console.log("Successfully replaced strategy logic in dashboard snapshot");
} else {
    console.log("Could not find regex match");
}
