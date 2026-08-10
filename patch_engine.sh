cat << 'INNER' > patch.js
const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/engine.ts', 'utf8');

code = code.replace(
  /if \(candidateEval.isWaiting\) \{[\s\S]*?this\.setupDetector\.clearSetup\(context\.symbol\);\s*return;\s*\}/,
  `if (candidateEval.isWaiting) {
          const reason = candidateEval.rejectionReason || '';
          const isScanning = reason.includes('structure') || reason.includes('sweep') || reason.includes('CHoCH') || reason.includes('OB/FVG') || reason.includes('zone') || reason.includes('engulfing') || reason.includes('double');
          const step = isScanning ? STEPS.SCANNING : STEPS.WAITING_MARKET;
          await this.advanceStateMachine(sm, step, reason || 'Waiting for market data or session', setup.id, context, { marketStates, ruleResults: evaluatedRules });
          logger.info(\`[\${step}] Strategy \${strategyId} waiting: \${reason}\`);
          if (!isScanning) {
            this.setupDetector.clearSetup(context.symbol);
          }
          return;
        }`
);

fs.writeFileSync('lib/trading-engine/engine.ts', code);
INNER
node patch.js
