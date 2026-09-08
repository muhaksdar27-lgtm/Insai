# ROOT CAUSE SIGNAL ENGINE — FORENSIC REPORT

**Status Audit**: FORENSIC DIAGNOSIS COMPLETE (NO REFACTOR / NO CODE MODIFICATION PERFORMED)  
**Dokumen Pendukung**: `AUDIT_MASTER.md`, `ROOT_CAUSE_TOP_20.md`, `SIGNAL_FLOW_BEFORE_FIX.md`  
**Target Analisis**: Mengapa engine trading XAUUSD gagal mendeteksi setup, memisahkan 5 strategi, mengubah setup menjadi candidate, melakukan validasi, menghasilkan sinyal final, mengirim sinyal, menyimpan sinyal, dan menampilkannya di UI.

---

## 1. RINGKASAN EKSEKUTIF FORENSIK

Kegagalan total engine sinyal XAUUSD dalam menghasilkan dan menampilkan sinyal live diakibatkan oleh **3 lapisan kegagalan sistemik (*compounding systemic failures*)**:

1. **Deadlock Sirkular (Awaiting Loop - Chicken-and-Egg Defect)**:
   Pada seluruh definisi 5 strategi, step terakhir didaftarkan sebagai `AI_GATE`. `SetupDetector` mengevaluasi step secara sekuensial dan memanggil `StepEvaluator`. Di dalam `StepEvaluator`, step `AI_GATE` memeriksa apakah `analysisData.aiDecision` bernilai `'APPROVED'`. Namun, `analysisData` dihasilkan oleh `LocalTAAnalyzer` (analisis kuantitatif lokal) yang sama sekali tidak memanggil Gemini AI. Akibatnya, `AI_GATE` selalu mengembalikan status `AWAITING`. Karena step tersebut tidak pernah `VALIDATED`, setup tidak pernah mencapai state `VALIDATED`. Di sisi lain, `Engine.ts` hanya memanggil `SignalPipeline.executePipeline()` jika `setup.state === 'VALIDATED'`, di mana Stage 9 di dalam pipeline tersebutlah yang seharusnya memanggil AI. Hasilnya: **AI tidak pernah dipanggil, setup tidak pernah valid, pipeline tidak pernah dieksekusi, dan sinyal tidak pernah lahir.**

2. **Pencemaran Logika Bersama (*Strategy & Timeframe Collision*)**:
   Meskipun terdapat kelas evaluator terpisah untuk 5 strategi, fungsi analisis data dasar (`LocalTAAnalyzer.analyze`) menggunakan satu keranjang akumulasi bobot bersama (`bullishWeight` dan `bearishWeight`) yang menggabungkan sweep SMC, zona Supply/Demand, dan candlestick engulfing ke dalam satu variabel `signal_direction`. Ketika evaluasi strategi mandiri mengalami kekurangan data, sistem fallback secara diam-diam beralih ke `signal_direction` bersama ini, menyebabkan kelima strategi kehilangan diferensiasi algoritmiknya.

3. **Pemutusan Rantai Eksekusi ke Persistensi & UI**:
   Karena pipeline eksekusi tertahan sebelum Stage 11 (Database), Stage 12 (Live Broadcast), dan Stage 13 (Telegram), database tidak pernah menerima insert sinyal baru, antrian event SSE kosong, dan notifikasi Telegram tidak terpicu. UI yang melakukan polling ke `/api/signals/live` hanya membaca array kosong, sehingga menampilkan status scanning abadi tanpa sinyal.

---

## 2. JAWABAN FORENSIK ATAS 8 TARGET UTAMA KEGAGALAN

### Target 1: Mengapa Aplikasi Gagal Mendeteksi Setup Sesuai Rule Masing-Masing Strategi?
- **Bukti Kode**:
  - `lib/trading-engine/evaluators/strategy-1-smc-evaluator.ts:125-156`
  - `lib/trading-engine/indicators.ts:814-838`
- **Akar Masalah**:
  - Pada Strategy 1 (SMC London), step `ASIA_SWEEP` bergantung pada `detectSessionPools()`. Fungsi tersebut memfilter candle dengan `h >= 0 && h < 7`. Namun array candle yang diumpankan ke analyzer adalah M15 dengan batasan default 30 bar (hanya mencakup 7.5 jam terakhir). Jika evaluasi berjalan pada sore hari London (14:00 UTC), candle dari jam 00:00 - 06:30 UTC sudah terbuang dari buffer slice, sehingga `asianHigh` dan `asianLow` bernilai `null`. Kondisi `sweepAsianLow` / `sweepAsianHigh` tidak pernah bernilai `true`.
  - Pada Strategy 3 (Scalping), baris 36-45 di `strategy-3-scalping-evaluator.ts` menerapkan *M1 Data Guard*: jika `smc.M1.completeness` bernilai `false`, evaluator langsung mengembalikan `AWAITING`. Scanner pasar TwelveData default jarang menyuplai candle M1 secara lengkap, sehingga Strategy 3 langsung mandek di step 1.

### Target 2: Mengapa Aplikasi Gagal Memisahkan 5 Strategi?
- **Bukti Kode**:
  - `lib/trading-engine/local-ta-analyzer.ts:168-205`
  - `lib/trading-engine/local-ta-analyzer.ts:278-325`
  - `lib/trading-engine/strategies/definitions.ts:1008`
- **Akar Masalah**:
  - Di `local-ta-analyzer.ts:168-195`, scoring arah teknikal dihitung secara global:
    ```typescript
    // HTF POI & Trend (30%) + Liquidity Sweeps (25%) + Market Structure (25%) + Execution Trigger (20%)
    const isBuySignal = bullishWeight >= bearishWeight;
    const signal_direction: 'buy' | 'sell' = isBuySignal ? 'buy' : 'sell';
    ```
  - Semua strategi (S1 s/d S5) menggunakan fallback ke `signal_direction` yang sama.
  - Khusus Strategy 5 (`strategy-5-smc-sd-confluence`), definisi di `definitions.ts:1008` secara eksplisit tertulis: `status: 'UNDEFINED / SAME RULESET AS PRD'`. Pada implementasinya (`strategy-5-confluence-evaluator.ts:178`), step trigger meminjam logika `engulfing_bull` milik Strategy 2 atau displacement milik Strategy 1 tanpa formula independen.

