import { BaseValidator, ValidatorResult, isRulePass, isRuleFail } from '../base-validator';
import { RuleResult } from '@/types';

export class LiquiditySweepValidator implements BaseValidator {
  name = 'Liquidity Sweep Validator';
  isCritical = true;
  private ruleKeys = ['rule_liquidity_sweep', 'rule_m1_m5_sweep', 'rule_post_news_sweep', 'rule_confluence_sweep', 'ASIA_SWEEP', 'MICRO_SWEEP'];

  validate(ruleResults: Record<string, RuleResult>, _marketContext?: any): ValidatorResult {
    for (const key of this.ruleKeys) {
      const rule = ruleResults[key];
      if (rule) {
        if (isRulePass(rule)) {
          return { rule: this.name, status: 'PASS', reason: `${key} passed: ${rule.description || 'Liquidity sweep confirmed'}`, evidence: JSON.stringify(rule.evidence || {}), isCritical: this.isCritical };
        }
        if (isRuleFail(rule)) {
          return { rule: this.name, status: 'FAIL', reason: `${key} failed: ${rule.failureDetails?.reason || rule.invalidations?.[0] || 'Sweep requirement not satisfied'}`, evidence: JSON.stringify(rule.invalidations || []), isCritical: this.isCritical };
        }
      }
    }
    return { rule: this.name, status: 'WAIT', reason: 'Awaiting liquidity sweep evaluation', evidence: `Keys: ${this.ruleKeys.join(',')}`, isCritical: this.isCritical };
  }
}
