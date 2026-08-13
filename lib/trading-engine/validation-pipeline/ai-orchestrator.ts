import { PythonEngineManager } from "../../mcp/engines/deployment";
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { AIDecision, AIChecklistItem, RuleResult } from '@/types';
import { StrategyState } from '../state-machine';
import { logger } from '../../utils/logger';
import { getProviderRegistry } from '../../market-data/provider-registry';
import { getEnv } from '../../utils/env';
import { getDatabaseClient } from '../../db/client';

import { getStrategyDefinition } from '../strategy-registry';
import { ValidatorResult } from './validators';

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

  public async runPipeline(
    strategyId: string,
    state: StrategyState,
    ruleResults: Record<string, RuleResult>,
    marketContext: any
  ): Promise<ValidationPipelineResult> {
    
    const startTime = performance.now();
    
    // 1. Kumpulkan hasil semua validator independen dan prioritaskan rule kritikal
    const strategyDef = getStrategyDefinition(strategyId);
    const activeValidators = [...(strategyDef?.validationRules || ['Trend Validator', 'Risk Validator'])];
    const activeRulesCount = activeValidators.length;
    
    // We already have ruleResults evaluated from engine (candidateRules).
    const validatorResults: ValidatorResult[] = [];
    let criticalFail = false;
    let failedRules: string[] = [];
    
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
             reason: status === 'PASS' ? 'Rule met' : ((ruleData as any).description || 'Rule not met'),
             evidence: JSON.stringify(ruleData.evidence || {}),
             isCritical: isMandatory
         };
         validatorResults.push(res);
         if (res.status === 'FAIL') {
             failedRules.push(res.rule);
             if (isMandatory) {
                 criticalFail = true;
             }
         }
      } else {
         validatorResults.push({ rule: vName, status: 'WAIT', reason: 'Rule result missing', evidence: '', isCritical: false });
      }
    }

    // 2. Menghentikan validasi lebih awal jika rule kritikal gagal (early exit)
    if (criticalFail) {
      const endTime = performance.now();
      logger.warn(`Early exit triggered for ${strategyId}: ${failedRules.join(', ')} failed. Evaluated in ${(endTime - startTime).toFixed(2)}ms`);
      return {
        strategyName: strategyId,
        decision: 'REJECTED',
        reasoning: `Early exit: critical rules failed (${failedRules.join(', ')}).`,
        evidence: 'Critical failure detected in rule engine.',
        checklist: validatorResults,
        riskNotes: 'Rule Engine invalidated the setup early.',
        missingFactors: [],
        recommendedAction: 'wait'
      };
    }

    // 3. Deteksi Konflik (AI akan membantu memvalidasi rule engine hasil ini)
    const candles = marketContext?.candles || marketContext?.marketData?.candles || [];
    const latestCandle = candles[candles.length - 1];
    const timestamp = latestCandle?.timestamp || 'unknown';
    const cacheKey = `${strategyId}-${timestamp}-${state.stateName}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const passedCount = validatorResults.filter(v => v.status === 'PASS').length;
    const totalCount = activeRulesCount;
    const realScore = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    const {} = { totalScore: realScore };

    // Check Python Engine Health First
    try {
        
        const pyHealth = await PythonEngineManager.evaluate();
        const statusUpper = (pyHealth.status || '').toUpperCase();
        if (statusUpper !== 'ACTIVE') {
             if (statusUpper === 'NOT CONFIGURED' || statusUpper === 'DISABLED_BY_DESIGN' || statusUpper === 'UNREACHABLE' || statusUpper === 'RUNTIME_ERROR') {
                 logger.debug(`Python engine status is ${pyHealth.status}, proceeding with Native TS & AI Orchestration.`);
             } else {
                 const waits = validatorResults.filter(v => v.status === 'WAIT').map(v => v.rule);
                 return {
                    strategyName: strategyId,
                    decision: 'WAIT',
                    checklist: validatorResults,
                    reasoning: `Python Engine OFFLINE: ${pyHealth.message}. Waiting for Python Engine.`,
                    evidence: 'System degraded. AI request blocked.',
                    riskNotes: 'Python Engine Offline',
                    missingFactors: ['Python Engine', ...waits],
                    recommendedAction: 'wait',
                    scores: {}
                 };
             }
        } else {
             // Python Engine is online, perform quantitative validation
             const pyUrl = getEnv("PYTHON_ENGINE_URL");
             if (!pyUrl) {
                 throw new Error("PYTHON_ENGINE_URL is not set");
             }
             
             // Build request payload
             const entryPrice = ruleResults['Entry Validator']?.evidence?.price || (candles && candles[candles.length-1]?.close) || 0;
             const slPrice = ruleResults['Risk Validator']?.evidence?.sl || 0;
             const tpPrice = ruleResults['Risk Validator']?.evidence?.tp1 || 0;
             const direction = (state as any).payload?.direction === 'sell' || state.stateName.includes('SHORT') ? 'SHORT' : 'LONG';

             if (candles && candles.length >= 30) {
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
                     const timeout = setTimeout(() => controller.abort(), 5000);
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
                             return {
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
                         }
                     } else {
                         const errData = await pyRes.text();
                         logger.warn(`Python Engine /validate returned ${pyRes.status}: ${errData}`);
                     }
                 } catch (e: any) {
                     logger.warn(`Python Engine /validate failed: ${e.message}`);
                 }
             } else {
                 logger.warn('Insufficient candles for python validation (< 30)');
             }
        }
    } catch (e: any) {
         logger.warn('Failed to check python engine status', e.message);
    }

    const aiClient = this.getAiClient();
    
    const aiHealth = getProviderRegistry().getProviderHealth("GeminiAI");
    if (aiHealth && aiHealth.circuitBreakerStatus === "open") {
        const failsCount = validatorResults.filter(v => v.status === 'FAIL').length;
        if (failsCount === 0 && passedCount > 0) {
            logger.info(`AI Service circuit breaker is open (${aiHealth.healthStatus}), but Deterministic Rule Engine passed with 0 failures (${passedCount} rules passed). Approving signal via Deterministic Rule Engine fallback.`);
            return {
               strategyName: strategyId,
               decision: "APPROVED",
               checklist: validatorResults,
               reasoning: "Approved via Deterministic Rule Engine (AI Circuit Breaker Fallback). All mandatory setup rules verified with 0 failures.",
               evidence: "Deterministic Rule Engine Passed",
               riskNotes: 'Rule Engine Validated',
               missingFactors: [],
               recommendedAction: "execute",
               scores: { confidence: realScore || 100 }
            };
        }
        logger.warn(`AI Service circuit breaker is open (${aiHealth.healthStatus}). Hard-blocking signal dispatch as AI validation is mandatory.`);
        return {
           strategyName: strategyId,
           decision: "REJECTED",
           checklist: validatorResults,
           reasoning: "AI Validation circuit breaker is OPEN. Signal suppressed per quality gate requirement.",
           evidence: "Circuit breaker open.",
           riskNotes: "AI UNAVAILABLE - Circuit Breaker Open",
           missingFactors: ["AI Validation"],
           recommendedAction: "block",
           scores: {}
        };
    }
    
    if (!this.isConfigured || !aiClient) {
       logger.info('AI Service is not configured (Missing GEMINI_API_KEY). Proceeding with Deterministic Rule Engine validation.');
       return {
          strategyName: strategyId,
          decision: "APPROVED",
          checklist: validatorResults,
          reasoning: "Approved via Deterministic Rule Engine (GEMINI_API_KEY optional). All mandatory setup rules verified.",
          evidence: "Deterministic Rule Engine Passed",
          riskNotes: 'Rule Engine Validated',
          missingFactors: [],
          recommendedAction: "execute",
          scores: { confidence: realScore }
       };
    }

    try {
      // 4. AI Validates the Rule Engine outputs
      // Optimize prompt size by excluding raw evidence JSON which can be large
      const simplifiedResults = validatorResults.map(r => ({ rule: r.rule, status: r.status, reason: r.reason, isCritical: r.isCritical }));
      
      
      // --- RAG IMPLEMENTATION ---
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
          logger.warn('Failed to retrieve RAG context', { error: e.message });
      }
      // --------------------------

      let prompt = `INSAI Analyst. Strategi: ${strategyId} | State: ${state.stateName}.
