import { getEnv } from "../utils/env";
import { logger } from '../utils/logger';
import { Pool, PoolClient } from 'pg';

export class DatabaseService {
  private pool: Pool | null = null;
  private currentDbUrl: string = '';
  private memoryStateCache: Map<string, any> = new Map();
  private memorySignalsCache: Map<string, any> = new Map();
  private memoryHistoryCache: Map<string, any> = new Map();
  
  private failures: number = 0;
  private circuitOpen: boolean = false;
  private readonly maxFailures = 10;
  private isSchemaEnsured: boolean = false;
  private schemaInitPromise: Promise<void> | null = null;

  constructor() {
    // Memory caches start clean and will be populated only with live/scanned signals and DB data
  }

  public async ensureSchema(): Promise<void> {
    if (this.isSchemaEnsured) return;
    if (this.schemaInitPromise) return this.schemaInitPromise;

    this.schemaInitPromise = (async () => {
      const pool = this.getPool();
      if (!pool) return;
      try {
        const schemaSql = `
          DO $$ 
          BEGIN
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
          EXCEPTION WHEN OTHERS THEN NULL;
          END $$;

          CREATE TABLE IF NOT EXISTS strategies (
            id VARCHAR(100) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(50) NOT NULL,
            enabled BOOLEAN DEFAULT false,
            config JSONB,
            priority INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS signals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            signal_key VARCHAR(255) UNIQUE NOT NULL,
            strategy_id VARCHAR(100) REFERENCES strategies(id),
            symbol VARCHAR(20) NOT NULL,
            session VARCHAR(50),
            timeframe VARCHAR(10),
            direction VARCHAR(10) NOT NULL,
            entry_price NUMERIC,
            sl_price NUMERIC,
            tp1_price NUMERIC,
            tp2_price NUMERIC,
            tp3_price NUMERIC,
            ai_decision VARCHAR(50),
            ai_reasoning TEXT,
            status VARCHAR(50) NOT NULL,
            correlation_id VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS strategy_states (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            strategy_id VARCHAR(100) REFERENCES strategies(id),
            symbol VARCHAR(20) NOT NULL,
            timeframe VARCHAR(10) NOT NULL,
            state_name VARCHAR(50) NOT NULL,
            state_status VARCHAR(50) NOT NULL,
            signal_key VARCHAR(255),
            payload_json JSONB,
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS signal_evidence (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            signal_key VARCHAR(255) REFERENCES signals(signal_key),
            rule_id VARCHAR(100),
            engine_name VARCHAR(100),
            evidence_type VARCHAR(50),
            details JSONB,
            passed BOOLEAN,
            reason TEXT,
            payload_json JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS market_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            symbol VARCHAR(20) NOT NULL,
            timeframe VARCHAR(10) NOT NULL,
            close NUMERIC NOT NULL,
            high NUMERIC,
            low NUMERIC,
            open NUMERIC,
            volume NUMERIC,
            price_live NUMERIC,
            provider VARCHAR(100),
            timestamp TIMESTAMPTZ,
            indicators_json JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            signal_key VARCHAR(255) REFERENCES signals(signal_key),
            strategy_id VARCHAR(100) REFERENCES strategies(id),
            symbol VARCHAR(20) NOT NULL,
            status VARCHAR(50) NOT NULL,
            outcome VARCHAR(50),
            pips_result NUMERIC,
            rr_realized NUMERIC,
            reason TEXT,
            correlation_id VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            closed_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS alerts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            type VARCHAR(50),
            severity VARCHAR(50),
            target VARCHAR(255),
            message TEXT,
            payload_json JSONB,
            status VARCHAR(50),
            alert_key VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS risk_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            signal_key VARCHAR(255),
            strategy_id VARCHAR(100),
            decision VARCHAR(50),
            reason TEXT,
            threshold_json JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor VARCHAR(255),
            actor_id UUID,
            action VARCHAR(100) NOT NULL,
            entity_type VARCHAR(100),
            entity_id VARCHAR(255),
            payload_json JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS mcp_services (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) UNIQUE NOT NULL,
            category VARCHAR(50),
            purpose TEXT,
            source_type VARCHAR(50),
            status VARCHAR(50) NOT NULL,
            health_status VARCHAR(50),
            dependency VARCHAR(100),
            fallback_status VARCHAR(50),
            last_checked_at TIMESTAMPTZ,
            last_error TEXT,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS news_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_id VARCHAR(100) UNIQUE NOT NULL,
            title VARCHAR(255) NOT NULL,
            currency VARCHAR(10),
            impact VARCHAR(20),
            forecast VARCHAR(50),
            previous VARCHAR(50),
            actual VARCHAR(50),
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS provider_health (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            provider_name VARCHAR(100) NOT NULL,
            category VARCHAR(50),
            health_status VARCHAR(50),
            last_success_at TIMESTAMPTZ,
            last_error TEXT,
            circuit_breaker_status VARCHAR(50),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          INSERT INTO strategies (id, name, description, status, enabled, priority)
          VALUES 
          ('strategy-1-smc', 'SMC Logic', 'Smart Money Concepts including BOS, CHoCH, and Liquidity Sweeps', 'active', true, 10),
          ('strategy-2-snd', 'Supply & Demand', 'Order Blocks, Fair Value Gaps, and Support/Resistance Zones', 'active', true, 20),
          ('strategy-3-scalping', 'Scalping Trends', 'High momentum short-term trend scalping', 'active', true, 30),
          ('strategy-4-news', 'News Volatility', 'High-impact news filter and volatility breakout', 'active', true, 40),
          ('strategy-5-smc-sd-confluence', 'SMC & S/D Confluence', '4-Layer multi-timeframe confluence logic', 'active', true, 50)
          ON CONFLICT (id) DO UPDATE SET 
            status = EXCLUDED.status,
            enabled = EXCLUDED.enabled;

          -- Relax constraints to allow robust event recording
          ALTER TABLE history DROP CONSTRAINT IF EXISTS history_signal_key_fkey;
          ALTER TABLE signal_evidence DROP CONSTRAINT IF EXISTS signal_evidence_signal_key_fkey;

          -- Clean up any legacy dummy records with obsolete hardcoded prices (< 3500)
          DELETE FROM signals WHERE symbol = 'XAUUSD' AND (entry_price < 3500 OR signal_key LIKE 'sig-live-%');
          DELETE FROM history WHERE symbol = 'XAUUSD' AND (signal_key LIKE 'sig-live-%' OR signal_key LIKE 'sig-hist-%');
        `;
        await pool.query(schemaSql);
        this.isSchemaEnsured = true;
        logger.info('PostgreSQL schema auto-initialized successfully');
      } catch (err: any) {
        logger.warn(`PostgreSQL schema initialization warning: ${err.message}`);
      } finally {
        this.schemaInitPromise = null;
      }
    })();

    return this.schemaInitPromise;
  }

