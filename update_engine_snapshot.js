const fs = require('fs');
let code = fs.readFileSync('/app/applet/lib/trading-engine/engine.ts', 'utf8');

code = code.replace(/return \{\n\s*entryPrice,/, `return {
          ...setupDetails,
          entryPrice,`);

// Down in advanceStateMachine... Wait! When advanceStateMachine is called, how do we pass translatedSnapshot?
// Let's modify runDetectionCycle where we call advanceStateMachine to include translatedSnapshot in setupDetails!

code = code.replace(/const translatedSnapshot = this\.setupDetector\.translateMarketDataToSnapshot\(strategyId, pyData\);/, 
`const translatedSnapshot = this.setupDetector.translateMarketDataToSnapshot(strategyId, pyData);
        setup.setupSnapshot = translatedSnapshot;`);

// Wait, setup object doesn't have setupSnapshot in its type? Let's pass translatedSnapshot to advanceStateMachine:
// find where advanceStateMachine(..., { setupDetails: { ... } }) is called.
// Let's just modify the final steps that call advanceStateMachine:
code = code.replace(/await this\.advanceStateMachine\(sm, STEPS\.REJECTED, validationResult\.reasoning, setup\.id, context, \{ marketStates, ruleResults, setupDetails: \{ aiDecision: validationResult\.decision, direction, entryPrice, slPrice, tpPrice \} \}\);/,
`await this.advanceStateMachine(sm, STEPS.REJECTED, validationResult.reasoning, setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: validationResult.decision, direction, entryPrice, slPrice, tpPrice } });`);

code = code.replace(/await this\.advanceStateMachine\(sm, STEPS\.SIGNAL_ACTIVE, 'Signal generated successfully', setup\.id, context, \{ marketStates, ruleResults, setupDetails: \{ aiDecision: validationResult\.decision, direction, entryPrice, slPrice, tpPrice \} \}\);/,
`await this.advanceStateMachine(sm, STEPS.SIGNAL_ACTIVE, 'Signal generated successfully', setup.id, context, { marketStates, ruleResults, setupDetails: { ...translatedSnapshot, aiDecision: validationResult.decision, direction, entryPrice, slPrice, tpPrice } });`);


fs.writeFileSync('/app/applet/lib/trading-engine/engine.ts', code);
console.log("Updated engine snapshot merge");