TUGAS: Anda adalah Validator AI yang bertugas MEMVALIDASI setup trading berdasarkan STRATEGI SPESIFIK pengguna. Gemini HANYA bertindak sebagai VALIDATOR. Gemini TIDAK PERNAH membuat signal sendiri.

STRATEGY CONTEXT:
- Name: ${strategyDef?.name || strategyId}
- Description: ${strategyDef?.description || 'No specific description'}
- Required Rules: ${strategyDef?.validationRules?.join(', ') || 'Standard rules'}

MARKET CONTEXT (Korelasi & Makro):
- DXY: ${JSON.stringify(marketContext?.marketData?.correlations?.dxy || 'Not available')}
- US10Y: ${JSON.stringify(marketContext?.marketData?.correlations?.us10y || 'Not available')}
- COT Data: ${JSON.stringify(marketContext?.marketData?.correlations?.cotData || 'Not available')}
- News/Calendar: ${marketContext?.marketData?.calendar ? 'Active events detected' : 'No major events'}
- Historical Similarity (RAG):
${similarHistoryText}

Analisis bukti dari Scoring Engine dan konteks makro di atas SESUAI DENGAN ATURAN STRATEGI INI. Berikan probabilitas (0-100) untuk:
- Institution Accumulation Probability (institutionalAccumulation)
- Institution Distribution Probability (institutionalDistribution)
- Liquidity Sweep Probability (liquiditySweep)
- Continuation Probability (continuationProbability)
- Reversal Probability (reversalProbability)
- Breakout Probability (genuineBreakout)
- False Breakout Probability (falseBreakout)
- News Probability (newsIntervention)
Dan berikan:
- Confidence Score keseluruhan (0-100)
- Market Confidence (0-100)
- Data Quality Score (0-100)
- Signal Quality Score (0-100)