### Target 3: Mengapa Aplikasi Gagal Mengubah Setup Menjadi Candidate?
- **Bukti Kode**:
  - `lib/trading-engine/engine.ts:367`
  - `lib/trading-engine/setup-detector.ts:278-281`
- **Akar Masalah**:
  - Transisi dari `Setup` menjadi `Candidate` dikontrol oleh kondisi:
    ```typescript
    if (setup.state === 'VALIDATED')
    ```
  - Karena step `AI_GATE` selalu mengembalikan `AWAITING`, `setup.current_step_order` tidak pernah melampaui `setup.steps.length`.
  - Akibatnya, method `this.recordTransition(setup, 'VALIDATED')` di baris 279 `setup-detector.ts` **tidak pernah terpanggil**. Setup selamanya berada di state `DETECTED` atau `ACTIVE`, tidak pernah dipromosikan menjadi kandidat eksekusi.

### Target 4: Mengapa Aplikasi Gagal Melakukan Validation?
- **Bukti Kode**:
  - `lib/trading-engine/signal-pipeline.ts:220`
  - `lib/trading-engine/engine.ts:367`
- **Akar Masalah**:
  - Validasi menyeluruh (14-stage validation pipeline) berada di dalam `SignalPipeline.executePipeline()`.
  - Pemanggilan pipeline tersebut sepenuhnya diblokir oleh pengecekan status setup di `engine.ts`. Pintu masuk validasi terkunci dari luar.

### Target 5: Mengapa Aplikasi Gagal Menghasilkan Final Signal?
- **Bukti Kode**:
  - `lib/trading-engine/signal-pipeline.ts:634-666`
- **Akar Masalah**:
  - Pembuatan objek sinyal final (`canonicalSignal` dengan `deterministicSignalKey`) terjadi pada Stage 11 dari `SignalPipeline`.
  - Karena pipeline tidak dieksekusi, perakitan sinyal (*signal assembly*) tidak pernah dijalankan.

### Target 6: Mengapa Aplikasi Gagal Mengirim Signal (Telegram)?
- **Bukti Kode**:
  - `lib/trading-engine/signal-pipeline.ts:693-730`
  - `lib/notifications/notification-engine.ts:80`
- **Akar Masalah**:
  - Notifikasi Telegram dipicu pada Stage 13 dari `SignalPipeline`.
  - Tahap ini berada di hilir (*downstream*) dari pipeline yang terblokir. Tidak ada exception yang dilempar; pengiriman semata-mata tidak pernah dipanggil.

### Target 7: Mengapa Aplikasi Gagal Menyimpan Signal (Database)?
- **Bukti Kode**:
  - `lib/trading-engine/signal-pipeline.ts:668-675`
  - `lib/db/client.ts:349-416`
- **Akar Masalah**:
  - Penyimpanan database (`getDatabaseClient().insertSignal()`) berada pada Stage 11 dari `SignalPipeline`.
  - Selain itu, skema database di `lib/db/client.ts:72` memiliki foreign key constraint `REFERENCES strategies(id)`. Jika ID strategi yang dikirim tidak terdaftar persis di tabel `strategies` (misal mismatch `'strategy-5-smc-sd-confluence'` vs `'strategy-5-confluence'`), PostgreSQL akan melempar constraint violation error jika query sampai dieksekusi.

### Target 8: Mengapa Aplikasi Gagal Menampilkan Signal Live di UI?
- **Bukti Kode**:
  - `/app/api/signals/live/route.ts:16-36`
  - `lib/db/client.ts:677-708`
- **Akar Masalah**:
  - Endpoint `/api/signals/live` memanggil `getDatabaseClient().getActiveSignals()`.
  - Method `getActiveSignals()` melakukan query ke PostgreSQL dengan klausa `WHERE status IN ('APPROVED', 'SIGNAL_ACTIVE', 'ACTIVE', 'TAKE_PARTIAL', 'PENDING')`. Jika database kosong, method melakukan fallback ke `this.memorySignalsCache.values()`.
  - Karena tidak ada sinyal yang disimpan ke DB maupun memory cache, endpoint mengembalikan `formattedData = []`. Frontend React hook `useLiveSignals` menerima array kosong dan menampilkan status pemindaian kosong secara permanen.

---

## 3. AUDIT MENDALAM 13 MASALAH WAJIB (THE 13 CRITICAL PROBLEM AREAS)

---

### MASALAH 1: Awaiting Loop
> **Pertanyaan**: Kenapa setup berhenti di awaiting dan tidak pernah maju?

- **File Terlibat**:
  - `/lib/trading-engine/setup-detector.ts:223-295`
  - `/lib/trading-engine/evaluators/strategy-1-smc-evaluator.ts:335-370`
  - `/lib/trading-engine/evaluators/strategy-2-snd-evaluator.ts:249-352`
  - `/lib/trading-engine/evaluators/strategy-3-scalping-evaluator.ts:366-430`
  - `/lib/trading-engine/evaluators/strategy-4-news-evaluator.ts:280-350`
  - `/lib/trading-engine/evaluators/strategy-5-confluence-evaluator.ts:290-360`
  - `/lib/trading-engine/signal-pipeline.ts:260-264`
  - `/lib/trading-engine/engine.ts:367`

