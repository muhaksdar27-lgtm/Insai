const fs = require('fs');
let content = fs.readFileSync('lib/trading-engine/engine.ts', 'utf-8');

const target = `    // 1. Market State Classification
    const marketStates = this.marketStateEngine.classifyState(context);`;

const replacement = `    // 1. Macro News Filter (Ultra-High Accuracy Filtration)
    const calendarEvents = context.marketData?.calendar || [];
    const nowTime = new Date().getTime();
    let hasHighImpactUSDNews = false;
    for (const evt of calendarEvents) {
        if (evt.impact === 'high' && (evt.country === 'USD' || evt.currency === 'USD')) {
            const evtTime = new Date(evt.time || evt.timestamp || nowTime).getTime();
            const diffMins = Math.abs(evtTime - nowTime) / (1000 * 60);
            if (diffMins <= 30) {
                hasHighImpactUSDNews = true;
                break;
            }
        }
    }

    if (hasHighImpactUSDNews) {
        logger.warn(\`Macro News Filter: High Impact USD News detected within 30 minutes! Entering STANDBY mode.\`);
        for (const stratId of activeStrategyIds) {
            await this.syncState(stratId, STEPS.SUPPRESSED, 'standby', 'Macro News Filter: Standby mode due to High Impact USD news', null, this.buildSetupSnapshot(context, { validationSummary: 'Standby mode due to High Impact USD news' }));
        }
        return;
    }

    // 1. Market State Classification
    const marketStates = this.marketStateEngine.classifyState(context);`;

content = content.replace(target, replacement);
fs.writeFileSync('lib/trading-engine/engine.ts', content);
