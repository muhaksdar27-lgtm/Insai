import { PythonEngineManager } from "../../mcp/engines/deployment";
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { AIDecision, AIChecklistItem, RuleResult } from '@/types';
import { StrategyState } from '../state-machine';
import { logger } from '../../utils/logger';
import { getProviderRegistry } from '../../market-data/provider-registry';
import { getEnv } from '../../utils/env';
import { getDatabaseClient } from '../../db/client';
import { PythonAnalyzerBridge } from '../python-analyzer-bridge';
import { getStrategyDefinition } from '../strategy-registry';
import { tryGetStrategyManifest } from '../strategies';
import { ValidatorResult } from './validators';
import crypto from 'crypto';

export interface AIValidationDecision {
  decision: AIDecision;
  evidence: string;
  reasoning: string;
  rulesChecked: string[];
  rulesPassed: string[];
  rulesFailed: string[];
  conflicts: string;
  probabilities?: {
    institutionalAccumulation: number;
    institutionalDistribution: number;
    liquiditySweep: number;
    continuationProbability: number;
    reversalProbability: number;
    genuineBreakout: number;
    falseBreakout: number;
    newsIntervention: number;
  };
  confidenceScore?: number;
  marketConfidence?: number;
  dataQualityScore?: number;
  signalQualityScore?: number;
  scoringEngineData?: any;
}

export interface ValidationPipelineResult {
  strategyName: string;
  decision: AIDecision;
  reasoning: string;
  evidence?: string;
  checklist: AIChecklistItem[];
  riskNotes: string;
  missingFactors: string[];
  recommendedAction: string;
  aiReview?: AIValidationDecision;
  scores?: any;
}

export class AIValidationOrchestrator {
  private ai: GoogleGenAI | null = null;
  private cache = new Map<string, ValidationPipelineResult>();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly MIN_CONFIDENCE_THRESHOLD = 70;

  private get isConfigured(): boolean {
    return !!getEnv('GEMINI_API_KEY');
  }