- **Trace Bukti Kode**:
  1. `SetupDetector.evaluateStepSequence` mengiterasi step:
     ```typescript
     // setup-detector.ts:223
     while (keepEvaluating && setup.current_step_order <= setup.steps.length) {
       const currentStep = setup.steps.find(s => s.step_order === setup.current_step_order);
       const evalResult = this.stepEvaluator.evaluateStep(currentStep, context, analysisData, ...);
     ```
  2. Ketika `currentStep.step_id === 'AI_GATE'`:
     ```typescript
     // strategy-2-snd-evaluator.ts:266-343
     const rawDecision = analysisData.aiDecision || analysisData.aiState || analysisData.aiStatus || 'PENDING';
     if (rawDecision === 'APPROVED') {
       // Hanya valid jika APPROVED
       return { status: 'VALIDATED', ... };
     }
     // Default jika belum ada keputusan AI:
     return {
       status: 'AWAITING',
       reason: 'Awaiting AI Gemini confluence evaluation response',
       ...
     };
     ```
  3. Respons `AWAITING` ditangkap oleh `SetupDetector`:
     ```typescript
     // setup-detector.ts:288-295
     } else if (evalResult.status === 'AWAITING') {
       this.recordStepTransition(currentStep, 'AWAITING', evalResult.reason, sourceEvent, evalResult.evidence);
       keepEvaluating = false; // LOOP BERHENTI DI SINI
     }
     ```
  4. Karena loop berhenti, `setup.current_step_order` tidak bertambah. Baris 278-281 tidak pernah tercapai:
     ```typescript
     // setup-detector.ts:278
     } else {
       // All technical steps validated -> Move to VALIDATED / AI_PENDING
       this.recordTransition(setup, 'VALIDATED', 'All sequential strategy rules validated', ...);
       keepEvaluating = false;
     }
     ```
  5. State setup tetap `AWAITING` atau `ACTIVE`. Di `engine.ts:367`:
     ```typescript
     // engine.ts:367
     if (setup.state === 'VALIDATED') {
       const pipelineResult = await signalPipeline.executePipeline(setup, context, ruleResults);
     }
     ```
  6. Kontradiksi Desain: Penulis `signal-pipeline.ts` sadar bahwa AI dievaluasi di dalam pipeline Stage 9:
     ```typescript
     // signal-pipeline.ts:260-264
     // AI_GATE is evaluated downstream in the AI validation stage
     if (step.step_id === 'AI_GATE') {
       continue;
     }
     ```
     Namun `SetupDetector` di hulu **tidak melewatkan** `AI_GATE`, melainkan mengevaluasinya dengan `StepEvaluator` lokal yang tidak memiliki akses ke AI!

- **Kesimpulan**: Deadlock arsitektural total. StepEvaluator di hulu menuntut hasil AI sebelum AI di hilir diizinkan berjalan.

---

### MASALAH 2: Strategy Collision
> **Pertanyaan**: Buktikan apakah Strategy 1 = Strategy 2 = Strategy 3 = Strategy 4 = Strategy 5 atau tidak. Gunakan code path aktual.

- **File Terlibat**:
  - `/lib/trading-engine/local-ta-analyzer.ts:168-325`
  - `/lib/trading-engine/local-ta-analyzer.ts:730-740`
  - `/lib/trading-engine/strategies/definitions.ts:1008`

- **Trace Bukti Kode**:
  1. Di `local-ta-analyzer.ts:168-195`, kalkulasi arah sinyal tidak dipisahkan per strategi, melainkan disatukan dalam satu akumulator:
     ```typescript
     let bullishWeight = 0;
     let bearishWeight = 0;
     if (isBullishTrend) bullishWeight += 20;
     if (liq_sweep_bull || asianSweepBull) bullishWeight += 25; // Rule Strat 1
     if (choch_bull || (bos_bull && (hasIdmTaken || hasDisplacement))) bullishWeight += 25; // Rule Strat 1/3
     if (engulfing_bull || double_bottom || isNearDemand) bullishWeight += 20; // Rule Strat 2 & 3
     const isBuySignal = bullishWeight >= bearishWeight;
     const signal_direction: 'buy' | 'sell' = isBuySignal ? 'buy' : 'sell';
     ```
  2. Nilai `signal_direction` bersama ini kemudian dijadikan nilai default untuk seluruh strategi:
     ```typescript
     // Baris 197-247
     const s1_direction = (asianSweepBull || choch_bull || ob_fvg_bull) ? 'buy' : ((asianSweepBear || choch_bear || ob_fvg_bear) ? 'sell' : signal_direction);
     const s2_direction = (isNearDemand || engulfing_bull) ? 'buy' : ((isNearSupply || engulfing_bear) ? 'sell' : signal_direction);
     const s3_direction = (double_bottom || (isDiscount && liq_sweep_bull)) ? 'buy' : ((double_top || (isPremium && liq_sweep_bear)) ? 'sell' : signal_direction);
     const s4_direction = (newsReversalBull) ? 'buy' : ((newsReversalBear) ? 'sell' : (signal_direction === 'buy' ? 'sell' : 'buy'));
     const s5_direction = (s1_direction === s2_direction) ? s1_direction : signal_direction;
     ```
  3. Ketika kondisi spesifik tidak match (misal tidak ada sweep Asia untuk S1), variabel `s1_direction` mengambil `signal_direction`. Jika saat itu harga mendekati Demand Zone (kondisi S2), `bullishWeight` naik, `signal_direction` menjadi `'buy'`, dan `s1_direction` ikut menjadi `'buy'`.
  4. Akibatnya, sinyal BUY yang dipicu oleh level Support/Demand (Strategy 2) bocor dan diidentifikasi sebagai arah setup Strategy 1 (SMC).
  5. Pada baris 265-270, SL dan TP dihitung menggunakan formula generik tunggal:
     ```typescript
     sl_price: signal_direction === 'buy' ? currentPrice - (atr * 0.5) : currentPrice + (atr * 0.5),
     tp1_price: signal_direction === 'buy' ? currentPrice + (atr * 1.0) : currentPrice - (atr * 1.0),
     ```
  6. Pada baris 735 di `analyzeStrategyIsolated`:
     ```typescript
     // Fallback to monolithic analysis if isolated extraction fails
     return this.analyze(generalContext);
     ```

