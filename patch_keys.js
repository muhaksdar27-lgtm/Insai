const fs = require('fs');

const files = [
  'lib/trading-engine/strategies/strategy-1-smc.ts',
  'lib/trading-engine/strategies/strategy-2-snd.ts',
  'lib/trading-engine/strategies/strategy-3-scalping.ts',
  'lib/trading-engine/strategies/strategy-4-news.ts',
  'lib/trading-engine/strategies/strategy-5-smc-sd-confluence.ts'
];

files.forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/for \(const \[key, res\] of Object\.entries\(candidateRules\)\)/g, "for (const res of Object.values(candidateRules))");
  fs.writeFileSync(file, code);
});