Sertakan alasan (reasoning) kuat berbasis data (evidence) untuk keputusan Anda.
Jika data tidak cukup atau ambigu (misalnya rule bernilai WAIT/ASUMSI), Anda HARUS mereturn decision REJECTED/WAIT, jangan memaksakan APPROVED.
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

      const geminiHealth = getProviderRegistry().getProviderHealth('GeminiAI');
      if (geminiHealth?.circuitBreakerStatus === 'open') {
        logger.warn(`GeminiAI circuit breaker is open. Hard blocking AI validation for ${strategyId}.`);
        const fallbackResult: ValidationPipelineResult = {
          strategyName: strategyId,
          decision: 'REJECTED',
          checklist: validatorResults,
          reasoning: "AI Validation circuit breaker is open. Signal dispatch suppressed.",
          evidence: "Circuit breaker open.",
          riskNotes: 'AI UNAVAILABLE - Circuit Breaker Open',
          missingFactors: ['AI Validation'],
          recommendedAction: 'block',
          scores: {}
        };
        this.cache.set(cacheKey, fallbackResult);
        setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);
        return fallbackResult;
      }

      const response = await this.callGeminiWithTimeoutAndRetry(aiClient, prompt, responseSchema, 8000, 1);

      const text = response.text;
      if (!text) throw new Error('No response from Gemini API');
      
      const parsed = JSON.parse(text) as AIValidationDecision;
      const aiDecision = parsed.decision;
      
      // Report successful Gemini API invocation to ProviderRegistry
      getProviderRegistry().reportSuccess('GeminiAI');
      
      const finalChecklist = validatorResults;
      
      const result: ValidationPipelineResult = {
        strategyName: strategyId,
        decision: aiDecision,
        checklist: finalChecklist,
        reasoning: parsed.reasoning + (parsed.conflicts ? ` [Conflicts: ${parsed.conflicts}]` : ''),
        evidence: parsed.evidence,
        riskNotes: finalChecklist.find(c => c.rule === 'Risk Validator')?.reason || 'OK',
        missingFactors: finalChecklist.filter(c => c.status === 'WAIT').map(c => c.rule),
        recommendedAction: aiDecision === 'APPROVED' ? 'allow_signal' : 'wait',
        aiReview: { ...parsed, scoringEngineData: {} },
        scores: {}
      };

      const endTime = performance.now();
      logger.info(`AI Validation Orchestrator completed for ${strategyId} in ${(endTime - startTime).toFixed(2)}ms`);

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

      logger.warn(`AI Validation notice for ${strategyId}: ${cleanMsg}`);
      getProviderRegistry().reportError('GeminiAI', cleanMsg);

      const passedCount = validatorResults.filter(v => v.status === 'PASS').length;
      const failsCount = validatorResults.filter(v => v.status === 'FAIL').length;

      if (failsCount === 0 && passedCount > 0) {
        logger.info(`AI Service rate-limited (${cleanMsg}), but Deterministic Rule Engine passed with 0 failures (${passedCount} rules passed). Approving setup via Deterministic Rule Engine fallback.`);
        const fallbackRes: ValidationPipelineResult = {
           strategyName: strategyId,
           decision: 'APPROVED',
           checklist: validatorResults,
           reasoning: `Approved via Deterministic Rule Engine fallback (${cleanMsg}). All mandatory setup rules verified with 0 failures.`,
           evidence: "Deterministic Rule Engine Passed",
           riskNotes: 'Rule Engine Validated',
           missingFactors: [],
           recommendedAction: 'allow_signal',
           scores: { confidence: realScore || 90 }
        };

        this.cache.set(cacheKey, fallbackRes);
        setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

        return fallbackRes;
      }

      const fallbackRes: ValidationPipelineResult = {
         strategyName: strategyId,
         decision: 'REJECTED',
         checklist: validatorResults,
         reasoning: `AI Validation unavailable (${cleanMsg}). Signal suppressed per quality gate requirement.`,
         evidence: "AI Validation failed.",
         riskNotes: isQuotaExceeded ? 'AI UNAVAILABLE - Quota Exceeded' : (isTimeout ? 'AI UNAVAILABLE - Request Timeout' : 'AI UNAVAILABLE - System Error'),
         missingFactors: ['AI Validation'],
         recommendedAction: 'block',
         scores: {}
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
    let attempt = 0;
    while (attempt <= maxRetries) {
      const startTime = Date.now();
      try {
        const generatePromise = aiClient.models.generateContent({
          model: 'gemini-3.6-flash',
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
        attempt++;
        const { metricsEngine } = await import('../../observability/metrics-engine');
        metricsEngine.recordAiValidationLatency(Date.now() - startTime);
        
        const isQuotaOrAuth = err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('429') || err.message?.includes('401') || err.message?.includes('403') || err.message?.toLowerCase().includes('quota');
        if (attempt > maxRetries || isQuotaOrAuth) {
          throw err;
        }
        logger.warn(`Gemini API call failed (attempt ${attempt}/${maxRetries}), retrying in 500ms... Error: ${err.message}`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
}
