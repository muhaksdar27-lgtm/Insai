import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class MarketStructureValidator implements BaseValidator {
  name = 'Market Structure Validator';
  isCritical = true;
  private ruleKeys = ['rule_h1_trend', 'rule_h1_m15_structure', 'rule_choch_confirmation', 'rule_market_structure', 'H1_TREND', 'M15_CHOCH'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'Market structure aligned'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        if (isRuleFail(rule)) return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'Market structure broken'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting market structure evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
