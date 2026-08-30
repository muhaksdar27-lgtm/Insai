import { RuleEvaluationContext, Candle, RuleResult } from '@/types';

export function getLatestCandle(context: RuleEvaluationContext): Candle | null {
  const candles = context.candles || [];
  return candles.length > 0 ? candles[candles.length - 1] : null;
}

export function getCurrentPrice(context: RuleEvaluationContext, analysisData: Record<string, any>): number {
  if (typeof analysisData?.current_price === 'number' && analysisData.current_price > 0) {
    return analysisData.current_price;
  }
  const latest = getLatestCandle(context);
  if (latest && typeof latest.close === 'number' && latest.close > 0) {
    return latest.close;
  }
  return 0;
}

export function getSourceCandle(latestCandle: Candle | null) {
  if (!latestCandle) return undefined;
  return {
    timestamp: latestCandle.timestamp,
    open: latestCandle.open,
    high: latestCandle.high,
    low: latestCandle.low,
    close: latestCandle.close,
    volume: latestCandle.volume ?? 0
  };
}

export function createRuleResult(
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
