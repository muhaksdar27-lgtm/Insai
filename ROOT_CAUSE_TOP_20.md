# ROOT_CAUSE_TOP_20.md — Root Cause Mapping & Remediation Blueprint

This document details the Top 20 Critical and High-severity root causes identified during the end-to-end audit of the InsAI quantitative trading system. Each entry maps the exact file and lines, observable symptoms, underlying root cause, blast radius, and an actionable, concrete technical remediation blueprint.

---

### RC-01: Python Analyzer Bridge Falls Back to Static Dummy Indicators
- **Location:** `lib/trading-engine/python-analyzer-bridge.ts:446-479`
- **Severity:** P0 (Critical Blocker)
- **Symptom:**
  Whenever the Python engine is offline or unreachable, all strategies calling `FULL_ANALYSIS` via the bridge receive identical static indicators regardless of market conditions:
  ```ts
  values: {
    current_price: lastClose,
    atr: 4.5,
    rsi: 52.0,
    ma50: lastClose,
    ma200: lastClose,
    fvg_bull_active: false,
    ob_bull: false,
    sd_zone_active: false,
    double_top: false,
    neckline: 0
  }
  ```
- **Root Cause:**
  `executeLocalDeterministicAnalysis` contains hardcoded placeholder literals instead of invoking the mathematical indicator algorithms implemented in `LocalTAAnalyzer`.
- **Blast Radius:**
  Strategy 2 (SND), Strategy 3 (Scalping), and Strategy 5 (Confluence) can never validate setups when Python is offline, because Order Blocks, S&D Zones, Double Tops, and Necklines are permanently hardcoded to `false` or `0`.
- **Remediation Blueprint:**
  Refactor `executeLocalDeterministicAnalysis` in `python-analyzer-bridge.ts` to delegate directly to `LocalTAAnalyzer.analyze(req)` and return genuine computed values for ATR, RSI, MA, S&D zones, OB/FVG, and pattern structures.

---

### RC-02: Missing Python Runtime Dependencies (Pip and Pytest)
- **Location:** `python-engine/ensure-python.sh:1-13`, `/usr/bin/python3`
- **Severity:** P0 (Critical Blocker)
- **Symptom:**
  Running Python scripts or tests fails immediately with:
  `/usr/bin/python3: No module named pip` and `pytest: command not found`.
- **Root Cause:**
  The base container image provides Python 3.10.12 without `python3-pip` or a pre-built virtual environment (`venv`). `ensure-python.sh` attempts `curl -sS https://bootstrap.pypa.io/get-pip.py | python3 -` which fails in network-restricted sandboxes or without curl permissions.
- **Blast Radius:**
  Zero execution of `python-engine/core_engine.py`, FastAPI routes, and quantitative regression test suites.
- **Remediation Blueprint:**
  1. Provision a isolated Python virtual environment during build/container initialization.
  2. For environments where Python packages cannot be installed dynamically, ensure the TypeScript control plane is 100% self-sufficient by having `LocalTAAnalyzer` serve as the primary deterministic calculation engine.

---

### RC-03: Arbitrary Configuration Tamper via `/api/config/save`
- **Location:** `app/api/config/save/route.ts:46-123`
- **Severity:** P0 (Security Critical)
- **Symptom:**
  Unauthenticated HTTP POST requests to `/api/config/save` can mutate `process.env` in memory and write arbitrary string keys into `.env` on disk.
- **Root Cause:**
  Missing authorization header verification, missing session token check, and direct invocation of `fs.writeFileSync(envPath, ...)` based on client-provided payloads.
- **Blast Radius:**
  Systemic compromise of trading parameters, risk limits, and environment stability.
- **Remediation Blueprint:**
  1. Require strict Admin JWT / API secret validation on the endpoint.
  2. Disallow filesystem writes to `.env` from runtime API handlers.
  3. Store user-adjustable strategy settings in PostgreSQL (`system_config` table) and reload them dynamically in memory.

---

### RC-04: Python Test Suite Excluded from Build and Verification
- **Location:** `package.json:scripts.test`
- **Severity:** P0 (Quality & Reliability)
- **Symptom:**
  `npm test` reports 217 passing tests, giving a false sense of 100% green coverage, while 0 Python tests (`test_deterministic_analyzer.py`, `test_strategy_regression_matrix.py`) are ever executed.
- **Root Cause:**
  `package.json` only invokes `vitest run`. There is no composite test runner or pre-commit hook that includes Python testing.
- **Blast Radius:**
  Silent drift and regressions in Python quantitative models go completely undetected in CI/CD.
- **Remediation Blueprint:**
  Update the test script to execute both Vitest and Pytest (when Python is enabled), or provide a unified runner:
  `"test": "vitest run && (python3 -m pytest -q python-engine || echo 'Python pytest skipped in Node container')"`

