const fs = require('fs');

let file = './lib/trading-engine/engine.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /constructor\(\) \{\s*this\.ruleEngine = new \(\);\s*this\.signalPipeline = new SignalPipeline\(\);\s*this\.setupDetector = new SetupDetector\(\);\s*this\.aiValidator = new AIValidationOrchestrator\(\);\s*this\.marketStateEngine = new MarketStateEngine\(this\.ruleEngine\);\s*\}/;

const replacement = `constructor() {
    this.signalPipeline = new SignalPipeline();
    this.setupDetector = new SetupDetector();
    this.marketStateEngine = new MarketStateEngine();
  }`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
