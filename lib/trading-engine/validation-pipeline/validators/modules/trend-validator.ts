import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class TrendValidator implements BaseValidator {
  name = 'Trend Validator';
  isCritical = true;
  private ruleKeys = ['rule_h1_trend', 'rule_trend', 'rule_trend_h1', 'rule_h1_m15_structure', 'H1_TREND', 'MA_TREND'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) {
          return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'Trend aligned'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        }
        if (isRuleFail(rule)) {
          return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'Trend not aligned'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
        }
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting trend rule evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
