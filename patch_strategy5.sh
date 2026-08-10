cat << 'INNER' > patch_rule_engine.js
const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/rule-engine.ts', 'utf8');

const strategy4Block = "} else if (strategyId === 'strategy-4-news') {";

// Find where strategy-4 ends by looking for Risk Reward logic
const riskRewardIndex = code.indexOf('// 5. Risk / Reward Minimums');

const strategy5Rules = `    } else if (strategyId === 'strategy-5-smc-sd-confluence') {
      const confluenceActive = (bosBull || bosBear) && sdActive;
      rules['rule_confluence_overlap'] = this.createRuleResult(
        'rule_confluence_overlap',
        true,
        confluenceActive ? true : 'WAIT',
        confluenceActive ? 'Confluence Overlap Confirmed' : 'Waiting for confluence',
        'BOS and S&D Zone Confluence',
        'Waiting for BOS and S&D Zone confluence',
        { bosBull, bosBear, sdActive },
        'SMC-SD Multi-Zone Confluence Overlap'
      );
`;

const newCode = code.slice(0, riskRewardIndex) + strategy5Rules + code.slice(riskRewardIndex);
fs.writeFileSync('lib/trading-engine/rule-engine.ts', newCode);
INNER
node patch_rule_engine.js
