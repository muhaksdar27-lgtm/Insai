const fs = require('fs');
let content = fs.readFileSync('lib/trading-engine/engine.ts', 'utf-8');

const target = `        // Advance to Candidate stage
        setup = this.setupDetector.transitionState(setup.id, 'candidate', 'Evaluating specific strategy rules');`;

const replacement = `        // Advance to Candidate stage
        if (setup.status === 'scanning') {
            setup = this.setupDetector.transitionState(setup.id, 'candidate', 'Evaluating specific strategy rules');
        }`;

content = content.replace(target, replacement);
fs.writeFileSync('lib/trading-engine/engine.ts', content);
