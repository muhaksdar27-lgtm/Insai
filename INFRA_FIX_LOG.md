# Infrastructure & Data Pipeline Fix Log (INSAi XAUUSD Trading System)

**Date**: 2026-09-05  
**Target Asset**: XAUUSD (Spot Gold)  
**System**: Full-Stack Next.js + Node.js Engine + Redis/PostgreSQL Infrastructure + Python Sidecar  

---

## 1. Executive Summary

This log records the complete audit, hardening, and verification of the infrastructure and data pipeline for the XAUUSD automated trading system. All modifications strictly maintain existing strategy business rules and quantitative thresholds while enhancing data integrity, provider failover, database concurrency, distributed locking, idempotent notifications, and deployment readiness.

---

## 2. Canonical XAUUSD Pipeline Architecture

The end-to-end data pipeline adheres strictly to the canonical processing flow:

```
External Providers (TwelveData / Polygon.io / Binance / YahooFinance)
  │
  ▼
[1] Canonical Symbol Layer (toCanonicalSymbol -> "XAUUSD")
  │
  ▼
[2] Validated Market Data (DataValidator: OHLC, volume, outliers, timestamp continuity)
  │
  ▼
[3] Candle Processor (deduplicateAndOrder, isCandleClosed, getClosedCandles)
  │
  ▼
[4] Session / Calendar Engine (MarketCalendar, SessionEngine, Killzone validation)
  │
  ▼
[5] Trading Engine Core (SetupDetector -> StepEvaluator -> CandidateGate -> QualityGate)
  │
  ▼
[6] Final Validated Signal Persistence (PostgreSQL withTransaction) & Idempotent Telegram Dispatch
```

---

## 3. Detailed Audit & Remediation by Scope

### Scope 1: `lib/market-data/`
* **Canonical Symbol Mapping**:
  * Unified all external representations (`XAU/USD`, `xau_usd`, `GOLD`, `GC=F`, `PAXGUSDT`, `C:XAUUSD`) to canonical `XAUUSD`.
  * Verified `toProviderSymbol` transforms `XAUUSD` to `XAU/USD` (TwelveData), `C:XAUUSD` (Polygon), `PAXGUSDT` (Binance), and `GC=F` (Yahoo Finance).
* **Provider Fallback Chain & Polygon Integration**:
  * Added `PolygonProvider` to `FallbackChain<PriceProvider>` in `MarketDataService` as secondary spot metals aggregator between `TwelveData` (primary) and `Binance`/`YahooFinance`.
  * Guarded against missing API keys without breaking the fallback sequence.
* **Candle Processor & Closed Candle Calculation**:
  * Added `getTimeframeDurationMs(timeframe)`, `isCandleClosed(candle, timeframe, referenceTime)`, and `getClosedCandles(candles, timeframe, referenceTime)`.
  * Guaranteed chronological deduplication (`deduplicateAndOrder`) prior to validation and state progression to eliminate repainting.
* **Calendar & Session Hard Blocks**:
  * Enforced strict weekend closures (Friday 22:00 UTC to Sunday 22:00 UTC) via `SessionEngine` and `MarketCalendar`.
  * Added stale data detection thresholds: 60s for real-time spot price, 5m for M15 candles.

### Scope 2: `lib/db/`
* **Connection Pool Management**:
  * Initialized `pg.Pool` with connection timeout (5s), idle timeout (30s), and max connection cap (20).
* **Atomic Database Transactions**:
  * Implemented `withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T>` on `DatabaseService` with automatic `BEGIN`, `COMMIT`, and `ROLLBACK` handling.
* **Resilience & Circuit Breaker**:
  * Retries database queries up to 2 times with exponential backoff on transient errors.
  * Auto-trips circuit breaker after repeated network failures with a 30s cooldown before probing connection health.
* **Schema & Idempotency Constraints**:
  * Schema automatically creates `signals` with `signal_key VARCHAR(255) UNIQUE NOT NULL`.
  * Stored state transitions in `strategy_states` with timestamped payloads.

