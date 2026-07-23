const fs = require('fs');
let content = fs.readFileSync('lib/market-data/market-data-service.ts', 'utf-8');

const target1 = `      this.getLatestPrice('DXY', 60000).catch(() => ({ status: 'error', reason: 'Failed to fetch DXY' })),`;
const target2 = `      this.getLatestPrice('US10Y', 60000).catch(() => ({ status: 'error', reason: 'Failed to fetch US10Y' }))`;

const rep1 = `      this.getLatestPrice('DXY', 300000).catch(() => ({ status: 'error', reason: 'Failed to fetch DXY' })),`;
const rep2 = `      this.getLatestPrice('US10Y', 300000).catch(() => ({ status: 'error', reason: 'Failed to fetch US10Y' }))`;

content = content.replace(target1, rep1).replace(target2, rep2);
fs.writeFileSync('lib/market-data/market-data-service.ts', content);
