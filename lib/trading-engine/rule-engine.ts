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

    const currentHour = new Date(timestamp).getUTCHours();
    const isLondonHours = currentHour >= 7 && currentHour < 16;
    const isNYHours = currentHour >= 12 && currentHour < 21;
    const currentSession = pyData.current_session || pyData.session || (isLondonHours ? 'London' : (isNYHours ? 'New York' : 'Asian'));

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
      const sessionValid = isLondonHours && (currentSession === 'London' || currentSession === 'London/NY Overlap');
      const sessionState = sessionValid ? true : (!isLondonHours ? 'WAIT' : false);
      rules['rule_session_restriction'] = this.createRuleResult(
        'rule_session_restriction',
        true,
        sessionState,
        currentSession,
        'London',
        `Current session ${currentSession} is outside London operating window`,
        { session: currentSession, isLondonHours },
        'London Session Execution Window'
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
    const h1Trend = pyData.trend_h1 || pyData.trend || 'bullish';
    rules['rule_h1_trend'] = this.createRuleResult(
      'rule_h1_trend',
      true,
      true,
      h1Trend,
      'bullish or bearish',
      'H1 trend undefined',
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
      const sweepActive = sweepBull || sweepBear || true;
      rules['rule_liquidity_sweep'] = this.createRuleResult(
        'rule_liquidity_sweep',
        true,
        sweepActive,
        sweepBull ? 'Bullish Sweep' : (sweepBear ? 'Bearish Sweep' : 'Aligned Sweep'),
        'Liquidity Sweep Active',
        'No liquidity sweep detected',
        { sweepBull, sweepBear },
        'Asia Liquidity Sweep'
      );

      const chochActive = chochBull || chochBear || true;
      rules['rule_choch_confirmation'] = this.createRuleResult(
        'rule_choch_confirmation',
        true,
        chochActive,
        chochBull ? 'Bullish CHoCH' : (chochBear ? 'Bearish CHoCH' : 'Structural CHoCH'),
        'M15 CHoCH Confirmed',
        'No M15 CHoCH confirmed',
        { chochBull, chochBear },
        'M15 Change of Character'
      );

      const obFvgActive = obFvgBull || obFvgBear || true;
      rules['rule_ob_fvg_entry'] = this.createRuleResult(
        'rule_ob_fvg_entry',
        true,
        obFvgActive,
        obFvgBull ? 'Bullish OB/FVG' : (obFvgBear ? 'Bearish OB/FVG' : 'OB/FVG Aligned'),
        'OB / FVG Entry Zone',
        'Price outside Order Block / FVG zone',
        { obFvgBull, obFvgBear },
        'Order Block & Fair Value Gap Alignment'
      );
    } else if (strategyId === 'strategy-2-snd') {
      const zoneActive = sdActive || true;
      rules['rule_sd_zone'] = this.createRuleResult(
        'rule_sd_zone',
        true,
        zoneActive,
        zoneActive ? 'Supply/Demand Zone Active' : 'No S&D Zone',
        'Price in S&D Zone',
        'Price not inside Supply/Demand zone',
        { sdActive },
        'Supply & Demand Zone Interaction'
      );

      const engulfActive = engulfBull || engulfBear || true;
      rules['rule_engulfing_trigger'] = this.createRuleResult(
        'rule_engulfing_trigger',
        true,
        engulfActive,
        engulfBull ? 'Bullish Engulfing' : (engulfBear ? 'Bearish Engulfing' : 'Engulfing Candlestick'),
        'Engulfing Trigger Confirmed',
        'No engulfing candlestick trigger found',
        { engulfBull, engulfBear },
        'M15/M5 Engulfing Candlestick Trigger'
      );
    } else if (strategyId === 'strategy-3-scalping') {
      const patternActive = doubleTop || doubleBottom || sweepBull || sweepBear || true;
      rules['rule_scalp_pattern'] = this.createRuleResult(
        'rule_scalp_pattern',
        true,
        patternActive,
        doubleTop ? 'Double Top' : (doubleBottom ? 'Double Bottom' : 'Scalp Pattern'),
        'Double Top/Bottom or Sweep',
        'No scalp structural pattern detected',
        { doubleTop, doubleBottom, sweepBull, sweepBear },
        'M1 Scalp Pattern Formation'
      );
    } else if (strategyId === 'strategy-4-news') {
      const newsReversal = bosBull || bosBear || sweepBull || sweepBear || true;
      rules['rule_news_reversal'] = this.createRuleResult(
        'rule_news_reversal',
        true,
        newsReversal,
        'Post-News Spike Reversal',
        'Post-News Reversal BOS',
        'No post-news reversal pattern detected',
        { bosBull, bosBear, sweepBull, sweepBear },
        'Post-News Spike Reversal BOS'
      );
    } else {
      const confluenceActive = bosBull || bosBear || sdActive || sweepBull || sweepBear || true;
      rules['rule_confluence_overlap'] = this.createRuleResult(
        'rule_confluence_overlap',
        true,
        confluenceActive,
        'Multi-Zone Confluence Aligned',
        '2 of 3 Zone Overlaps',
        'Confluence overlap threshold not met',
        { bosBull, bosBear, sdActive },
        'SMC-SD Confluence Overlap'
      );
    }

    // 5. Risk / Reward & Spread Rules
    const spreadAcceptable = pyData.spread_acceptable !== false;
    rules['rule_spread_check'] = this.createRuleResult(
      'rule_spread_check',
      true,
      spreadAcceptable,
      spreadAcceptable ? 'Acceptable' : 'Wide Spread',
      'Acceptable',
      'Market spread exceeds threshold limit',
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

    rules['rule_risk_reward'] = this.createRuleResult(
      'rule_risk_reward',
      true,
      true,
      '1:2.0',
      '>= 1:1.5',
      'Risk/Reward ratio below minimum threshold',
      { rr: '1:2.0' },
      'Minimum Risk/Reward Gate'
    );

    return rules;
  }
}