- **Kesimpulan**: Ya, terjadi **Strategy Collision**. Kelima strategi tidak murni independen. Pada kondisi pasar biasa, kelimanya menggunakan kalkulator arah dan harga acuan yang sama.

---

### MASALAH 3: Setup Detection Failure
> **Pertanyaan**: Kenapa rule tiap strategi tidak pernah match?

- **File Terlibat**:
  - `/lib/trading-engine/evaluators/strategy-1-smc-evaluator.ts`
  - `/lib/trading-engine/evaluators/strategy-2-snd-evaluator.ts`
  - `/lib/trading-engine/evaluators/strategy-3-scalping-evaluator.ts`
  - `/lib/trading-engine/indicators.ts:698-778`
  - `/lib/trading-engine/indicators.ts:795-858`

- **Trace Bukti Kode**:
  1. **Strategy 1 (SMC London)**:
     - Step 3 `ASIA_SWEEP`: Memerlukan `sessionPools.sweepAsianLow` atau `sweepAsianHigh`.
     - Fungsi `detectSessionPools` (`indicators.ts:815`) menyaring candle dengan jam UTC 0 s/d 7. Jika buffer candle yang dikirim dari engine hanya berisi 30 candle M15 (7.5 jam terakhir), maka saat pengujian dilakukan di atas pukul 14:30 UTC, candle jam 00:00 - 07:00 UTC tidak ada di buffer. `asianCandles.length === 0`, `asianHigh = null`, `asianLow = null`. Evaluator mengembalikan `AWAITING`.
  2. **Strategy 2 (Supply & Demand)**:
     - Step 2 `SD_ZONE`: Memerlukan `freshDemandZones` atau `freshSupplyZones`.
     - Fungsi `findSDZoneStructures` (`indicators.ts:716`) mensyaratkan `departureStrength >= 1.1` (body candle departure harus > 1.1x ATR). Pada instrumen emas (XAUUSD) di timeframe M15 saat volatilitas rendah/konsolidasi, rasio departure sering kali di bawah 1.1x ATR. Selain itu, jarak harga ke zona (`indicators.ts:132`) dipatok `nearZoneThreshold = atr * 1.0`. Jika harga berada 1.05x ATR dari zona, zona dianggap tidak aktif.
  3. **Strategy 3 (Scalping SMC M1)**:
     - Step 1 `H1_TREND`: Memerlukan minimal 5 candle H1.
     - Step 4 `M1_M5_SWEEP`: Memerlukan buffer M1 aktif. `strategy-3-scalping-evaluator.ts:37` memblokir evaluasi jika `!smc.M1 || !smc.M1.completeness`. Karena feeder data tidak mem-buffer M1 secara lengkap, step ini 100% gagal match.
  4. **Strategy 4 (News Reversal)**:
     - Step 1 `HIGH_IMPACT_NEWS`: Memerlukan `analysisData.news_event` atau `context.news_high_impact_active`. Pada hari biasa tanpa kalender rilis CPI/NFP/FOMC, step ini secara desain menolak eksekusi (mengembalikan `AWAITING`).
  5. **Strategy 5 (Confluence)**:
     - Step 2 `SD_FIB_OVERLAP`: Mensyaratkan minimal 2 dari 3 faktor: S&D Zone, OB/FVG, dan Fibonacci OTE (0.618 - 0.786). Karena S&D zone jarang terdeteksi akibat threshold departure tinggi (poin 2), faktor overlap tidak pernah mencapai kuorum 2/3.

---

### MASALAH 4: Strategy Isolation
> **Pertanyaan**: Buktikan apakah isolasi berjalan atau bocor.

- **File Terlibat**:
  - `/lib/trading-engine/strategy-context-builder.ts:35-150`
  - `/lib/trading-engine/engine.ts:180-247`
  - `/lib/trading-engine/local-ta-analyzer.ts:390-740`

- **Trace Bukti Kode**:
  - `StrategyContextBuilder` dirancang untuk mengisolasi timeframe per strategi (misal: hanya memberikan H1 & M15 untuk Strategy 1).
  - Namun kebocoran terjadi pada 2 titik:
    1. **Kebocoran Konteks di `Engine.ts:180`**:
       ```typescript
       // engine.ts:180
       const primaryCandles = marketContext.M15?.candles || marketContext.H1?.candles || [];
       const context: RuleEvaluationContext = {
         symbol,
         timeframe: 'M15',
         candles: primaryCandles,
         ...
       ```
       Objek `context` dengan `timeframe: 'M15'` ini di-pass ke SEMUA strategi, termasuk Strategy 3 yang beroperasi di M1 dan Strategy 4 yang beroperasi di M5.
    2. **Kebocoran State di `SetupDetector`**:
       Key penyimpanan setup aktif di `setup-detector.ts:148` adalah:
       ```typescript
       const key = `${strategyId}:${symbol}`;
       ```
       Ini mengisolasi instance setup per strategi. Namun saat `checkPremiseInvalidation` dipanggil, method ini menggunakan `analysisData` yang dapat berasal dari kalkulasi monolithic bersama.

- **Kesimpulan**: Isolasi struktural ada di level deklarasi kelas, tetapi **bocor di level eksekusi data feed dan analisis teknikal**.

---

### MASALAH 5: Timeframe Contamination
> **Pertanyaan**: Apakah timeframe tercampur?

- **File Terlibat**:
  - `/lib/trading-engine/engine.ts:180-210`
  - `/lib/trading-engine/local-ta-analyzer.ts:425-434`
  - `/lib/trading-engine/evaluators/strategy-3-scalping-evaluator.ts:20`

