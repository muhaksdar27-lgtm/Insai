import { RuleEvaluationContext } from '@/types';
import { MarketState } from './market-state-engine';

import { detectStrategy1SMC } from './strategies/strategy-1-smc';
import { detectStrategy2SND } from './strategies/strategy-2-snd';
import { detectStrategy3Scalping } from './strategies/strategy-3-scalping';
import { detectStrategy4News } from './strategies/strategy-4-news';
import { detectStrategy5Confluence } from './strategies/strategy-5-smc-sd-confluence';

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
        confirmationStatus?: string;
        setupSnapshot?: Record<string, any>;
    };
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
        setupFields: ['h1Trend', 'asiaLiquiditySweep', 'm15Choch', 'obFvgAlignment', 'londonSessionFilter', 'atr14Buffer'],
        validationRules: [
            'rule_pair_xauusd', 'rule_session_london', 'rule_h1_trend', 
            'rule_asia_liquidity_sweep', 'rule_choch_confirmation', 
            'rule_ob_fvg_entry', 'rule_atr_sl_buffer', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {
            h1Trend: 'H1 Trend',
            asiaLiquiditySweep: 'Asia Liquidity Sweep',
            m15Choch: 'M15 CHoCH',
            obFvgAlignment: 'OB/FVG Alignment',
            londonSessionFilter: 'London Session',
            atr14Buffer: 'ATR SL Buffer'
        },
        priority: 5,
        isRelevantForStates: (states) => states.some(s => [MarketState.TRENDING, MarketState.LIQUIDITY_HUNT, MarketState.SESSION_TRANSITION].includes(s)),
        extractCandidateRules: (context, pyData = {}) => detectStrategy1SMC(context, pyData)
    },
    'strategy-2-snd': {
        id: 'strategy-2-snd',
        name: 'STRATEGI 2(S&D+ENGULFING)',
        description: 'Supply and Demand zones paired with moving average confluence and engulfing trigger.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['Any'],
        timeframes: { bias: ['D1', 'H4', 'H1'], entry: ['H1', 'M15', 'M5'] },
        canonicalFlow: 'strategy-2-snd',
        setupFields: ['movingAverageTrend', 'supplyDemandZone', 'candlestickEngulfing', 'spreadCheck', 'atrBuffer'],
        validationRules: [
            'rule_pair_xauusd', 'rule_ma_trend', 'rule_sd_zone_touch',
            'rule_engulfing_confirm', 'rule_spread_check', 'rule_atr_sl_buffer', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {
            movingAverageTrend: 'MA Trend Alignment',
            supplyDemandZone: 'Supply & Demand Zone',
            candlestickEngulfing: 'Engulfing Candlestick Trigger',
            spreadCheck: 'Spread Gate',
            atrBuffer: 'ATR SL Buffer'
        },
        priority: 4,
        isRelevantForStates: (states) => states.some(s => [MarketState.TRENDING, MarketState.RANGING, MarketState.COMPRESSION, MarketState.EXPANSION].includes(s)),
        extractCandidateRules: (context, pyData = {}) => detectStrategy2SND(context, pyData)
    },
    'strategy-3-scalping': {
        id: 'strategy-3-scalping',
        name: 'STRATEGI 3 (scalping smc+liquidity sweep+double top/down)',
        description: 'Aggressive M1 scalping aligned with H1 trend, requiring liquidity sweep before double top/bottom structural formation.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['Any'],
        timeframes: { bias: ['H1'], context: ['M15'], entry: ['M1'] },
        canonicalFlow: 'strategy-3-scalping',
        setupFields: ['h1Trend', 'm15Retracement', 'scalpLiquiditySweep', 'm1DoubleTopBottom', 'necklineBreakout', 'newsFilter'],
        validationRules: [
            'rule_h1_trend', 'rule_m15_retracement', 'rule_liquidity_sweep',
            'rule_m1_double_top_bottom', 'rule_neckline_break', 'rule_rr_min_1_3', 'rule_news_filter'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {
            h1Trend: 'H1 Trend Alignment',
            m15Retracement: 'M15 Retracement',
            scalpLiquiditySweep: 'M1/M5 Scalp Sweep',
            m1DoubleTopBottom: 'M1 Double Top/Bottom',
            necklineBreakout: 'Neckline Break',
            newsFilter: 'News Exclusion Gate'
        },
        priority: 3,
        isRelevantForStates: (states) => states.some(s => [MarketState.RANGING, MarketState.COMPRESSION, MarketState.LIQUIDITY_HUNT, MarketState.HIGH_VOLATILITY].includes(s)),
        extractCandidateRules: (context, pyData = {}) => detectStrategy3Scalping(context, pyData)
    },
    'strategy-4-news': {
        id: 'strategy-4-news',
        name: 'Strategi 4 (news)',
        description: 'Trades the post-news liquidity sweep. Strictly avoids the initial news candle, waiting for structural reversal.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['News Window'],
        timeframes: { context: ['M15'], bias: ['M5'], entry: ['M1'] },
        canonicalFlow: 'strategy-4-news',
        setupFields: ['highImpactNewsFilter', 'spreadWideFilter', 'postNewsLiquiditySweep', 'rejectionCandleWick', 'm1BosReversal'],
        validationRules: [
            'rule_news_high_impact', 'rule_spread_wide_filter', 'rule_liquidity_sweep',
            'rule_rejection_confirmation', 'rule_bos_reversal', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {
            highImpactNewsFilter: 'High-Impact News Window',
            spreadWideFilter: 'Post-News Spread Normalization',
            postNewsLiquiditySweep: 'Post-News Spike Sweep',
            rejectionCandleWick: 'Wick Rejection Candle',
            m1BosReversal: 'M1 Reversal BOS'
        },
        priority: 2,
        isRelevantForStates: (states) => states.some(s => [MarketState.NEWS_MODE, MarketState.HIGH_VOLATILITY].includes(s)),
        extractCandidateRules: (context, pyData = {}) => detectStrategy4News(context, pyData)
    },
    'strategy-5-smc-sd-confluence': {
        id: 'strategy-5-smc-sd-confluence',
        name: 'Strategy 5: SMC-SD-Pattern Confluence',
        description: 'High-probability confluence engine requiring overlaps between market structure, SD zones, and liquidity sweeps.',
        pairRestriction: ['XAUUSD'],
        sessionRestriction: ['Any'],
        timeframes: { bias: ['H1', 'M15'], context: ['M15'], entry: ['M5', 'M1'] },
        canonicalFlow: 'strategy-5-smc-sd-confluence',
        setupFields: ['h1M15Structure', 'sdZoneOverlap2of3', 'confluenceLiquiditySweep', 'rejectionTrigger', 'minRR2plus'],
        validationRules: [
            'rule_h1_m15_structure', 'rule_zone_overlap_2_of_3', 'rule_liquidity_sweep',
            'rule_entry_trigger', 'rule_rr_gate', 'rule_ai_validation'
        ],
        outputFields: ['entryPrice', 'slPrice', 'tpPrice', 'rr'],
        uiLabels: {
            h1M15Structure: 'H1/M15 Structure Alignment',
            sdZoneOverlap2of3: 'S&D / Fib Overlap (2 of 3)',
            confluenceLiquiditySweep: 'Confluence Level Sweep',
            rejectionTrigger: 'Rejection Trigger Candle',
            minRR2plus: 'Min 1:2+ Risk/Reward'
        },
        priority: 1,
        isRelevantForStates: (states) => states.some(s => [MarketState.TRENDING, MarketState.RANGING, MarketState.EXPANSION, MarketState.LIQUIDITY_HUNT].includes(s)),
        extractCandidateRules: (context, pyData = {}) => detectStrategy5Confluence(context, pyData)
    }
};

export function getStrategyDefinition(id: string): StrategyDefinition | undefined {
    return StrategyRegistry[id];
}

export function getAllStrategies(): StrategyDefinition[] {
    return Object.values(StrategyRegistry);
}
