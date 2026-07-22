const fs = require('fs');
let code = fs.readFileSync('./lib/trading-engine/market-state-engine.ts', 'utf8');

const regex = /public classifyState[\s\S]*?return states;\s*\}/;

code = code.replace(regex, `public classifyState(context: RuleEvaluationContext): MarketState[] {
    const states: MarketState[] = [];
    states.push(MarketState.TRENDING);
    return states;
  }`);

fs.writeFileSync('./lib/trading-engine/market-state-engine.ts', code);