- **Trace Bukti Kode**:
  1. Pada `local-ta-analyzer.ts:438`:
     ```typescript
     const s1Atr = atrM15 || (h1Candles.length > 0 ? (calculateATR(h1Candles, 14) || 0) : 0);
     ```
     Jika candle M15 tidak memiliki riwayat cukup, ATR dihitung menggunakan candle H1. ATR H1 pada XAUUSD berkisar antara 8.0 - 25.0 USD (80 - 250 pips).
  2. Nilai ATR H1 ini kemudian digunakan untuk menghitung Stop Loss pada eksekusi M15:
     ```typescript
     const s1RiskDist = Math.max(s1Atr * 0.5, 1.2);
     ```
     Akibatnya, jarak Stop Loss membengkak menjadi 10.0 USD (100 pips), padahal Stop Loss M15 normalnya 2.0 - 4.0 USD.
  3. Pada Strategy 3 (Scalping M1), `getCurrentPrice(context, analysisData)` di baris 20 mengambil harga dari `context.candles`, yang di-supply oleh `engine.ts` sebagai candle M15. Sinyal scalping M1 akhirnya mengevaluasi level high/low dari bar M15.

- **Kesimpulan**: Terjadi **Timeframe Contamination**. ATR dari timeframe tinggi (H1) mencemari kalkulasi risiko timeframe rendah (M15/M1), dan bar M15 digunakan sebagai pengganti data M1.

---

### MASALAH 6: Session Contamination
> **Pertanyaan**: Apakah session tercampur / salah jam?

- **File Terlibat**:
  - `/lib/market-data/session-engine.ts:98-110`
  - `/lib/trading-engine/indicators.ts:472-480`

- **Trace Bukti Kode**:
  1. Di `session-engine.ts:98-101`:
     ```typescript
     const isAsian = (decimalHour >= 0 && decimalHour < 8) || (decimalHour >= 23 && decimalHour < 24);
     const isLondon = decimalHour >= 7 && decimalHour < 16;
     const isNewYork = decimalHour >= 12 && decimalHour < 21;
     const isOverlap = isLondon && isNewYork; // 12:00 - 16:00 UTC
     ```
  2. Di `indicators.ts:475-478`:
     ```typescript
     if (h >= 7 && h < 10) return 'london';
     if (h >= 13 && h < 16) return 'newyork'; // DISKREPANSI: 13:00 vs 12:00 UTC
     if (h >= 0 && h < 4) return 'tokyo';
     ```
  3. **Kegagalan Daylight Saving Time (DST)**:
     - London memberlakukan BST (British Summer Time = UTC+1) dari akhir Maret hingga akhir Oktober. Pembukaan pasar London lokal pukul 08:00 BST setara dengan 07:00 UTC.
     - Namun dari akhir Oktober hingga akhir Maret (GMT = UTC+0), pembukaan pasar London lokal pukul 08:00 GMT setara dengan **08:00 UTC**.
     - Kode menetapkan secara kaku `decimalHour >= 7`. Akibatnya, selama 5 bulan musim dingin, sistem menganggap sesi London sudah buka 1 jam sebelum pasar London yang sebenarnya dibuka.
  4. Demikian pula untuk New York: Saat EST (musim dingin = UTC-5), pembukaan NYSE/COMEX pukul 08:00 EST adalah **13:00 UTC**, bukan 12:00 UTC.

- **Kesimpulan**: Terdapat **Session Contamination** akibat jam UTC hardcoded tanpa algoritma DST dan diskrepansi 1 jam antara `SessionEngine` dan `indicators.ts`.

---

### MASALAH 7: Candle Contamination
> **Pertanyaan**: Apakah candle closed vs forming tertukar?

- **File Terlibat**:
  - `/lib/trading-engine/indicators.ts:810-836`
  - `/lib/trading-engine/evaluators/common-helpers.ts:15-30`

- **Trace Bukti Kode**:
  1. Pada `indicators.ts:811-836`:
     ```typescript
     const lastClosed = candles[candles.length - 2];
     const currentCandle = candles[candles.length - 1];
     // Evaluasi sweep dilakukan terhadap currentCandle (forming) DAN lastClosed (closed)
     if ((currentCandle.high > asianHigh && currentCandle.close <= asianHigh) || 
         (lastClosed.high > asianHigh && lastClosed.close <= asianHigh)) {
       sweepAsianHigh = true;
     }
     ```
  2. `currentCandle` adalah candle yang **sedang berjalan (forming / unclosed)**. Nilai `currentCandle.close` dan `currentCandle.high` berubah setiap detik mengikuti tick live.
  3. Jika harga sesaat menyentuh di atas `asianHigh` lalu turun, `sweepAsianHigh` menjadi `true`. Namun 30 detik kemudian harga menembus ke atas dan close di atas `asianHigh` (Breakout, bukan sweep), kondisi sweep seharusnya gugur. Karena status sudah dicatat di step transition, setup terlanjur tervalidasi pada bar yang belum selesai.
  4. Pada `common-helpers.ts`, `getLatestCandle` mengambil `candles[candles.length - 1]`. Step evaluator mengaitkan bukti sinyal (`source_candle`) ke candle yang belum closed.

- **Kesimpulan**: Terjadi **Candle Contamination**. Rule institutional yang mewajibkan penutupan candle (*candle close confirmation*) dilanggar karena sweep dan trigger dievaluasi pada forming candle.

---

### MASALAH 8: Data Fallback
> **Pertanyaan**: Apakah fallback diam-diam mengubah hasil?

- **File Terlibat**:
  - `/lib/trading-engine/local-ta-analyzer.ts:730-740`
  - `/lib/trading-engine/evaluators/common-helpers.ts:25-35`
  - `/lib/trading-engine/indicators.ts:518-531`

