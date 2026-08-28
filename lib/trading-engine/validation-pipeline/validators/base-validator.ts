import { RuleResult } from '@/types';

export interface ValidatorResult {
  rule: string;
  status: 'PASS' | 'FAIL' | 'WAIT';
  reason: string;
  evidence: string;
  isCritical?: boolean;
}

export interface BaseValidator {
  name: string;
  isCritical: boolean;
  validate(ruleResults: Record<string, RuleResult>, marketContext: any): ValidatorResult;
}

export function isRulePass(rule?: RuleResult): boolean {
  if (!rule) return false;
  const s = String(rule.status).toUpperCase();
  return s === 'PASS' || s === 'VALID' || s === 'TRUE' || (rule.status as unknown) === true;
}

export function isRuleFail(rule?: RuleResult): boolean {
  if (!rule) return false;
  const s = String(rule.status).toUpperCase();
  return s === 'FAIL' || s === 'INVALID' || s === 'FALSE' || (rule.status as unknown) === false;
}

export function isRuleWait(rule?: RuleResult): boolean {
  if (!rule) return true;
  const s = String(rule.status).toUpperCase();
  return s === 'WAIT' || s === 'VALID_WAIT' || s === 'PENDING' || s === 'AWAITING';
}
