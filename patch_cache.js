const fs = require('fs');
let content = fs.readFileSync('lib/market-data/market-data-service.ts', 'utf-8');

const target = `    const cacheEntry = {
      data: snapshot,
      expiresAt: now + this.PRICE_CACHE_TTL_MS
    };
    this.priceCache.set(symbol, cacheEntry);
    getQueueManager().setCache(\`price:\${symbol}\`, cacheEntry, Math.ceil(this.PRICE_CACHE_TTL_MS / 1000)).catch(() => {});`;

const replacement = `    const ttl = (symbol === 'DXY' || symbol === 'US10Y') ? 300000 : this.PRICE_CACHE_TTL_MS;
    const cacheEntry = {
      data: snapshot,
      expiresAt: now + ttl
    };
    this.priceCache.set(symbol, cacheEntry);
    getQueueManager().setCache(\`price:\${symbol}\`, cacheEntry, Math.ceil(ttl / 1000)).catch(() => {});`;

content = content.replace(target, replacement);
fs.writeFileSync('lib/market-data/market-data-service.ts', content);