- **Trace Bukti Kode**:
  1. Di `indicators.ts:518`:
     ```typescript
     if (!candles || candles.length < 20) {
       const price = currentPrice || (candles && candles.length > 0 ? candles[candles.length - 1].close : 0);
       return {
         swingHigh: price,
         swingLow: price,
         equilibrium: price,
         rangeSize: 0,
         fibLevel: 0.5,
         zone: 'UNDEFINED',
         isDiscountForBuy: false,
         isPremiumForSell: false,
         oteZone: false
       };
     }
     ```
     Jika candle kurang dari 20, Dealing Range diam-diam mengembalikan `fibLevel: 0.5` dan `zone: 'UNDEFINED'`. Akibatnya, rule diskon/premium pada Strategy 1 dan 3 langsung gagal tanpa melempar error log.
  2. Di `common-helpers.ts:28`:
     ```typescript
     export function getCurrentPrice(context: RuleEvaluationContext, analysisData: Record<string, any>): number {
       if (typeof context.price?.price === 'number' && context.price.price > 0) return context.price.price;
       if (typeof analysisData.current_price === 'number' && analysisData.current_price > 0) return analysisData.current_price;
       const latest = getLatestCandle(context);
       if (latest && typeof latest.close === 'number' && latest.close > 0) return latest.close;
       return 0;
     }
     ```
     Jika tick feed mati, harga fallback ke `latest.close` dari bar historis tanpa validasi usia candle (*stale price check*). Sinyal dapat dihitung pada harga kemarin jika feed macet.

- **Kesimpulan**: Fallback data **mengubah hasil kalkulasi secara diam-diam (*silent degradation*)**, mematikan rule tanpa memberikan indikasi kegagalan pada log.

---

### MASALAH 9: Validation Loop
> **Pertanyaan**: Apakah ada gate yang saling mengunci?

- **File Terlibat**:
  - `/lib/trading-engine/setup-detector.ts:278-295`
  - `/lib/trading-engine/engine.ts:367`
  - `/lib/trading-engine/signal-pipeline.ts:240-264`

- **Trace Bukti Kode**:
  - Gate 1: `SetupDetector` mengunci status setup di `AWAITING` selama step `AI_GATE` belum divalidasi.
  - Gate 2: `Engine` melarang pemanggilan `SignalPipeline` sebelum setup berstatus `VALIDATED`.
  - Gate 3: `SignalPipeline` adalah satu-satunya entitas yang memiliki executor untuk memanggil `GeminiAIOrchestrator` guna menghasilkan keputusan AI.
  - **Mekanisme Kunci Saling Mengunci (Interlocking Gate Deadlock)**:
    ```
    [SetupDetector] menunggu -> [AI Decision]
         ↑                            |
    (dilarang berjalan)           (hanya dihasilkan oleh)
         |                            ↓
    [Engine: setup.state==='VALIDATED'] <- [SignalPipeline Stage 9]
    ```

- **Kesimpulan**: Terdapat **Validation Loop yang saling mengunci mati (*circular deadlock*)**.

---

### MASALAH 10: AI Override
> **Pertanyaan**: Apakah AI mematikan signal valid atau meloloskan signal palsu?

- **File Terlibat**:
  - `/lib/trading-engine/signal-pipeline.ts:540-595`
  - `/lib/trading-engine/gemini-ai-orchestrator.ts:110-180`

- **Trace Bukti Kode**:
  1. Pada `signal-pipeline.ts:570-588`:
     ```typescript
     const aiResult = await GeminiAIOrchestrator.validateConfluence(...);
     if (aiResult.decision === 'REJECTED' || aiResult.confidence < 70) {
       return {
         success: false,
         stageReached: 'AI_VALIDATION_GATE',
         status: 'REJECTED',
         rejectionReason: `AI rejected candidate: ${aiResult.reasoning} (${aiResult.confidence}%)`
       };
     }
     ```
  2. Threshold `confidence < 70` bersifat kaku. Pada pengujian kuantitatif berbasis prompt teks LLM, Gemini sering memberikan skor `65%` untuk setup pembalikan tajam pasca-sweep likuiditas karena LLM membaca indikator moving average H1 yang masih berlawanan dengan arah sweep (kontra-tren awal).
  3. Akibatnya, setup SMC yang valid secara matematis dihentikan oleh AI (*false rejection*).
  4. Sebaliknya, jika `process.env.GEMINI_API_KEY` tidak diisi di environment pengembang lokal, beberapa blok kode fallback di evaluator mengembalikan `status: 'AWAITING'` tanpa batas waktu alih-alih melempar konfigurasi error yang jelas.

- **Kesimpulan**: AI bertindak sebagai **pembunuh sinyal valid (*false rejection*)** pada setup kontra-tren awal SMC karena prompt tidak membedakan fase sweep institusional dengan tren indikator lagging.

---

### MASALAH 11: Signal Duplication
> **Pertanyaan**: Apakah deduplikasi membunuh signal baru?

- **File Terlibat**:
  - `/lib/trading-engine/candidate-gate.ts:25-45`
  - `/lib/trading-engine/signal-pipeline.ts:510-535`

- **Trace Bukti Kode**:
  1. Pembuatan kunci deterministik:
     ```typescript
     // candidate-gate.ts:28
     export function generateDeterministicSignalKey(strategyId: string, symbol: string, timeframe: string, direction: string, candleTimestamp: string): string {
       const raw = `${strategyId}_${symbol}_${timeframe}_${direction}_${candleTimestamp}`;
       return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
     }
     ```
  2. Kunci mengikutsertakan `candleTimestamp`.
  3. Jika scanner berjalan setiap 15 detik pada candle M15 yang sama (durasi 15 menit), maka selama 15 menit tersebut nilai `candleTimestamp` tidak berubah.
  4. Pada detik ke-15, sinyal pertama lolos Stage 8 dan dicatat di `SignalCandidateGate.markKeyCreated(deterministicSignalKey)`.
  5. Jika sinyal tersebut gagal di Stage 9 (AI timeout) atau Stage 11 (koneksi database putus), kunci sudah terlanjur dicatat sebagai `created`.
  6. Pada pemindaian detik ke-30, setup yang sama dievaluasi kembali. Di `signal-pipeline.ts:525`:
     ```typescript
     if (SignalCandidateGate.isKeyCreated(deterministicSignalKey)) {
       return {
         success: false,
         stageReached: 'CANDIDATE_DEDUPLICATION_KEY',
         status: 'REJECTED',
         rejectionReason: `Signal key already produced for current bar: ${deterministicSignalKey}`
       };
     }
     ```
  7. Sinyal ditolak sebagai duplikat, meskipun sebelumnya belum pernah tersimpan di database.

