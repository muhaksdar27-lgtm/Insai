import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class FairValueGapValidator implements BaseValidator {
  name = 'Fair Value Gap Validator';
  isCritical = true;
  private ruleKeys = ['rule_fvg', 'rule_ob_fvg_entry', 'rule_fvg_alignment', 'OB_FVG'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'FVG valid'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        if (isRuleFail(rule)) return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'FVG invalid'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting Fair Value Gap evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
