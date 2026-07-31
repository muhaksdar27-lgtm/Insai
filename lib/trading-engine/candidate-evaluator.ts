import { RuleResult, RuleFailureDetails } from './rule-engine';
import { logger } from '../utils/logger';

export interface CandidateEvaluationResult {
  accepted: boolean;
  rejected: boolean;
  rejectionReason: string | null;
  score: number;
  confidence: number;
  ruleResults: Record<string, RuleResult>;
  failedRules: RuleFailureDetails[];
  isWaiting: boolean;
}

export class CandidateEvaluator {
  /**
   * Evaluates candidate setup rule results deterministically.
   * Returns accepted, rejected, rejectionReason, score, confidence.
   */
  public static evaluateCandidate(
    strategyId: string,
    ruleResults: Record<string, RuleResult>
  ): CandidateEvaluationResult {
    let mandatoryFailCount = 0;
    let mandatoryWaitCount = 0;
    let totalCount = 0;
    let passCount = 0;

    const failedRules: RuleFailureDetails[] = [];
    let primaryRejectionReason: string | null = null;
    let primaryWaitReason: string | null = null;

    for (const [ruleKey, res] of Object.entries(ruleResults)) {
      totalCount++;

      if (res.status === 'PASS' || res.status === 'valid' || res.status === 'valid_wait') {
        passCount++;
      } else if (res.status === 'WAIT') {
        if (res.mandatory) {
          mandatoryWaitCount++;
          if (!primaryWaitReason) {
            primaryWaitReason = res.failureDetails?.reason || `Rule ${ruleKey} is waiting for market data or session`;
          }
        }
      } else if (res.status === 'FAIL' || res.status === 'ERROR' || res.status === 'invalid') {
        if (res.failureDetails) {
          failedRules.push(res.failureDetails);
        }
        if (res.mandatory) {
          mandatoryFailCount++;
          if (!primaryRejectionReason) {
            primaryRejectionReason = res.failureDetails?.reason || `Mandatory rule ${ruleKey} failed`;
          }
        }
      }
    }

    const score = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;
    const confidence = Math.min(100, Math.max(0, score));

    // Decision logic
    if (mandatoryWaitCount > 0 && mandatoryFailCount === 0) {
      return {
        accepted: false,
        rejected: false,
        rejectionReason: primaryWaitReason || 'Waiting for market session or data',
        score,
        confidence,
        ruleResults,
        failedRules,
        isWaiting: true
      };
    }

    if (mandatoryFailCount > 0) {
      return {
        accepted: false,
        rejected: true,
        rejectionReason: primaryRejectionReason || `${mandatoryFailCount} mandatory rule(s) failed`,
        score,
        confidence,
        ruleResults,
        failedRules,
        isWaiting: false
      };
    }

    // All mandatory rules PASS
    logger.info(`CandidateEvaluator: Setup for ${strategyId} accepted with score ${score}%.`);
    return {
      accepted: true,
      rejected: false,
      rejectionReason: null,
      score,
      confidence,
      ruleResults,
      failedRules,
      isWaiting: false
    };
  }
}
