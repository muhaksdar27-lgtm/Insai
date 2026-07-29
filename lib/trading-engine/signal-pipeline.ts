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

      const aiDecision = (setup as any).aiValidation?.decision || 'WAIT';
      const isSuppressed = (setup as any).isSuppressed || aiDecision !== 'APPROVED' || (setup as any).qualityGatePassed === false;
      const status = isSuppressed ? 'SUPPRESSED' : 'SIGNAL_ACTIVE';

      const liveSignal = {
        signalKey: setup.id,
        correlationId: crypto.randomUUID(),
        strategyId: setup.sourceStrategy,
        symbol: setup.symbol,
        timeframe: setup.timeframe,
        session: marketContext?.session || 'UNKNOWN',
        direction: setup.direction || 'buy',
        entryPrice: setup.entryPrice || 0,
        slPrice: setup.slPrice || 0,
        tp1Price: setup.tpPrice || 0,
        tp2Price: 0,
        tp3Price: 0,
        aiDecision: aiDecision,
        aiReasoning: (setup as any).aiValidation?.reasoning || 'Missing AI Validation Data',
        aiEvidence: (setup as any).aiValidation?.evidence || '',
        status: status as any,
        createdAt: new Date().toISOString()
      };

      await getSupabaseClient().insertSignal(liveSignal);
      
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
      const candidateRules = (setup as any).candidateRules || (setup as any).context?.candidateRules;
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
    const aiDecision = (setup as any).aiValidation?.decision;
    if ((setup as any).isSuppressed || aiDecision !== 'APPROVED' || (setup as any).qualityGatePassed === false) {
      logger.info(`Notification bypassed for non-approved signal: ${setup.id}`);
      return;
    }

    // 1. Global Cross-Strategy Market Setup Hash Deduplication
    // Combines symbol, timeframe, direction, entry, sl, snapshot timestamp, and decision to form a deterministic fingerprint
    const dir = (setup.direction || 'buy').toLowerCase();
    const entryRounded = Math.round((setup.entryPrice || 0) * 100);
    const slRounded = Math.round((setup.slPrice || 0) * 100);
    const snapshotTs = marketContext?.timestamp ? Math.floor(new Date(marketContext.timestamp).getTime() / 60000) : ''; // Minute precision
    const setupHash = crypto.createHash('sha256').update(`${setup.symbol}_${setup.timeframe}_${dir}_${entryRounded}_${slRounded}_${snapshotTs}_APPROVED`).digest('hex').substring(0, 16);
    
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
    
    const tpArray = [
      setup.tpPrice || (setup as any).tp1Price || 0,
      (setup as any).tp2Price || 0,
      (setup as any).tp3Price || 0
    ].filter((p: number) => typeof p === 'number' && p > 0);

    const dirUpper = (setup.direction || '').toUpperCase();
    const finalDir: 'BUY' | 'SELL' = (dirUpper === 'BUY' || dirUpper === 'LONG') ? 'BUY' : 'SELL';

    // Use NotificationEngine
    notificationEngine.notifyNewSignal({
       signal_key: setup.id,
       correlationId: crypto.randomUUID(),
       strategyName: setup.sourceStrategy,
       symbol: setup.symbol,
       timeframe: setup.timeframe || 'M15',
       direction: finalDir,
       entry: setup.entryPrice || 0,
       sl: setup.slPrice || 0,
       tp: tpArray.length > 0 ? tpArray : [setup.tpPrice || 0],
       timestamp: new Date().toISOString(),
       status: 'queued',
       qualityGatePassed: true,
       aiDecision: 'APPROVED'
    }).then(() => {
        metricsEngine.recordNotification(true);
    }).catch(() => {
        metricsEngine.recordNotification(false);
    });
  }
}

