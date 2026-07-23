const fs = require('fs');
let content = fs.readFileSync('lib/market-data/data-validator.ts', 'utf-8');

content = content.replace("const priceChangePct = Math.abs((candle.open - prevCandle.close) / prevCandle.close);", "const priceChangePct = Math.abs((candle.open - prevCandle.close) / prevCandle.close);\n        const atrThreshold = 0.003; // Approximate ATR threshold for XAUUSD");
content = content.replace("if (priceChangePct > 0.05) { // 5% jump", "if (priceChangePct > atrThreshold) {");
content = content.replace("if (priceChangePct > 0.1) {", "if (priceChangePct > (atrThreshold * 2)) {");
content = content.replace("return { isValid: false, reason: `Price Outlier Error: Jump > 10% at ${candle.timestamp}` };", "return { isValid: false, reason: `Volatility/ATR Error: Abnormal price jump detected at ${candle.timestamp}. Holding signals.` };");

fs.writeFileSync('lib/market-data/data-validator.ts', content);