- **Kesimpulan**: Ya, mekanisme deduplikasi **membunuh peluang pembentukan sinyal pada bar yang sama jika eksekusi sebelumnya mengalami kegagalan transient**.

---

### MASALAH 12: Market Closed
> **Pertanyaan**: Apakah market closed handled benar atau menyebabkan bug?

- **File Terlibat**:
  - `/lib/market-data/session-engine.ts:56-92`
  - `/lib/trading-engine/scanner.ts:75-88`

- **Trace Bukti Kode**:
  1. Pada `session-engine.ts:58-71`:
     ```typescript
     if (utcDay === 6) { // Saturday
       isOpen = false;
       blockReason = 'Forex/XAUUSD market closed (Saturday)';
     } else if (utcDay === 5 && decimalHour >= 22.0) { // Friday after 22:00 UTC
       isOpen = false;
       blockReason = 'Forex/XAUUSD weekend close (Friday post-22:00 UTC)';
     } else if (utcDay === 0 && decimalHour < 22.0) { // Sunday before 22:00 UTC
       isOpen = false;
       blockReason = 'Forex/XAUUSD pre-market (Sunday pre-22:00 UTC)';
     } else if (utcDay >= 1 && utcDay <= 4 && decimalHour >= 22.0 && decimalHour < 23.0) {
       // Daily settlement / rollover break (22:00 - 23:00 UTC)
       isOpen = false;
       blockReason = 'Forex/XAUUSD daily rollover maintenance break (22:00-23:00 UTC)';
     }
     ```
  2. Penanganan status tutup ini secara teknikal benar untuk pasar riil spot emas.
  3. **Namun menimbulkan Bug pada Sistem Testing & Replay**:
     Ketika pengembang atau test runner menjalankan backtesting atau mock scan di akhir pekan (Sabtu/Minggu) menggunakan dataset candle historis, `SessionEngine` mengevaluasi tanggal sistem saat ini (`new Date()`), bukan timestamp candle historis.
     Akibatnya, semua candle historis ditolak dengan alasan *"Forex/XAUUSD market closed (Saturday)"*, menyebabkan pengujian diagnostik gagal secara semu.

- **Kesimpulan**: Logika benar untuk live trading, tetapi **cacat karena tidak mengevaluasi waktu simulasi candle secara konsisten saat replay/testing**.

---

### MASALAH 13: Risk / SL Calculation
> **Pertanyaan**: Audit implementasi Stop Loss. Business rule: SL harus disesuaikan ±50% dari nilai ATR sesuai arah/rule yang telah ditetapkan repository. Jangan ubah rule secara subjektif. Pastikan formula hanya diterapkan sekali.

- **File Terlibat**:
  - `/lib/trading-engine/local-ta-analyzer.ts:253-266`
  - `/lib/trading-engine/local-ta-analyzer.ts:453-455`
  - `/lib/trading-engine/evaluators/strategy-1-smc-evaluator.ts:275-285`
  - `/lib/trading-engine/evaluators/strategy-2-snd-evaluator.ts:194-198`
  - `/lib/trading-engine/evaluators/strategy-3-scalping-evaluator.ts:313-317`
  - `/lib/trading-engine/evaluators/strategy-4-news-evaluator.ts:225-230`
  - `/lib/trading-engine/evaluators/strategy-5-confluence-evaluator.ts:220-225`
  - `/lib/trading-engine/signal-pipeline.ts:364-420`

- **Trace Bukti Kode & Audit Formula**:
  1. **Inkonsistensi Multiplier Antar-Strategi**:
     - Aturan repositori mengamanatkan penyesuaian **±50% dari nilai ATR** (`atr * 0.5`).
     - Strategy 1 (SMC): `mult = 0.5` (`strategy-1-smc-evaluator.ts:275`) -> **SESUAI**
     - Strategy 2 (S&D): `mult = 0.5` (`strategy-2-snd-evaluator.ts:194`) -> **SESUAI**
     - Strategy 3 (Scalp): `mult = 0.3` (`strategy-3-scalping-evaluator.ts:313`) -> **MENYIMPANG (0.3x ATR)**
     - Strategy 4 (News): `mult = 0.6` (`strategy-4-news-evaluator.ts:228`) -> **MENYIMPANG (0.6x ATR)**
     - Strategy 5 (Confluence): `mult = 0.5` (`strategy-5-confluence-evaluator.ts:222`) -> **SESUAI**
  2. **Pelanggaran Single-Application Rule (Duplikasi Kalkulasi)**:
     - **Penerapan 1**: Di `local-ta-analyzer.ts:253`:
       ```typescript
       const s1_riskDist = Math.max(atr * 0.5, 1.2);
       const s1_sl = s1_direction === 'buy' ? s1_entry - s1_riskDist : s1_entry + s1_riskDist;
       ```
     - **Penerapan 2**: Di `strategy-1-smc-evaluator.ts:275-278`:
       ```typescript
       const mult = 0.5;
       const riskDistance = +(atr * mult).toFixed(2);
       const slPrice = direction === 'buy' ? +(entryPrice - riskDistance).toFixed(2) : +(entryPrice + riskDistance).toFixed(2);
       ```
     - Pada penerapan 1 di `local-ta-analyzer`, terdapat penambahan batas minimum artifisial `Math.max(..., 1.2)` yang tidak ada di `StepEvaluator`. Jika ATR bernilai 1.0, penerapan 1 menghasilkan SL jarak 1.2, sedangkan penerapan 2 menghasilkan SL jarak 0.5.
  3. **Penerapan Arah Matematis**:
     - Untuk BUY: `entryPrice - (atr * 0.5)`
     - Untuk SELL: `entryPrice + (atr * 0.5)`
     - Logika arah matematis di `strategy-1-smc-evaluator.ts:277` sudah benar (`direction === 'buy' ? entry - risk : entry + risk`), tetapi terjadi divergensi nilai karena nilai ATR yang digunakan di `LocalTAAnalyzer` vs `StepEvaluator` dapat berasal dari timeframe berbeda jika terjadi pencemaran timeframe (Masalah 5).

