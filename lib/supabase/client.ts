import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private currentUrl: string = '';
  private currentKey: string = '';
  private memoryStateCache: Map<string, any> = new Map();
  private memorySignalsCache: Map<string, any> = new Map();
  private memoryHistoryCache: Map<string, any> = new Map();
  
  private failures: number = 0;
  private circuitOpen: boolean = false;
  private readonly maxFailures = 10;

  public getClient(): SupabaseClient | null {
    const rawSupabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL") || '';
    const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const supabaseKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || '';

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    if (this.currentUrl === supabaseUrl && this.currentKey === supabaseKey && this.client) {
      return this.client;
    }

    try {
      new URL(supabaseUrl);
      this.client = createClient(supabaseUrl, supabaseKey, {
         auth: { persistSession: false },
         global: {
           fetch: (url, options) => {
             const controller = new AbortController();
             const timeoutId = setTimeout(() => {
               try { controller.abort(); } catch {}
             }, 12000); // 12s timeout for reliable Supabase REST operations

             // Omit parent signal listener to decouple DB operations from transient parent request HTTP cancellations
             const fetchOptions = { ...options };
             delete fetchOptions.signal;

             return fetch(url, { ...fetchOptions, signal: controller.signal as any })
               .finally(() => {
                 clearTimeout(timeoutId);
               });
           }
         }
      });
      this.currentUrl = supabaseUrl;
      this.currentKey = supabaseKey;
      this.failures = 0;
      this.circuitOpen = false;
      return this.client;
    } catch (e: any) {
      logger.warn(`Invalid Supabase configuration: ${e.message}. Supabase will be disabled.`);
      return null;
    }
  }

  public isConnected() {
    return this.getClient() !== null && !this.circuitOpen;
  }

  public isNetworkError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    return msg.includes('fetch failed') ||
           msg.includes('econnrefused') ||
           msg.includes('enotfound') ||
           msg.includes('aborterror') ||
           msg.includes('aborted') ||
           msg.includes('typeerror') ||
           msg.includes('circuit breaker') ||
           msg.includes('schema cache');
  }

  private async withRetry<T>(operation: () => Promise<T>, retries: number = 2): Promise<T> {
    if (this.circuitOpen) {
      throw new Error("Supabase circuit breaker is open");
    }
    
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await operation();
        this.failures = 0; // reset on success
        return result;
      } catch (err: any) {
        if (err.message === "Supabase circuit breaker is open") throw err;
        
        if (this.isNetworkError(err)) {
          this.failures += 2;
          if (this.failures >= this.maxFailures && !this.circuitOpen) {
            this.circuitOpen = true;
            logger.warn(`Supabase network unreachable (${err.message}). Circuit breaker opened for 30s. Operating in memory fallback mode.`);
            setTimeout(() => {
               this.circuitOpen = false;
               this.failures = 0;
               logger.info('Supabase circuit breaker reset to closed');
            }, 30000);
          }
          throw err;
        }

        if (i === retries) {
          this.failures++;
          if (this.failures >= this.maxFailures && !this.circuitOpen) {
            this.circuitOpen = true;
            logger.warn(`Supabase circuit breaker opened after ${this.failures} failures. Cooldown for 30s.`);
            setTimeout(() => {
               this.circuitOpen = false;
               this.failures = 0;
               logger.info('Supabase circuit breaker reset to closed');
            }, 30000); // 30s reset
          }
          throw err;
        }
        // exponential backoff
        await new Promise(res => setTimeout(res, Math.pow(2, i) * 200));
      }
    }
    throw new Error("Unreachable");
  }

  public async insertSignal(signal: any) {
    const key = signal.signalKey || signal.signal_key || crypto.randomUUID();
    const payload = {
      id: signal.id || crypto.randomUUID(),
      signal_key: key,
      strategy_id: signal.strategyId || signal.strategy_id || null,
      symbol: signal.symbol || null,
      session: signal.session || null,
      timeframe: signal.timeframe || null,
      direction: signal.direction || null,
      entry_price: signal.entryPrice ?? signal.entry_price ?? null,
      sl_price: signal.slPrice ?? signal.sl_price ?? null,
      tp1_price: signal.tp1Price ?? signal.tp1_price ?? null,
      tp2_price: signal.tp2Price ?? signal.tp2_price ?? null,
      tp3_price: signal.tp3Price ?? signal.tp3_price ?? null,
      ai_decision: signal.aiDecision || signal.ai_decision || null,
      ai_reasoning: signal.aiReasoning || signal.ai_reasoning || null,
      status: signal.status || null,
      correlation_id: signal.correlationId || signal.correlation_id || crypto.randomUUID(),
      created_at: signal.createdAt || signal.created_at || new Date().toISOString()
    };

    // Always cache in memory
    this.memorySignalsCache.set(key, payload);

    if (!this.isConnected()) return [payload];
    const supabase = this.getClient()!;
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase.from('signals').upsert([payload], { onConflict: 'signal_key' }).select();
        if (error) throw error;
        return data || [payload];
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        logger.error(`Supabase insert error: ${err.message}`);
      }
      return [payload];
    }
  }

  public async insertSignalEvidence(payload: { signal_key: string, engine_name: string, evidence_type: string, details: any, passed: boolean, reason: any }) {
    if (!this.isConnected()) return null;
    const supabase = this.getClient()!;
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('signal_evidence')
          .insert([{
             signal_key: payload.signal_key,
             engine_name: payload.engine_name,
             evidence_type: payload.evidence_type,
             details: payload.details,
             passed: payload.passed,
             reason: payload.reason
          }])
          .select();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        logger.error(`Supabase insert signal evidence error: ${err.message}`);
      }
      return null;
    }
  }

  public async updateSignalState(signalKey: string, state: any) {
    const cached = this.memorySignalsCache.get(signalKey);
    if (cached) {
      cached.status = state;
      this.memorySignalsCache.set(signalKey, cached);
    }
    if (!this.isConnected()) return null;
    const supabase = this.getClient()!;
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('signals')
          .update({ status: state })
          .eq('signal_key', signalKey)
          .select();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        logger.error(`Supabase update error: ${err.message}`);
      }
      return null;
    }
  }

  public async insertAlert(alert: any) {
    if (!this.isConnected()) return null;
    const supabase = this.getClient()!;
    try {
      await this.withRetry(async () => {
        await supabase.from('alerts').insert([{
            alert_key: alert.alert_key,
            severity: alert.severity,
            target: alert.component,
            message: alert.message,
            payload_json: alert.details
        }]);
      });
    } catch (e: any) {
        if (!e.message?.includes('circuit breaker')) {
          logger.error(`Supabase insert alert error: ${e.message}`);
        }
    }
  }

  public async archiveToHistory(signalKey: string, finalState: string, pipsResult: number = 0, outcome?: string, correlationId?: string, rrRealized?: number) {
    let signalData = this.memorySignalsCache.get(signalKey);

    const supabase = this.getClient();
    if (supabase && this.isConnected()) {
      try {
        const { data, error } = await supabase
          .from('signals')
          .select('*')
          .eq('signal_key', signalKey)
          .single();
        if (!error && data) {
          signalData = data;
        }
      } catch (e) {
        // use memory signalData fallback
      }
    }

    if (!signalData) {
      signalData = this.memorySignalsCache.get(signalKey);
    }
    if (!signalData) {
      logger.warn(`Cannot record result: signal ${signalKey} not found in DB or cache`);
      return null;
    }

    signalData.status = finalState;
    this.memorySignalsCache.set(signalKey, signalData);

    const computedOutcome = outcome || (pipsResult > 0 ? 'WIN' : (pipsResult < 0 ? 'LOSS' : 'BREAK_EVEN'));
    let computedRr = rrRealized;
    if (computedRr === undefined && signalData) {
      const entry = signalData.entry_price || signalData.entryPrice || 0;
      const sl = signalData.sl_price || signalData.slPrice || 0;
      const tp = signalData.tp1_price || signalData.tp1Price || 0;
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      computedRr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
    }

    const historyRecord = { 
       id: crypto.randomUUID(),
       signal_key: signalData.signal_key,
       strategy_id: signalData.strategy_id,
       symbol: signalData.symbol,
       status: finalState,
       outcome: computedOutcome,
       pips_result: pipsResult,
       rr_realized: computedRr ?? 0,
       reason: finalState,
       correlation_id: correlationId || signalData.correlation_id,
       closed_at: new Date().toISOString(),
       created_at: new Date().toISOString(),
       signals: signalData
    };

    this.memoryHistoryCache.set(signalKey, historyRecord);

    if (!supabase || !this.isConnected()) {
      return historyRecord;
    }

    try {
      return await this.withRetry(async () => {
        try {
          await supabase.from('history').insert([{
             signal_key: historyRecord.signal_key,
             strategy_id: historyRecord.strategy_id,
             symbol: historyRecord.symbol,
             status: historyRecord.status,
             outcome: historyRecord.outcome,
             pips_result: historyRecord.pips_result,
             rr_realized: historyRecord.rr_realized,
             reason: historyRecord.reason,
             correlation_id: historyRecord.correlation_id,
             closed_at: historyRecord.closed_at
          }]);
        } catch (e) {
          logger.warn(`Failed to insert into history table: ${(e as Error).message}`);
        }
        
        try {
          await supabase
            .from('signals')
            .update({ status: finalState })
            .eq('signal_key', signalKey);
        } catch (e) {
          logger.warn(`Failed to update signal status: ${(e as Error).message}`);
        }
          
        return historyRecord;
      });
    } catch (err: any) {
      logger.error(`Supabase archive to history error: ${err.message}`);
      return historyRecord;
    }
  }

  public async getActiveSignals() {
    const supabase = this.getClient();
    if (supabase && this.isConnected()) {
      try {
        const data = await this.withRetry(async () => {
          const { data, error } = await supabase
            .from('signals')
            .select('*, signal_evidence(*)')
            .eq('status', 'SIGNAL_ACTIVE');
          if (error) throw error;
          return data || [];
        });

        if (Array.isArray(data) && data.length > 0) {
          data.forEach((s: any) => this.memorySignalsCache.set(s.signal_key, s));
          return data;
        }
      } catch (err: any) {
        logger.warn(`Supabase fetch active signals warn: ${err.message}`);
      }
    }

    // Check memorySignalsCache
    const cachedActive = Array.from(this.memorySignalsCache.values()).filter(s => s.status === 'SIGNAL_ACTIVE');
    if (cachedActive.length > 0) {
      return cachedActive;
    }

    if (!this.isConnected()) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }

    return [];
  }

  public async getHistoricalSignals() {
    const supabase = this.getClient();
    if (supabase && this.isConnected()) {
      try {
        const data = await this.withRetry(async () => {
          const { data, error } = await supabase
            .from('history')
            .select('*, signals(direction, entry_price, sl_price, tp1_price)')
            .order('created_at', { ascending: false })
            .limit(1000);
          if (error) throw error;
          return data || [];
        });

        if (Array.isArray(data) && data.length > 0) {
          data.forEach((h: any) => this.memoryHistoryCache.set(h.signal_key, h));
          return data;
        }
      } catch (err: any) {
        logger.warn(`Supabase fetch history warn: ${err.message}`);
        return { status: 'error', available: false, reason: err.message };
      }
    }

    // Check memoryHistoryCache
    const cachedHistory = Array.from(this.memoryHistoryCache.values());
    if (cachedHistory.length > 0) {
      return cachedHistory;
    }

    if (!this.isConnected()) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }

    return [];
  }

  public async getStrategyState(strategyId: string) {
    const supabase = this.getClient();
    let dbData = null;
    if (supabase) {
      try {
        dbData = await this.withRetry(async () => {
          const { data, error } = await supabase
            .from('strategy_states')
            .select('*')
            .eq('strategy_id', strategyId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          return data;
        });
      } catch (err: any) {
        if (err.message && (err.message.includes('schema cache') || err.message.includes('AbortError'))) {
            logger.warn(`Supabase fetch strategy state warn: ${err.message} (URL: ${this.currentUrl})`);
        } else {
            logger.error(`Supabase fetch strategy state error: ${err.message} (URL: ${this.currentUrl})`);
        }
      }
    }

    if (dbData) {
      this.memoryStateCache.set(strategyId, dbData);
      return dbData;
    }

    const cached = this.memoryStateCache.get(strategyId);
    if (cached) return cached;

    if (!this.isConnected()) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }

    return null;
  }

  public async insertStrategyState(payload: any) {
    const stateObj = {
      strategy_id: payload.strategy_id,
      symbol: payload.symbol || null,
      timeframe: payload.timeframe || null,
      state_name: payload.state_name,
      state_status: payload.state_status,
      signal_key: payload.signal_key,
      payload_json: payload.payload_json,
      reason: payload.reason,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.memoryStateCache.set(payload.strategy_id, stateObj);

    if (!this.isConnected()) return stateObj;
    const supabase = this.getClient()!;
    try {
      const result = await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('strategy_states')
          .insert([{
             strategy_id: payload.strategy_id,
             symbol: payload.symbol || null,
             timeframe: payload.timeframe || null,
             state_name: payload.state_name,
             state_status: payload.state_status,
             signal_key: payload.signal_key,
             payload_json: payload.payload_json,
             reason: payload.reason
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      });
      return result || stateObj;
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        if (this.isNetworkError(err)) {
          logger.warn(`Supabase insert strategy state warn: ${err.message}`);
        } else {
          logger.error(`Supabase insert strategy state error: ${err.message}`);
        }
      }
      return stateObj;
    }
  }

  public async getStrategies() {
    if (!this.isConnected()) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured or circuit open' };
    }
    const supabase = this.getClient()!;
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('strategies')
          .select('*');
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          description: row.description || row.config?.description || '',
          status: row.status || (row.enabled ? 'active' : 'inactive'),
          parameters: row.config || {},
          enabled: row.enabled
        }));
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        if (this.isNetworkError(err)) {
            logger.warn(`Supabase fetch strategies warn: ${err.message}`);
        } else {
            logger.error(`Supabase fetch strategies error: ${err.message}`);
        }
      }
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async getAuditLogs(limit: number = 50) {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw error;
        return data || [];
      });
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        logger.warn(`Supabase fetch audit logs warn: ${err.message}`);
      } else {
        logger.error(`Supabase fetch audit logs error: ${err.message}`);
      }
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async insertAuditLog(payload: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping insertAuditLog.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('audit_logs')
          .insert([{
             actor: payload.actor,
             actor_id: payload.actor_id,
             action: payload.action,
             entity_type: payload.entity_type,
             entity_id: payload.entity_id,
             payload_json: payload.payload_json
          }])
          .select();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        if (this.isNetworkError(err)) {
          logger.warn(`Supabase insert audit log warn: ${err.message}`);
        } else {
          logger.error(`Supabase insert audit log error: ${err.message}`);
        }
      }
      return null;
    }
  }

  public async upsertMCPService(payload: any) {
    const supabase = this.getClient();
    if (!supabase) {
      logger.warn('Database is not configured. Skipping upsertMCPService.');
      return null;
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('mcp_services')
          .upsert([{
             name: payload.name,
             category: payload.category,
             purpose: payload.purpose,
             source_type: payload.source_type,
             status: payload.status,
             health_status: payload.health_status,
             dependency: payload.dependency,
             fallback_status: payload.fallback_status,
             last_error: payload.last_error,
             notes: payload.notes
          }], { onConflict: 'name' })
          .select()
          .single();
        if (error) throw error;
        return data;
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker')) {
        if (this.isNetworkError(err)) {
          logger.warn(`Supabase upsert MCP warn: ${err.message}`);
        } else {
          logger.error(`Supabase upsert MCP error: ${err.message}`);
        }
      }
      return null;
    }
  }

  public async getMCPServices() {
    const supabase = this.getClient();
    if (!supabase) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('mcp_services')
          .select('*')
          .order('category', { ascending: true })
          .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
      });
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        logger.warn(`Supabase fetch MCPs warn: ${err.message}`);
      } else {
        logger.error(`Supabase fetch MCPs error: ${err.message}`);
      }
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async findSimilarHistory(embedding: number[], threshold: number = 0.7, limit: number = 5) {
    const supabase = this.getClient();
    if (!supabase) return [];
    try {
        const { data, error } = await supabase.rpc('match_history_signals', {
            query_embedding: embedding,
            match_threshold: threshold,
            match_count: limit
        });
        if (error) {
            logger.warn('Failed to fetch similar history', { error: error.message });
            return [];
        }
        return data || [];
    } catch (e) {
        logger.warn('Exception fetching similar history', { error: e });
        return [];
    }
  }

}

let _supabaseClient: SupabaseService | null = null;
export function getSupabaseClient(): SupabaseService {
  if (!_supabaseClient) _supabaseClient = new SupabaseService();
  return _supabaseClient;
}

  