  private getAiClient(): GoogleGenAI | null {
    if (this.ai) return this.ai;
    const apiKey = getEnv('GEMINI_API_KEY');
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      return this.ai;
    }
    return null;
  }

  /**
   * Generates a deterministic, setup-scoped cache key containing:
   * strategy_id, setup_id, event/candle timestamp, strategy version, evidence hash.
   */
  public generateCacheKey(
    strategyId: string,
    setupId: string,
    candleTimestamp: string,
    strategyVersion: string,
    canonicalEvidence: Record<string, any>
  ): string {
    const evidenceHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(canonicalEvidence))
      .digest('hex')
      .slice(0, 16);

    return `ai_val_${strategyId}_${setupId}_${candleTimestamp}_v${strategyVersion}_${evidenceHash}`;
  }

  public async runPipeline(
    strategyId: string,
    state: StrategyState,
    ruleResults: Record<string, RuleResult>,
    marketContext: any
  ): Promise<ValidationPipelineResult> {
    const startTime = performance.now();

    // 1. Gather strategy definition & active mandatory rules
    const strategyDef = getStrategyDefinition(strategyId);
    const manifest = tryGetStrategyManifest(strategyId);
    const strategyVersion = (manifest as any)?.version || (strategyDef as any)?.version || '1.0.0';
    const activeValidators = [...(strategyDef?.validationRules || ['rule_risk_reward'])];

    const validatorResults: ValidatorResult[] = [];
    let criticalFail = false;
    const failedRules: string[] = [];
    const waitingRules: string[] = [];

    for (const vName of activeValidators) {
      const ruleData = ruleResults[vName];
      if (ruleData) {
        const rawStatus: any = ruleData.status;
        const isPass = rawStatus === 'PASS' || rawStatus === 'valid' || rawStatus === true;
        const isFail = rawStatus === 'FAIL' || rawStatus === 'invalid' || rawStatus === false;
        const status = isPass ? 'PASS' : (isFail ? 'FAIL' : 'WAIT');
        const isMandatory = (ruleData as any).mandatory !== false;

        const res: ValidatorResult = {
          rule: vName,
          status: status,
          reason: status === 'PASS' ? 'Rule passed' : (status === 'WAIT' ? 'Awaiting rule conditions' : ((ruleData as any).description || (ruleData as any).reason || 'Rule failed')),
          evidence: JSON.stringify(ruleData.evidence || {}),
          isCritical: isMandatory
        };
        validatorResults.push(res);
        if (res.status === 'FAIL') {
          failedRules.push(res.rule);
          if (isMandatory) {
            criticalFail = true;
          }
        } else if (res.status === 'WAIT') {
          if (isMandatory) {
            waitingRules.push(res.rule);
          }
        }
      } else {
        validatorResults.push({
          rule: vName,
          status: 'WAIT',
          reason: 'Rule result missing',
          evidence: '',
          isCritical: true
        });
        waitingRules.push(vName);
      }
    }

    // 2. Early exit: Hard fail if any mandatory technical rule failed (fail-closed)
    if (criticalFail) {
      const endTime = performance.now();
      logger.warn(`[AI ORCHESTRATOR] Early exit triggered for ${strategyId}: mandatory rule(s) failed (${failedRules.join(', ')}). Evaluated in ${(endTime - startTime).toFixed(2)}ms`);
      return {
        strategyName: strategyId,
        decision: 'REJECTED',
        reasoning: `Early exit: mandatory technical rules failed (${failedRules.join(', ')}).`,
        evidence: 'Mandatory technical rule failure detected in rule engine.',
        checklist: validatorResults,
        riskNotes: 'Rule Engine invalidated the setup early.',
        missingFactors: failedRules,
        recommendedAction: 'block',
        scores: { confidence: 0 }
      };
    }

    // 3. Early hold: AI cannot validate or approve if mandatory technical rules are incomplete (WAIT)
    // AI CANNOT turn WAIT into APPROVED!
    if (waitingRules.length > 0) {
      const endTime = performance.now();
      logger.info(`[AI ORCHESTRATOR] AI validation held for ${strategyId}: mandatory technical rules still in WAIT state (${waitingRules.join(', ')}). Evaluated in ${(endTime - startTime).toFixed(2)}ms`);
      return {
        strategyName: strategyId,
        decision: 'WAIT',
        reasoning: `Prerequisite mandatory technical rules are still awaiting completion: ${waitingRules.join(', ')}. AI validation held.`,
        evidence: `Waiting on mandatory rules: ${waitingRules.join(', ')}`,
        checklist: validatorResults,
        riskNotes: 'TECHNICAL_RULES_AWAITING',
        missingFactors: waitingRules,
        recommendedAction: 'wait',
        scores: { confidence: 0 }
      };
    }

    // 4. Build canonical evidence strictly scoped to the evaluated strategy
    const candles = marketContext?.candles || marketContext?.marketData?.candles || [];
    const latestCandle = candles[candles.length - 1];
    const candleTimestamp = latestCandle?.timestamp || marketContext?.timestamp || new Date().toISOString();
    const setupId = (state as any)?.setupId || (state as any)?.id || (state as any)?.payload?.id || marketContext?.setupId || marketContext?.setup?.id || `setup_${strategyId}`;

    const simplifiedResults = validatorResults.map(r => ({
      rule: r.rule,
      status: r.status,
      reason: r.reason,
      isCritical: r.isCritical
    }));

    const canonicalEvidence = {
      strategyId,
      strategyVersion,
      symbol: marketContext?.marketData?.symbol || marketContext?.symbol || 'XAUUSD',
      timeframe: marketContext?.timeframe || 'M15',
      direction: (state as any)?.payload?.direction || (state as any)?.context?.direction || 'buy',
      candle: {
        timestamp: candleTimestamp,
        open: latestCandle?.open,
        high: latestCandle?.high,
        low: latestCandle?.low,
        close: latestCandle?.close,
        volume: latestCandle?.volume
      },
      technicalRules: simplifiedResults,
      marketMetrics: {
        atr: marketContext?.atr || marketContext?.marketData?.atr || 0,
        spread: marketContext?.spread || marketContext?.marketData?.spread || 0
      }
    };

    // 5. Query deterministic cache
    const cacheKey = this.generateCacheKey(
      strategyId,
      setupId,
      candleTimestamp,
      strategyVersion,
      canonicalEvidence
    );

    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.info(`[AI ORCHESTRATOR] Cache hit for ${cacheKey} (Decision: ${cached.decision})`);
      return cached;
    }

    // 6. Python Engine Quantitative Verification (if available)
    try {
      const pyHealth = await PythonEngineManager.evaluate();
      const statusUpper = (pyHealth.status || '').toUpperCase();
      if (statusUpper === 'ACTIVE') {
        const pyUrl = getEnv("PYTHON_ENGINE_URL");
        if (pyUrl && candles && candles.length >= 30) {
          const entryPrice = ruleResults['rule_risk_reward']?.evidence?.entry || (candles && candles[candles.length - 1]?.close) || 0;
          const slPrice = ruleResults['rule_risk_reward']?.evidence?.sl || 0;
          const tpPrice = ruleResults['rule_risk_reward']?.evidence?.tp1 || 0;
          const direction = (state as any).payload?.direction === 'sell' || state.stateName.includes('SHORT') ? 'SHORT' : 'LONG';

          const reqPayload = {
            symbol: 'XAUUSD',
            timeframe: marketContext.timeframe || 'M15',
            direction: direction,
            entry_price: entryPrice,
            sl_price: slPrice,
            tp_price: tpPrice,
            candles: candles,
            strategy_id: strategyId
          };

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const pyRes = await fetch(`${pyUrl}/validate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqPayload),
              signal: controller.signal
            });
            clearTimeout(timeout);

            if (pyRes.ok) {
              const pyData = await pyRes.json();
              validatorResults.push({
                rule: 'Python Quant Engine',
                status: pyData.decision === 'APPROVED' ? 'PASS' : (pyData.decision === 'WAIT' ? 'WAIT' : 'FAIL'),
                reason: (pyData.reasons || []).join(', '),
                evidence: JSON.stringify(pyData.metrics || {}),
                isCritical: true
              });

              if (pyData.decision === 'REJECTED') {
                logger.warn(`[PYTHON ENGINE REJECTED] Strategy ${strategyId} rejected by Python Quant Engine: ${(pyData.reasons || []).join(', ')}`);
                const pyRejectResult: ValidationPipelineResult = {
                  strategyName: strategyId,
                  decision: 'REJECTED',
                  checklist: validatorResults,
                  reasoning: `Python Quant Engine REJECTED setup: ${(pyData.reasons || []).join(', ')}`,
                  evidence: JSON.stringify(pyData.metrics || {}),
                  riskNotes: 'Rejected by Python Quant Scorer',
                  missingFactors: [],
                  recommendedAction: 'block',
                  scores: { score: pyData.quant_score || pyData.score || 0 }
                };
                this.cache.set(cacheKey, pyRejectResult);
                setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);
                return pyRejectResult;
              }
            }
          } catch (e: any) {
            logger.warn(`Python Engine /validate request failed: ${e.message}`);
          }
        }
      }
    } catch (e: any) {
      logger.warn(`Failed to check python engine status: ${e.message}`);
    }

    // 7. Strict Data Verification Guard
    const setupEvidence = (state as any)?.evidence || marketContext?.evidence || { stateName: state?.stateName };
    const dataIntegrity = PythonAnalyzerBridge.validateAIDataIntegrity(
      marketContext?.marketData || {},
      marketContext?.marketData?.candles || candles,
      { strategyId, strategyDef },
      setupEvidence,
      validatorResults
    );

    if (!dataIntegrity.isValid) {
      logger.warn(`[AI VALIDATION REJECTED] Unverified / incomplete data sent to AI: ${dataIntegrity.missingFactors.join(', ')}`);
      const unverifiedResult: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: "REJECTED",
        checklist: validatorResults,
        reasoning: `Signal validation rejected because input data failed verification: ${dataIntegrity.missingFactors.join(', ')}`,
        evidence: `Unverified Data: ${dataIntegrity.missingFactors.join(', ')}`,
        riskNotes: 'INSUFFICIENT_OR_UNVERIFIED_DATA',
        missingFactors: dataIntegrity.missingFactors,
        recommendedAction: "block",
        scores: { confidence: 0 }
      };
      this.cache.set(cacheKey, unverifiedResult);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);
      return unverifiedResult;
    }

    // 8. Circuit Breaker & Provider Health Checks
    const aiHealth = getProviderRegistry().getProviderHealth("GeminiAI");
    if (aiHealth && aiHealth.circuitBreakerStatus === "open") {
      logger.warn(`AI Service circuit breaker is open (${aiHealth.healthStatus}). Returning AI_UNAVAILABLE without auto-approving.`);
      const breakerResult: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: "AI_UNAVAILABLE",
        checklist: validatorResults,
        reasoning: "AI Validation circuit breaker is OPEN. Signal cannot be approved without AI validation layer.",
        evidence: "Circuit breaker open.",
        riskNotes: "AI_UNAVAILABLE - Circuit Breaker Open",
        missingFactors: ["AI Validation Layer"],
        recommendedAction: "wait",
        scores: { confidence: 0 }
      };
      this.cache.set(cacheKey, breakerResult);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);
      return breakerResult;
    }

    const aiClient = this.getAiClient();
    if (!this.isConfigured || !aiClient) {
      logger.info('AI Service is not configured (Missing GEMINI_API_KEY). Returning AI_UNAVAILABLE without auto-approving.');
      const unconfigResult: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: "AI_UNAVAILABLE",
        checklist: validatorResults,
        reasoning: "AI Service is not configured (Missing GEMINI_API_KEY). Signal held in AI_UNAVAILABLE state.",
        evidence: "AI Service Not Configured",
        riskNotes: 'AI_UNAVAILABLE',
        missingFactors: ['AI Validation Layer'],
        recommendedAction: "wait",
        scores: { confidence: 0 }
      };
      this.cache.set(cacheKey, unconfigResult);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);
      return unconfigResult;
    }

    // 9. Execute AI Validation with Gemini
    try {
      // Historical RAG lookup for canonical strategy context
      let similarHistoryText = "No historical context available.";
      try {
        const stateSummary = `Strategy: ${strategyId}, Timeframe: ${marketContext?.marketData?.timeframe || 'Unknown'}, Symbol: ${marketContext?.marketData?.symbol || 'Unknown'}, Rules: ${simplifiedResults.map(r => r.rule + "=" + r.status).join(',')}`;
        const embedRes = await aiClient.models.embedContent({
          model: 'gemini-embedding-2-preview',
          contents: stateSummary
        });
        const embedding = embedRes.embeddings?.[0]?.values;
        if (embedding && embedding.length > 0) {
          const db = getDatabaseClient();
          const similarSignals = await db.findSimilarHistory(embedding, 0.7, 5);
          if (similarSignals && similarSignals.length > 0) {
            const winCount = similarSignals.filter((s: any) => s.outcome === 'WIN').length;
            const lossCount = similarSignals.filter((s: any) => s.outcome === 'LOSS').length;
            similarHistoryText = `Found ${similarSignals.length} similar historical signals (Win: ${winCount}, Loss: ${lossCount}). ` +
              similarSignals.map((s: any) => `[${s.outcome}] Pips: ${s.pips_result || 0} | Strategy: ${s.strategy_id} | Similarity: ${(s.similarity * 100).toFixed(1)}%`).join('\n');
          }
        }
      } catch (e: any) {
        logger.debug('Historical RAG context lookup skipped', { error: e.message });
      }

      const prompt = `INSAI Institutional Gold Quantitative Validator. Strategi: ${strategyId} | State: ${state.stateName}.
TUGAS: Anda adalah Lead Quantitative & Institutional Orderflow AI Validator yang bertugas MEMVALIDASI setup trading XAU/USD (Gold) berdasarkan aturan baku strategi pengguna. Gemini HANYA bertindak sebagai VALIDATOR independen dan objektif (fail-closed). Gemini TIDAK PERNAH membuat signal spekulatif sendiri.

STRATEGY CANONICAL CONTEXT:
- Strategy ID: ${strategyId} (v${strategyVersion})
- Name: ${strategyDef?.name || strategyId}
- Description: ${strategyDef?.description || 'No specific description'}
- Required Rules: ${strategyDef?.validationRules?.join(', ') || 'Standard rules'}

XAU/USD INSTITUTIONAL DOMAIN PRINCIPLES:
1. Session Liquidity Dynamics: Asia range (liquidity engineering) -> London open (liquidity raid/sweep) -> NY session (trend continuation or institutional reversal).
2. Fair Value Gap & Mitigation: High-probability entries strictly seek mitigated Order Blocks / FVG with genuine institutional displacement (>60% candle body ratio).
3. Dealing Range Alignment: Longs must strictly reside in Discount Zone (<50% or OTE 0.618-0.786); Shorts must reside in Premium Zone (>50%).
4. Macro Confluences: Inverted DXY Dollar Index correlation & US 10-Year yield pressure.

MARKET CONTEXT (Korelasi & Makro):
- DXY Index Context: ${JSON.stringify(marketContext?.marketData?.correlations?.dxy || 'Not available')}
- US10Y Yield Context: ${JSON.stringify(marketContext?.marketData?.correlations?.us10y || 'Not available')}
- COT Data Sentiment: ${JSON.stringify(marketContext?.marketData?.correlations?.cotData || 'Not available')}
- News/Calendar Status: ${marketContext?.marketData?.calendar ? 'Active events detected' : 'No major events'}
- Historical Similarity (RAG):
${similarHistoryText}

CANONICAL EVIDENCE:
${JSON.stringify(canonicalEvidence, null, 2)}

Analisis bukti dari Scoring Engine dan konteks makro di atas SESUAI DENGAN ATURAN STRATEGI INI. Berikan probabilitas objektif (0-100) untuk:
- Institution Accumulation Probability (institutionalAccumulation)
- Institution Distribution Probability (institutionalDistribution)
- Liquidity Sweep Probability (liquiditySweep)
- Continuation Probability (continuationProbability)
- Reversal Probability (reversalProbability)
- Breakout Probability (genuineBreakout)
- False Breakout Probability (falseBreakout)
- News Probability (newsIntervention)
Dan berikan skor kuantitatif:
- Confidence Score keseluruhan (0-100) (Threshold persetujuan minimum: ${this.MIN_CONFIDENCE_THRESHOLD}%)
- Market Confidence (0-100)
- Data Quality Score (0-100)
- Signal Quality Score (0-100)

Sertakan alasan (reasoning) teknis berbasis data terukur (evidence) untuk keputusan Anda.
Jika data tidak cukup, terjadi kontradiksi zona, atau aturan bernilai WAIT/GAGAL, Anda HARUS mereturn decision REJECTED, jangan pernah memaksakan APPROVED.
VALIDATOR RULES RESULTS: ${JSON.stringify(simplifiedResults)}`;

      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING, enum: ['APPROVED', 'REJECTED'] },
          evidence: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          rulesChecked: { type: Type.ARRAY, items: { type: Type.STRING } },
          rulesPassed: { type: Type.ARRAY, items: { type: Type.STRING } },
          rulesFailed: { type: Type.ARRAY, items: { type: Type.STRING } },
          conflicts: { type: Type.STRING },
          probabilities: {
            type: Type.OBJECT,
            properties: {
              institutionalAccumulation: { type: Type.NUMBER },
              institutionalDistribution: { type: Type.NUMBER },
              liquiditySweep: { type: Type.NUMBER },
              continuationProbability: { type: Type.NUMBER },
              reversalProbability: { type: Type.NUMBER },
              genuineBreakout: { type: Type.NUMBER },
              falseBreakout: { type: Type.NUMBER },
              newsIntervention: { type: Type.NUMBER }
            }
          },
          confidenceScore: { type: Type.NUMBER },
          marketConfidence: { type: Type.NUMBER },
          dataQualityScore: { type: Type.NUMBER },
          signalQualityScore: { type: Type.NUMBER }
        },
        required: ['decision', 'evidence', 'reasoning', 'rulesChecked', 'rulesPassed', 'rulesFailed', 'probabilities', 'confidenceScore', 'marketConfidence', 'dataQualityScore', 'signalQualityScore']
      };

      const response = await this.callGeminiWithTimeoutAndRetry(aiClient, prompt, responseSchema, 10000, 1);
      const text = response.text;
      if (!text) throw new Error('Empty response payload from Gemini API');

      const parsed = JSON.parse(text) as AIValidationDecision;
      let finalDecision: AIDecision = parsed.decision;
      const confidenceScore = typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0;

      // STRICT AI QUALITY GATE:
      // If AI returned APPROVED but confidence score is below the threshold, strictly reject
      if (finalDecision === 'APPROVED' && confidenceScore < this.MIN_CONFIDENCE_THRESHOLD) {
        logger.warn(`[AI QUALITY GATE] AI returned APPROVED for ${strategyId} but confidence score (${confidenceScore}%) is below minimum threshold (${this.MIN_CONFIDENCE_THRESHOLD}%). Rejecting.`);
        finalDecision = 'REJECTED';
        parsed.reasoning = `Confidence score (${confidenceScore}%) below mandatory ${this.MIN_CONFIDENCE_THRESHOLD}% threshold. ` + (parsed.reasoning || '');
      }

      // Report successful Gemini API invocation to ProviderRegistry
      getProviderRegistry().reportSuccess('GeminiAI');

      const result: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: finalDecision,
        checklist: validatorResults,
        reasoning: parsed.reasoning + (parsed.conflicts ? ` [Conflicts: ${parsed.conflicts}]` : ''),
        evidence: parsed.evidence,
        riskNotes: validatorResults.find(c => c.rule === 'rule_risk_reward')?.reason || 'OK',
        missingFactors: validatorResults.filter(c => c.status === 'WAIT').map(c => c.rule),
        recommendedAction: finalDecision === 'APPROVED' ? 'allow_signal' : 'block',
        aiReview: { ...parsed, confidenceScore, scoringEngineData: {} },
        scores: { confidence: confidenceScore }
      };

      const endTime = performance.now();
      logger.info(`[AI ORCHESTRATOR] AI Validation completed for ${strategyId} in ${(endTime - startTime).toFixed(2)}ms (Decision: ${finalDecision}, Confidence: ${confidenceScore}%)`);

      this.cache.set(cacheKey, result);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      return result;
    } catch (error: any) {
      const rawMsg = String(error.message || '');
      const isQuotaExceeded = rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('429') || rawMsg.toLowerCase().includes('quota');
      const isTimeout = rawMsg.toLowerCase().includes('timed out');

      const cleanMsg = isQuotaExceeded
        ? 'Gemini API quota exceeded (429 Rate Limit)'
        : (isTimeout ? 'Gemini API call timed out' : 'Gemini AI service error');

      logger.warn(`[AI ORCHESTRATOR] AI Validation notice for ${strategyId}: ${cleanMsg}`);
      getProviderRegistry().reportError('GeminiAI', cleanMsg);

      // Distinguish provider availability vs validation syntax/runtime error
      const fallbackDecision: AIDecision = (isQuotaExceeded || isTimeout) ? 'AI_UNAVAILABLE' : 'VALIDATION_ERROR';
      const fallbackRes: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: fallbackDecision,
        checklist: validatorResults,
        reasoning: `AI Validation service notice (${cleanMsg}). Signal held without automatic approval per strict validation policy.`,
        evidence: "AI Validation Service Notice.",
        riskNotes: isQuotaExceeded ? 'AI_UNAVAILABLE - Quota Exceeded' : (isTimeout ? 'AI_UNAVAILABLE - Request Timeout' : 'VALIDATION_ERROR - Service Error'),
        missingFactors: ['AI Validation Layer'],
        recommendedAction: 'wait',
        scores: { confidence: 0 }
      };

      this.cache.set(cacheKey, fallbackRes);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      return fallbackRes;
    }
  }

  private async callGeminiWithTimeoutAndRetry(
    aiClient: GoogleGenAI,
    prompt: string,
    responseSchema: Schema,
    timeoutMs: number = 8000,
    maxRetries: number = 1
  ): Promise<any> {
    const candidateModels = ['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    let lastError: any = null;

    for (const modelName of candidateModels) {
      let attempt = 0;
      while (attempt <= maxRetries) {
        const startTime = Date.now();
        try {
          const generatePromise = aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: responseSchema,
              temperature: 0,
            },
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Gemini API call timed out after ${timeoutMs}ms`)), timeoutMs);
          });

          const response = await Promise.race([generatePromise, timeoutPromise]);

          // Record latency successfully
          const { metricsEngine } = await import('../../observability/metrics-engine');
          metricsEngine.recordAiValidationLatency(Date.now() - startTime);

          return response;
        } catch (err: any) {
          lastError = err;
          attempt++;
          const { metricsEngine } = await import('../../observability/metrics-engine');
          metricsEngine.recordAiValidationLatency(Date.now() - startTime);

          const isHighDemandOrBusy = err.status === 503 || err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('UNAVAILABLE');
          if (isHighDemandOrBusy) {
            logger.warn(`Model ${modelName} experiencing high demand (503), switching to next fallback model...`);
            break; // Switch to next model immediately
          }

          const isQuotaOrAuth = err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429') || err.message?.includes('401') || err.message?.includes('403') || err.message?.toLowerCase().includes('quota');
          if (attempt > maxRetries || isQuotaOrAuth) {
            break;
          }
          logger.warn(`Gemini API call failed for ${modelName} (attempt ${attempt}/${maxRetries}), retrying in 500ms... Error: ${err.message}`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    throw lastError || new Error('All Gemini candidate models failed');
  }
}

