# Deployment Readiness & Production Operations Manual

**System**: INSAi Automated Trading Intelligence Platform (XAUUSD Engine)  
**Version**: 1.0.0-PROD  
**Target Environment**: Railway / Cloud Run / Kubernetes / Bare Container  
**Audited**: 2026-09-05  

---

## 1. System Topology

```
                   ┌───────────────────────────────────────────────┐
                   │             Railway / Cloud Run Container     │
                   │                                               │
                   │   ┌─────────────────┐   HTTP / REST           │
   External Traffic───►│ Next.js/Node.js ├───────────────────────┐ │
   (Port 3000)     │   │ Server (server.ts│                       │ │
                   │   └────────┬────────┘                       │ │
                   │            │                                │ │
                   │            ▼                                ▼ │
                   │   ┌─────────────────┐       ┌─────────────────┐│
                   │   │ Ingestion &     │       │ Python Sidecar  ││
                   │   │ Trading Engine  │       │ (FastAPI: 8181) ││
                   │   └────────┬────────┘       └─────────────────┘│
                   └────────────┼───────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌──────────────────┐                            ┌──────────────────┐
│ PostgreSQL 15+   │                            │ Redis 7+         │
│ (Signals/States) │                            │ (Locks/Streams)  │
└──────────────────┘                            └──────────────────┘
```

---

## 2. Environment Configuration Matrix

| Variable | Description | Requirement | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment mode | Recommended | Defaults to `production` |
| `PORT` | Node server listening port | Required | Hardcoded to `3000` |
| `HOST` | Binding interface address | Recommended | Defaults to `0.0.0.0` |
| `TWELVEDATA_API_KEY` | Primary real-time market data feed | Recommended | Switches to Polygon or Binance |
| `POLYGON_API_KEY` | Secondary Forex/Metals spot feed | Optional | Skips to Binance / Yahoo |
| `DATABASE_URL` | PostgreSQL connection string with SSL | Recommended | Memory cache with auto-reconnect |
| `REDIS_URL` | Redis distributed queue/stream URL | Recommended | In-memory distributed lock & cache |
| `TELEGRAM_BOT_TOKEN` | Bot API token for trade alerts | Recommended | Logs warning, suppresses dispatch |
| `TELEGRAM_CHAT_ID` | Telegram channel or group ID | Recommended | Logs warning, suppresses dispatch |
| `PYTHON_ENGINE_URL` | URL of analytical sidecar engine | Optional | Node.js deterministic quant engine |
| `GEMINI_API_KEY` | Google Gemini AI validation API key | Optional | Deterministic rule orchestrator |

---

## 3. Pre-Flight Checklist

Before cutting production traffic over to the instance:

1. **Database Schema Validation**:
   - Run `GET /api/system/health`. Verify `PostgreSQL` status is `ONLINE`.
   - Table schema auto-initialization executes `CREATE TABLE IF NOT EXISTS signals`, `strategies`, and `strategy_states` on initial connection.
2. **Redis Connection & Stream Health**:
   - Ensure Redis instance accepts connections without latency spikes > 200ms.
   - Stream `market_stream:XAUUSD` will be automatically established upon first tick.
3. **Market Provider API Quotas**:
   - Confirm `TWELVEDATA_API_KEY` has active credit allotment.
   - Verify fallback chain sequence: `TwelveData -> Polygon.io -> Binance -> YahooFinance`.
4. **Telegram Quality Gate Verification**:
   - Only signals meeting `qualityGatePassed === true` AND `aiDecision === 'APPROVED'` will trigger outbound Telegram messages.
   - Non-approved signals (REJECTED, INVALIDATED, AWAITING) are strictly suppressed.
5. **Readiness Probe**:
   - Container readiness check: `GET /health/readiness` (returns HTTP 200 when all core systems are operational).

---

## 4. Container Startup Sequence

1. **`ops/start.sh` executes**:
   * Evaluates if `uvicorn` / `python3` is installed in the container image.
   * If available, launches `python-engine/main.py` on `127.0.0.1:8181` in the background.
   * Hands off execution to `npm run start` (`node server.ts`).
2. **`server.ts` initialization**:
   * Synchronizes Next.js production build (`app.prepare()`).
   * Validates mandatory environment settings (`validateEnvironment`).
   * Probes `PYTHON_ENGINE_URL` (if configured). If unconfigured or offline, seamlessly designates Node.js deterministic analyzer as active.
   * Connects to PostgreSQL (`DatabaseService`) and Redis (`QueueManager`).
   * Launches `IngestionService` and `MarketScanner` for continuous symbol monitoring.
   * Binds HTTP listener to `0.0.0.0:3000`.

---

## 5. Failure Modes & Resilience Strategy

| Failure Scenario | Automatic Mitigation | Recovery Time |
| :--- | :--- | :--- |
| **Primary Provider Down** | `FallbackChain` fails over from TwelveData to Polygon, then Binance, then Yahoo Finance. | Instant (< 500ms) |
| **PostgreSQL Outage** | Circuit breaker opens after 10 failures; stores signals in memory cache; retries every 30s. | Auto-recovers on reconnect |
| **Redis Outage** | In-flight locks fall back to local `Map` with owner tokens and timestamped TTL pruning. | Auto-recovers on reconnect |
| **Python Sidecar Down** | `AIOrchestrator` falls back immediately to built-in deterministic rule evaluator. | 0ms (In-process fallback) |
| **Market Weekend Closure** | `SessionEngine` blocks setup progression; `QualityGate` rejects signals during closure. | Resumes Sunday 22:00 UTC |
| **Duplicate Candidate Signal** | Signal pipeline deduplicates against existing active setups; no duplicate Telegram alerts. | Instant |

---

## 6. Verification Commands

To verify system integrity in any environment:

```bash
# Run unit & full regression matrix (217 tests)
npm test

# Run build verification
npm run build

# Check system health via curl
curl -s http://localhost:3000/api/system/health | jq .
```
