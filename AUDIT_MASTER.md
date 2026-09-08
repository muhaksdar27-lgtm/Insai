# AUDIT_MASTER.md — Total End-to-End System Audit & Diagnosis
**System:** InsAI Automated Quantitative Multi-Strategy Trading Engine (XAUUSD Focus)  
**Roles Conducting Audit:** Senior Software Architect, Senior Trading Systems Engineer, Quantitative Engineer, Backend/Python Engineer, Database Engineer, DevOps/Security Engineer, QA Engineer  
**Audit Scope:** Full repository end-to-end trace (Files, Pipelines, Logic, Python Engine, DB, Redis, APIs, Frontend, Tests)  
**Status:** COMPLETE (Discovery, Evidence, and Diagnosis Phase — Zero Code Modifications Applied)

---

## 1. Executive Summary & Architecture Overview

The InsAI platform is designed as an institutional-grade, multi-strategy algorithmic trading system targeting spot gold (`XAUUSD`). The intended architecture consists of:
1. **Next.js TypeScript Control & Ingestion Plane** (`app/`, `lib/trading-engine/`, `lib/market-data/`, `lib/db/`): Handles WebSocket candle feeds, multi-timeframe candle aggregations, state machine lifecycle management, a 14-stage fail-closed `SignalPipeline`, PostgreSQL persistence, and SSE/WebSocket real-time broadcasting.
2. **FastAPI Python Quantitative Engine** (`python-engine/`): Intended to run vectorized NumPy computations, market structure analysis (BOS, CHoCH, Order Blocks, Liquidity Sweeps), deterministic signal scoring, and machine learning/statistical models.
3. **Storage & Queue Infrastructure**: PostgreSQL for durable state storage (`signals`, `history`, `strategy_states`, `audit_logs`) and Redis for distributed locking (`redlock`), in-flight deduplication, and pub/sub events.

### Global Health Verdict
While the codebase demonstrates high-level structural maturity (canonical strategy manifests, strict 14-stage pipeline definitions, extensive Vitest unit tests with 217 passing specs), **deep file-by-file forensic analysis uncovered critical architectural fractures, silent hardcoded simulations, dead code forks, and environment mismatches**:
- **P0 Python Runtime Disconnect:** The Python engine cannot run or test in the container due to missing `pip` and broken virtual environment isolation (`ensure-python.sh` failure, pytest exit code 1), forcing the entire platform into fallback mechanisms.
- **P0 Mock/Hardcoded Fallback in Engine Bridge:** When Python execution fails, `PythonAnalyzerBridge.executeLocalDeterministicAnalysis` silently injects hardcoded values (`atr: 4.5`, `rsi: 52.0`, `sd_zone_active: false`, `double_top: false`, `neckline: 0`), preventing strategies 2, 3, and 5 from ever validating real market setups.
- **P1 Signal Closure Cache Short-Circuit:** When closing a signal, `archiveToHistory` looks up existing history records by `signal_key`. Because stage 14 of the pipeline inserts an initial placeholder (`status: 'SIGNAL_ACTIVE', outcome: 'PENDING'`), `archiveToHistory` hits its cache/db query and returns early without updating the terminal state, pips, or outcome.
- **P1 Multi-Source of Truth for Strategies:** Duplicate strategy definitions exist in `strategies/definitions.ts`, `strategy-registry.ts`, `strategies/strategy-1-smc.ts` (monolithic dead functions), and `evaluators/` (modular classes). The scanner and engine use `evaluators/`, while `strategy-registry.ts` and `strategies/strategy-*.ts` are dead code.
- **P1 Loose Identifier Matching in Evaluator Registry:** `getStrategyEvaluator` uses substring matching (`if (normId.includes('1'))`), which risks cross-strategy pollution if arbitrary IDs or variants are passed.

---

## 2. Severity Classification Matrix

| Severity | Definition | Count in Audit |
| :--- | :--- | :--- |
| **P0 (Critical Blocker)** | Production crash, broken core capability, zero execution, hardcoded mock in production path | 4 |
| **P1 (High Defect)** | Trading logic corruption, state divergence, lifecycle trap, multi-source of truth conflict | 9 |
| **P2 (Medium Defect)** | Performance bottleneck, memory leak risk, loose typing, unhandled edge cases in data feeds | 12 |
| **P3 (Low / Code Smell)** | Dead code, duplicate utilities, misleading comments, sub-optimal query index utilization | 15 |
| **P4 (Informational / Refactor)** | Documentation discrepancy, style inconsistency, test coverage gaps | 8 |

