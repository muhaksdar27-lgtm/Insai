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

export function normalizeStrategyFromDB(baseStrat: any, state: any): StrategyResponse & { assumptions_flagged?: string } {
    const strategyId = baseStrat.id;
    const flowConfig = STRATEGY_FLOWS_CONFIG.find(f => f.id === strategyId);
    const flowSteps = flowConfig?.steps || [];
    const flow: string[] = flowSteps.map(s => s.id);
    
    let currentStep = 'Scanning';
    let progress = 0;
    let setupSnapshot: SetupSnapshot = {};
    let ruleResults: Record<string, any> = {};
    let signal: any = null;
    let updatedAt: string | null = null;
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
        updatedAt = state.updated_at || state.created_at || null;
        
        let currentIndex = flow.indexOf(currentStateName);
        const isRejected = ['FAILED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(currentStateName);
        
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
        } else if (['WAITING_MARKET', 'SCANNING', 'INITIALIZING'].includes(currentStateName) || currentStateName.includes('WAIT')) {
            if (state.reason && state.reason.trim() !== '' && state.reason !== 'Success' && state.reason !== 'Waiting for market data...') {
                currentStep = `Wait: ${state.reason}`;
            }
        }
        
        const checkRule = (ruleKey: string): boolean => {
            const r = ruleResults[ruleKey] || Object.values(ruleResults).find((x: any) => x.ruleId === ruleKey || x.name === ruleKey);
            if (!r) return false;
            const st = String(r.status || '').toUpperCase();
            return st === 'PASS' || st === 'VALID' || st === 'VALIDATED' || st === 'APPROVED' || r.passed === true;
        };

        const checkRuleFailed = (ruleKey: string): boolean => {
            const r = ruleResults[ruleKey] || Object.values(ruleResults).find((x: any) => x.ruleId === ruleKey || x.name === ruleKey);
            if (!r) return false;
            const st = String(r.status || '').toUpperCase();
            return st === 'FAIL' || st === 'INVALID' || st === 'REJECTED';
        };

        steps = flow.map((stepName) => {
            let status: any = 'awaiting';
            const title = getStepDisplayName(strategyId, stepName);
            
            if (signal || currentStateName === 'DISPATCHED' || currentStateName === 'SIGNAL_ACTIVE') {
                status = stepName === 'DISPATCHED' ? 'approved' : 'approved';
            } else if (stepName === 'LONDON_FILTER') {
                status = checkRule('rule_session_restriction') ? 'approved' : (checkRuleFailed('rule_session_restriction') ? 'failed' : 'current');
            } else if (stepName === 'H1_TREND' || stepName === 'MA_TREND' || stepName === 'H1_M15_STRUCTURE') {
                status = checkRule('rule_h1_trend') ? 'approved' : (checkRuleFailed('rule_h1_trend') ? 'failed' : 'current');
            } else if (stepName === 'ASIA_SWEEP' || stepName === 'M1_M5_SWEEP' || stepName === 'CONFLUENCE_SWEEP') {
                status = checkRule('rule_liquidity_sweep') || String(setupSnapshot.sweepStatus || '').includes('Confirmed') ? 'approved' : 'current';
            } else if (stepName === 'SD_ZONE' || stepName === 'SD_FIB_OVERLAP') {
                status = checkRule('rule_sd_zone') || String(setupSnapshot.sdZoneStatus || '').includes('Active') ? 'approved' : 'current';
            } else if (stepName === 'M15_CHOCH' || stepName === 'M1_BOS_REVERSAL') {
                status = checkRule('rule_choch_confirmation') || String(setupSnapshot.confirmationStatus || '').includes('Confirmed') ? 'approved' : 'current';
            } else if (stepName === 'OB_FVG' || stepName === 'ENGULFING_TRIGGER' || stepName === 'DOUBLE_TOP_BOTTOM' || stepName === 'REJECTION_TRIGGER') {
                status = checkRule('rule_ob_fvg_entry') || checkRule('rule_engulfing_trigger') || checkRule('rule_scalp_pattern') || checkRule('rule_confluence_overlap') ? 'approved' : 'current';
            } else if (stepName === 'RISK_PARAMS' || stepName === 'RISK_NEWS_FILTER' || stepName === 'MIN_RR_CALC') {
                status = checkRule('rule_spread_check') && checkRule('rule_atr_sl_buffer') && checkRule('rule_risk_reward') ? 'approved' : 'current';
            } else if (stepName === 'AI_GATE') {
                const aiDec = (setupSnapshot as any).aiDecision || (payload as any).aiDecision;
                status = aiDec === 'APPROVED' ? 'approved' : (aiDec === 'REJECTED' ? 'failed' : 'awaiting');
            } else if (stepName === 'DISPATCHED') {
                status = signal ? 'approved' : 'awaiting';
            }

            return { name: title, status };
        });

        // Ensure sequential status consistency
        let firstCurrentFound = false;
        steps = steps.map(s => {
            if (s.status === 'approved') return s;
            if (s.status === 'failed') return s;
            if (!firstCurrentFound) {
                firstCurrentFound = true;
                return { ...s, status: 'current' };
            }
            return { ...s, status: 'awaiting' };
        });

        const approvedCount = steps.filter(s => s.status === 'approved').length;
        progress = steps.length > 0 ? Math.round((approvedCount / steps.length) * 100) : 0;
        if (signal) progress = 100;
        
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
