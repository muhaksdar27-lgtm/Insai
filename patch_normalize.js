const fs = require('fs');
let code = fs.readFileSync('lib/trading-engine/strategy-normalize.ts', 'utf8');

code = code.replace(
  "        currentStep = getStepDisplayName(strategyId, currentStateName) || 'Unknown Step';\n        if (isRejected) {\n            currentStep = `Failed: ${state.reason || 'Validation Error'}`;\n            if (state.reason) {\n                errors.push(state.reason);\n            }\n        }",
  "        currentStep = getStepDisplayName(strategyId, currentStateName) || 'Unknown Step';\n        if (isRejected) {\n            currentStep = `Failed: ${state.reason || 'Validation Error'}`;\n            if (state.reason) {\n                errors.push(state.reason);\n            }\n        } else if (['WAITING_MARKET', 'SCANNING', 'INITIALIZING'].includes(currentStateName) || currentStateName.includes('WAIT')) {\n            if (state.reason && state.reason.trim() !== '' && state.reason !== 'Success' && state.reason !== 'Waiting for market data...') {\n                currentStep = `Wait: ${state.reason}`;\n            }\n        }"
);

fs.writeFileSync('lib/trading-engine/strategy-normalize.ts', code);