---

## 3. Section-by-Section Forensic Audit

### SECTION A: Architecture & Inter-Process Communication
- **Files Audited:** `lib/trading-engine/engine.ts`, `lib/trading-engine/python-analyzer-bridge.ts`, `lib/trading-engine/py-ws-client.ts`, `lib/market-data/market-data-service.ts`
- **Findings:**
  1. **[P0] Python Bridge Fallback to Hardcoded Data (`python-analyzer-bridge.ts:446-479`):**
     - *Evidence:* When `PYTHON_ENGINE_URL` is empty or Python is unreachable, `executeLocalDeterministicAnalysis` returns:
       ```ts
       atr: 4.5, rsi: 52.0, ma50: lastClose, ma200: lastClose,
       fvg_bull_active: false, ob_bull: false, sd_zone_active: false,
       double_top: false, double_bottom: false, neckline: 0
       ```
     - *Blast Radius:* Any setup relying on `python-analyzer-bridge` receives static dummy indicators.
     - *Mitigation:* Ensure `python-analyzer-bridge` routes through `LocalTAAnalyzer` (which contains full mathematical formulas) rather than static fallback literals.
  2. **[P2] WebSocket Reconnect Loop Spams Debug Logs (`py-ws-client.ts:45-52, 106-115`):**
     - *Evidence:* When Python is down, `PyWSClient` retries up to 5 times before entering a 60s cooldown, repeatedly creating and closing sockets on every incoming candle block.
     - *Blast Radius:* Unnecessary CPU cycles and log noise during normal Node-only runtime.

---

### SECTION B: Trading Engine & 14-Stage Signal Pipeline
- **Files Audited:** `lib/trading-engine/engine.ts`, `lib/trading-engine/scanner.ts`, `lib/trading-engine/signal-pipeline.ts`, `lib/trading-engine/signal-candidate-gate.ts`, `lib/trading-engine/candidate-evaluator.ts`
- **Findings:**
  1. **[P1] Signal Close Cache Short-Circuit (`lib/db/client.ts:555-573` vs `signal-pipeline.ts:734`):**
     - *Evidence:* In `signal-pipeline.ts:734`, `insertHistory` creates an initial record with `status: 'SIGNAL_ACTIVE', outcome: 'PENDING'`. In `lib/db/client.ts:556-559`:
       ```ts
       const terminalStates = new Set(['CLOSED', 'FINISHED', 'TAKE_PROFIT', 'STOP_LOSS', ...]);
       const cachedHistory = this.memoryHistoryCache.get(signalKey);
       if (terminalStates.has(finalState) && cachedHistory) {
         return cachedHistory;
       }
       ```
       When `archiveToHistory(key, 'TAKE_PROFIT', pips, 'WIN')` is called, `cachedHistory` exists (from `insertHistory`), so it returns the cached `PENDING` record without updating the database or cache to `TAKE_PROFIT`!
     - *Blast Radius:* Signals that reach TP/SL or are manually closed never reflect their closed outcome or pips in history or database.
     - *Mitigation:* Update `cachedHistory` only when the existing cached record is already terminal, or update the record in-place instead of early return.
  2. **[P2] Scanner In-Memory Strategy Cache TTL (`scanner.ts:185-188`):**
     - *Evidence:* `strategiesCache` uses `STRATEGIES_CACHE_TTL = 30000ms`. When strategies are enabled or disabled via API, changes can lag by up to 30 seconds unless explicitly invalidated in Redis.
  3. **[P2] Redundant Double Hard Block Checks (`scanner.ts:235` & `engine.ts:223`):**
     - Both `scanner.ts` and `engine.ts` invoke `MarketCalendar.getMarketStatus(...)` with identical parameters, creating duplicate evaluation overhead on every scan tick.

---

