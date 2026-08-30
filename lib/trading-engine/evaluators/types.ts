import { SetupStepRecord, StepState } from '../types';
import { RuleEvaluationContext, RuleResult } from '@/types';

export interface StepEvaluationOutput {
  status: StepState;
  reason: string;
  direction?: 'buy' | 'sell';
  evidence?: Record<string, any>;
  invalidationReason?: string;
  calculatedLevels?: {
    entryPrice?: number;
    slPrice?: number;
    tp1Price?: number;
    tp2Price?: number;
    tp3Price?: number;
    riskReward?: number;
  };
  source_candle?: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
}

export interface IStrategyEvaluator {
  readonly strategyId: string;
  readonly strategyName: string;
  
  evaluateStep(
    step: SetupStepRecord,
    context: RuleEvaluationContext,
    analysisData: Record<string, any>,
    priorSteps: SetupStepRecord[],
    currentDirection?: 'buy' | 'sell'
  ): StepEvaluationOutput;

  evaluateRules(
    context: RuleEvaluationContext,
    analysisData: Record<string, any>
  ): Record<string, RuleResult>;
}