---

### RC-05: Signal Closure Short-Circuits Due to Premature History Insertion
- **Location:** `lib/db/client.ts:555-573` vs `lib/trading-engine/signal-pipeline.ts:734`
- **Severity:** P1 (Trading Lifecycle Corruption)
- **Symptom:**
  When a signal reaches TP or SL and `archiveToHistory` is called with terminal state (`TAKE_PROFIT` or `STOP_LOSS`), the record in `history` retains `status: 'SIGNAL_ACTIVE'` and `outcome: 'PENDING'`.
- **Root Cause:**
  Stage 14 of `SignalPipeline` calls `insertHistory` with `status: 'SIGNAL_ACTIVE'`. This populates `memoryHistoryCache.set(signalKey, record)`.
  Later, when `archiveToHistory` is called with `finalState = 'TAKE_PROFIT'`:
  ```ts
  const terminalStates = new Set(['CLOSED', 'FINISHED', 'TAKE_PROFIT', 'STOP_LOSS', ...]);
  const cachedHistory = this.memoryHistoryCache.get(signalKey);
  if (terminalStates.has(finalState) && cachedHistory) {
    return cachedHistory;
  }
  ```
  It finds the cached record from Stage 14 and returns it immediately, skipping the database update!
- **Blast Radius:**
  Closed signals are permanently recorded as active and pending. Win/Loss metrics and realized RR calculations in history dashboards are completely corrupted.
- **Remediation Blueprint:**
  Modify the short-circuit condition to check if the cached record is *already in a terminal state*:
  ```ts
  if (cachedHistory && terminalStates.has(cachedHistory.status)) {
    return cachedHistory;
  }
  ```
  When updating an active record to a terminal state, proceed with updating `signals` and inserting/updating `history`.

---

### RC-06: Loose Substring Fallback in Strategy Evaluator Registry
- **Location:** `lib/trading-engine/evaluators/index.ts:31-37`
- **Severity:** P1 (Strategy Isolation Breach)
- **Symptom:**
  Requesting an unrecognized strategy identifier such as `"strategy-10"` or `"london-breakout"` resolves to `strategy-1-smc`.
- **Root Cause:**
  `getStrategyEvaluator` implements loose string matching:
  ```ts
  if (normId.includes('1') || normId.includes('london')) return evaluatorRegistry['strategy-1-smc'];
  if (normId.includes('2') || normId.includes('snd') || normId.includes('supply')) return evaluatorRegistry['strategy-2-snd'];
  ```
- **Blast Radius:**
  Violates fail-closed strategy isolation. Misconfigured strategy requests execute Strategy 1 logic without warning.
- **Remediation Blueprint:**
  Remove substring fallbacks. Use strict exact key lookups against `evaluatorRegistry` and throw an explicit error if the strategy ID is unregistered.

---

### RC-07: Monolithic Strategy Detectors Are Dead Code
- **Location:** `lib/trading-engine/strategies/strategy-[1-5]*.ts`
- **Severity:** P1 (Architectural Drift)
- **Symptom:**
  Over 1,500 lines of code across `strategy-1-smc.ts`, `strategy-2-snd.ts`, `strategy-3-scalping.ts`, `strategy-4-news.ts`, and `strategy-5-smc-sd-confluence.ts` are never invoked by `TradingEngine`, `SetupDetector`, or `SignalPipeline`.
- **Root Cause:**
  The system was refactored to use `evaluators/Strategy[1-5]*Evaluator.ts`, but the old functions (`detectStrategy1SMC`, etc.) were left in `strategies/` and exported via `strategies/index.ts`.
- **Blast Radius:**
  Engineers modifying strategy rules in `strategies/` wonder why behavior does not change at runtime.
- **Remediation Blueprint:**
  Deprecate and remove the legacy files in `lib/trading-engine/strategies/strategy-*.ts`, establishing `lib/trading-engine/evaluators/` as the single authoritative implementation of strategy execution.

---

### RC-08: Unused `extractCandidateRules` in `strategy-registry.ts`
- **Location:** `lib/trading-engine/strategy-registry.ts:29-37, 65, 90, 116, 141, 166`
- **Severity:** P1 (Redundant Abstraction)
- **Symptom:**
  `StrategyRegistry` maintains interfaces and mapping functions for `extractCandidateRules`, which are never invoked by any scanner or pipeline stage.
- **Root Cause:**
  Divergence between `strategy-registry.ts` and `strategies/registry.ts` (STRATEGY_MANIFESTS).
- **Blast Radius:**
  Dual sources of truth for strategy metadata.
- **Remediation Blueprint:**
  Consolidate `strategy-registry.ts` into `strategies/registry.ts`. Remove `extractCandidateRules` and standardize on `IStrategyEvaluator.evaluateStep`.