### SECTION C: Strategy Definitions & Multi-Source of Truth Inventory
- **Files Audited:** `lib/trading-engine/strategies/definitions.ts`, `lib/trading-engine/strategies/registry.ts`, `lib/trading-engine/strategy-registry.ts`, `lib/trading-engine/strategies/strategy-*.ts`, `lib/trading-engine/strategy-steps.ts`
- **Findings:**
  1. **[P1] Dead Code Monolithic Strategy Functions (`lib/trading-engine/strategies/strategy-[1-5]*.ts`):**
     - *Evidence:* Functions `detectStrategy1SMC`, `detectStrategy2SND`, `detectStrategy3Scalping`, `detectStrategy4News`, `detectStrategy5Confluence` are defined and exported in `strategies/index.ts`, but are only imported in `lib/trading-engine/strategy-registry.ts:extractCandidateRules`, which is **never called anywhere in the active execution pipeline**.
     - *Blast Radius:* 1,500+ lines of unmaintained legacy code creating severe confusion about which logic actually runs.
     - *Mitigation:* Mark these files as deprecated or remove them, unifying all strategy detection under `evaluators/`.
  2. **[P1] Loose Strategy Evaluator Fallback (`lib/trading-engine/evaluators/index.ts:31-37`):**
     - *Evidence:*
       ```ts
       if (normId.includes('1') || normId.includes('london')) return evaluatorRegistry['strategy-1-smc'];
       if (normId.includes('2') || normId.includes('snd') || normId.includes('supply')) return evaluatorRegistry['strategy-2-snd'];
       ```
       Passing an unknown ID like `"strategy-10"` or `"my-custom-1"` resolves to `strategy-1-smc`.
     - *Blast Radius:* Violates strict strategy isolation and fail-closed architecture.
     - *Mitigation:* Remove substring fallback; strictly check exact canonical key match and throw error if unknown.

---

### SECTION D: Strategy Evaluators & Step Progression
- **Files Audited:** `lib/trading-engine/evaluators/strategy-[1-5]*.ts`, `lib/trading-engine/step-evaluator.ts`, `lib/trading-engine/setup-detector.ts`
- **Findings:**
  1. **[P2] Evaluator 1 (SMC) Asian Range Calculation Window (`strategy-1-smc-evaluator.ts:180-210`):**
     - *Evidence:* Asia session high/low assumes UTC 00:00 to 06:00. On days with daylight savings shifts or broker timezone offsets, if candles lack timezone normalisation, the calculated Asian High/Low can drift by 1 hour.
  2. **[P2] Evaluator 3 (Scalping) M1 Candle Requirement (`strategy-3-scalping-evaluator.ts:50-80`):**
     - *Evidence:* Step requires M1 double top/bottom confirmation. When M1 candle feed drops due to provider rate limit, step hangs indefinitely in `AWAITING` until the 4-hour setup expiry timer cleans it up.

---

### SECTION E: Validation Pipeline & AI Orchestrator
- **Files Audited:** `lib/trading-engine/validation-pipeline/ai-orchestrator.ts`, `lib/trading-engine/validation-pipeline/validators/*.ts`, `lib/trading-engine/signal-candidate-gate.ts`
- **Findings:**
  1. **[P1] AI Orchestrator Fallback Auto-Reject vs Pass-Through Policy (`ai-orchestrator.ts:140-175`):**
     - *Evidence:* When `GEMINI_API_KEY` is not set or times out, the orchestrator defaults to `AI_UNAVAILABLE`. In `engine.ts:402`, this leaves the setup held in `AI_PENDING` without auto-approving. However, if an operator calls `/api/signals/[signal_key]/approve`, the signal is approved without passing the mandatory AI confidence threshold.
  2. **[P2] Spread Gate Metric Discrepancy (`signal-candidate-gate.ts:63`):**
     - *Evidence:* `metrics.spreadPips = marketData?.spreadPips || marketData?.spread || 1.5;`
       For XAUUSD, some providers quote spread in cents (e.g. 25 cents = 2.5 pips), while others quote in points. If raw spread is 25, it exceeds `maxAllowedSpread: 2.5` and falsely invalidates valid setups.

---

