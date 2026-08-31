import { StateName, StrategyResponse, SetupSnapshot } from '@/types';
import { STRATEGY_FLOWS_CONFIG, getStepDisplayName } from '@/lib/trading-engine/state-machine';

export function deriveSetupSnapshot(payload: any, state: any): SetupSnapshot {
    const snap: SetupSnapshot = {};
    if (!payload && !state) return snap;

    const src = payload?.setupSnapshot || payload?.setupDetails || payload?.context?.setupSnapshot || payload?.context?.setupDetails || (payload && (payload.entryPrice !== undefined || payload.bias !== undefined || payload.pair !== undefined || payload.session !== undefined || payload.entry !== undefined) ? payload : ((payload && payload.context) ? payload.context : (payload || {})));

    const entry = src.entryPrice ?? src.entry ?? src.current_price;
    const sl = src.slPrice ?? src.sl;
    const tp1 = src.tp1Price ?? src.tp1 ?? src.tpPrice;

    if (entry !== undefined && entry !== null) {
      snap.entryPrice = entry;
      snap.entry = entry;
    }
    if (sl !== undefined && sl !== null) {
      snap.slPrice = sl;
      snap.sl = sl;
    }
    if (tp1 !== undefined && tp1 !== null) {
      snap.tp1Price = tp1;
      snap.tp1 = tp1;
    }
    snap.tp2Price = src.tp2Price ?? src.tp2;
    snap.tp2 = src.tp2 ?? src.tp2Price;
    snap.tp3Price = src.tp3Price ?? src.tp3;
    snap.tp3 = src.tp3 ?? src.tp3Price;
    
    if (src.direction) {
      const dirLower = String(src.direction).toLowerCase();
      snap.direction = (dirLower === 'long' || dirLower === 'buy') ? 'buy' : (dirLower === 'short' || dirLower === 'sell') ? 'sell' : dirLower;
    } else if (src.bias || src.marketBias || src.trend_h1) {
      const biasStr = String(src.bias || src.marketBias || src.trend_h1).toLowerCase();
      snap.direction = biasStr.includes('bear') ? 'sell' : 'buy';
    }
    
    if (entry && sl && tp1) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp1 - entry);
      snap.rr = src.rr || (risk > 0 ? `1:${(reward / risk).toFixed(1)}` : '--');
    } else {
      snap.rr = src.rr || '--';
    }

    snap.pair = src.pair || src.symbol || state?.symbol || 'XAUUSD';
    snap.timeframe = src.timeframe || state?.timeframe || 'M15';
    snap.session = src.session || '--';
    const biasVal = src.bias || src.marketBias || src.h1Bias || src.trend_h1 || src.trend || 'NEUTRAL';
    snap.bias = String(biasVal).toUpperCase();
    snap.marketBias = snap.bias;
    snap.h1Bias = snap.bias;
    snap.marketStates = src.marketStates || [];
    snap.marketStructure = src.marketStructure;
    snap.confirmation = src.confirmation;
    snap.sweepStatus = src.sweepStatus || src.liq_sweep_status || 'Monitored';
    snap.confirmationStatus = src.confirmationStatus || src.confirmation_status || src.chochStatus || 'Monitored';
    snap.sdZoneStatus = src.sdZoneStatus || src.sd_zone_status || src.zone_status || 'Monitored';
    snap.atr14 = src.atr14 || src.atr || '--';
    if (snap.atr14 && snap.atr14 !== '--') {
      snap.atrBuffer50Pct = src.atrBuffer50Pct || `${(Number(snap.atr14) * 0.5 * 10).toFixed(1)} pips`;
    }
    snap.validationLogSummary = src.validationLogSummary || src.validationSummary || state?.reason;
    snap.aiDecision = src.aiDecision;
    return snap;
}

