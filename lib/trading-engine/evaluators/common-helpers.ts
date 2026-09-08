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

export interface CalculatedRiskLevels {
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  riskDistance: number;
  riskReward: string;
  isValidGeometry: boolean;
  geometryError?: string;
}

/**
 * Single canonical risk calculation function.
 * Calculates SL and TP levels based on entry price, direction, ATR, multiplier, and minRR.
 * Enforces strict directional geometry:
 * - BUY: SL strictly below entry, TP strictly above entry
 * - SELL: SL strictly above entry, TP strictly below entry
 */
export function calculateRiskLevels(
  entryPrice: number,
  direction: 'buy' | 'sell',
  atr: number,
  multiplier: number = 0.5,
  minRR: number = 2.0
): CalculatedRiskLevels {
  const riskDist = Math.max(0.1, +(atr * multiplier).toFixed(2));
  const slPrice = direction === 'buy' ? +(entryPrice - riskDist).toFixed(2) : +(entryPrice + riskDist).toFixed(2);
  const tp1Price = direction === 'buy' ? +(entryPrice + (riskDist * minRR)).toFixed(2) : +(entryPrice - (riskDist * minRR)).toFixed(2);
  const tp2Price = direction === 'buy' ? +(entryPrice + (riskDist * (minRR + 1.5))).toFixed(2) : +(entryPrice - (riskDist * (minRR + 1.5))).toFixed(2);
  const tp3Price = direction === 'buy' ? +(entryPrice + (riskDist * (minRR + 3.0))).toFixed(2) : +(entryPrice - (riskDist * (minRR + 3.0))).toFixed(2);

  let isValidGeometry = true;
  let geometryError: string | undefined;

  if (direction === 'buy') {
    if (slPrice >= entryPrice) {
      isValidGeometry = false;
      geometryError = `Invalid BUY geometry: SL (${slPrice}) must be strictly below entry (${entryPrice})`;
    } else if (tp1Price <= entryPrice) {
      isValidGeometry = false;
      geometryError = `Invalid BUY geometry: TP1 (${tp1Price}) must be strictly above entry (${entryPrice})`;
    }
  } else {
    if (slPrice <= entryPrice) {
      isValidGeometry = false;
      geometryError = `Invalid SELL geometry: SL (${slPrice}) must be strictly above entry (${entryPrice})`;
    } else if (tp1Price >= entryPrice) {
      isValidGeometry = false;
      geometryError = `Invalid SELL geometry: TP1 (${tp1Price}) must be strictly below entry (${entryPrice})`;
    }
  }

  return {
    entryPrice,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    riskDistance: riskDist,
    riskReward: `1:${minRR.toFixed(1)}`,
    isValidGeometry,
    geometryError
  };
}
