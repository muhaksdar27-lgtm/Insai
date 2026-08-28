import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class StrategyValidator implements BaseValidator {
  name = 'Strategy Validator';
  isCritical = true;
  private ruleKeys = ['rule_scalp_pattern', 'rule_confluence_overlap', 'rule_engulfing_trigger', 'DOUBLE_TOP_BOTTOM', 'LTF_ENGULFING'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'Strategy specific condition met'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        if (isRuleFail(rule)) return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'Strategy condition failed'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting strategy pattern evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
