const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/rule-engine.ts', 'utf8');

// The junk at the end is after "return rules;\n  }\n}"
let validCodeEnd = code.indexOf('return rules;\n  }\n}');
if (validCodeEnd !== -1) {
  code = code.substring(0, validCodeEnd + 19);
}

// Fix Strategy 4
code = code.replace(/newsReversal,/g, "newsReversal ? true : 'WAIT',");
code = code.replace(/'No post-news reversal pattern detected'/g, "'Waiting for post-news reversal pattern'");

// Fix Strategy 5
code = code.replace(/confluenceActive,/g, "confluenceActive ? true : 'WAIT',");
code = code.replace(/'Confluence overlap threshold not met'/g, "'Waiting for confluence overlap'");

fs.writeFileSync('lib/trading-engine/rule-engine.ts', code);
