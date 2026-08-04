/**
 * Centralized Rule Transformer Utility
 * Provides uniform transformation and normalization of candidate rules,
 * rule results, and AI checklist evidence across backend pipelines and frontend view models.
 */

export interface RuleValidationResult {
  ruleId: string;
  passed: boolean;
  status: 'valid' | 'invalid' | 'pending';
  invalidations: string[];
  evidence?: any;
}

export interface AiChecklistItem {
  rule: string;
  status: 'PASS' | 'FAIL';
  reason?: string;
  evidence?: any;
}

export interface ConsolidatedRules {
  rulesPassed: string[];
  rulesFailed: string[];
}

/**
 * Transforms raw candidate rules object or array into consolidated passed and failed rule lists.
 */
export function transformCandidateRules(candidateRules: any): ConsolidatedRules {
  const rulesPassed: string[] = [];
  const rulesFailed: string[] = [];

  if (candidateRules && typeof candidateRules === 'object') {
    for (const [k, v] of Object.entries(candidateRules)) {
      const valObj = v as any;
      const isPassed = valObj?.status === 'valid' || valObj?.status === 'PASS' || valObj === true || valObj?.passed === true;
      if (isPassed) {
        if (!rulesPassed.includes(k)) rulesPassed.push(k);
      } else {
        if (!rulesFailed.includes(k)) rulesFailed.push(k);
      }
    }
  }

  return { rulesPassed, rulesFailed };
}

/**
 * Transforms raw AI checklist items into standardized AiChecklistItem array.
 */
export function transformAiChecklist(checklist: any): AiChecklistItem[] {
  if (!Array.isArray(checklist)) return [];

  return checklist.map((item: any) => {
    const ruleName = item.rule || item.name || item.ruleId || 'Unnamed Rule';
    const status: 'PASS' | 'FAIL' = (item.status === 'PASS' || item.passed === true || item.status === 'valid') ? 'PASS' : 'FAIL';
    return {
      rule: ruleName,
      status,
      reason: item.reason || item.description || '',
      evidence: item.evidence || item.details || null
    };
  });
}

/**
 * Consolidates candidate rules and AI checklist into unified passed and failed arrays.
 */
export function consolidateValidationRules(candidateRules: any, aiChecklist: any): ConsolidatedRules {
  const { rulesPassed, rulesFailed } = transformCandidateRules(candidateRules);
  const checklist = transformAiChecklist(aiChecklist);

  for (const item of checklist) {
    if (item.status === 'PASS' && item.rule) {
      if (!rulesPassed.includes(item.rule)) rulesPassed.push(item.rule);
      const failIdx = rulesFailed.indexOf(item.rule);
      if (failIdx !== -1) rulesFailed.splice(failIdx, 1);
    } else if (item.status === 'FAIL' && item.rule) {
      if (!rulesFailed.includes(item.rule)) rulesFailed.push(item.rule);
      const passIdx = rulesPassed.indexOf(item.rule);
      if (passIdx !== -1) rulesPassed.splice(passIdx, 1);
    }
  }

  return { rulesPassed, rulesFailed };
}
