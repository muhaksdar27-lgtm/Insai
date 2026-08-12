const fs = require('fs');

let sm = fs.readFileSync('lib/trading-engine/state-machine.ts', 'utf8');
let sr = fs.readFileSync('lib/trading-engine/strategy-registry.ts', 'utf8');

// The strategy-registry.ts names:
sr = sr.replace(/'Strategy 1 \(SMC \+ London \+ M15\)'/g, "'STRATEGI 1 — Canonical SMC'");
sr = sr.replace(/'Strategy 2 \(S&D \+ Engulfing\)'/g, "'STRATEGI 2 — Supply & Demand + Engulfing'");
sr = sr.replace(/'Strategy 3 \(Scalping SMC \+ Liquidity Sweep \+ Double Top\/Bottom\)'/g, "'STRATEGI 3 — Scalping SMC + Liquidity Sweep + Double Top/Bottom'");
sr = sr.replace(/'Strategy 4 \(News Reversal\)'/g, "'STRATEGI 4 — News Liquidity Sweep Reversal'");
sr = sr.replace(/'Strategy 5: SMC-SD-Pattern Confluence'/g, "'STRATEGI 5 — SMC-SD Pattern Confluence'");

fs.writeFileSync('lib/trading-engine/strategy-registry.ts', sr);
