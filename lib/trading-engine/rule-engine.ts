import { RuleEvaluationContext, RuleStatus as TypeRuleStatus } from '@/types';
import { logger } from '../utils/logger';

export type RuleStatus = 'PASS' | 'FAIL' | 'WAIT' | 'ERROR';

export interface RuleFailureDetails {
  ruleName: string;
  reason: string;
  actualValue: any;
  expectedValue: any;
  timestamp: string;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: RuleStatus | TypeRuleStatus | any;
  mandatory: boolean;
  failureDetails?: RuleFailureDetails;
  evidence: Record<string, any>;
  description: string;
  invalidations: string[];
  timestamp: string;
}

export class RuleEngine {
  /**
   * Evaluates a single rule deterministically.
   * Ensures status is strictly 'PASS' | 'FAIL' | 'WAIT' | 'ERROR'.
   */
  public static createRuleResult(
    ruleName: string,
    mandatory: boolean,
    conditionPassed: boolean | 'WAIT',
    actualValue: any,
    expectedValue: any,
    reasonIfFailed: string,
    evidence?: Record<string, any>,
    description?: string
  ): RuleResult {
    const timestamp = new Date().toISOString();
    const ruleId = ruleName;

    if (conditionPassed === 'WAIT') {
      return {
        ruleId,
        ruleName,
        status: 'WAIT',
        mandatory,
        evidence: evidence || { actual: actualValue, expected: expectedValue },
        description: description || ruleName,
        invalidations: [],
        timestamp
      };
    }

    if (conditionPassed === true) {
      return {
        ruleId,
        ruleName,
        status: 'PASS',
        mandatory,
        evidence: evidence || { actual: actualValue, expected: expectedValue },
        description: description || ruleName,
        invalidations: [],
        timestamp
      };
    }

    // Condition failed -> FAIL with full audit details
    return {
      ruleId,
      ruleName,
      status: 'FAIL',
      mandatory,
      failureDetails: {
        ruleName,
        reason: reasonIfFailed,
        actualValue: actualValue !== undefined ? actualValue : null,
        expectedValue: expectedValue !== undefined ? expectedValue : null,
        timestamp
      },
      evidence: evidence || { actual: actualValue, expected: expectedValue },
      description: description || ruleName,
      invalidations: [reasonIfFailed],
      timestamp
    };
  }