### Scope 3: `lib/redis/`
* **Distributed Locking & Stale Lock Prevention**:
  * In-flight lock manager (`InFlightLockManager`) combines Redis `SET NX EX` with local memory fallback using owner tokens (`worker_PID_UUID`).
  * Added periodic stale lock recovery and memory pruning (`pruneExpiredLocalLocks`) when cache size exceeds 500 keys.
* **Stream Ingestion & Group Consumption**:
  * Market ticks published to Redis stream `market_stream:${symbol}` with `MAXLEN ~ 1000`.
  * Implemented consumer group creation (`MKSTREAM`) and safe polling for event decoupling.

### Scope 4: `lib/services/`
* **Ingestion Service**:
  * Standardized ingestion bootstrapping on canonical symbol `XAUUSD`.
  * Dual-mode real-time ingestion: WebSocket bootstrap on primary provider with 60s polling heartbeat fallback.

### Scope 5: `app/api/`
* **Contract & Error Normalization**:
  * Enforced standard `ApiResponse<T>` contract across all endpoints (`/api/market/*`, `/api/signals/*`, `/api/strategies/*`).
  * Masked internal error stacks in production using `publicApiError`.
  * Enforced `force-dynamic` to prevent unwanted caching on real-time market data routes.

### Scope 6: `lib/notifications/`
* **Telegram Quality Gate Enforcement**:
  * Notifications are strictly restricted to final validated setups: `qualityGatePassed === true` AND `aiDecision === 'APPROVED'`.
  * Non-approved setups (REJECTED, PENDING, INVALIDATED) are automatically suppressed.
* **Idempotent Dispatch**:
  * Dual-layer deduplication: in-memory `Set<string>` and Redis distributed cache (`notif::${signal_key}`) with 24-hour TTL.
  * Exponential backoff retry logic capped at 3 attempts.

### Scope 7: `lib/observability/`
* **Health Check & Circuit Breakers**:
  * Centralized `HealthCheckEngine` monitoring Database, Redis, Telegram Bot, Market Data Providers, and Python Engine.
  * Added structured request context tracking (`correlationId`) propagated across HTTP headers (`X-Request-ID`).

### Scope 8: `server.ts`
* **Server Lifecycle & Python Engine Probing**:
  * Probes Python sidecar ONLY when `process.env.PYTHON_ENGINE_URL` is set, avoiding false local connection attempts when running Node.js standalone.
  * Implemented 30-second request/response timeouts to prevent connection leaks (excluding SSE `/api/stream`).
  * Added graceful shutdown hooks (`SIGINT`, `SIGTERM`) to cleanly close server and database connections.

### Scope 9-12: `ops/`, `railway.json`, `nixpacks.toml`, `.github/workflows/`
* **Container Start Script (`ops/start.sh`)**:
  * Background orchestration for Python sidecar with fallback if Python runtime is unavailable.
* **Railway & Nixpacks Configuration**:
  * Configured multi-phase build installing Node.js 22 and Python 3.11 with pip dependencies.
  * Verified healthcheck endpoint `/health/readiness`.
* **CI/CD Workflow (`.github/workflows/deploy.yml`)**:
  * Fixed pytest target path to execute all existing `python-engine/test_*.py` smoke tests.

---

## 4. Regression Matrix Resolution

* **Root Cause**: In test #14 of `test/strategy-regression-matrix.test.ts`, `qualityGate.evaluate` was invoked with `{ symbol: fixture.symbol }` without passing `timestamp: fixture.baseTimestamp`. In absence of a market timestamp, `SessionEngine` evaluated `Date.now()` (Saturday), triggering `Market Hard Block: Forex/XAUUSD market closed (Saturday)` rather than reaching the AI validation check.
* **Fix**: Supplied `timestamp: fixture.baseTimestamp` in the test context.
* **Verification**: All 217 tests across 9 test suites passed with 0 failures:
  * `test/strategy-regression-matrix.test.ts`: 130/130 PASS
  * `test/trading-engine-lifecycle.test.ts`: 11/11 PASS
  * `test/strategy-isolation.test.ts`: 9/9 PASS
  * `test/market-data-pipeline.test.ts`: 19/19 PASS
  * All unit and integration suites: 217/217 PASS