---

### RC-09: Client-Controlled Outcomes in `/api/signals/[signal_key]/close`
- **Location:** `app/api/signals/[signal_key]/close/route.ts:25-45`
- **Severity:** P1 (Data Integrity & Tampering)
- **Symptom:**
  The client can post `{ outcome: 'WIN', pips_result: 500, status: 'CLOSED' }` and arbitrarily set historical performance stats.
- **Root Cause:**
  The route trusted body parameters instead of calculating pips and outcome server-side from entry price, direction, and live market price.
- **Blast Radius:**
  Falsification of backtest and live trading performance metrics.
- **Remediation Blueprint:**
  Enforce server-authoritative calculation in `close/route.ts`:
  Fetch the signal from DB, fetch current market price from `MarketDataService`, compute `pips = (currentPrice - entryPrice) * 10`, derive `WIN` or `LOSS`, and record atomically.

---

### RC-10: In-Flight Lock Expiry Prior to Slow AI Gate Completion
- **Location:** `lib/trading-engine/signal-pipeline.ts:470-485`
- **Severity:** P1 (Concurrency Race Condition)
- **Symptom:**
  When Gemini API takes >10 seconds to respond, a subsequent candle tick can acquire the in-flight lock for the same setup and trigger duplicate signal creation.
- **Root Cause:**
  `LOCK_TTL_MS = 10000` (10s), but `AIOrchestrator.validateSignal` has a timeout of up to 12,000ms.
- **Blast Radius:**
  Duplicate signals created for the same setup under high API latency.
- **Remediation Blueprint:**
  Increase lock TTL to 20,000ms (20s) with active heartbeat renewal while AI validation is in-flight, releasing the lock explicitly in a `finally` block after Stage 11 persistence.

---

### RC-11: Indefinite Setup Stall in `AI_PENDING` State
- **Location:** `lib/trading-engine/engine.ts:392-408`
- **Severity:** P1 (State Machine Deadlock)
- **Symptom:**
  When Gemini API credentials are not provided or AI rate limits are exceeded, setups remain permanently in `AI_PENDING` without expiring or gracefully falling back to deterministic confirmation.
- **Root Cause:**
  `engine.ts` handles `AI_UNAVAILABLE` by holding the state in `AI_PENDING` indefinitely:
  ```ts
  await this.syncState(strategyId, 'AI_PENDING', 'pending', failMsg, setup.id, payload);
  ```
- **Blast Radius:**
  Strategies accumulate stuck setups that prevent new setups from being evaluated during the cycle.
- **Remediation Blueprint:**
  Implement a deterministic fallback mode or transition the setup to `AI_HELD_TIMEOUT` after 3 consecutive failed attempts, allowing the setup lifecycle to finalize.

---

### RC-12: Unthrottled Burst of 6 Timeframe Queries on Free Market Data Tier
- **Location:** `lib/trading-engine/strategy-context-builder.ts:51-58`
- **Severity:** P2 (API Quota Depletion)
- **Symptom:**
  Under high market activity, `buildGlobalMarketContext` issues 6 simultaneous requests (D1, H4, H1, M15, M5, M1) to external provider APIs, causing immediate HTTP 429 Too Many Requests.
- **Root Cause:**
  Unbatched `Promise.all` without request spacing or cache-first verification.
- **Blast Radius:**
  Candle streams go stale; market scans fail with `DATA_VALIDATION_ERROR`.
- **Remediation Blueprint:**
  1. Check Redis candle cache before making external network calls.
  2. Sequentialize or stagger uncached fetches with a 250ms delay between requests.

---

### RC-13: Spread Scaling Discrepancy (Pips vs Cents/Points)
- **Location:** `lib/trading-engine/signal-candidate-gate.ts:63`
- **Severity:** P2 (False Rejection)
- **Symptom:**
  Setups for `XAUUSD` get rejected at Stage 4 with "Spread exceeds maximum threshold" even during normal liquid market hours.
- **Root Cause:**
  Different market data providers express spread differently: TwelveData reports absolute price difference (e.g. 0.25 = 2.5 pips), while other feeds report points (25). When 25 is passed directly without normalization, it exceeds `spreadMaxPips: 2.5`.
- **Blast Radius:**
  High rejection rate of valid setups during liquid sessions.
- **Remediation Blueprint:**
  Normalize spread in `MarketDataService` using canonical pip sizing:
  `spreadPips = spread > 5 ? spread / 10 : spread * 10` (or derive from bid/ask difference explicitly).

---

### RC-14: Unbounded Memory Cache Growth in Database Client
- **Location:** `lib/db/client.ts:38-42`
- **Severity:** P2 (Memory Leak)
- **Symptom:**
  Node.js container memory steadily increases over days/weeks of continuous operation.
