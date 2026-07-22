const fs = require('fs');
let code = fs.readFileSync('lib/observability/health-check.ts', 'utf8');

// Replace the manual MarketData check block with provider registry
code = code.replace(/try {\n\s+const start = Date\.now\(\);.*?Check Economic Calendar/s, `try {
    const start = Date.now();
    const providers = getProviderRegistry().getAllHealth();
    let onlineCount = 0;
    let rateLimited = false;
    let lastError = null;
    let configuredCount = 0;

    providers.filter(p => p.category === 'price').forEach(p => {
        if (p.providerName !== 'yahoo-finance') {
             configuredCount++;
             if (p.healthStatus === 'ONLINE') onlineCount++;
             else if (p.healthStatus === 'RATE_LIMITED') rateLimited = true;
             else if (p.lastError) lastError = p.lastError;
        }
    });

    if (configuredCount === 0) {
        this.updateServiceHealth('MarketData', 'ONLINE', Date.now() - start, 'Using YahooFinance fallback');
    } else if (onlineCount > 0) {
        this.updateServiceHealth('MarketData', 'ONLINE', Date.now() - start, onlineCount > 1 ? 'Hybrid Active' : 'Online');
    } else if (rateLimited) {
        this.updateServiceHealth('MarketData', 'RATE LIMITED', Date.now() - start, lastError);
    } else {
        this.updateServiceHealth('MarketData', 'UNAVAILABLE', Date.now() - start, lastError || 'All configured providers failed');
    }
} catch (e: any) {
    this.updateServiceHealth('MarketData', 'UNAVAILABLE', 0, e.message);
}

// Check Economic Calendar`);

fs.writeFileSync('lib/observability/health-check.ts', code);
