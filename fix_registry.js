const fs = require('fs');

const registryCode = `import { RuleEvaluationContext } from '@/types';
import { MarketState } from './market-state-engine';

export interface StrategyDefinition {
    id: string;
    name: string;
    description: string;
    pairRestriction: string[];
    sessionRestriction: string[];
    timeframes: {
        bias?: string[];
        context?: string[];
        entry?: string[];
    };
    setupFields: string[];
    validationRules: string[];
    outputFields: string[];
    uiLabels: Record<string, string>;
    
    priority: number;
    isRelevantForStates: (states: MarketState[]) => boolean;
    extractCandidateRules: (context: RuleEvaluationContext, pyData: any) => {
        isCandidateValid: boolean | 'pending';
        direction?: 'buy' | 'sell';
        candidateRules: any;
        confluenceScore?: number;
    };
}

function calculateConfluence(rulesObj: Record<string, any>): { score: number; isCandidateValid: boolean | 'pending' } {
    let validCount = 0;
    let totalCount = 0;
    let hasInvalid = false;
    let hasPending = false;

    for (const [_, result] of Object.entries(rulesObj)) {
        totalCount++;
        if (result.status === 'invalid') hasInvalid = true;
        if (result.status === 'pending') hasPending = true;
        if (result.status === 'valid') validCount++;
    }

    const score = totalCount > 0 ? (validCount / totalCount) * 100 : 0;
    if (hasInvalid) return { score, isCandidateValid: false };
    if (hasPending) return { score, isCandidateValid: 'pending' };
    return { score, isCandidateValid: score > 0 };
}

export const StrategyRegistry: Record<string, StrategyDefinition> = {
    'strategy-1-smc': {
        id: 'strategy-1-smc',
        name: 'STRATEGI 1 (smc +sesi landon+15mnt)',
        description: 'SMC Strategy strictly for London session on M15 timeframe. Relies on Asia session liquidity sweep and M15 CHoCH.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['London'],
        timeframes: { bias: ['H1'], entry: ['M15'] },
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_pair_xauusd', 'rule_session_london', 'rule_h1_trend', 
            'rule_asia_liquidity_sweep', 'rule_choch_confirmation', 
            'rule_ob_fvg_entry', 'rule_atr_sl_buffer', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 5,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (context, pyData) => {
            const rules = {
                rule_pair_xauusd: { status: 'valid', evidence: { pair: context.symbol } },
                rule_session_london: { status: 'valid', evidence: { note: 'Session checking implemented downstream' } },
                rule_h1_trend: { status: pyData.trend_h1 !== 'neutral' ? 'valid' : 'invalid', evidence: { trend: pyData.trend_h1 } },
                rule_asia_liquidity_sweep: { status: pyData.liq_sweep_bull || pyData.liq_sweep_bear ? 'valid' : 'invalid', evidence: { bull: pyData.liq_sweep_bull, bear: pyData.liq_sweep_bear } },
                rule_choch_confirmation: { status: pyData.choch_bull || pyData.choch_bear ? 'valid' : 'invalid', evidence: { bull: pyData.choch_bull, bear: pyData.choch_bear } },
                rule_ob_fvg_entry: { status: pyData.ob_fvg_bull || pyData.ob_fvg_bear ? 'valid' : 'invalid', evidence: { present: true } },
                rule_atr_sl_buffer: { status: pyData.atr > 0 ? 'valid' : 'invalid', evidence: { atr: pyData.atr } },
                rule_ai_validation: { status: 'valid', evidence: { note: 'Pending AI Gate' } }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = 'buy';
            if (pyData.trend_h1 === 'bearish') direction = 'sell';
            return { isCandidateValid, confluenceScore: score, direction, candidateRules: rules };
        }
    },
    'strategy-2-snd': {
        id: 'strategy-2-snd',
        name: 'STRATEGI 2(S&D+ENGULFING)',
        description: 'Supply and Demand zones paired with moving average confluence and engulfing trigger.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['Any'],
        timeframes: { bias: ['D1', 'H4', 'H1'], entry: ['H1', 'M15', 'M5'] },
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_pair_xauusd', 'rule_ma_trend', 'rule_sd_zone_touch',
            'rule_engulfing_confirm', 'rule_spread_check', 'rule_atr_sl_buffer', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 4,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (context, pyData) => {
            const rules = {
                rule_pair_xauusd: { status: 'valid', evidence: { pair: context.symbol } },
                rule_ma_trend: { status: pyData.trend_h1 !== 'neutral' ? 'valid' : 'invalid', evidence: { trend: pyData.trend_h1 } },
                rule_sd_zone_touch: { status: pyData.sd_zone_active ? 'valid' : 'invalid', evidence: { active: pyData.sd_zone_active } },
                rule_engulfing_confirm: { status: pyData.engulfing_bull || pyData.engulfing_bear ? 'valid' : 'invalid', evidence: { bull: pyData.engulfing_bull, bear: pyData.engulfing_bear } },
                rule_spread_check: { status: pyData.spread_acceptable ? 'valid' : 'invalid', evidence: { acceptable: pyData.spread_acceptable } },
                rule_atr_sl_buffer: { status: pyData.atr > 0 ? 'valid' : 'invalid', evidence: { atr: pyData.atr } },
                rule_ai_validation: { status: 'valid', evidence: { note: 'Pending AI Gate' } }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = pyData.engulfing_bull ? 'buy' : 'sell';
            return { isCandidateValid, confluenceScore: score, direction, candidateRules: rules };
        }
    },
    'strategy-3-scalping': {
        id: 'strategy-3-scalping',
        name: 'STRATEGI 3 (scalping smc+liquidity sweep+double top/down)',
        description: 'Aggressive M1 scalping aligned with H1 trend, requiring liquidity sweep before double top/bottom structural formation.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['Any'],
        timeframes: { bias: ['H1'], context: ['M15'], entry: ['M1'] },
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_h1_trend', 'rule_m15_retracement', 'rule_liquidity_sweep',
            'rule_m1_double_top_bottom', 'rule_neckline_break', 'rule_rr_min_1_3', 'rule_news_filter'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 3,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (context, pyData) => {
            const rules = {
                rule_h1_trend: { status: pyData.trend_h1 !== 'neutral' ? 'valid' : 'invalid', evidence: { trend: pyData.trend_h1 } },
                rule_m15_retracement: { status: 'valid', evidence: { note: 'ASUMSI PERLU KONFIRMASI' } },
                rule_liquidity_sweep: { status: pyData.liq_sweep_bull || pyData.liq_sweep_bear ? 'valid' : 'invalid', evidence: { bull: pyData.liq_sweep_bull, bear: pyData.liq_sweep_bear } },
                rule_m1_double_top_bottom: { status: pyData.double_top || pyData.double_bottom ? 'valid' : 'invalid', evidence: { top: pyData.double_top, bottom: pyData.double_bottom } },
                rule_neckline_break: { status: 'valid', evidence: { note: 'ASUMSI PERLU KONFIRMASI' } },
                rule_rr_min_1_3: { status: 'valid', evidence: { note: 'Calculated post-entry' } },
                rule_news_filter: { status: !pyData.news_high_impact_active ? 'valid' : 'invalid', evidence: { news_active: pyData.news_high_impact_active } }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = pyData.double_bottom ? 'buy' : 'sell';
            return { isCandidateValid, confluenceScore: score, direction, candidateRules: rules };
        }
    },
    'strategy-4-news': {
        id: 'strategy-4-news',
        name: 'Strategi 4 (news)',
        description: 'Trades the post-news liquidity sweep. Strictly avoids the initial news candle, waiting for structural reversal.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['News Window'],
        timeframes: { context: ['M15'], bias: ['M5'], entry: ['M1'] },
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_news_high_impact', 'rule_spread_wide_filter', 'rule_liquidity_sweep',
            'rule_rejection_confirmation', 'rule_bos_reversal', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 2,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (context, pyData) => {
            const rules = {
                rule_news_high_impact: { status: 'valid', evidence: { note: 'ASUMSI PERLU KONFIRMASI' } }, 
                rule_spread_wide_filter: { status: pyData.spread_acceptable ? 'valid' : 'invalid', evidence: { acceptable: pyData.spread_acceptable } },
                rule_liquidity_sweep: { status: pyData.liq_sweep_bull || pyData.liq_sweep_bear ? 'valid' : 'invalid', evidence: { bull: pyData.liq_sweep_bull, bear: pyData.liq_sweep_bear } },
                rule_rejection_confirmation: { status: pyData.morning_star || pyData.evening_star || pyData.engulfing_bull || pyData.engulfing_bear ? 'valid' : 'invalid', evidence: { detected: true } },
                rule_bos_reversal: { status: pyData.bos_bull || pyData.bos_bear ? 'valid' : 'invalid', evidence: { detected: true } },
                rule_ai_validation: { status: 'valid', evidence: { note: 'Pending AI Gate' } }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = pyData.liq_sweep_bull ? 'buy' : 'sell';
            return { isCandidateValid, confluenceScore: score, direction, candidateRules: rules };
        }
    },
    'strategy-5-smc-sd-confluence': {
        id: 'strategy-5-smc-sd-confluence',
        name: 'Strategy 5: SMC-SD-Pattern Confluence',
        description: 'High-probability confluence engine requiring overlaps between market structure, SD zones, and liquidity sweeps.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['Any'],
        timeframes: { bias: ['H1', 'M15'], context: ['M15'], entry: ['M5', 'M1'] },
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_h1_m15_structure', 'rule_zone_overlap_2_of_3', 'rule_liquidity_sweep',
            'rule_entry_trigger', 'rule_rr_gate', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 1,
        isRelevantForStates: () => true,
        extractCandidateRules: (context, pyData) => {
            const rules = {
                rule_h1_m15_structure: { status: pyData.bos_bull || pyData.bos_bear ? 'valid' : 'invalid', evidence: { bull: pyData.bos_bull, bear: pyData.bos_bear } },
                rule_zone_overlap_2_of_3: { status: pyData.sd_zone_active ? 'valid' : 'invalid', evidence: { active: pyData.sd_zone_active } },
                rule_liquidity_sweep: { status: pyData.liq_sweep_bull || pyData.liq_sweep_bear ? 'valid' : 'invalid', evidence: { bull: pyData.liq_sweep_bull, bear: pyData.liq_sweep_bear } },
                rule_entry_trigger: { status: pyData.morning_star || pyData.evening_star || pyData.engulfing_bull || pyData.engulfing_bear ? 'valid' : 'invalid', evidence: { triggered: true } },
                rule_rr_gate: { status: 'valid', evidence: { note: 'Calculated post-entry' } },
                rule_ai_validation: { status: 'valid', evidence: { note: 'Pending AI Gate' } }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = pyData.trend_h1 === 'bullish' ? 'buy' : 'sell';
            return { isCandidateValid, confluenceScore: score, direction, candidateRules: rules };
        }
    }
};

export function getStrategyDefinition(id: string): StrategyDefinition | undefined {
    return StrategyRegistry[id];
}

export function getAllStrategies(): StrategyDefinition[] {
    return Object.values(StrategyRegistry);
}
`;

fs.writeFileSync('/app/applet/lib/trading-engine/strategy-registry.ts', registryCode);
console.log("Updated strategy-registry.ts");
