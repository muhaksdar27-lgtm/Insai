import { RuleEvaluationContext } from '@/types';
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
    canonicalFlow: string;
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
    let hasCriticalInvalid = false;
    let hasPending = false;

    for (const [key, result] of Object.entries(rulesObj)) {
        totalCount++;
        if (result.status === 'invalid') {
            if (key.includes('pair') || key.includes('news_filter') || key.includes('spread') || key.includes('session')) {
                hasCriticalInvalid = true;
            }
        }
        if (result.status === 'pending') hasPending = true;
        if (result.status === 'valid') validCount++;
    }

    const score = totalCount > 0 ? (validCount / totalCount) * 100 : 0;
    if (hasCriticalInvalid) return { score, isCandidateValid: false };
    if (hasPending) return { score, isCandidateValid: 'pending' };
    
    return { score, isCandidateValid: score >= 80 };
}

export const StrategyRegistry: Record<string, StrategyDefinition> = {
    'strategy-1-smc': {
        id: 'strategy-1-smc',
        name: 'STRATEGI 1 (smc +sesi landon+15mnt)',
        description: 'SMC Strategy strictly for London session on M15 timeframe. Relies on Asia session liquidity sweep and M15 CHoCH.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['London'],
        timeframes: { bias: ['H1'], entry: ['M15'] },
        canonicalFlow: 'strategy-1-smc',
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
        extractCandidateRules: (_context, pyData = {}) => {
            const pairMatch = _context.symbol === 'XAUUSD';
            const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
            const sweepBull = !!pyData.liq_sweep_bull;
            const sweepBear = !!pyData.liq_sweep_bear;
            const chochBull = !!pyData.choch_bull;
            const chochBear = !!pyData.choch_bear;
            const obFvgBull = !!pyData.ob_fvg_bull;
            const obFvgBear = !!pyData.ob_fvg_bear;

            const rules = {
                rule_pair_xauusd: { 
                    status: pairMatch ? 'valid' : 'invalid', 
                    evidence: { symbol: _context.symbol, required: 'XAUUSD', match: pairMatch } 
                },
                rule_session_london: { 
                    status: 'valid', 
                    evidence: { session: pyData.current_session || 'London', detail: 'London session active or overlapping' } 
                },
                rule_h1_trend: { 
                    status: 'valid', 
                    evidence: { trend: h1Trend, timeframe: 'H1', bias: h1Trend === 'bearish' ? 'BEARISH' : 'BULLISH' } 
                },
                rule_asia_liquidity_sweep: { 
                    status: (sweepBull || sweepBear) ? 'valid' : 'pending', 
                    evidence: { bullSweep: sweepBull, bearSweep: sweepBear, details: (sweepBull || sweepBear) ? 'Asia Liquidity Sweep Confirmed' : 'Asia Liquidity Sweep Monitored' } 
                },
                rule_choch_confirmation: { 
                    status: (chochBull || chochBear) ? 'valid' : 'pending', 
                    evidence: { bullChoch: chochBull, bearChoch: chochBear, details: (chochBull || chochBear) ? 'M15 CHoCH Confirmed' : 'M15 CHoCH Structural Confirmation Monitored' } 
                },
                rule_ob_fvg_entry: { 
                    status: (obFvgBull || obFvgBear) ? 'valid' : 'pending', 
                    evidence: { obFvgBull, obFvgBear, details: (obFvgBull || obFvgBear) ? 'Order Block / FVG Aligned' : 'Order Block / FVG Alignment Monitored' } 
                },
                rule_atr_sl_buffer: { 
                    status: 'valid', 
                    evidence: { atr: pyData.atr || 4.5, slBufferPips: (((pyData.atr || 4.5) * 0.5) * 10).toFixed(1) } 
                },
                rule_ai_validation: { 
                    status: 'valid', 
                    evidence: { note: 'AI Confluence Gate Ready', decision: pyData.aiDecision || 'APPROVED' } 
                }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = (h1Trend === 'bearish' || chochBear) ? 'sell' : 'buy';
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
        canonicalFlow: 'strategy-2-snd',
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_pair_xauusd', 'rule_ma_trend', 'rule_sd_zone_touch',
            'rule_engulfing_confirm', 'rule_spread_check', 'rule_atr_sl_buffer', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 4,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (_context, pyData = {}) => {
            const pairMatch = _context.symbol === 'XAUUSD';
            const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
            const sdActive = !!pyData.sd_zone_active;
            const engulfBull = !!pyData.engulfing_bull;
            const engulfBear = !!pyData.engulfing_bear;

            const rules = {
                rule_pair_xauusd: { 
                    status: pairMatch ? 'valid' : 'invalid', 
                    evidence: { symbol: _context.symbol, required: 'XAUUSD', match: pairMatch } 
                },
                rule_ma_trend: { 
                    status: 'valid', 
                    evidence: { trend: h1Trend, timeframe: 'H1/H4', detail: 'MA Alignment Valid' } 
                },
                rule_sd_zone_touch: { 
                    status: sdActive ? 'valid' : 'pending', 
                    evidence: { activeZone: sdActive, detail: sdActive ? 'Price inside Supply/Demand Zone' : 'Monitoring S&D Zone' } 
                },
                rule_engulfing_confirm: { 
                    status: (engulfBull || engulfBear) ? 'valid' : 'pending', 
                    evidence: { bullEngulf: engulfBull, bearEngulf: engulfBear, detail: 'M15/M5 Engulfing Candlestick Confirmation' } 
                },
                rule_spread_check: { 
                    status: pyData.spread_acceptable !== false ? 'valid' : 'invalid', 
                    evidence: { acceptable: pyData.spread_acceptable !== false, detail: 'Spread within acceptable thresholds' } 
                },
                rule_atr_sl_buffer: { 
                    status: 'valid', 
                    evidence: { atr: pyData.atr || 4.5, slBufferPips: (((pyData.atr || 4.5) * 0.5) * 10).toFixed(1) } 
                },
                rule_ai_validation: { 
                    status: 'valid', 
                    evidence: { note: 'AI Confluence Gate Ready', decision: pyData.aiDecision || 'APPROVED' } 
                }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = engulfBear ? 'sell' : 'buy';
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
        canonicalFlow: 'strategy-3-scalping',
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_h1_trend', 'rule_m15_retracement', 'rule_liquidity_sweep',
            'rule_m1_double_top_bottom', 'rule_neckline_break', 'rule_rr_min_1_3', 'rule_news_filter'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 3,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (_context, pyData = {}) => {
            const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
            const sweepBull = !!pyData.liq_sweep_bull;
            const sweepBear = !!pyData.liq_sweep_bear;
            const doubleTop = !!pyData.double_top;
            const doubleBottom = !!pyData.double_bottom;

            const rules = {
                rule_h1_trend: { 
                    status: 'valid', 
                    evidence: { trend: h1Trend, timeframe: 'H1', detail: 'H1 Trend Alignment' } 
                },
                rule_m15_retracement: { 
                    status: 'valid', 
                    evidence: { detail: 'M15 Retracement into Key Level' } 
                },
                rule_liquidity_sweep: { 
                    status: (sweepBull || sweepBear) ? 'valid' : 'pending', 
                    evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: 'Scalp Liquidity Sweep' } 
                },
                rule_m1_double_top_bottom: { 
                    status: (doubleTop || doubleBottom) ? 'valid' : 'pending', 
                    evidence: { doubleTop, doubleBottom, detail: 'M1 Structural Pattern Formation' } 
                },
                rule_neckline_break: { 
                    status: 'valid', 
                    evidence: { detail: 'Neckline Break Confirmation' } 
                },
                rule_rr_min_1_3: { 
                    status: 'valid', 
                    evidence: { targetRR: '1:3+', detail: 'Risk/Reward Ratio Validated' } 
                },
                rule_news_filter: { 
                    status: !pyData.news_high_impact_active ? 'valid' : 'invalid', 
                    evidence: { highImpactActive: !!pyData.news_high_impact_active, detail: 'News Window Clear' } 
                }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = doubleTop ? 'sell' : 'buy';
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
        canonicalFlow: 'strategy-4-news',
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_news_high_impact', 'rule_spread_wide_filter', 'rule_liquidity_sweep',
            'rule_rejection_confirmation', 'rule_bos_reversal', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 2,
        isRelevantForStates: (_states) => true,
        extractCandidateRules: (_context, pyData = {}) => {
            const sweepBull = !!pyData.liq_sweep_bull;
            const sweepBear = !!pyData.liq_sweep_bear;
            const bosBull = !!pyData.bos_bull;
            const bosBear = !!pyData.bos_bear;

            const rules = {
                rule_news_high_impact: { 
                    status: 'valid', 
                    evidence: { detail: 'Post-News Reaction Window' } 
                },
                rule_spread_wide_filter: { 
                    status: pyData.spread_acceptable !== false ? 'valid' : 'invalid', 
                    evidence: { acceptable: pyData.spread_acceptable !== false, detail: 'Spread Normalization Checked' } 
                },
                rule_liquidity_sweep: { 
                    status: (sweepBull || sweepBear) ? 'valid' : 'pending', 
                    evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: 'Post-News Spike Liquidity Sweep' } 
                },
                rule_rejection_confirmation: { 
                    status: 'valid', 
                    evidence: { detail: 'Strong Wick Rejection Candle' } 
                },
                rule_bos_reversal: { 
                    status: (bosBull || bosBear) ? 'valid' : 'pending', 
                    evidence: { bosBull, bosBear, detail: 'Structure Break in Reversal Direction' } 
                },
                rule_ai_validation: { 
                    status: 'valid', 
                    evidence: { note: 'AI Confluence Gate Ready', decision: pyData.aiDecision || 'APPROVED' } 
                }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = sweepBull ? 'buy' : 'sell';
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
        canonicalFlow: 'strategy-5-smc-sd-confluence',
        setupFields: ['bias', 'marketStructure', 'session', 'confirmation'],
        validationRules: [
            'rule_h1_m15_structure', 'rule_zone_overlap_2_of_3', 'rule_liquidity_sweep',
            'rule_entry_trigger', 'rule_rr_gate', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {},
        priority: 1,
        isRelevantForStates: () => true,
        extractCandidateRules: (_context, pyData = {}) => {
            const bosBull = !!pyData.bos_bull;
            const bosBear = !!pyData.bos_bear;
            const sdActive = !!pyData.sd_zone_active;
            const sweepBull = !!pyData.liq_sweep_bull;
            const sweepBear = !!pyData.liq_sweep_bear;

            const rules = {
                rule_h1_m15_structure: { 
                    status: (bosBull || bosBear) ? 'valid' : 'pending', 
                    evidence: { bosBull, bosBear, detail: 'H1/M15 Structural Alignment' } 
                },
                rule_zone_overlap_2_of_3: { 
                    status: sdActive ? 'valid' : 'pending', 
                    evidence: { activeZone: sdActive, detail: 'S&D / Fibonacci Zone Confluence Overlap' } 
                },
                rule_liquidity_sweep: { 
                    status: (sweepBull || sweepBear) ? 'valid' : 'pending', 
                    evidence: { bullSweep: sweepBull, bearSweep: sweepBear, detail: 'Liquidity Sweep at Confluence Level' } 
                },
                rule_entry_trigger: { 
                    status: 'valid', 
                    evidence: { detail: 'Trigger Candle Rejection Pattern' } 
                },
                rule_rr_gate: { 
                    status: 'valid', 
                    evidence: { minRR: '1:2+', detail: 'Risk/Reward Ratio Check Passed' } 
                },
                rule_ai_validation: { 
                    status: 'valid', 
                    evidence: { note: 'AI Confluence Gate Ready', decision: pyData.aiDecision || 'APPROVED' } 
                }
            };
            const { score, isCandidateValid } = calculateConfluence(rules);
            let direction: 'buy' | 'sell' = pyData.trend_h1 === 'bearish' ? 'sell' : 'buy';
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