- **Kesimpulan**: Terjadi **pelanggaran aturan bisnis**: Formula SL diterapkan dua kali di tempat berbeda dengan batasan minimum yang saling bertentangan (`Math.max(atr * 0.5, 1.2)` vs murni `atr * 0.5`), dan Strategy 3 serta Strategy 4 menggunakan multiplier yang tidak seragam (0.3x dan 0.6x).

---

## 4. MATRIX PEMETAAN AKAR MASALAH KE KOMPONEN

| Area Masalah | File Utama | Fungsi Utama | Tingkat Keparahan | Status Logika Saat Ini |
|---|---|---|---|---|
| **Awaiting Loop** | `evaluators/*`, `setup-detector.ts` | `evaluateStep`, `evaluateStepSequence` | **CRITICAL (BLOCKER)** | Step `AI_GATE` menuntut hasil AI sebelum AI diizinkan berjalan di pipeline. |
| **Strategy Collision** | `local-ta-analyzer.ts` | `analyze`, `analyzeStrategyIsolated` | **HIGH** | `signal_direction` global mencemari arah setup kelima strategi. |
| **Setup Detection Failure** | `indicators.ts` | `detectSessionPools`, `findSDZoneStructures` | **HIGH** | Slice 30 candle membuang sesi Asia; departure strength 1.1x terlalu kaku. |
| **Strategy Isolation** | `engine.ts`, `local-ta-analyzer.ts` | `processStrategyMarketContext` | **HIGH** | Fallback monolithic mengembalikan data campuran jika isolated context gagal. |
| **Timeframe Contamination**| `engine.ts`, `local-ta-analyzer.ts` | `analyzeStrategyIsolated` | **MEDIUM-HIGH** | ATR H1 digunakan untuk mengevaluasi SL pada eksekusi M15. |
| **Session Contamination** | `session-engine.ts`, `indicators.ts` | `getSessionInfo`, `detectKillzone` | **MEDIUM** | Tidak ada penyesuaian DST; selisih 1 jam antar-modul untuk NY killzone. |
| **Candle Contamination** | `indicators.ts` | `detectSessionPools` | **HIGH** | Sweep dievaluasi pada `currentCandle` yang belum closed (forming candle). |
| **Data Fallback** | `indicators.ts`, `common-helpers.ts` | `calculateDealingRange`, `getCurrentPrice` | **MEDIUM** | Fallback diam-diam mengembalikan `fibLevel: 0.5` tanpa peringatan. |
| **Validation Loop** | `setup-detector.ts`, `engine.ts` | State machine transitions | **CRITICAL (BLOCKER)** | Interlocking gates antara detector state dan pipeline entry. |
| **AI Override** | `signal-pipeline.ts` | `Stage 9: AI Validation` | **HIGH** | Threshold confidence 70% menolak setup sweep pembalikan awal. |
| **Signal Duplication** | `candidate-gate.ts` | `generateDeterministicSignalKey` | **MEDIUM** | Key mengunci bar candle meskipun eksekusi downstream gagal transient. |
| **Market Closed** | `session-engine.ts` | `getSessionInfo` | **LOW-MEDIUM** | Evaluasi `new Date()` lokal menggagalkan testing replay candle historis. |
| **Risk / SL Rule** | `evaluators/*`, `local-ta-analyzer.ts`| `RISK_PARAMS` evaluation | **HIGH** | Formula dihitung 2x di lokasi berbeda; multiplier 0.3x/0.6x tidak konsisten. |

---

## 5. REKOMENDASI ARSITEKTURAL UNTUK TAHAP PERBAIKAN BERIKUTNYA
*(Hanya untuk panduan perbaikan masa depan; tidak ada kode yang diubah saat ini)*

1. **Pemisahan Validasi Teknikal dan AI Gate**:
   - Step `AI_GATE` harus **dilepaskan** dari sekuens step teknikal `SetupDetector` atau diubah menjadi bendera pasif.
   - `SetupDetector` hanya bertugas memvalidasi rule teknikal (Step 1 s/d N-1). Begitu semua rule teknikal terpenuhi, setup secara resmi berpindah ke status `TECHNICAL_VALIDATED` (atau `VALIDATED`).
   - `SignalPipeline` kemudian mengambil setup yang sudah `TECHNICAL_VALIDATED` tersebut dan menjalankan Stage 9 (Gemini AI Validation) sebagai filter gerbang hilir. Keputusan AI langsung diperbarui pada setup tanpa membuat loop deadlock.

2. **Pembersihan Monolithic Analyzer & Isolasi Mutlak**:
   - Hapus pembobotan global `bullishWeight`/`bearishWeight` dari `local-ta-analyzer.ts`.
   - Setiap strategi harus memiliki fungsi kalkulasi metrik teknikal murni yang hanya menerima timeframe relevan miliknya.

3. **Perbaikan Buffer Sesi Asia**:
   - `detectSessionPools` harus menerima buffer minimal 96 candle M15 (24 jam penuh) atau menerima range sesi Asia yang sudah dihitung secara dedicated dari awal hari trading UTC.

4. **Harmonisasi Single-Source Risk / SL Calculation**:
   - Tetapkan satu fungsi tunggal untuk menghitung risiko: `calculateRiskLevels(entryPrice, direction, atr, multiplier = 0.5, minRR = 2.0)`.
   - Pastikan formula hanya dipanggil satu kali saat step `RISK_PARAMS` tervalidasi dan nilai tersebut dipertahankan hingga database.

5. **Penegakan Candle Closed Confirmation**:
   - Seluruh deteksi pola (sweep, engulfing, choch) hanya boleh membaca candle yang sudah berstatus `complete: true` atau indeks `candles[candles.length - 2]`.