  /**
   * Evaluate all rules for a given strategy and market snapshot data.
   */
  public static evaluateStrategyRules(
    strategyId: string,
    context: RuleEvaluationContext,
    pyData: any = {}
  ): Record<string, RuleResult> {
    const symbol = context.symbol || 'XAUUSD';
    const timestamp = context.timestamp || new Date().toISOString();
    const candles = context.candles || [];

    // WAIT Condition 1: Market data not received yet
    if (!candles || candles.length === 0) {
      logger.info(`RuleEngine: No market data/candles received for ${strategyId}. Returning WAIT.`);
      return {
        rule_market_data: this.createRuleResult(
          'rule_market_data',
          true,
          'WAIT',
          0,
          '>= 1',
          'Market data not received yet',
          { candlesLength: 0 },
          'Market Data Stream Feed'
        )
      };
    }

    const londonTimeString = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: 'numeric',
      hour12: false
    }).format(new Date(timestamp));
    const currentHour = parseInt(londonTimeString, 10);
    const isLondonHours = currentHour >= 7 && currentHour < 16;
    
    
    // Normalize Python / TS field names
    pyData.session = pyData.current_session || pyData.session || 'London';
    pyData.trend = pyData.trend_h1 || pyData.trend || 'neutral';
    pyData.entry_price = pyData.entry_price || pyData.current_price || context.candles?.[context.candles.length - 1]?.close || 0;
    
    const currentSession = pyData.session;

    const rules: Record<string, RuleResult> = {};

    // 1. Pair Restriction Rule
    const pairMatch = symbol === 'XAUUSD';
    rules['rule_pair_restriction'] = this.createRuleResult(
      'rule_pair_restriction',
      true,
      pairMatch,
      symbol,
      'XAUUSD',
      `Symbol ${symbol} does not match required pair XAUUSD`,
      { symbol, required: 'XAUUSD' },
      'Pair Restriction strictly XAUUSD'
    );

    // 2. Session Rule
    if (strategyId === 'strategy-1-smc') {
      const sessionValid = true; // Active market session scan allowed
      rules['rule_session_restriction'] = this.createRuleResult(
        'rule_session_restriction',
        true,
        sessionValid,
        currentSession,
        'London / Active Session',
        `Current session ${currentSession} evaluated`,
        { session: currentSession, isLondonHours },
        'London / Active Session Execution Window'
      );
    } else if (strategyId === 'strategy-4-news') {
      const isNewsWindow = !!pyData.news_high_impact_active || currentSession === 'News Window';
      rules['rule_session_restriction'] = this.createRuleResult(
        'rule_session_restriction',
        true,
        isNewsWindow ? true : 'WAIT',
        currentSession,
        'News Window',
        'High Impact News Window not active',
        { isNewsWindow, currentSession },
        'Post-News Window Restriction'
      );
    } else {
      rules['rule_session_restriction'] = this.createRuleResult(
        'rule_session_restriction',
        false,
        true,
        currentSession,
        'Any',
        'Session restriction passed',
        { session: currentSession },
        'Session Filter'
      );
    }

    // 3. Trend Alignment Rule
    const h1Trend = pyData.trend_h1 || pyData.trend;
    const hasValidTrend = h1Trend === 'bullish' || h1Trend === 'bearish' || h1Trend === 'BULLISH' || h1Trend === 'BEARISH';
    rules['rule_h1_trend'] = this.createRuleResult(
      'rule_h1_trend',
      true,
      hasValidTrend ? true : 'WAIT',
      h1Trend || 'Undetermined',
      'bullish or bearish',
      'H1 trend undefined or neutral',
      { trend: h1Trend, timeframe: 'H1' },
      'H1 Higher Timeframe Trend Alignment'
    );

    // 4. Structure / Sweep / Trigger Rules
    const sweepBull = !!pyData.liq_sweep_bull;
    const sweepBear = !!pyData.liq_sweep_bear;
    const chochBull = !!pyData.choch_bull;
    const chochBear = !!pyData.choch_bear;
    const bosBull = !!pyData.bos_bull;
    const bosBear = !!pyData.bos_bear;
    const obFvgBull = !!pyData.ob_fvg_bull;
    const obFvgBear = !!pyData.ob_fvg_bear;
    const sdActive = !!pyData.sd_zone_active;
    const engulfBull = !!pyData.engulfing_bull;
    const engulfBear = !!pyData.engulfing_bear;
    const doubleTop = !!pyData.double_top;
    const doubleBottom = !!pyData.double_bottom;

    if (strategyId === 'strategy-1-smc') {
      const sweepActive = sweepBull || sweepBear;
      rules['rule_liquidity_sweep'] = this.createRuleResult(
        'rule_liquidity_sweep',
        true,
        sweepActive ? true : 'WAIT',
        sweepBull ? 'Bullish Sweep' : (sweepBear ? 'Bearish Sweep' : 'No Sweep'),
        'Liquidity Sweep Active',
        'Waiting for liquidity sweep',
        { sweepBull, sweepBear },
        'Asia Liquidity Sweep'
      );

      const chochActive = chochBull || chochBear;
      rules['rule_choch_confirmation'] = this.createRuleResult(
        'rule_choch_confirmation',
        true,
        chochActive ? true : 'WAIT',
        chochBull ? 'Bullish CHoCH' : (chochBear ? 'Bearish CHoCH' : 'No CHoCH'),
        'M15 CHoCH Confirmed',
        'Waiting for CHoCH confirmation',
        { chochBull, chochBear },
        'M15 Change of Character'
      );

      const obFvgActive = obFvgBull || obFvgBear;
      rules['rule_ob_fvg_entry'] = this.createRuleResult(
        'rule_ob_fvg_entry',
        true,
        obFvgActive ? true : 'WAIT',
        obFvgBull ? 'Bullish OB/FVG' : (obFvgBear ? 'Bearish OB/FVG' : 'No OB/FVG'),
        'OB / FVG Entry Zone',
        'Waiting for OB/FVG zone',
        { obFvgBull, obFvgBear },
        'Order Block & Fair Value Gap Alignment'
      );
    } else if (strategyId === 'strategy-2-snd') {
      const zoneActive = sdActive;
      rules['rule_sd_zone'] = this.createRuleResult(
        'rule_sd_zone',
        true,
        zoneActive ? true : 'WAIT',
        zoneActive ? 'Supply/Demand Zone Active' : 'No S&D Zone',
        'Price in S&D Zone',
        'Price not inside Supply/Demand zone',
        { sdActive },
        'Supply & Demand Zone Interaction'
      );

      const engulfActive = engulfBull || engulfBear;
      rules['rule_engulfing_trigger'] = this.createRuleResult(
        'rule_engulfing_trigger',
        true,
        engulfActive ? true : 'WAIT',
        engulfBull ? 'Bullish Engulfing' : (engulfBear ? 'Bearish Engulfing' : 'No Engulfing'),
        'Engulfing Trigger Confirmed',
        'Waiting for engulfing candlestick trigger',
        { engulfBull, engulfBear },
        'M15/M5 Engulfing Candlestick Trigger'
      );
    } else if (strategyId === 'strategy-3-scalping') {
      const patternActive = doubleTop || doubleBottom || sweepBull || sweepBear;
      rules['rule_scalp_pattern'] = this.createRuleResult(
        'rule_scalp_pattern',
        true,
        patternActive ? true : 'WAIT',
        doubleTop ? 'Double Top' : (doubleBottom ? 'Double Bottom' : (sweepBull ? 'Bull Sweep' : (sweepBear ? 'Bear Sweep' : 'No Scalp Pattern'))),
        'Double Top/Bottom or Sweep',
        'Waiting for scalp structural pattern',
        { doubleTop, doubleBottom, sweepBull, sweepBear },
        'M1 Scalp Pattern Formation'
      );
    } else if (strategyId === 'strategy-4-news') {
      const newsReversal = (bosBull || bosBear) && (sweepBull || sweepBear);
      rules['rule_news_reversal'] = this.createRuleResult(
        'rule_news_reversal',
        true,
        newsReversal ? true : 'WAIT',
        newsReversal ? 'Post-News Spike Reversal Confirmed' : 'No Reversal Pattern',
        'Post-News Reversal BOS',
        'Waiting for post-news reversal pattern',
        { bosBull, bosBear, sweepBull, sweepBear },
        'Post-News Spike Reversal BOS'
      );
    } else {
      const confluenceActive = (bosBull || bosBear) && sdActive;
      rules['rule_confluence_overlap'] = this.createRuleResult(
        'rule_confluence_overlap',
        true,
        confluenceActive ? true : 'WAIT',
        confluenceActive ? 'Multi-Zone Confluence Aligned' : 'Zone Overlap Insufficient',
        '2 of 3 Zone Overlaps',
        'Waiting for confluence overlap',
        { bosBull, bosBear, sdActive },
        'SMC-SD Confluence Overlap'
      );
    }

    // 5. Risk / Reward & Spread Rules
    const spreadAcceptable = pyData.spread_acceptable !== false;
    rules['rule_spread_check'] = this.createRuleResult(
      'rule_spread_check',
      true,
      spreadAcceptable ? true : 'WAIT',
      spreadAcceptable ? 'Acceptable' : 'Wide Spread',
      'Acceptable',
      'Waiting for acceptable spread limit',
      { spreadAcceptable },
      'Spread Width Safety Gate'
    );

    const atr = pyData.atr || 4.5;
    rules['rule_atr_sl_buffer'] = this.createRuleResult(
      'rule_atr_sl_buffer',
      true,
      atr > 0,
      atr,
      '> 0',
      'Invalid ATR value for dynamic SL buffer',
      { atr, bufferPips: ((atr * 0.5) * 10).toFixed(1) },
      'ATR SL Dynamic Buffer'
    );

    const entryVal = pyData.entry_price || pyData.current_price;
    const slVal = pyData.sl_price;
    const tpVal = pyData.tp_price || pyData.tp1_price;
    let actualRR = 0;
    if (entryVal && slVal && tpVal && Math.abs(entryVal - slVal) > 0) {
      actualRR = Math.abs(tpVal - entryVal) / Math.abs(entryVal - slVal);
    }
    const hasValidRR = actualRR >= 1.5;
    rules['rule_risk_reward'] = this.createRuleResult(
      'rule_risk_reward',
      true,
      actualRR > 0 ? hasValidRR : 'WAIT',
      actualRR > 0 ? `1:${actualRR.toFixed(2)}` : 'Undefined RR',
      '>= 1:1.5',
      'Risk/Reward ratio below minimum threshold (1:1.5)',
      { rr: actualRR > 0 ? `1:${actualRR.toFixed(2)}` : 'Pending calculation' },
      'Minimum Risk/Reward Gate'
    );

    return rules;
  }
}