export function deriveRuleSummary(payload: any): Record<string, any> {
    if (payload?.ruleResults && Object.keys(payload.ruleResults).length > 0) return payload.ruleResults;
    if (payload?.context?.ruleResults && Object.keys(payload.context.ruleResults).length > 0) return payload.context.ruleResults;
    if (payload?.candidateRules && Object.keys(payload.candidateRules).length > 0) return payload.candidateRules;
    if (payload?.rules && Object.keys(payload.rules).length > 0) return payload.rules;
    
    return {};
}

export function normalizeStrategyFromDB(baseStrat: any, state?: any): StrategyResponse & { assumptions_flagged?: string } {
    if (!baseStrat) {
        return {
            id: 'unknown',
            name: 'Unknown Strategy',
            status: 'UNKNOWN',
            progress: 0,
            currentStep: 'Unknown',
            steps: [],
            setupSnapshot: {},
            ruleResults: {},
            signal: null,
            freshness: 'stale',
            updatedAt: null
        };
    }

    const strategyId = baseStrat.id;
    const flowConfig = STRATEGY_FLOWS_CONFIG.find(f => f.id === strategyId);
    const flowSteps = flowConfig?.steps?.filter(s => s.id !== 'FAILED' && s.id !== 'REJECTED') || flowConfig?.steps || [];
    
    let currentStep = 'Awaiting';
    let progress = 0;
    let setupSnapshot: SetupSnapshot = {};
    let ruleResults: Record<string, any> = {};
    let signal: any = null;
    let updatedAt: string | null = null;
    let freshness = 'stale';
    let steps: { id?: string; name: string; status: any }[] = [];
    const errors: string[] = [];
    let assumptions_flagged = '';
    let status = baseStrat.status || baseStrat.state || 'UNKNOWN';

    if (baseStrat.status === 'DATABASE_UNAVAILABLE' || baseStrat.state === 'DATABASE_UNAVAILABLE') {
        return {
            id: strategyId,
            name: baseStrat.name,
            status: 'DATABASE_UNAVAILABLE',
            progress: 0,
            currentStep: 'Database Unavailable',
            steps: flowSteps.map(s => ({ id: s.id, name: s.title, status: 'awaiting' })),
            setupSnapshot: {},
            ruleResults: {},
            signal: null,
            freshness: 'stale',
            updatedAt: null,
            errors: ['Database state unavailable']
        };
    }

    const effectiveState = state || (baseStrat.state_name || baseStrat.state || baseStrat.setup_snapshot || baseStrat.payload_json ? {
        state_name: baseStrat.state_name || baseStrat.state,
        payload_json: baseStrat.payload_json || {
            setupSnapshot: baseStrat.setup_snapshot,
            ruleResults: baseStrat.rule_results,
            signalKey: baseStrat.signal_key || baseStrat.signal,
            ...baseStrat.setup_snapshot
        },
        signal_key: baseStrat.signal_key || baseStrat.signal,
        reason: baseStrat.reason || baseStrat.current_step_id || baseStrat.current_step,
        updated_at: baseStrat.updated_at,
        created_at: baseStrat.created_at
    } : null);

    if (effectiveState && effectiveState.state_name) {
        const currentStateName = effectiveState.state_name as StateName;
        const payload = effectiveState.payload_json || {};
        status = currentStateName;
        
        setupSnapshot = deriveSetupSnapshot(payload, effectiveState);
        ruleResults = deriveRuleSummary(payload);
        
        signal = effectiveState.signal_key || payload.signalKey || payload.signal_key || null;
        updatedAt = effectiveState.updated_at || effectiveState.created_at || null;
        
        const isRejected = ['FAILED', 'REJECTED', 'EXPIRED', 'SUPPRESSED', 'INVALIDATED'].includes(currentStateName);
        
        if (isRejected) {
            currentStep = `Failed: ${effectiveState.reason || 'Validation Error'}`;
            if (effectiveState.reason) {
                errors.push(effectiveState.reason);
            }
        } else if (currentStateName === 'AI_PENDING') {
            currentStep = effectiveState.reason || 'AI Evaluation Pending';
        } else if (currentStateName === 'SIGNAL_ACTIVE' || currentStateName === 'APPROVED') {
            currentStep = 'Signal Dispatched';
        } else if (currentStateName === 'VALIDATED') {
            currentStep = effectiveState.reason || 'Technical Rules Validated';
        } else if (currentStateName === 'DETECTED') {
            currentStep = effectiveState.reason || 'Setup Detected';
        } else if (currentStateName === 'AWAITING') {
            currentStep = effectiveState.reason || 'Awaiting Setup Confluence';
        } else {
            currentStep = getStepDisplayName(strategyId, currentStateName) || effectiveState.reason || 'Scanning';
        }

        // Canonical step records strictly preserved from engine
        const canonicalStepRecords: any[] = payload.setupObject?.steps || payload.steps || payload.setupDetails?.steps || [];

        steps = flowSteps.map((stepConfig, idx) => {
            const stepId = stepConfig.id;
            const title = stepConfig.title;

            // 1. Direct match with canonical step record
            const recorded = canonicalStepRecords.find(
                (s: any) => s.step_id === stepId || s.step_order === idx + 1 || s.name === title
            );

            if (recorded) {
                const rawState = String(recorded.state || recorded.status || '').toUpperCase();
                let mappedStatus: string = 'awaiting';
                if (rawState === 'VALIDATED') mappedStatus = 'validated';
                else if (rawState === 'APPROVED') mappedStatus = 'approved';
                else if (rawState === 'ACTIVE' || rawState === 'DETECTED') mappedStatus = 'active';
                else if (rawState === 'REJECTED' || rawState === 'INVALIDATED' || rawState === 'FAILED') mappedStatus = 'rejected';
                else if (rawState === 'EXPIRED') mappedStatus = 'expired';
                else mappedStatus = 'awaiting';

                return { id: stepId, name: title, status: mappedStatus };
            }

            // 2. Direct 1:1 match in ruleResults
            const directRule = ruleResults[stepId] || Object.values(ruleResults).find((r: any) => r.ruleId === stepId);
            if (directRule) {
                const stUpper = String(directRule.status || '').toUpperCase();
                if (stUpper === 'PASS' || stUpper === 'VALID' || stUpper === 'VALIDATED' || stUpper === 'APPROVED') {
                    return { id: stepId, name: title, status: 'validated' };
                }
                if (stUpper === 'FAIL' || stUpper === 'INVALID' || stUpper === 'REJECTED') {
                    return { id: stepId, name: title, status: 'rejected' };
                }
            }

            return { id: stepId, name: title, status: 'awaiting' };
        });

        const validatedCount = steps.filter(s => s.status === 'validated' || s.status === 'approved').length;
        progress = steps.length > 0 ? Math.round((validatedCount / steps.length) * 100) : 0;
        
        const now = new Date().getTime();
        const lastUpdated = updatedAt ? new Date(updatedAt).getTime() : 0;
        const diffMin = updatedAt ? (now - lastUpdated) / 60000 : 999;
        freshness = diffMin < 5 ? 'live' : diffMin < 15 ? 'cached' : 'stale';

        const flagged = (setupSnapshot as any)._assumptions_flagged;
        if (flagged) {
            assumptions_flagged = typeof flagged === 'string' ? flagged : 'Data pending confirmation';
        } else if (['FINISHED', 'APPROVED', 'SIGNAL_ACTIVE', 'EXECUTING'].includes(currentStateName) && (!setupSnapshot.entryPrice || !setupSnapshot.slPrice || !setupSnapshot.tp1Price)) {
            assumptions_flagged = 'Setup prices are incomplete or missing. Waiting for valid entry signals.';
        }
    } else {
        steps = flowSteps.map((stepConfig) => ({
            id: stepConfig.id,
            name: stepConfig.title,
            status: 'awaiting'
        }));
        progress = 0;
        currentStep = 'Awaiting Setup';
        freshness = 'live';
        assumptions_flagged = '';
        status = baseStrat.status || 'UNKNOWN';
    }

    return {
        id: strategyId,
        name: baseStrat.name,
        status,
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
