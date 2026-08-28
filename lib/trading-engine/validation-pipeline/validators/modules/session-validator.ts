import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class SessionValidator implements BaseValidator {
  name = 'Session Validator';
  isCritical = true;
  private ruleKeys = ['rule_session_restriction', 'rule_session', 'LONDON_FILTER', 'NEWS_WINDOW'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) {
          return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'Session valid'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        }
        if (isRuleFail(rule)) {
          return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'Outside allowed session'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
        }
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting session restriction rule evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
