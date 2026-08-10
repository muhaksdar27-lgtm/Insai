cat << 'INNER' > patch_rules.js
const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/rule-engine.ts', 'utf8');

// replace sweepActive -> sweepActive ? true : 'WAIT'
code = code.replace(/sweepActive,/g, "sweepActive ? true : 'WAIT',");
// replace chochActive -> chochActive ? true : 'WAIT'
code = code.replace(/chochActive,/g, "chochActive ? true : 'WAIT',");
// replace obFvgActive -> obFvgActive ? true : 'WAIT'
code = code.replace(/obFvgActive,/g, "obFvgActive ? true : 'WAIT',");
// replace zoneActive -> zoneActive ? true : 'WAIT'
code = code.replace(/zoneActive,/g, "zoneActive ? true : 'WAIT',");
// replace engulfBull || engulfBear -> (engulfBull || engulfBear) ? true : 'WAIT'
code = code.replace(/engulfBull \|\| engulfBear,/g, "(engulfBull || engulfBear) ? true : 'WAIT',");
// doubleTopBottom
code = code.replace(/doubleTop \|\| doubleBottom,/g, "(doubleTop || doubleBottom) ? true : 'WAIT',");

// Also replace the failure reasons to have the keywords used in engine.ts isScanning
// Liquidity Sweep
code = code.replace(/'No liquidity sweep detected'/g, "'Waiting for liquidity sweep'");
// CHoCH
code = code.replace(/'No M15 CHoCH confirmed'/g, "'Waiting for CHoCH confirmation'");
// OB / FVG
code = code.replace(/'Price outside Order Block \/ FVG zone'/g, "'Waiting for OB/FVG zone'");
// Zone
code = code.replace(/'No active S&D zone'/g, "'Waiting for active zone'");
// Engulfing
code = code.replace(/'No engulfing pattern'/g, "'Waiting for engulfing pattern'");
// Double Top/Bottom
code = code.replace(/'No double top\/bottom structure'/g, "'Waiting for double top/bottom structure'");

fs.writeFileSync('lib/trading-engine/rule-engine.ts', code);
INNER
node patch_rules.js