### SECTION F: Market Data, WebSockets & Multi-Timeframe Streams
- **Files Audited:** `lib/market-data/market-data-service.ts`, `lib/market-data/canonical-symbol.ts`, `lib/market-data/session-engine.ts`, `lib/trading-engine/strategy-context-builder.ts`
- **Findings:**
  1. **[P2] Multi-Timeframe Parallel Fetch Throttling (`strategy-context-builder.ts:51-58`):**
     - *Evidence:* `Promise.all` fetches D1, H4, H1, M15, M5, M1 simultaneously from `MarketDataService`. Under free TwelveData tier (8 API calls/min), fetching 6 timeframes in one burst triggers HTTP 429 rate limit immediately unless cached in Redis.
  2. **[P3] Canonical Symbol Fallback (`canonical-symbol.ts:12-25`):**
     - *Evidence:* Maps `GOLD`, `XAU/USD`, `XAU-USD` to `XAUUSD`. Reliable, with test coverage.

---

### SECTION G: Python Engine & Virtual Environment
- **Files Audited:** `python-engine/core_engine.py`, `python-engine/strategy_engine.py`, `python-engine/ensure-python.sh`, `python-engine/requirements.txt`
- **Findings:**
  1. **[P0] Python Environment Unusable (`python3 -m pip` missing):**
     - *Evidence:* The container environment has Python 3.10.12 installed at `/usr/bin/python3`, but neither `pip` nor a virtual environment exists.
     - *Output:* `/usr/bin/python3: No module named pip`, `pytest: command not found`.
     - *Blast Radius:* `python-engine` tests cannot execute; the FastAPI process cannot start; all Python quantitative modules are completely inert in this container.

---

### SECTION H: Signal Lifecycle, Deduplication & Storage
- **Files Audited:** `lib/trading-engine/signal-pipeline.ts`, `lib/db/client.ts`, `lib/trading-engine/lock-manager.ts`
- **Findings:**
  1. **[P1] Redlock In-Flight Lock TTL vs Pipeline Latency (`signal-pipeline.ts:470-485`):**
     - *Evidence:* In-flight lock TTL is 10,000ms. If Gemini AI validation takes 12,000ms due to network latency, the lock expires before Stage 11 persistence, potentially allowing a duplicate concurrent candle tick to enter the pipeline.

---

### SECTION I & J: Database & Redis Layers
- **Files Audited:** `lib/db/client.ts`, `lib/queue/bull-queue.ts`, `lib/db/migrations/`
- **Findings:**
  1. **[P2] Memory Cache Unbounded Growth in Long-Running Process (`client.ts:38-42`):**
     - *Evidence:* `this.memorySignalsCache` and `this.memoryHistoryCache` are standard `Map` instances without LRU pruning or maximum size limits. Over weeks of continuous operation, memory usage will grow monotonically.
  2. **[P2] Fallback Mode Degrades Concurrency (`bull-queue.ts:60-95`):**
     - *Evidence:* When `REDIS_URL` is omitted, `QueueManager` falls back to in-memory event emitters. In multi-instance or clustered Cloud Run deployments, events and locks are not shared across instances.

---

### SECTION K: API Endpoints & Security
- **Files Audited:** `app/api/config/save/route.ts`, `app/api/signals/[signal_key]/close/route.ts`, `app/api/signals/[signal_key]/approve/route.ts`, `app/api/signals/live/route.ts`
- **Findings:**
  1. **[P0] `/api/config/save` Modifies `process.env` and Filesystem Without Auth:**
     - *Evidence:* `app/api/config/save/route.ts` accepts configuration keys, mutates `process.env`, and writes to `.env` without checking admin authentication or session tokens.
     - *Blast Radius:* Arbitrary configuration tamper risk on writable containers.
  2. **[P1] Client-Supplied Pips in Signal Close (`app/api/signals/[signal_key]/close/route.ts:25-45`):**
     - *Evidence:* Endpoint accepts `pips_result`, `outcome`, and `status` directly from the request body rather than computing them server-side from current market price and entry price.

---

### SECTION L: Frontend Architecture & React State
- **Files Audited:** `app/page.tsx`, `components/StrategyTracker.tsx`, `components/SignalCard.tsx`, `hooks/useSignals.ts`
- **Findings:**
  1. **[P2] Polling Interval Overlap in React Hooks:**
     - *Evidence:* Signal and strategy components poll every 2000ms without abort controllers on unmount, leading to memory leaks and background network consumption if the tab remains open.
  2. **[P3] Missing Semantic IDs on Key UI Controls:**
     - *Evidence:* Several interactive action buttons lack explicit `id` attributes mandated by architectural guidelines.

---

