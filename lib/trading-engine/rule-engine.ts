import { RuleEvaluationContext, RuleResult } from '@/types';
import { getStrategyEvaluator, createRuleResult } from './evaluators';
import { logger } from '../utils/logger';

export type { RuleResult };
export type RuleStatus = 'PASS' | 'FAIL' | 'WAIT' | 'ERROR';

export interface RuleFailureDetails {
  ruleName: string;
  reason: string;
  actualValue: any;
  expectedValue: any;
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
    return createRuleResult(
      ruleName,
      mandatory,
      conditionPassed,
      actualValue,
      expectedValue,
      reasonIfFailed,
      evidence,
      description
    );
  }

  /**
   * Evaluate all rules for a given strategy independently using dedicated strategy evaluators.
   */
  public static evaluateStrategyRules(
    strategyId: string,
    context: RuleEvaluationContext,
    pyData: any = {}
  ): Record<string, RuleResult> {
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

    // Timeframe assertion check for strategy context
    const smc = context.strategyMarketContext;
    if (smc) {
      if (strategyId === 'strategy-3-scalping' && (!smc.M1 || !smc.M1.completeness)) {
        return {
          rule_timeframe_m1: this.createRuleResult(
            'rule_timeframe_m1',
            true,
            'WAIT',
            smc.M1?.candleCount || 0,
            '>= 30 M1 Candles',
            'Awaiting required M1 candle stream data for Strategy 3 scalping pattern execution',
            { timeframe: 'M1', completeness: smc.M1?.completeness },
            'M1 Scalp Timeframe Stream Requirement'
          )
        };
      }
      if (strategyId === 'strategy-4-news' && (!smc.M1 || !smc.M1.completeness || !smc.M5 || !smc.M5.completeness)) {
        return {
          rule_timeframe_news: this.createRuleResult(
            'rule_timeframe_news',
            true,
            'WAIT',
            { m5: smc.M5?.candleCount || 0, m1: smc.M1?.candleCount || 0 },
            'M5 and M1 Completed Streams',
            'Awaiting required M5 news context and M1 trigger candle streams for Strategy 4',
            { m5Completeness: smc.M5?.completeness, m1Completeness: smc.M1?.completeness },
            'Strategy 4 News Timeframe Stream Requirement'
          )
        };
      }
    }

    // Delegate to strategy-specific independent evaluator
    const evaluator = getStrategyEvaluator(strategyId);
    return evaluator.evaluateRules(context, pyData);
  }
}
