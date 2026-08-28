import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class BOSValidator implements BaseValidator {
  name = 'BOS Validator';
  isCritical = true;
  private ruleKeys = ['rule_bos_confirmation', 'rule_m1_bos_reversal', 'rule_neckline_break', 'rule_bos', 'BOS_CONFIRMATION', 'NECKLINE_BREAK'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'BOS validated'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        if (isRuleFail(rule)) return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'BOS invalidation'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting BOS evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