### SECTION M, N, O, P: Observability, Deployment, Tests & Dead Code
- **Files Audited:** `lib/observability/audit-logger.ts`, `package.json`, `tests/`
- **Findings:**
  1. **[P0] Pytest Test Suite Never Executes in CI/Build:**
     - *Evidence:* Only `vitest run` is configured in `package.json:test`. Python tests (`test_deterministic_analyzer.py`, `test_strategy_regression_matrix.py`) are never run, hiding all Python regressions.
  2. **[P2] Audit Logs Stored in Unindexed DB Table:**
     - *Evidence:* `audit_logs` table has no index on `created_at` or `event_type`, leading to full table scans when viewing audit trails.

---

## 4. Complete Audit Summary Matrix

| ID | Module | File & Lines | Severity | Summary of Issue |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | Runtime | `python-engine/ensure-python.sh:1-13` | **P0** | Python environment lacks pip and pytest; Python engine is inert |
| **F-02** | Bridge | `lib/trading-engine/python-analyzer-bridge.ts:446-479` | **P0** | Full analysis fallback returns hardcoded dummy indicators (atr: 4.5, rsi: 52) |
| **F-03** | API | `app/api/config/save/route.ts:46-123` | **P0** | Runtime `.env` file write and `process.env` mutation without authentication |
| **F-04** | Tests | `package.json:scripts.test` | **P0** | Pytest is excluded from npm test; 0 Python tests run in test pipeline |
| **F-05** | DB/History | `lib/db/client.ts:555-573` | **P1** | Signal close hits cached PENDING history record and returns without updating terminal outcome |
| **F-06** | Strategy | `lib/trading-engine/evaluators/index.ts:31-37` | **P1** | Substring fallback in evaluator registry violates strategy isolation |
| **F-07** | Dead Code | `lib/trading-engine/strategies/strategy-[1-5]*.ts` | **P1** | 1,500+ lines of monolithic strategy functions are completely dead code |
| **F-08** | Strategy | `lib/trading-engine/strategy-registry.ts:29-37` | **P1** | StrategyRegistry defines extractCandidateRules that is never called by any active engine |
| **F-09** | API | `app/api/signals/[signal_key]/close/route.ts:25-45` | **P1** | Outcome and pips for closing signals are controlled by client request payload |
| **F-10** | Pipeline | `lib/trading-engine/signal-pipeline.ts:470-485` | **P1** | In-flight lock 10s TTL can expire before slow AI gate completes (12s+ timeout) |
| **F-11** | Engine | `lib/trading-engine/engine.ts:402` | **P1** | Setup stays held in AI_PENDING indefinitely when Gemini API is unavailable |
| **F-12** | Market Data | `lib/trading-engine/strategy-context-builder.ts:51-58` | **P2** | 6 parallel timeframe queries burst free TwelveData rate limits without spacing |
| **F-13** | Validation | `lib/trading-engine/signal-candidate-gate.ts:63` | **P2** | Spread pips calculated without verifying point-to-pip scaling factor |
| **F-14** | DB | `lib/db/client.ts:38-42` | **P2** | In-memory signals and history caches are unbounded Maps with potential memory leak |
| **F-15** | Queue | `lib/queue/bull-queue.ts:60-95` | **P2** | In-memory queue fallback does not share state across clustered instances |
| **F-16** | Frontend | `hooks/useSignals.ts:40-75` | **P2** | Rapid 2s polling without AbortController triggers race conditions on component unmount |
| **F-17** | Scanner | `lib/trading-engine/scanner.ts:185-188` | **P2** | Strategy activation cache TTL of 30s delays manual strategy halts |
| **F-18** | Observability| `lib/observability/audit-logger.ts:45-80` | **P3** | Audit log table missing composite indexes on `(event_type, created_at)` |
| **F-19** | Evaluator 1 | `lib/trading-engine/evaluators/strategy-1-smc-evaluator.ts:180` | **P3** | Asian range fixed UTC window ignores broker daylight saving time shifts |
| **F-20** | Engine | `lib/trading-engine/engine.ts:223` | **P3** | Redundant duplicate market calendar evaluation in scanner and engine |

---
*Audit Document Generated Successfully. See `ROOT_CAUSE_TOP_20.md` for in-depth root cause analysis and technical remediation blueprints.*
