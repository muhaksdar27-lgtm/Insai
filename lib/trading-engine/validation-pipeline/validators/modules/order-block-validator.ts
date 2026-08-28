import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class OrderBlockValidator implements BaseValidator {
  name = 'Order Block Validator';
  isCritical = true;
  private ruleKeys = ['rule_ob_fvg_entry', 'rule_ob', 'rule_sd_zone', 'OB_FVG', 'SD_ZONE'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'OB zone valid'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        if (isRuleFail(rule)) return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'OB invalid'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting Order Block evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
