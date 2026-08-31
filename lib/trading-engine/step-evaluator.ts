import { SetupStepRecord } from './types';
import { RuleEvaluationContext } from '@/types';
import { StepEvaluationOutput, getStrategyEvaluator } from './evaluators';

export type { StepEvaluationOutput };

export class StepEvaluator {
  public static evaluateStep(
    step: SetupStepRecord,
    context: RuleEvaluationContext,
    analysisData: Record<string, any>,
    priorSteps: SetupStepRecord[] = [],
    currentDirection?: 'buy' | 'sell'
  ): StepEvaluationOutput {
    // Resolve target strategy identifier
    const strategyId = step.strategy_id || analysisData?.strategy_id || (context as any)?.strategy_id;
    if (!strategyId) {
      return {
        status: 'INVALIDATED',
        reason: 'Step evaluation failed: Missing strategy identifier on step record, analysis data, or evaluation context',
        invalidationReason: 'Missing strategy identifier',
        evidence: { missingField: 'strategy_id' }
      };
    }
    const evaluator = getStrategyEvaluator(strategyId);

    return evaluator.evaluateStep(step, context, analysisData, priorSteps, currentDirection);
  }
}
