import { StateName, StrategyResponse, SetupSnapshot } from '@/types';
import { STRATEGY_FLOWS_CONFIG, getStepDisplayName, getCurrentProgress } from '@/lib/trading-engine/state-machine';

export function deriveSetupSnapshot(payload: any, state: any): SetupSnapshot {
    const snap: SetupSnapshot = {};
    if (!payload && !state) return snap;

    // From new patched engine structure
    if (payload.entryPrice !== undefined || payload.entry !== undefined) {
        snap.entryPrice = payload.entryPrice || payload.entry;
        snap.entry = payload.entry || payload.entryPrice;
        snap.slPrice = payload.slPrice || payload.sl;
        snap.sl = payload.sl || payload.slPrice;
        snap.tp1Price = payload.tp1Price || payload.tp1 || payload.tpPrice;
        snap.tp1 = payload.tp1 || payload.tp1Price || payload.tpPrice;
        snap.tp2Price = payload.tp2Price || payload.tp2;
        snap.tp2 = payload.tp2 || payload.tp2Price;
        snap.tp3Price = payload.tp3Price || payload.tp3;
        snap.tp3 = payload.tp3 || payload.tp3Price;
        snap.direction = payload.direction;
        snap.rr = payload.rr;
        snap.timeframe = payload.timeframe || state?.timeframe;
        snap.session = payload.session;
        snap.marketBias = payload.marketBias || payload.bias;
        snap.bias = payload.bias || payload.marketBias;
        snap.marketStates = payload.marketStates || [];
        snap.marketStructure = payload.marketStructure;
        snap.confirmation = payload.confirmation;
        snap.validationLogSummary = payload.validationLogSummary || payload.validationSummary || state?.reason || '';
        snap.aiDecision = payload.aiDecision;
        return snap;
    }
    
    // Legacy migration for old payloads
    snap.entryPrice = payload.context?.entryPrice;
    snap.entry = payload.context?.entryPrice;
    snap.slPrice = payload.context?.slPrice;
    snap.sl = payload.context?.slPrice;
    snap.tp1Price = payload.context?.tp1Price || payload.context?.tpPrice;
    snap.tp1 = payload.context?.tp1Price || payload.context?.tpPrice;
    snap.direction = payload.context?.direction;
    snap.timeframe = payload.context?.timeframe || state?.timeframe;
    snap.session = payload.context?.session;
    snap.marketBias = payload.context?.direction;
    snap.bias = payload.context?.direction;
    snap.marketStates = payload.context?.marketStates || [];
    snap.validationLogSummary = state?.reason || '';
    snap.aiDecision = payload.context?.aiDecision || payload.aiDecision;
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
