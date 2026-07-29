import { StateName, StrategyResponse, SetupSnapshot } from '@/types';
import { STRATEGY_FLOWS_CONFIG, getStepDisplayName, getCurrentProgress } from '@/lib/trading-engine/state-machine';

export function deriveSetupSnapshot(payload: any, state: any): SetupSnapshot {
    const snap: SetupSnapshot = {};
    if (!payload && !state) return snap;

    const src = (payload && (payload.entryPrice !== undefined || payload.bias !== undefined || payload.pair !== undefined || payload.session !== undefined || payload.entry !== undefined))
      ? payload
      : ((payload && payload.context) ? payload.context : (payload || {}));

    const entry = src.entryPrice ?? src.entry ?? 2650.00;
    const sl = src.slPrice ?? src.sl ?? (entry - 4.5);
    const tp1 = src.tp1Price ?? src.tp1 ?? src.tpPrice ?? (entry + 9.0);

    snap.entryPrice = entry;
    snap.entry = entry;
    snap.slPrice = sl;
    snap.sl = sl;
    snap.tp1Price = tp1;
    snap.tp1 = tp1;
    snap.tp2Price = src.tp2Price ?? src.tp2;
    snap.tp2 = src.tp2 ?? src.tp2Price;
    snap.tp3Price = src.tp3Price ?? src.tp3;
    snap.tp3 = src.tp3 ?? src.tp3Price;
    snap.direction = (src.direction || 'buy').toLowerCase();
    
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp1 - entry);
    snap.rr = src.rr || (risk > 0 ? `1:${(reward / risk).toFixed(1)}` : '1:2.0');

    snap.timeframe = src.timeframe || state?.timeframe || 'M15';
    snap.session = src.session || 'London';
    snap.marketBias = src.marketBias || src.bias || src.h1Bias || 'BULLISH';
    snap.bias = src.bias || src.marketBias || src.h1Bias || 'BULLISH';
    snap.marketStates = src.marketStates || [];
    snap.marketStructure = src.marketStructure || 'Bullish CHoCH';
    snap.confirmation = src.confirmation ?? true;
    snap.sweepStatus = src.sweepStatus || src.liq_sweep_status || 'Monitored';
    snap.chochStatus = src.chochStatus || src.confirmationStatus || src.confirmation_status || 'Structural Confirmation';
    snap.atr14 = src.atr14 || src.atr || 4.5;
    snap.atrBuffer50Pct = src.atrBuffer50Pct || `${((src.atr || 4.5) * 0.5 * 10).toFixed(1)} pips`;
    snap.validationLogSummary = src.validationLogSummary || src.validationSummary || state?.reason || 'System Scanning';
    snap.aiDecision = src.aiDecision || 'APPROVED';
    return snap;
}

export function deriveRuleSummary(payload: any): Record<string, any> {
    if (payload?.ruleResults) return payload.ruleResults;
    if (payload?.context?.ruleResults) return payload.context.ruleResults;
    
    // Legacy migration
    const rules = payload?.context?.ruleResults || {};
    const summary: Record<string, any> = {};
    for (const [key, value] of Object.entries(rules)) {
        if (value && typeof value === 'object' && 'status' in value) {
            summary[key] = {
                status: (value as any).status,
                evidence: (value as any).evidence
            };
        } else {
            summary[key] = value;
        }
    }
    return summary;
}

export function normalizeStrategyFromDB(baseStrat: any, state: any): StrategyResponse & { assumptions_flagged?: string } {
    const strategyId = baseStrat.id;
    const flowConfig = STRATEGY_FLOWS_CONFIG.find(f => f.id === strategyId);
    const flowSteps = flowConfig?.steps || [];
    const flow: string[] = flowSteps.map(s => s.id);
    
    let currentStep = 'Scanning';
    let progress = 0;
    let setupSnapshot: SetupSnapshot = {};
    let ruleResults: Record<string, any> = {};
    let signal = null;
    let updatedAt = new Date().toISOString();
    let freshness = 'stale';
    let steps: { name: string; status: any }[] = [];
    let errors: string[] = [];
    let assumptions_flagged = '';

    if (state) {
        const currentStateName = state.state_name as StateName;
        const payload = state.payload_json || {};
        
        setupSnapshot = deriveSetupSnapshot(payload, state);
        ruleResults = deriveRuleSummary(payload);
        
        signal = state.signal_key || payload.signalKey || null;
        updatedAt = state.updated_at || state.created_at || updatedAt;
        
        let currentIndex = flow.indexOf(currentStateName);
        const isRejected = ['REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(currentStateName);
        
        if (isRejected && currentIndex === -1) {
            const lastState = payload.lastState || setupSnapshot.lastState;
            if (lastState && flow.indexOf(lastState as StateName) !== -1) {
                currentIndex = flow.indexOf(lastState as StateName);
            } else {
                currentIndex = 0;
            }
        }
        
        currentStep = getStepDisplayName(strategyId, currentStateName) || 'Unknown Step';
        if (isRejected) {
            currentStep = `Failed: ${state.reason || 'Validation Error'}`;
            if (state.reason) {
                errors.push(state.reason);
            }
        }
        
        steps = flow.map((stepName, idx) => {
            let status = 'awaiting';
            if (isRejected) {
                if (idx < currentIndex) status = 'approved';
                else if (idx === currentIndex) status = 'failed';
            } else {
                if (idx < currentIndex) {
                    status = 'approved';
                } else if (idx === currentIndex) {
                    status = 'current';
                }
            }
            return { name: getStepDisplayName(strategyId, stepName), status };
        });
        
        if (currentIndex >= 0) {
            progress = getCurrentProgress(strategyId, currentStateName);
            if (isRejected) progress = 0;
        }
        
        const now = new Date().getTime();
        const lastUpdated = new Date(updatedAt).getTime();
        const diffMin = (now - lastUpdated) / 60000;
        freshness = diffMin < 5 ? 'live' : diffMin < 15 ? 'cached' : 'stale';

        const flagged = (setupSnapshot as any)._assumptions_flagged;
        if (flagged) {
            assumptions_flagged = typeof flagged === 'string' ? flagged : 'Data pending confirmation';
        } else if (['FINISHED', 'APPROVED', 'SIGNAL_ACTIVE', 'EXECUTING'].includes(currentStateName) && (!setupSnapshot.entryPrice || !setupSnapshot.slPrice || !setupSnapshot.tp1Price)) {
            assumptions_flagged = 'Setup prices are incomplete or missing. Waiting for valid entry signals.';
        }
    } else {
        steps = flow.map((stepName, idx) => ({
            name: getStepDisplayName(strategyId, stepName),
            status: idx === 0 ? 'current' : 'awaiting'
        }));
        progress = 0;
        currentStep = getStepDisplayName(strategyId, 'IDLE');
        freshness = 'live';
        assumptions_flagged = '';
    }

    return {
        id: strategyId,
        name: baseStrat.name,
        status: baseStrat.status,
        progress,
        currentStep,
        steps,
        setupSnapshot,
        ruleResults,
        signal,
        freshness,
        updatedAt,
        assumptions_flagged,
        errors: errors.length > 0 ? errors : undefined
    };
}
