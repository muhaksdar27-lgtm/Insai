import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class CHOCHValidator implements BaseValidator {
  name = 'CHOCH Validator';
  isCritical = true;
  private ruleKeys = ['rule_choch_confirmation', 'rule_choch', 'M15_CHOCH', 'rule_m1_bos_reversal'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) {
          return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'CHOCH confirmed'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        }
        if (isRuleFail(rule)) {
          return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'CHOCH invalidation'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
        }
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting CHOCH evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