- **Root Cause:**
  `memorySignalsCache` and `memoryHistoryCache` are native JavaScript `Map` objects that insert entries without eviction or size caps.
- **Blast Radius:**
  Potential container OOM crash under high setup/signal volume.
- **Remediation Blueprint:**
  Replace raw `Map` with an LRU cache (e.g., `lru-cache` package or fixed-capacity ring buffer of 2,000 items).

---

### RC-15: Queue Manager In-Memory Fallback Lacks Cross-Process Sync
- **Location:** `lib/queue/bull-queue.ts:60-95`
- **Severity:** P2 (Multi-Instance Inconsistency)
- **Symptom:**
  When deployed on Cloud Run with autoscaling (>1 instance), published events on one instance are invisible to other instances when `REDIS_URL` is omitted.
- **Root Cause:**
  Fallback uses in-memory Node `EventEmitter`.
- **Blast Radius:**
  Duplicate scanning and state conflicts across horizontal replicas.
- **Remediation Blueprint:**
  Enforce Redis in production environments; log a fatal startup warning if multiple instances are detected without Redis configured.

---

### RC-16: Frontend Polling Race Conditions and Memory Leaks
- **Location:** `hooks/useSignals.ts:40-75`
- **Severity:** P2 (Frontend Instability)
- **Symptom:**
  Component unmount errors in browser console; UI cards flicker between stale and new signal states.
- **Root Cause:**
  `setInterval` fetches signals every 2000ms without canceling pending `fetch` calls via `AbortController` on unmount.
- **Blast Radius:**
  Browser client performance degradation and stale UI state.
- **Remediation Blueprint:**
  Wrap fetch calls with `AbortController` in `useEffect` cleanup return functions.

---

### RC-17: 30-Second Strategy Activation Cache Latency in Scanner
- **Location:** `lib/trading-engine/scanner.ts:185-188`
- **Severity:** P2 (Operational Delay)
- **Symptom:**
  Toggling a strategy off in the UI/Admin dashboard takes up to 30 seconds to take effect in the background market scanner.
- **Root Cause:**
  Scanner checks in-memory `strategiesCache` with a 30,000ms TTL.
- **Blast Radius:**
  Emergency strategy pause requests are delayed by up to 30 seconds.
- **Remediation Blueprint:**
  Publish an `ACTIVE_STRATEGIES_UPDATED` event via `QueueManager` upon strategy state changes to immediately invalidate scanner cache.

---

### RC-18: Missing Index on `audit_logs` Table
- **Location:** `lib/observability/audit-logger.ts:45-80`, `lib/db/migrations/`
- **Severity:** P3 (Query Performance)
- **Symptom:**
  Audit trail dashboard queries slow down as the `audit_logs` table grows beyond 50,000 records.
- **Root Cause:**
  Missing database composite index on `(event_type, created_at)`.
- **Blast Radius:**
  Slow API responses on `/api/audit-trail` under heavy logging.
- **Remediation Blueprint:**
  Add migration: `CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created ON audit_logs (event_type, created_at DESC);`

---

### RC-19: Fixed Asian Session UTC Window Ignores Daylight Saving Shifts
- **Location:** `lib/trading-engine/evaluators/strategy-1-smc-evaluator.ts:180-210`
- **Severity:** P3 (Edge-Case Drift)
- **Symptom:**
  Asian liquidity sweeps are calculated from 00:00 to 06:00 UTC regardless of Tokyo/Sydney daylight saving or London daylight saving time (BST).
- **Root Cause:**
  Static hour boundaries without daylight saving offset calculation.
- **Blast Radius:**
  Minor 1-hour misalignment in Asian High/Low sweep detection during seasonal transitions.
- **Remediation Blueprint:**
  Enhance `SessionEngine.getAsianSessionWindow()` to dynamically compute seasonal offsets for Tokyo/Sydney exchange hours.

---

### RC-20: Redundant Market Calendar Hard Block Checks
- **Location:** `lib/trading-engine/scanner.ts:235` and `lib/trading-engine/engine.ts:223`
- **Severity:** P3 (Efficiency Smell)
- **Symptom:**
  `MarketCalendar.getMarketStatus("XAUUSD", ...)` is evaluated twice in immediate succession on every market tick.
- **Root Cause:**
  Lack of cached status sharing between scanner orchestration and engine execution.
- **Blast Radius:**
  Negligible CPU overhead; minor code duplication.
- **Remediation Blueprint:**
  Pass the already-evaluated `marketStatus` from `scanner.ts` into `engine.processStrategyMarketContext` to avoid re-evaluation.

---
*End of Root Cause Mapping. All 20 items are fully mapped with code evidence and actionable blueprints for the subsequent remediation phase.*
