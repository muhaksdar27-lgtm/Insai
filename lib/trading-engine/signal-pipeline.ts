import { getQueueManager } from '../redis/queue';
import { Setup } from '@/types';
import { logger } from '../utils/logger';
import { notificationEngine } from '../notifications/notification-engine';
import { getSupabaseClient } from '../supabase/client';
import { metricsEngine } from '../observability/metrics-engine';
import crypto from 'crypto';

export class SignalPipeline {
  constructor() {
  }

  public async emitSignal(setup: Setup, marketContext: any) {
    const lockKey = `${setup.sourceStrategy}_${setup.symbol}_${setup.timeframe}`;
    
    // Distributed In-flight lock deduplication
    const lockAcquired = await getQueueManager().acquireLock(lockKey, 30);
    if (!lockAcquired) {
      logger.warn(`Signal generation for ${lockKey} is already in-flight (Distributed Lock). Suppressing duplicate.`);
      return;
    }

    try {
      logger.info(`Pipeline processing setup signal for ${setup.id}`);

      const aiDecision = (setup as any).aiValidation?.decision || 'REJECTED';
      const isSuppressed = (setup as any).isSuppressed || aiDecision !== 'APPROVED' || (setup as any).qualityGatePassed === false;
      const status = isSuppressed ? 'SUPPRESSED' : 'SIGNAL_ACTIVE';

      const snapshot = (setup as any).setupSnapshot || {};
      const candidateRules = (setup as any).candidateRules || (setup as any).context?.candidateRules || {};
      
      const rulesPassed: string[] = [];
      const rulesFailed: string[] = [];
      if (candidateRules && typeof candidateRules === 'object') {
        for (const [k, v] of Object.entries(candidateRules)) {
          const valObj = v as any;
          if (valObj?.status === 'valid' || valObj?.status === 'PASS' || valObj === true) {
            rulesPassed.push(k);
          } else {
            rulesFailed.push(k);
          }
        }
      }

      const aiChecklist = (setup as any).aiValidation?.checklist;
      if (Array.isArray(aiChecklist)) {
        for (const item of aiChecklist) {
          if (item.status === 'PASS' && item.rule && !rulesPassed.includes(item.rule)) {
            rulesPassed.push(item.rule);
          } else if (item.status === 'FAIL' && item.rule && !rulesFailed.includes(item.rule)) {
            rulesFailed.push(item.rule);
          }
        }
      }

      const entry = setup.entryPrice || snapshot.entryPrice || snapshot.entry || 0;
      const sl = setup.slPrice || snapshot.slPrice || snapshot.sl || 0;
      const tp = setup.tpPrice || snapshot.tp1Price || snapshot.tp1 || snapshot.tp || 0;
      let rr = '1:2.0';
      if (entry > 0 && sl > 0 && tp > 0 && Math.abs(entry - sl) > 0) {
        rr = `1:${(Math.abs(tp - entry) / Math.abs(entry - sl)).toFixed(2)}`;
      }

      const atr = snapshot?.technicalIndicators?.atr || marketContext?.atr || 4.5;
      const confidenceNum = (setup as any).aiValidation?.scores?.confidence || (setup as any).confidence || (rulesPassed.length > 0 ? 100 : 85);
      const confidence = typeof confidenceNum === 'number' ? `${confidenceNum}%` : confidenceNum;
      
      const aiReasoning = (setup as any).aiValidation?.reasoning || 'Engine Rule Engine Validated';
      const aiEvidence = (setup as any).aiValidation?.evidence || JSON.stringify({ rulesPassed, rulesFailed });

      // Canonical 18-field Signal Object
      const canonicalSignal = {
        signalUuid: setup.id || crypto.randomUUID(),
        strategy: setup.sourceStrategy,
        symbol: setup.symbol,
        session: marketContext?.session || snapshot.session || 'London',
        timeframe: setup.timeframe || snapshot.timeframe || 'M15',
        direction: (setup.direction || 'BUY').toUpperCase(),
        entry,
        sl,
        tp,
        rr,
        atr,
        confidence,
        rulesPassed,
        rulesFailed,
        aiStatus: aiDecision,
        reason: aiReasoning,
        evidence: aiEvidence,
        timestamp: new Date().toISOString(),
        
        // Internal aliases for db column mappings
        signalKey: setup.id,
        correlationId: crypto.randomUUID(),
        strategyId: setup.sourceStrategy,
        entryPrice: entry,
        slPrice: sl,
        tp1Price: tp,
        aiDecision,
        aiReasoning,
        aiEvidence,
        status: status as any,
        createdAt: new Date().toISOString()
      };

      await getSupabaseClient().insertSignal(canonicalSignal);
      logger.info(`[HISTORY SAVED] Signal ${setup.id} (${setup.sourceStrategy}) saved to database & history`);
      
      // Store AI Review Evidence if available
      const aiValidationData = (setup as any).aiValidation;
      if (aiValidationData) {
        await getSupabaseClient().insertSignalEvidence({
           signal_key: setup.id,
           engine_name: 'ai_validation',
           evidence_type: 'ai_review',
           details: aiValidationData,
           passed: aiValidationData.decision === 'APPROVED',
           reason: 'AI Validation Review'
        }).catch(e => logger.error(`Failed to insert AI evidence: ${e.message}`));

        if (Array.isArray(aiValidationData.checklist)) {
          for (const item of aiValidationData.checklist) {
            await getSupabaseClient().insertSignalEvidence({
               signal_key: setup.id,
               engine_name: 'validation_pipeline',
               evidence_type: 'checklist_item',
               details: {
                 rule: item.rule,
                 evidence: item.evidence || item.reason
               },
               passed: item.status === 'PASS',
               reason: item.reason || item.rule
            }).catch(e => logger.error(`Failed to insert checklist evidence: ${e.message}`));
          }
        }
      }

      // Store candidate rules as checklist_item evidence if present
      if (candidateRules && typeof candidateRules === 'object') {
        for (const [ruleKey, ruleVal] of Object.entries(candidateRules)) {
          const valObj = ruleVal as any;
          await getSupabaseClient().insertSignalEvidence({
             signal_key: setup.id,
             engine_name: 'validation_pipeline',
             evidence_type: 'checklist_item',
             details: {
               rule: ruleKey,
               evidence: valObj?.evidence
             },
             passed: valObj?.status === 'valid' || valObj?.status === 'PASS',
             reason: ruleKey
          }).catch(e => logger.error(`Failed to insert candidate rule evidence: ${e.message}`));
        }
      }

      // Store validation logs as evidence
      if (setup.validationLog && setup.validationLog.length > 0) {
        setup.validationLog.forEach(log => {
           getSupabaseClient().insertSignalEvidence({
              signal_key: setup.id,
              engine_name: 'setup_detector',
              evidence_type: 'lifecycle_log',
              details: { 
                 action: log.action,
                 details: log.details
              },
              passed: log.status === 'success',
              reason: log.action
           }).catch(e => logger.error(`Failed to insert evidence: ${e.message}`));
        });
      }

      if (!isSuppressed) {
        getQueueManager().publish('events', { type: 'SIGNAL_PUBLISHED', signalKey: setup.id });
        logger.info(`[LIVE SENT] Signal ${setup.id} broadcasted to live event stream & dashboard`);
        await this.notifyNewSignal(setup, marketContext);
      } else {
        logger.info(`Signal ${setup.id} is suppressed/rejected. Skipping notification and public event stream.`);
      }
      
      metricsEngine.recordSignalProcessed(false, false);

    } catch (e: any) {
      metricsEngine.recordSignalProcessed(false, true);
      throw e;
    } finally {
      await getQueueManager().releaseLock(lockKey);
    }
  }