  public getPool(): Pool | null {
    const dbUrl = getEnv("DATABASE_URL") || '';

    if (!dbUrl) {
      return null;
    }

    if (this.currentDbUrl === dbUrl && this.pool) {
      return this.pool;
    }

    try {
      if (this.pool) {
        this.pool.end().catch(() => {});
      }

      const useSsl = dbUrl.includes('sslmode=require') || 
                     dbUrl.includes('amazonaws.com') || 
                     dbUrl.includes('neon.tech') || 
                     process.env.NODE_ENV === 'production';

      this.pool = new Pool({
        connectionString: dbUrl,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on('error', (err) => {
        logger.warn(`PostgreSQL Pool Background Error: ${err.message}`);
      });

      this.currentDbUrl = dbUrl;
      this.failures = 0;
      this.circuitOpen = false;
      return this.pool;
    } catch (e: any) {
      logger.warn(`Invalid PostgreSQL configuration: ${e.message}. Database pool disabled.`);
      return null;
    }
  }

  public isConnected(): boolean {
    return this.getPool() !== null && !this.circuitOpen;
  }

  public isNetworkError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    return msg.includes('econnrefused') ||
           msg.includes('enotfound') ||
           msg.includes('eai_again') ||
           msg.includes('connection terminated') ||
           msg.includes('timeout') ||
           msg.includes('circuit breaker');
  }

  private async withRetry<T>(operation: (client: PoolClient | Pool) => Promise<T>, retries: number = 2): Promise<T> {
    if (this.circuitOpen) {
      throw new Error("PostgreSQL circuit breaker is open");
    }

    const pool = this.getPool();
    if (!pool) {
      throw new Error("PostgreSQL is not configured");
    }

    for (let i = 0; i <= retries; i++) {
      try {
        const result = await operation(pool);
        this.failures = 0;
        return result;
      } catch (err: any) {
        if (err.message === "PostgreSQL circuit breaker is open") throw err;

        if (err.message && (err.message.includes('relation') || err.message.includes('does not exist')) && !this.isSchemaEnsured) {
          logger.info(`Missing database relation detected (${err.message}). Auto-initializing schema...`);
          await this.ensureSchema();
        }

        if (this.isNetworkError(err)) {
          this.failures += 2;
          if (this.failures >= this.maxFailures && !this.circuitOpen) {
            this.circuitOpen = true;
            logger.warn(`PostgreSQL network unreachable (${err.message}). Circuit breaker opened for 30s. Memory fallback active.`);
            setTimeout(() => {
               this.circuitOpen = false;
               this.failures = 0;
               logger.info('PostgreSQL circuit breaker reset to closed');
            }, 30000);
          }
          throw err;
        }

        if (i === retries) {
          this.failures++;
          if (this.failures >= this.maxFailures && !this.circuitOpen) {
            this.circuitOpen = true;
            logger.warn(`PostgreSQL circuit breaker opened after ${this.failures} failures. Cooldown for 30s.`);
            setTimeout(() => {
               this.circuitOpen = false;
               this.failures = 0;
               logger.info('PostgreSQL circuit breaker reset to closed');
            }, 30000);
          }
          throw err;
        }

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
      status: signal.status || 'PENDING',
      correlation_id: signal.correlationId || signal.correlation_id || crypto.randomUUID(),
      created_at: signal.createdAt || signal.created_at || new Date().toISOString()
    };

    // Always cache in memory
    this.memorySignalsCache.set(key, payload);

    if (!this.isConnected()) return [payload];

    try {
      return await this.withRetry(async (pool) => {
        const query = `
          INSERT INTO signals (
            id, signal_key, strategy_id, symbol, session, timeframe, direction,
            entry_price, sl_price, tp1_price, tp2_price, tp3_price,
            ai_decision, ai_reasoning, status, correlation_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
          ON CONFLICT (signal_key) DO UPDATE SET
            strategy_id = EXCLUDED.strategy_id,
            symbol = EXCLUDED.symbol,
            session = EXCLUDED.session,
            timeframe = EXCLUDED.timeframe,
            direction = EXCLUDED.direction,
            entry_price = EXCLUDED.entry_price,
            sl_price = EXCLUDED.sl_price,
            tp1_price = EXCLUDED.tp1_price,
            tp2_price = EXCLUDED.tp2_price,
            tp3_price = EXCLUDED.tp3_price,
            ai_decision = EXCLUDED.ai_decision,
            ai_reasoning = EXCLUDED.ai_reasoning,
            status = EXCLUDED.status,
            correlation_id = EXCLUDED.correlation_id,
            updated_at = NOW()
          RETURNING *;
        `;
        const values = [
          payload.id, payload.signal_key, payload.strategy_id, payload.symbol, payload.session, payload.timeframe,
          payload.direction, payload.entry_price, payload.sl_price, payload.tp1_price, payload.tp2_price, payload.tp3_price,
          payload.ai_decision, payload.ai_reasoning, payload.status, payload.correlation_id
        ];
        const { rows } = await pool.query(query, values);
        return rows || [payload];
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL insert signal error: ${err.message}`);
      }
      return [payload];
    }
  }

  public async insertSignalEvidence(payload: { signal_key: string, engine_name: string, evidence_type: string, details: any, passed: boolean, reason: any }) {
    // Always store evidence in memory cache so evidence checklist works seamlessly
    if (payload.signal_key) {
      const cached = this.memorySignalsCache.get(payload.signal_key);
      if (cached) {
        if (!cached.signal_evidence) cached.signal_evidence = [];
        cached.signal_evidence.push({
          signal_key: payload.signal_key,
          engine_name: payload.engine_name,
          evidence_type: payload.evidence_type,
          details: payload.details,
          passed: payload.passed,
          reason: typeof payload.reason === 'string' ? payload.reason : JSON.stringify(payload.reason || ''),
          created_at: new Date().toISOString()
        });
      }
    }

    if (!this.isConnected()) return null;
    try {
      return await this.withRetry(async (pool) => {
        const query = `
          INSERT INTO signal_evidence (signal_key, engine_name, evidence_type, details, passed, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *;
        `;
        const values = [
          payload.signal_key,
          payload.engine_name,
          payload.evidence_type,
          JSON.stringify(payload.details || {}),
          payload.passed,
          typeof payload.reason === 'string' ? payload.reason : JSON.stringify(payload.reason || '')
        ];
        const { rows } = await pool.query(query, values);
        return rows;
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL insert signal evidence error: ${err.message}`);
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
    try {
      return await this.withRetry(async (pool) => {
        const query = `
          UPDATE signals
          SET status = $1, updated_at = NOW()
          WHERE signal_key = $2
          RETURNING *;
        `;
        const { rows } = await pool.query(query, [state, signalKey]);
        return rows;
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL update signal state error: ${err.message}`);
      }
      return null;
    }
  }

  public async insertAlert(alert: any) {
    if (!this.isConnected()) return null;
    try {
      await this.withRetry(async (pool) => {
        const query = `
          INSERT INTO alerts (alert_key, severity, target, message, payload_json, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (alert_key) DO NOTHING;
        `;
        await pool.query(query, [
          alert.alert_key || crypto.randomUUID(),
          alert.severity || 'INFO',
          alert.component || alert.target || 'SYSTEM',
          alert.message || '',
          JSON.stringify(alert.details || alert.payload_json || {})
        ]);
      });
    } catch (e: any) {
      if (!e.message?.includes('circuit breaker') && !this.isNetworkError(e)) {
        logger.error(`PostgreSQL insert alert error: ${e.message}`);
      }
    }
  }

  public async archiveToHistory(signalKey: string, finalState: string, pipsResult: number = 0, outcome?: string, correlationId?: string, rrRealized?: number) {
    let signalData = this.memorySignalsCache.get(signalKey);

    if (this.isConnected()) {
      try {
        const pool = this.getPool();
        if (pool) {
          const { rows } = await pool.query('SELECT * FROM signals WHERE signal_key = $1 LIMIT 1', [signalKey]);
          if (rows && rows.length > 0) {
            signalData = rows[0];
          }
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

    if (!this.isConnected()) {
      return historyRecord;
    }

    try {
      return await this.withRetry(async (pool) => {
        try {
          const histQuery = `
            INSERT INTO history (id, signal_key, strategy_id, symbol, status, outcome, pips_result, rr_realized, reason, correlation_id, closed_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW());
          `;
          await pool.query(histQuery, [
            historyRecord.id,
            historyRecord.signal_key,
            historyRecord.strategy_id,
            historyRecord.symbol,
            historyRecord.status,
            historyRecord.outcome,
            historyRecord.pips_result,
            historyRecord.rr_realized,
            historyRecord.reason,
            historyRecord.correlation_id,
            historyRecord.closed_at
          ]);
        } catch (e: any) {
          logger.warn(`Failed to insert into history table: ${e.message}`);
        }
        
        try {
          await pool.query('UPDATE signals SET status = $1, updated_at = NOW() WHERE signal_key = $2', [finalState, signalKey]);
        } catch (e: any) {
          logger.warn(`Failed to update signal status in history archive: ${e.message}`);
        }
          
        return historyRecord;
      });
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        logger.warn(`PostgreSQL archive to history warn: ${err.message}`);
      } else {
        logger.error(`PostgreSQL archive to history error: ${err.message}`);
      }
      return historyRecord;
    }
  }

  public async getActiveSignals() {
    if (this.isConnected()) {
      try {
        const data = await this.withRetry(async (pool) => {
          const query = `
            SELECT s.*, 
                   COALESCE(
                     json_agg(se.*) FILTER (WHERE se.id IS NOT NULL), 
                     '[]'
                   ) AS signal_evidence
            FROM signals s
            LEFT JOIN signal_evidence se ON s.signal_key = se.signal_key
            WHERE s.status IN ('APPROVED', 'SIGNAL_ACTIVE', 'ACTIVE', 'TAKE_PARTIAL', 'PENDING')
            GROUP BY s.id
            ORDER BY s.created_at DESC;
          `;
          const { rows } = await pool.query(query);
          return rows || [];
        });

        if (Array.isArray(data) && data.length > 0) {
          data.forEach((s: any) => this.memorySignalsCache.set(s.signal_key, s));
          return data;
        }
      } catch (err: any) {
        logger.warn(`PostgreSQL fetch active signals warn: ${err.message}`);
      }
    }

    const cachedActive = Array.from(this.memorySignalsCache.values()).filter(s => ['SIGNAL_ACTIVE', 'APPROVED', 'ACTIVE', 'TAKE_PARTIAL', 'PENDING'].includes(s.status));
    return cachedActive;
  }

  public async getHistoricalSignals() {
    if (this.isConnected()) {
      try {
        const data = await this.withRetry(async (pool) => {
          const query = `
            SELECT h.*,
                   json_build_object(
                     'direction', s.direction,
                     'entry_price', s.entry_price,
                     'sl_price', s.sl_price,
                     'tp1_price', s.tp1_price
                   ) AS signals
            FROM history h
            LEFT JOIN signals s ON h.signal_key = s.signal_key
            WHERE h.status IN ('CLOSED', 'FINISHED', 'TAKE_PROFIT', 'STOP_LOSS', 'REJECTED', 'FAILED', 'EXPIRED', 'SUPPRESSED', 'WIN', 'LOSS', 'DISPATCHED_CLOSED') 
               OR h.outcome IN ('WIN', 'LOSS', 'BREAK_EVEN')
            ORDER BY h.created_at DESC
            LIMIT 1000;
          `;
          const { rows } = await pool.query(query);
          return rows || [];
        });

        if (Array.isArray(data) && data.length > 0) {
          data.forEach((h: any) => this.memoryHistoryCache.set(h.signal_key, h));
          return data;
        }
      } catch (err: any) {
        logger.warn(`PostgreSQL fetch history warn: ${err.message}`);
      }
    }

    return Array.from(this.memoryHistoryCache.values());
  }

  public async getStrategyState(strategyId: string) {
    if (this.isConnected()) {
      try {
        const dbData = await this.withRetry(async (pool) => {
          const query = `
            SELECT * FROM strategy_states
            WHERE strategy_id = $1
            ORDER BY created_at DESC
            LIMIT 1;
          `;
          const { rows } = await pool.query(query, [strategyId]);
          return rows[0] || null;
        });

        if (dbData) {
          this.memoryStateCache.set(strategyId, dbData);
          return dbData;
        }
      } catch (err: any) {
        logger.warn(`PostgreSQL fetch strategy state warn: ${err.message}`);
      }
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
    try {
      const result = await this.withRetry(async (pool) => {
        const query = `
          INSERT INTO strategy_states (strategy_id, symbol, timeframe, state_name, state_status, signal_key, payload_json, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          RETURNING *;
        `;
        const values = [
          payload.strategy_id,
          payload.symbol || null,
          payload.timeframe || null,
          payload.state_name,
          payload.state_status,
          payload.signal_key || null,
          JSON.stringify(payload.payload_json || {}),
          payload.reason || null
        ];
        const { rows } = await pool.query(query, values);
        return rows[0];
      });
      return result || stateObj;
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL insert strategy state error: ${err.message}`);
      } else if (this.isNetworkError(err)) {
        logger.warn(`PostgreSQL insert strategy state warn: ${err.message}`);
      }
      return stateObj;
    }
  }

  public async getStrategies() {
    const defaultStrats = [
      { id: 'strategy-1-smc', name: 'SMC Logic', description: 'Smart Money Concepts including BOS, CHoCH, and Liquidity Sweeps', status: 'active', parameters: {}, enabled: true },
      { id: 'strategy-2-snd', name: 'Supply & Demand', description: 'Order Blocks, Fair Value Gaps, and Support/Resistance Zones', status: 'active', parameters: {}, enabled: true },
      { id: 'strategy-3-scalping', name: 'Scalping Trends', description: 'High momentum short-term trend scalping', status: 'active', parameters: {}, enabled: true },
      { id: 'strategy-4-news', name: 'News Volatility', description: 'High-impact news filter and volatility breakout', status: 'active', parameters: {}, enabled: true },
      { id: 'strategy-5-smc-sd-confluence', name: 'SMC & S/D Confluence', description: '4-Layer multi-timeframe confluence logic', status: 'active', parameters: {}, enabled: true }
    ];

    if (!this.isConnected()) {
      return defaultStrats;
    }
    try {
      await this.ensureSchema();
      return await this.withRetry(async (pool) => {
        const { rows } = await pool.query('SELECT * FROM strategies ORDER BY priority ASC, id ASC');
        if (!rows || rows.length === 0) {
          return defaultStrats;
        }
        return rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          description: row.description || row.config?.description || '',
          status: row.status || (row.enabled ? 'active' : 'inactive'),
          parameters: row.config || {},
          enabled: row.enabled
        }));
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL fetch strategies error: ${err.message}`);
      } else if (this.isNetworkError(err)) {
        logger.warn(`PostgreSQL fetch strategies warn (fallback to defaults): ${err.message}`);
      }
      return defaultStrats;
    }
  }

  public async getAuditLogs(limit: number = 50) {
    if (!this.isConnected()) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async (pool) => {
        const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [limit]);
        return rows || [];
      });
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        logger.warn(`PostgreSQL fetch audit logs warn: ${err.message}`);
      } else {
        logger.error(`PostgreSQL fetch audit logs error: ${err.message}`);
      }
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async insertAuditLog(payload: any) {
    if (!this.isConnected()) {
      logger.warn('Database is not configured. Skipping insertAuditLog.');
      return null;
    }
    try {
      return await this.withRetry(async (pool) => {
        const query = `
          INSERT INTO audit_logs (actor, actor_id, action, entity_type, entity_id, payload_json, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *;
        `;
        const values = [
          payload.actor || 'SYSTEM',
          payload.actor_id || null,
          payload.action,
          payload.entity_type || null,
          payload.entity_id || null,
          JSON.stringify(payload.payload_json || {})
        ];
        const { rows } = await pool.query(query, values);
        return rows[0];
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL insert audit log error: ${err.message}`);
      }
      return null;
    }
  }

  public async upsertMCPService(payload: any) {
    if (!this.isConnected()) {
      logger.warn('Database is not configured. Skipping upsertMCPService.');
      return null;
    }
    try {
      return await this.withRetry(async (pool) => {
        const query = `
          INSERT INTO mcp_services (name, category, purpose, source_type, status, health_status, dependency, fallback_status, last_error, notes, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (name) DO UPDATE SET
            category = EXCLUDED.category,
            purpose = EXCLUDED.purpose,
            source_type = EXCLUDED.source_type,
            status = EXCLUDED.status,
            health_status = EXCLUDED.health_status,
            dependency = EXCLUDED.dependency,
            fallback_status = EXCLUDED.fallback_status,
            last_error = EXCLUDED.last_error,
            notes = EXCLUDED.notes,
            updated_at = NOW()
          RETURNING *;
        `;
        const values = [
          payload.name, payload.category, payload.purpose, payload.source_type, payload.status,
          payload.health_status, payload.dependency, payload.fallback_status, payload.last_error, payload.notes
        ];
        const { rows } = await pool.query(query, values);
        return rows[0];
      });
    } catch (err: any) {
      if (!err.message?.includes('circuit breaker') && !this.isNetworkError(err)) {
        logger.error(`PostgreSQL upsert MCP error: ${err.message}`);
      }
      return null;
    }
  }

  public async getMCPServices() {
    if (!this.isConnected()) {
      return { status: 'not_configured', available: false, reason: 'Database is not configured' };
    }
    try {
      return await this.withRetry(async (pool) => {
        const { rows } = await pool.query('SELECT * FROM mcp_services ORDER BY category ASC, name ASC');
        return rows || [];
      });
    } catch (err: any) {
      if (this.isNetworkError(err)) {
        logger.warn(`PostgreSQL fetch MCPs warn: ${err.message}`);
      } else {
        logger.error(`PostgreSQL fetch MCPs error: ${err.message}`);
      }
      return { status: 'error', available: false, reason: err.message };
    }
  }

  public async findSimilarHistory(embedding: number[], threshold: number = 0.7, limit: number = 5) {
    if (!this.isConnected()) return [];
    try {
      const pool = this.getPool();
      if (!pool) return [];
      const query = `
        SELECT id, signal_key, strategy_id, symbol, outcome, pips_result,
               1 - (embedding <=> $1::vector) AS similarity
        FROM history
        WHERE embedding IS NOT NULL AND 1 - (embedding <=> $1::vector) > $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3;
      `;
      const { rows } = await pool.query(query, [JSON.stringify(embedding), threshold, limit]);
      return rows || [];
    } catch (e: any) {
      logger.warn('Failed or vector extension unavailable for similar history query', { error: e.message });
      return [];
    }
  }

  public async ping(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
    if (!this.isConnected()) {
      return { connected: false, latencyMs: -1, error: 'Database connection not configured' };
    }
    const start = Date.now();
    try {
      const pool = this.getPool();
      if (!pool) return { connected: false, latencyMs: -1, error: 'Pool unavailable' };
      await pool.query('SELECT 1;');
      return { connected: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { connected: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}

let _dbClient: DatabaseService | null = null;
export function getDatabaseClient(): DatabaseService {
  if (!_dbClient) _dbClient = new DatabaseService();
  return _dbClient;
}