  private async notifyNewSignal(setup: Setup, marketContext?: any) {
    const aiDecision = (setup as any).aiValidation?.decision || 'REJECTED';
    if ((setup as any).isSuppressed || aiDecision !== 'APPROVED' || (setup as any).qualityGatePassed === false) {
      logger.info(`Notification bypassed for non-APPROVED signal: ${setup.id} (AI Decision: ${aiDecision})`);
      return;
    }

    // 1. Global Cross-Strategy Market Setup Hash Deduplication
    // Combines symbol, timeframe, direction, entry, sl, snapshot timestamp, and decision to form a deterministic fingerprint
    const dir = (setup.direction || 'buy').toLowerCase();
    const entryRounded = Math.round((setup.entryPrice || 0) * 100);
    const slRounded = Math.round((setup.slPrice || 0) * 100);
    const snapshotTs = marketContext?.timestamp ? Math.floor(new Date(marketContext.timestamp).getTime() / 60000) : ''; // Minute precision
    const setupHash = crypto.createHash('sha256').update(`${setup.symbol}_${setup.timeframe}_${dir}_${entryRounded}_${slRounded}_${snapshotTs}_${aiDecision}`).digest('hex').substring(0, 16);
    
    const GLOBAL_COOLDOWN_SECONDS = 300; // 5 minute global cross-strategy cooldown for exact same setup
    const globalDedupKey = `global_signal_cooldown_${setupHash}`;
    
    const isGlobalNew = await getQueueManager().deduplicate(globalDedupKey, GLOBAL_COOLDOWN_SECONDS);
    if (!isGlobalNew) {
      logger.info(`Notification suppressed for duplicate setup across strategies (Hash: ${setupHash}, Signal: ${setup.id}).`);
      return;
    }

    const STRATEGY_COOLDOWN_SECONDS = 60; // 1 minute per strategy
    const strategyDedupKey = `notification_cooldown_${setup.sourceStrategy}`;
    
    const isStrategyNew = await getQueueManager().deduplicate(strategyDedupKey, STRATEGY_COOLDOWN_SECONDS);
    if (!isStrategyNew) {
      logger.info(`Notification suppressed for strategy ${setup.sourceStrategy} (distributed cooldown active).`);
      return;
    }
    
    logger.info(`Sending notification for APPROVED signal: ${setup.id} on strategy ${setup.sourceStrategy}`);
    
    const snap = (setup as any).setupSnapshot || {};
    const tpArray = [
      setup.tpPrice || snap.tp1Price || snap.tp1 || 0,
      snap.tp2Price || snap.tp2 || 0,
      snap.tp3Price || snap.tp3 || 0
    ].filter((p: number) => typeof p === 'number' && p > 0);

    const dirUpper = (setup.direction || '').toUpperCase();
    const finalDir: 'BUY' | 'SELL' = (dirUpper === 'BUY' || dirUpper === 'LONG') ? 'BUY' : 'SELL';

    const entry = setup.entryPrice || 0;
    const sl = setup.slPrice || 0;
    const tp1 = tpArray[0] || 0;
    let rrStr = '1:2.0';
    if (entry > 0 && sl > 0 && tp1 > 0 && Math.abs(entry - sl) > 0) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp1 - entry);
      rrStr = `1:${(reward / risk).toFixed(2)}`;
    }

    const atrValue = (setup as any).setupSnapshot?.technicalIndicators?.atr || marketContext?.atr || 4.5;
    const atrBufferStr = `0.5x ATR (${atrValue} pips)`;

    // Candidate rules & checklist evidence
    const checklistItems: string[] = [];
    const candidateRules = (setup as any).candidateRules || (setup as any).context?.candidateRules;
    if (candidateRules && typeof candidateRules === 'object') {
      for (const [ruleKey, ruleVal] of Object.entries(candidateRules)) {
        const valObj = ruleVal as any;
        if (valObj?.status === 'valid' || valObj?.status === 'PASS' || valObj === true) {
           checklistItems.push(ruleKey);
        }
      }
    }
    const aiChecklist = (setup as any).aiValidation?.checklist;
    if (Array.isArray(aiChecklist)) {
      for (const item of aiChecklist) {
        if (item.status === 'PASS' && item.rule && !checklistItems.includes(item.rule)) {
          checklistItems.push(item.rule);
        }
      }
    }

    const aiReasoning = (setup as any).aiValidation?.reasoning || '';
    const rawAiDecision = (setup as any).aiValidation?.decision || 'AI OFFLINE';
    const isDeterministic = rawAiDecision === 'AI OFFLINE' || !aiReasoning || aiReasoning.includes('deterministic') || aiReasoning.includes('Circuit Breaker') || aiReasoning.includes('Not Configured');
    const aiProvider: 'Deterministic' | 'Gemini' = isDeterministic ? 'Deterministic' : 'Gemini';

    const isAiApproved = rawAiDecision === 'APPROVED' && !isDeterministic;
    const valStatus = isAiApproved ? 'AI Approved' : 'AI Offline - Deterministic Validation Active';

    let confidenceVal = (setup as any).aiValidation?.scores?.confidence || (setup as any).confluenceScore || (setup as any).setupSnapshot?.confluenceScore;
    if (!confidenceVal) {
      const totalCandidateRules = candidateRules ? Object.keys(candidateRules).length : 0;
      confidenceVal = totalCandidateRules > 0 ? Math.round((checklistItems.length / totalCandidateRules) * 100) : (checklistItems.length > 0 ? 88 : 80);
    }

    const customReason = (setup as any).aiValidation?.reasoning && !isDeterministic ? (setup as any).aiValidation.reasoning : undefined;

    // Use NotificationEngine
    notificationEngine.notifyNewSignal({
       signal_key: setup.id,
       correlationId: crypto.randomUUID(),
       strategyName: setup.sourceStrategy,
       symbol: setup.symbol,
       timeframe: setup.timeframe || 'M15',
       session: marketContext?.session || (setup as any).session || 'Off-Session',
       direction: finalDir,
       entry: entry,
       sl: sl,
       tp: tpArray.length > 0 ? tpArray : [setup.tpPrice || 0],
       riskReward: rrStr,
       atrBuffer: atrBufferStr,
       validationStatus: valStatus,
       confidence: `${confidenceVal}%`,
       rulesPassed: checklistItems.length > 0 ? checklistItems : undefined,
       checklist: checklistItems.length > 0 ? checklistItems : undefined,
       reason: customReason,
       aiProvider: aiProvider,
       timestamp: new Date().toISOString(),
       status: 'queued',
       qualityGatePassed: true,
       aiDecision: rawAiDecision as any,
       engineVersion: '2.0.0'
    }).then(() => {
        logger.info(`[TELEGRAM SENT] Signal ${setup.id} (${setup.sourceStrategy}) delivered to Telegram queue`);
        metricsEngine.recordNotification(true);
    }).catch(() => {
        metricsEngine.recordNotification(false);
    });
  }
}

