import { StrategySpecification } from './types';

export const STRATEGY_MANIFESTS: Record<string, StrategySpecification> = {
  'strategy-1-smc': {
    strategy_id: 'strategy-1-smc',
    name: 'STRATEGI 1 — SMC + Sesi London + M15',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Smart Money Concept strategy exploiting Asian session liquidity sweeps during the London session open with M15 CHoCH and unmitigated OB/FVG retracements.',
    timeframe: {
      htf: 'H1',
      ltf: 'M15',
      execution: 'M15'
    },
    session_requirement: {
      allowedSessions: ['London', 'London/NY Overlap'],
      utcWindow: '07:00-16:00 UTC',
      description: 'London liquidity window (07:00 - 16:00 UTC / GMT)'
    },
    setup_sequence: [
      {
        step_id: 'H1_TREND',
        step_order: 1,
        rule_id: 'rule_h1_trend',
        name: 'Analisis Trend H1',
        description: 'Menyesuaikan bias arah struktur pasar H1 (Bullish / Bearish)',
        invalidation: 'Trend H1 membalik arah berlawanan atau tidak terdefinisi',
        defaultExpiryMinutes: 240
      },
      {
        step_id: 'LONDON_FILTER',
        step_order: 2,
        rule_id: 'rule_session_restriction',
        name: 'Filter Sesi London',
        description: 'Memastikan waktu trading berada dalam jendela operasional Sesi London (07:00 - 16:00 UTC)',
        invalidation: 'Sesi London berakhir atau waktu di luar jam likuiditas utama',
        defaultExpiryMinutes: 300
      },
      {
        step_id: 'ASIA_LIQUIDITY',
        step_order: 3,
        rule_id: 'rule_asia_liquidity',
        name: 'Identifikasi Likuiditas Asia',
        description: 'Menentukan range tertinggi (High) dan terendah (Low) Sesi Asia sebagai pool likuiditas',
        invalidation: 'Range Asia tidak terdefinisi atau terlalu lebar (> 45 pips)',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'LIQUIDITY_SWEEP',
        step_order: 4,
        rule_id: 'rule_liquidity_sweep',
        name: 'Sweep Likuiditas',
        description: 'Mendeteksi sweep likuiditas pada High atau Low Sesi Asia',
        invalidation: 'Harga menembus jauh tanpa penolakan (breakout) atau sesi London usai',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'FAKEOUT_REJECTION',
        step_order: 5,
        rule_id: 'rule_fakeout_rejection',
        name: 'Fakeout & Wick Rejection',
        description: 'Konfirmasi penolakan harga (wick rejection) setelah sweep likuiditas',
        invalidation: 'Candle close di luar level sweep tanpa penolakan',
        defaultExpiryMinutes: 90
      },
      {
        step_id: 'M15_CHOCH',
        step_order: 6,
        rule_id: 'rule_choch_confirmation',
        name: 'Konfirmasi CHoCH M15',
        description: 'Mencari struktur pembalikan Change of Character / MSS pada timeframe M15',
        invalidation: 'Harga membuat new extreme menembus sweep wick',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'OB_FVG_ALIGNMENT',
        step_order: 7,
        rule_id: 'rule_ob_fvg_entry',
        name: 'OB & FVG Alignment',
        description: 'Validasi posisi entry pada zona Order Block atau Fair Value Gap dalam Discount/Premium',
        invalidation: 'Zona OB/FVG tertembus total (> 100% mitigation / invalidation)',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'ENTRY_RISK_EXECUTION',
        step_order: 8,
        rule_id: 'rule_risk_params',
        name: 'Eksekusi Entry & Parameter Risiko',
        description: 'Kalkulasi jarak SL (0.5x ATR buffer di belakang OB/Sweep) dan TP rasio minimum 1:2.0',
        invalidation: 'Rasio R:R < 1:2.0 atau spread melebihi toleransi',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'AI_GATE',
        step_order: 9,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi konfirmasi model AI Gemini & Konsistensi Quality Gate',
        invalidation: 'AI menolak setup karena konflik makro atau volatilitas ekstrem',
        defaultExpiryMinutes: 15
      }
    ],
    rule_definition: [
      {
        rule_id: 'rule_h1_trend',
        name: 'H1 Higher Timeframe Trend Bias',
        mandatory: true,
        timeframe: 'H1',
        description: 'Trend struktur pasar H1 wajib sejalan dengan arah order flow (Bullish/Bearish)',
        evaluation_logic: 'H1 EMA20 > EMA50 with positive slope for Bullish; EMA20 < EMA50 with negative slope for Bearish',
        invalidation_condition: 'H1 trend direction neutral or opposite to setup bias'
      },
      {
        rule_id: 'rule_session_restriction',
        name: 'London Active Liquidity Session',
        mandatory: true,
        timeframe: 'M15',
        description: 'Waktu eksekusi dibatasi pada jendela Sesi London (07:00-16:00 UTC)',
        evaluation_logic: 'London UTC hour >= 7 && hour < 16',
        invalidation_condition: 'Outside London session window'
      },
      {
        rule_id: 'rule_asia_liquidity',
        name: 'Asian Session High/Low Liquidity Range',
        mandatory: true,
        timeframe: 'M15',
        description: 'Identifikasi pool likuiditas pada level High/Low sesi Asia',
        evaluation_logic: 'Asian Session Range detected between 00:00 - 07:00 UTC',
        invalidation_condition: 'Asian range missing or corrupted'
      },
      {
        rule_id: 'rule_liquidity_sweep',
        name: 'Asia High/Low Liquidity Sweep',
        mandatory: true,
        timeframe: 'M15',
        description: 'Pengambilan likuiditas Asia Low (Buy) atau Asia High (Sell)',
        evaluation_logic: 'Price wicks below Asian Low (Buy) or above Asian High (Sell)',
        invalidation_condition: 'Clean breakout without rejection'
      },
      {
        rule_id: 'rule_fakeout_rejection',
        name: 'Liquidity Fakeout & Rejection Wick',
        mandatory: true,
        timeframe: 'M15',
        description: 'Ekor penolakan cepat membuktikan institutional fakeout / liquidity grab',
        evaluation_logic: 'Rejection wick ratio >= 50% of candle body range',
        invalidation_condition: 'Full candle body close beyond swept level'
      },
      {
        rule_id: 'rule_choch_confirmation',
        name: 'M15 Change of Character (MSS)',
        mandatory: true,
        timeframe: 'M15',
        description: 'Pembalikan struktur pasar internal M15 dengan candle displacement yang jelas',
        evaluation_logic: 'Close beyond last internal swing high (Buy) or swing low (Sell)',
        invalidation_condition: 'Price fails to break structural pivot or makes new extreme'
      },
      {
        rule_id: 'rule_ob_fvg_entry',
        name: 'Order Block / Fair Value Gap Alignment',
        mandatory: true,
        timeframe: 'M15',
        description: 'Retracement ke zona unmitigated OB atau FVG di area Discount (Buy) / Premium (Sell)',
        evaluation_logic: 'Price touches fresh OB/FVG within Discount (<50%) for Buy or Premium (>50%) for Sell',
        invalidation_condition: 'Zone completely breached (>100% mitigation)'
      },
      {
        rule_id: 'rule_risk_params',
        name: 'Institutional SL & R:R Verification',
        mandatory: true,
        timeframe: 'M15',
        description: 'SL ditempatkan di luar OB/Sweep dengan buffer 0.5x ATR, TP minimum 1:2.0',
        evaluation_logic: 'Calculated TP1 >= 2.0 * SL distance',
        invalidation_condition: 'Risk/Reward ratio < 1:2.0 or spread > 2.5 pips'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'Gemini AI Confluence Verification',
        mandatory: true,
        timeframe: 'M15',
        description: 'Verifikasi model AI Gemini untuk konsistensi institusional',
        evaluation_logic: 'AI Decision == "APPROVED" && AI Confidence >= 80%',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'LIMIT',
      trigger: 'Touch / mitigation of unmitigated M15 Order Block or Fair Value Gap after confirmed CHoCH',
      description: 'Buy Limit at Discount OB/FVG for Bullish; Sell Limit at Premium OB/FVG for Bearish'
    },
    sl_rule: {
      bufferFormula: '0.5 * ATR(14)',
      anchor: 'Swing Low / Asian Low sweep wick for BUY; Swing High / Asian High sweep wick for SELL',
      description: 'SL placed 0.5x ATR beyond the extreme sweep/OB wick'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Equilibrium / Intermediate Swing)',
      tp2: '1:3.5 Risk-Reward (Opposite Liquidity Pool / HTF Target)',
      minRR: 2.0,
      description: 'Minimum institutional 1:2.0 R:R with runner to 1:3.5'
    },
    filter: {
      spreadMaxPips: 2.5,
      newsRestriction: 'No high impact news within 15 minutes before/after',
      sessionFilter: true
    },
    invalidation_rule: {
      conditions: [
        'H1 HTF Trend breaks opposite direction',
        'Price breaks sweep extreme before CHoCH',
        'OB/FVG zone breached beyond 100%',
        'London session closes without fill'
      ],
      action: 'Set state to INVALIDATED and release setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 240,
      condition: 'Setup expires if entry is not triggered within 4 hours'
    },
    evidence_model: {
      requiredFields: ['h1Bias', 'session', 'level', 'sweepType', 'chochPrice', 'zoneType', 'atr14', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'Structured evidence containing H1 bias, Asian sweep level, M15 CHoCH price, OB coordinates, ATR buffer, and calculated SL/TP'
    }
  },

  'strategy-2-snd': {
    strategy_id: 'strategy-2-snd',
    name: 'STRATEGI 2 — Supply & Demand + Engulfing',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Supply & Demand strategy driven by MA50/MA200 trend alignment, institutional imbalance zones (DBR/RBD/RBR/DBD), M15 BOS, zone touch, and lower-timeframe Engulfing confirmation.',
    timeframe: {
      htf: 'H1',
      ltf: 'M15',
      execution: 'M15'
    },
    session_requirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'Active high-volume sessions (London / New York)'
    },
    setup_sequence: [
      {
        step_id: 'HTF_MA_TREND',
        step_order: 1,
        rule_id: 'rule_htf_ma_trend',
        name: 'Higher Timeframe MA Trend',
        description: 'Konfirmasi arah trend utama menggunakan Moving Average (MA50 & MA200)',
        invalidation: 'Harga menyilang MA berlawanan arah dengan candle close',
        defaultExpiryMinutes: 240
      },
      {
        step_id: 'SD_ZONE_IMBALANCE',
        step_order: 2,
        rule_id: 'rule_sd_zone_imbalance',
        name: 'Zona Supply/Demand & Imbalance',
        description: 'Mendeteksi area Supply atau Demand segar (Fresh DBR/RBD/RBR/DBD) dengan imbalance jelas',
        invalidation: 'Zona S&D tertembus atau sudah sepenuhnya termitigasi sebelumnya',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'BOS_CONFIRMATION',
        step_order: 3,
        rule_id: 'rule_bos_confirmation',
        name: 'Break of Structure (BOS)',
        description: 'Konfirmasi kelanjutan struktur Break of Structure searah dengan trend utama',
        invalidation: 'Struktur pasar membalik berlawanan arah trend',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'AREA_TOUCH',
        step_order: 4,
        rule_id: 'rule_area_touch',
        name: 'Sentuhan Area S&D (Pullback)',
        description: 'Harga melakukan pullback dan menyentuh batas zona Fresh Supply/Demand',
        invalidation: 'Harga langsung melesat tanpa pullback ke area S&D',
        defaultExpiryMinutes: 90
      },
      {
        step_id: 'LTF_ENGULFING',
        step_order: 5,
        rule_id: 'rule_ltf_engulfing',
        name: 'Candlestick Engulfing Trigger',
        description: 'Konfirmasi candlestick Engulfing / momentum rejection tepat di dalam area S&D',
        invalidation: 'Candle close di luar batas zona S&D sebelum engulfing terjadi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'ENTRY_RISK_SD',
        step_order: 6,
        rule_id: 'rule_risk_params_sd',
        name: 'Entry & Parameter Risiko S&D',
        description: 'Entry pada penutupan candle engulfing, SL di luar zona S&D + 0.5x ATR, TP minimum 1:2.0',
        invalidation: 'Risk:Reward < 1:2.0 atau SL terlalu lebar',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi model AI Gemini untuk keselarasan zona S&D dan sentimen',
        invalidation: 'AI Quality Gate menolak setup',
        defaultExpiryMinutes: 15
      }
    ],
    rule_definition: [
      {
        rule_id: 'rule_htf_ma_trend',
        name: 'MA50 / MA200 Trend Alignment',
        mandatory: true,
        timeframe: 'H1',
        description: 'Harga di atas MA50 & MA200 untuk Bullish; di bawah MA50 & MA200 untuk Bearish',
        evaluation_logic: 'Price > MA50 && MA50 > MA200 (Bullish) or Price < MA50 && MA50 < MA200 (Bearish)',
        invalidation_condition: 'Trend crosses opposite side of MA50/200'
      },
      {
        rule_id: 'rule_sd_zone_imbalance',
        name: 'Fresh Supply/Demand Zone with Imbalance',
        mandatory: true,
        timeframe: 'M15',
        description: 'Zona DBR/RBR (Demand) atau RBD/DBD (Supply) yang belum pernah dites dengan FVG/Imbalance',
        evaluation_logic: 'Zone freshness == "FRESH" && Imbalance size >= 1.5x ATR',
        invalidation_condition: 'Zone previously mitigated or penetrated'
      },
      {
        rule_id: 'rule_bos_confirmation',
        name: 'M15 Break of Structure (BOS)',
        mandatory: true,
        timeframe: 'M15',
        description: 'Konfirmasi penembusan swing point searah trend sebelum pullback',
        evaluation_logic: 'Candle close beyond prior swing high/low',
        invalidation_condition: 'Failure to close beyond swing'
      },
      {
        rule_id: 'rule_area_touch',
        name: 'Supply/Demand Area Touch',
        mandatory: true,
        timeframe: 'M15',
        description: 'Harga masuk ke batas zona S&D',
        evaluation_logic: 'Price >= zoneLower && Price <= zoneUpper',
        invalidation_condition: 'Price blows through zone without stopping'
      },
      {
        rule_id: 'rule_ltf_engulfing',
        name: 'Lower Timeframe Engulfing Candlestick',
        mandatory: true,
        timeframe: 'M15',
        description: 'Candle penolakan Engulfing (Bullish Engulfing pada Demand, Bearish Engulfing pada Supply)',
        evaluation_logic: 'Engulfing body covers 100% of previous candle body',
        invalidation_condition: 'Opposite candle closes outside zone'
      },
      {
        rule_id: 'rule_risk_params_sd',
        name: 'S&D Stop Loss & Risk Reward',
        mandatory: true,
        timeframe: 'M15',
        description: 'SL di luar batas ekstrim zona S&D + buffer 0.5x ATR, TP minimum 1:2.0',
        evaluation_logic: 'Calculated TP >= 2.0 * SL distance',
        invalidation_condition: 'Risk/Reward < 1:2.0'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'Gemini AI Confluence Verification',
        mandatory: true,
        timeframe: 'M15',
        description: 'AI Quality Gate validation',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'MARKET',
      trigger: 'Close of confirmed Bullish/Bearish Engulfing candlestick at Supply/Demand zone boundary',
      description: 'Market entry at engulfing close or limit entry at upper/lower zone margin'
    },
    sl_rule: {
      bufferFormula: '0.5 * ATR(14)',
      anchor: 'Lower boundary of Demand Zone (BUY) / Upper boundary of Supply Zone (SELL)',
      description: 'SL placed 0.5x ATR outside the S&D zone perimeter'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Nearest Opposite S&D Zone)',
      tp2: '1:3.0 Risk-Reward (HTF Liquidity Pool)',
      minRR: 2.0,
      description: 'Target opposite major S&D zone with minimum 1:2.0 R:R'
    },
    filter: {
      spreadMaxPips: 2.5,
      newsRestriction: 'No trade during high impact news releases',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Candle closes beyond S&D zone invalidation level',
        'MA50 crosses MA200 in opposite direction',
        'S&D zone is fully mitigated prior to entry'
      ],
      action: 'Transition setup to INVALIDATED and release lock'
    },
    expiry_rule: {
      maxDurationMinutes: 240,
      condition: 'Setup expires if zone is not touched or triggered within 4 hours'
    },
    evidence_model: {
      requiredFields: ['trend', 'fastEma', 'slowEma', 'zoneUpper', 'zoneLower', 'zoneType', 'zoneFreshness', 'engulfingType', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'S&D evidence capturing MA trend, zone coordinates, freshness state, engulfing candle metrics, and R:R parameters'
    }
  },

  'strategy-3-scalping': {
    strategy_id: 'strategy-3-scalping',
    name: 'STRATEGI 3 — Scalping SMC + Micro Sweep + Double Top/Bottom',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'High-frequency institutional scalping strategy combining H1 trend, M15 retracement, M1/M5 micro liquidity sweep, and strict M1 Double Top/Bottom formation with neckline displacement.',
    timeframe: {
      htf: 'H1',
      intermediate: 'M15',
      ltf: 'M5',
      execution: 'M1'
    },
    session_requirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'High liquidity active market sessions'
    },
    setup_sequence: [
      {
        step_id: 'H1_TREND',
        step_order: 1,
        rule_id: 'rule_h1_trend',
        name: 'Analisis Trend H1',
        description: 'Memastikan arah trend H1 selaras (Bullish untuk Buy / Bearish untuk Sell)',
        invalidation: 'Trend H1 sideways tanpa bias atau berlawanan',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'M15_RETRACEMENT',
        step_order: 2,
        rule_id: 'rule_m15_retracement',
        name: 'Retracement M15',
        description: 'Mendeteksi gelombang koreksi harga masuk ke area Discount (Buy) / Premium (Sell)',
        invalidation: 'Koreksi menembus level invalidation swing structure',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'MICRO_SWEEP',
        step_order: 3,
        rule_id: 'rule_micro_sweep',
        name: 'Micro Liquidity Sweep',
        description: 'Sweep likuiditas mikro pada M1/M5 (Sweep Low untuk Buy / Sweep High untuk Sell)',
        invalidation: 'Harga tidak melakukan sweep dan langsung reli/dump',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'DOUBLE_TOP_BOTTOM',
        step_order: 4,
        rule_id: 'rule_double_top_bottom',
        name: 'Pola Double Top / Double Bottom (Wajib Pasca-Sweep)',
        description: 'Konfirmasi formasi Double Bottom (Buy) atau Double Top (Sell) yang terbentuk SETELAH sweep. Pola sebelum sweep DITOLAK.',
        invalidation: 'Pola terbentuk sebelum sweep, atau puncak/lembah kedua menembus melebihi batas toleransi',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'NECKLINE_BREAK',
        step_order: 5,
        rule_id: 'rule_neckline_break',
        name: 'Breakout Neckline',
        description: 'Konfirmasi penetrasi garis Neckline dengan candle displacement pada M1',
        invalidation: 'Harga memantul kembali dari neckline tanpa breakout valid',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'SCALP_ENTRY_RISK',
        step_order: 6,
        rule_id: 'rule_scalp_entry_risk',
        name: 'Eksekusi Entry & Parameter Scalp',
        description: 'Entry pada breakout neckline, SL ketat di bawah pola Double Bottom / di atas Double Top, TP 1:1.5 - 1:2.0',
        invalidation: 'Risk:Reward < 1:1.5 atau spread > 2.0 pips',
        defaultExpiryMinutes: 20
      },
      {
        step_id: 'AI_GATE',
        step_order: 7,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi AI cepat untuk validasi momentum scalping',
        invalidation: 'AI menolak setup scalping',
        defaultExpiryMinutes: 15
      }
    ],
    rule_definition: [
      {
        rule_id: 'rule_h1_trend',
        name: 'H1 Macro Trend Alignment',
        mandatory: true,
        timeframe: 'H1',
        description: 'H1 Bullish untuk Buy setup, H1 Bearish untuk Sell setup',
        evaluation_logic: 'H1 market structure bias is strictly aligned',
        invalidation_condition: 'H1 trend is neutral or opposite'
      },
      {
        rule_id: 'rule_m15_retracement',
        name: 'M15 Retracement Wave',
        mandatory: true,
        timeframe: 'M15',
        description: 'Harga mengalami koreksi sehat ke zona Discount/Premium',
        evaluation_logic: 'Pullback reaches at least 38.2% of prior M15 impulse',
        invalidation_condition: 'Pullback breaks structural origin'
      },
      {
        rule_id: 'rule_micro_sweep',
        name: 'M1/M5 Micro Liquidity Sweep',
        mandatory: true,
        timeframe: 'M1',
        description: 'Pengambilan likuiditas micro swing low (Buy) atau micro swing high (Sell)',
        evaluation_logic: 'Wick breaks micro swing extreme and returns quickly',
        invalidation_condition: 'No sweep occurs before reversal pattern'
      },
      {
        rule_id: 'rule_double_top_bottom',
        name: 'Post-Sweep Double Top / Bottom Formation',
        mandatory: true,
        timeframe: 'M1',
        description: 'Pola Double Bottom / Top WAJIB terjadi SETELAH sweep. Pola yang terbentuk sebelum sweep langsung DITOLAK.',
        evaluation_logic: 'patternTimestamp > sweepTimestamp && Math.abs(peak1 - peak2) / atr < 0.2',
        invalidation_condition: 'Pattern occurred prior to sweep or asymmetry > 20%'
      },
      {
        rule_id: 'rule_neckline_break',
        name: 'M1 Neckline Displacement Break',
        mandatory: true,
        timeframe: 'M1',
        description: 'Candle close M1 menembus garis leher (Neckline) pola pembalikan',
        evaluation_logic: 'Close > Neckline (Buy) or Close < Neckline (Sell)',
        invalidation_condition: 'Rejection at neckline without break'
      },
      {
        rule_id: 'rule_scalp_entry_risk',
        name: 'Scalp Risk Parameters & R:R',
        mandatory: true,
        timeframe: 'M1',
        description: 'SL di luar extreme pola + 0.3x ATR buffer, TP rasio minimum 1:1.5',
        evaluation_logic: 'TP >= 1.5 * SL distance',
        invalidation_condition: 'R:R < 1:1.5 or spread > 2.0 pips'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'AI Fast Scalping Verification',
        mandatory: true,
        timeframe: 'M1',
        description: 'Gemini AI fast momentum validation',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'MARKET',
      trigger: 'Close of M1 candle breaking the Double Bottom / Double Top Neckline with displacement',
      description: 'Market Buy on Bullish Neckline break; Market Sell on Bearish Neckline break'
    },
    sl_rule: {
      bufferFormula: '0.3 * ATR(14)',
      anchor: 'Lowest trough of Double Bottom (BUY) / Highest peak of Double Top (SELL)',
      description: 'Tight scalp SL placed 0.3x ATR behind the double top/bottom structural extremes'
    },
    tp_rule: {
      tp1: '1:1.5 Risk-Reward (M15 High/Low Range)',
      tp2: '1:2.0 Risk-Reward (Next M15 Liquidity Pool)',
      minRR: 1.5,
      description: 'Quick scalp TP at 1:1.5 - 1:2.0 R:R'
    },
    filter: {
      spreadMaxPips: 2.0,
      newsRestriction: 'Strictly prohibited 15 minutes before and after high-impact news',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Double bottom / top formed BEFORE liquidity sweep (Strict Rejection)',
        'Neckline fails to break within 15 candles of pattern completion',
        'Price breaks below second trough / above second peak',
        'High impact news scheduled within 15 minutes'
      ],
      action: 'Reject pattern, mark INVALIDATED, and clear setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 60,
      condition: 'Scalp setup expires after 60 minutes if neckline is not broken'
    },
    evidence_model: {
      requiredFields: ['h1Bias', 'sweepPrice', 'sweepTimestamp', 'peak1Price', 'peak2Price', 'patternTimestamp', 'necklinePrice', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'Scalping evidence verifying sweep-before-pattern temporal ordering, neckline level, and tight scalp risk boundaries'
    }
  },

  'strategy-4-news': {
    strategy_id: 'strategy-4-news',
    name: 'STRATEGI 4 — News Liquidity Sweep Reversal',
    version: '1.0.0',
    status: 'ACTIVE',
    description: 'Post-news event volatility reversal strategy capitalizing on liquidity sweeps triggered by high-impact macro data (CPI/NFP/FOMC/PPI), enforcing no-trade windows during initial spikes, spread normalization, wick rejections, and M1 BOS confirmation.',
    timeframe: {
      htf: 'M15',
      ltf: 'M5',
      execution: 'M1'
    },
    session_requirement: {
      allowedSessions: ['News Window'],
      description: 'High-Impact Macroeconomic News Release Windows'
    },
    setup_sequence: [
      {
        step_id: 'HIGH_IMPACT_NEWS',
        step_order: 1,
        rule_id: 'rule_high_impact_news',
        name: 'Event Berita High-Impact',
        description: 'Deteksi rilis berita makro berdampak tinggi (CPI, NFP, FOMC, PPI)',
        invalidation: 'Tidak ada agenda berita High Impact aktif',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'NO_TRADE_WINDOW',
        step_order: 2,
        rule_id: 'rule_no_trade_window',
        name: 'No-Trade Window & Normalisasi Spread',
        description: 'Larangan entry pada candle pertama lonjakan berita. Menunggu penormalan spread broker (< 3.0 pips).',
        invalidation: 'Spread tetap melebar abnormal melebihi ambang batas toleransi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'M15_LIQUIDITY',
        step_order: 3,
        rule_id: 'rule_m15_liquidity',
        name: 'Identifikasi Likuiditas M15',
        description: 'Menentukan level High/Low signifikan sebelum rilis berita sebagai target sweep',
        invalidation: 'Level likuiditas pra-berita tidak terdefinisi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'M5_NEWS_SWEEP',
        step_order: 4,
        rule_id: 'rule_m5_news_sweep',
        name: 'M5 Post-News Spike Sweep',
        description: 'Spike berita mengambil dan menyapu level likuiditas M15 secara agresif',
        invalidation: 'Tidak terjadi sweep melainkan pergerakan breakout satu arah berkelanjutan',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'WICK_REJECTION',
        step_order: 5,
        rule_id: 'rule_wick_rejection',
        name: 'Rejection Wick (> 50%)',
        description: 'Konfirmasi penolakan harga berupa ekor panjang (Wick Rejection minimal 50% rentang candle)',
        invalidation: 'Candle ditutup full body tanpa ekor penolakan yang memadai',
        defaultExpiryMinutes: 30
      },
      {
        step_id: 'M1_BOS_CONFIRMATION',
        step_order: 6,
        rule_id: 'rule_m1_bos_confirmation',
        name: 'Konfirmasi Pembalikan M1 BOS',
        description: 'Konfirmasi pembalikan arah dengan Break of Structure pada timeframe M1',
        invalidation: 'Harga kembali menembus ujung wick ekstrem spike',
        defaultExpiryMinutes: 20
      },
      {
        step_id: 'NEWS_ENTRY_RISK',
        step_order: 7,
        rule_id: 'rule_news_entry_risk',
        name: 'Eksekusi Entry & Parameter Risiko Berita',
        description: 'Entry pasca BOS M1, SL di luar ekor spike + 0.6x ATR buffer, TP rasio minimum 1:2.0',
        invalidation: 'Risk:Reward < 1:2.0',
        defaultExpiryMinutes: 15
      },
      {
        step_id: 'AI_GATE',
        step_order: 8,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi model AI Gemini khusus skenario volatilitas berita',
        invalidation: 'AI menolak setup pembalikan berita',
        defaultExpiryMinutes: 15
      }
    ],
    rule_definition: [
      {
        rule_id: 'rule_high_impact_news',
        name: 'High-Impact News Release Identification',
        mandatory: true,
        timeframe: 'M15',
        description: 'Agenda berita High-Impact resmi tercatat dalam kalender',
        evaluation_logic: 'News event impact == "HIGH" && minutesFromEvent <= 60',
        invalidation_condition: 'No active high impact news'
      },
      {
        rule_id: 'rule_no_trade_window',
        name: 'First Candle No-Trade & Spread Normalization',
        mandatory: true,
        timeframe: 'M5',
        description: 'DILARANG entry pada candle berita pertama. Spread broker harus telah kembali normal (< 3.0 pips).',
        evaluation_logic: 'candleIndexPostNews > 0 && spreadPips <= 3.0',
        invalidation_condition: 'Entry attempted on first news candle or spread > 3.0 pips'
      },
      {
        rule_id: 'rule_m15_liquidity',
        name: 'Pre-News M15 Liquidity Pool Target',
        mandatory: true,
        timeframe: 'M15',
        description: 'Level ekstrim pre-news High/Low sebagai pool likuiditas institusional',
        evaluation_logic: 'Identified pre-news high/low swing levels',
        invalidation_condition: 'No clear pre-news level'
      },
      {
        rule_id: 'rule_m5_news_sweep',
        name: 'Post-News M5 Liquidity Sweep',
        mandatory: true,
        timeframe: 'M5',
        description: 'Spike menembus level likuiditas dan segera berbalik arah',
        evaluation_logic: 'M5 spike high > preNewsHigh (Sell) or M5 spike low < preNewsLow (Buy)',
        invalidation_condition: 'Price trends through level without reversal'
      },
      {
        rule_id: 'rule_wick_rejection',
        name: 'Long Wick Candle Rejection (>= 50%)',
        mandatory: true,
        timeframe: 'M5',
        description: 'Candle spike membentuk ekor penolakan minimal 50% dari total range candle',
        evaluation_logic: 'wickSize / totalCandleRange >= 0.50',
        invalidation_condition: 'Full body close through level'
      },
      {
        rule_id: 'rule_m1_bos_confirmation',
        name: 'M1 Reversal Break of Structure',
        mandatory: true,
        timeframe: 'M1',
        description: 'Struktur M1 mengonfirmasi pergeseran momentum pembalikan',
        evaluation_logic: 'M1 candle closes beyond recent micro structural pivot',
        invalidation_condition: 'Price makes new high above spike extreme'
      },
      {
        rule_id: 'rule_news_entry_risk',
        name: 'News Reversal Risk Parameters & R:R',
        mandatory: true,
        timeframe: 'M1',
        description: 'SL di luar ujung ekor spike + 0.6x ATR buffer, TP rasio minimum 1:2.0',
        evaluation_logic: 'Calculated TP >= 2.0 * SL distance',
        invalidation_condition: 'Risk/Reward < 1:2.0'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'AI Volatility Reversal Gate',
        mandatory: true,
        timeframe: 'M1',
        description: 'AI model verification for macro volatility behavior',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'MARKET',
      trigger: 'Close of M1 BOS candle following post-news spike sweep and long-wick rejection',
      description: 'Market entry once spread normalizes and M1 structure confirms reversal'
    },
    sl_rule: {
      bufferFormula: '0.6 * ATR(14)',
      anchor: 'Extreme high of news spike wick (SELL) / Extreme low of news spike wick (BUY)',
      description: 'SL placed 0.6x ATR outside the extreme point of the news spike'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Pre-News Consolidation Origin)',
      tp2: '1:3.0 Risk-Reward (Opposite Pre-News Swing Range)',
      minRR: 2.0,
      description: 'Target pre-news equilibrium and opposite range with minimum 1:2.0 R:R'
    },
    filter: {
      spreadMaxPips: 3.0,
      newsRestriction: 'Strictly dedicated to high-impact post-news volatility (no initial candle trade)',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Attempting entry on the first news candle (Strict Prohibition)',
        'Price breaks beyond extreme news spike wick',
        'Spread remains elevated (> 3.0 pips) after 30 minutes',
        'No M1 BOS confirmed within 45 minutes of release'
      ],
      action: 'Mark INVALIDATED and clear setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 120,
      condition: 'Setup expires 2 hours after news release'
    },
    evidence_model: {
      requiredFields: ['newsTitle', 'newsImpact', 'spreadPips', 'preNewsLevel', 'spikeExtremePrice', 'rejectionRatio', 'bosPrice', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'News evidence capturing event impact, spread width, spike coordinates, rejection wick ratio, and M1 BOS confirmation'
    }
  },

  'strategy-5-smc-sd-confluence': {
    strategy_id: 'strategy-5-smc-sd-confluence',
    name: 'STRATEGI 5 — SMC-SD Pattern Confluence',
    version: '1.0.0',
    status: 'UNDEFINED / SAME RULESET AS PRD',
    description: 'Confluence hybrid model combining SMC order blocks/FVGs, Supply & Demand zones, and Fibonacci Optimal Trade Entry (OTE 0.618-0.786). Explicitly marked as UNDEFINED / SAME RULESET AS PRD to indicate multi-strategy confluence derivation.',
    timeframe: {
      htf: 'H1',
      ltf: 'M15',
      execution: 'M15'
    },
    session_requirement: {
      allowedSessions: ['London', 'New York', 'London/NY Overlap'],
      description: 'Major liquidity trading sessions'
    },
    setup_sequence: [
      {
        step_id: 'H1_M15_STRUCTURE',
        step_order: 1,
        rule_id: 'rule_h1_m15_structure',
        name: 'Struktur H1 & M15 Alignment',
        description: 'Alignment hirarki struktur pasar antara timeframe H1 dan M15',
        invalidation: 'Struktur pasar H1 dan M15 saling bertolak belakang tanpa bias',
        defaultExpiryMinutes: 240
      },
      {
        step_id: 'SD_FIB_OVERLAP',
        step_order: 2,
        rule_id: 'rule_sd_fib_overlap',
        name: 'Overlap Zona S&D & Fib OTE',
        description: 'Validasi minimal 2 dari 3 overlap (Zona Supply/Demand, FVG/OB, Fibonacci OTE 0.618-0.786)',
        invalidation: 'Harga tidak berada di zona tumpang tindih konfluen',
        defaultExpiryMinutes: 180
      },
      {
        step_id: 'CONFLUENCE_SWEEP',
        step_order: 3,
        rule_id: 'rule_confluence_sweep',
        name: 'Confluence Level Sweep',
        description: 'Sweep likuiditas yang terjadi tepat pada level konfluen tinggi',
        invalidation: 'Level tertembus keras tanpa reaksi sweep likuiditas',
        defaultExpiryMinutes: 120
      },
      {
        step_id: 'REJECTION_TRIGGER',
        step_order: 4,
        rule_id: 'rule_rejection_trigger',
        name: 'Trigger Rejection Candle',
        description: 'Konfirmasi candlestick Rejection atau CHoCH pembalikan pada LTF',
        invalidation: 'Tidak ada candle penolakan dalam batas toleransi',
        defaultExpiryMinutes: 60
      },
      {
        step_id: 'MIN_RR_CALC',
        step_order: 5,
        rule_id: 'rule_min_rr_calc',
        name: 'Kalkulasi Risiko (Min 1:2+ R:R)',
        description: 'Pemeriksaan rasio Risk:Reward minimal 1:2 dengan buffer ATR yang ketat',
        invalidation: 'Target profit tidak memungkinkan rasio 1:2',
        defaultExpiryMinutes: 45
      },
      {
        step_id: 'AI_GATE',
        step_order: 6,
        rule_id: 'rule_ai_gate',
        name: 'AI Confluence Gate',
        description: 'Verifikasi konfluen AI Gemini & Quality Gate multivariat',
        invalidation: 'AI menolak setup karena skor konfluen tidak mencapai ambang batas',
        defaultExpiryMinutes: 30
      }
    ],
    rule_definition: [
      {
        rule_id: 'rule_h1_m15_structure',
        name: 'Multi-Timeframe Structure Harmony',
        mandatory: true,
        timeframe: 'H1/M15',
        description: 'Struktur H1 dan M15 berada dalam bias tren yang harmonis',
        evaluation_logic: 'H1 trend direction == M15 structure bias',
        invalidation_condition: 'Conflicting timeframes'
      },
      {
        rule_id: 'rule_sd_fib_overlap',
        name: '2-of-3 Confluence Overlap Zone',
        mandatory: true,
        timeframe: 'M15',
        description: 'Minimal 2 overlap dari: (1) S&D Zone, (2) OB/FVG, (3) Fibonacci OTE 0.618-0.786',
        evaluation_logic: 'overlapCount >= 2',
        invalidation_condition: 'Less than 2 confluence factors present'
      },
      {
        rule_id: 'rule_confluence_sweep',
        name: 'Confluence Level Liquidity Sweep',
        mandatory: true,
        timeframe: 'M15',
        description: 'Pengambilan likuiditas pada batas zona konfluen',
        evaluation_logic: 'Liquidity sweep confirmed at overlap zone boundary',
        invalidation_condition: 'Zone completely invalidated'
      },
      {
        rule_id: 'rule_rejection_trigger',
        name: 'M15 Momentum Rejection Trigger',
        mandatory: true,
        timeframe: 'M15',
        description: 'Candle konfirmasi penolakan momentum',
        evaluation_logic: 'Rejection wick or displacement candle in confluence zone',
        invalidation_condition: 'No rejection trigger'
      },
      {
        rule_id: 'rule_min_rr_calc',
        name: 'Institutional R:R Gate (Min 1:2.0)',
        mandatory: true,
        timeframe: 'M15',
        description: 'Kalkulasi SL di luar zona konfluen + 0.5x ATR, TP minimum 1:2.0',
        evaluation_logic: 'Calculated TP >= 2.0 * SL distance',
        invalidation_condition: 'R:R < 1:2.0'
      },
      {
        rule_id: 'rule_ai_gate',
        name: 'Gemini AI Confluence Review',
        mandatory: true,
        timeframe: 'M15',
        description: 'AI Gate multivariat verification',
        evaluation_logic: 'AI Decision == "APPROVED"',
        invalidation_condition: 'AI Decision == "REJECTED"'
      }
    ],
    entry_rule: {
      type: 'LIMIT',
      trigger: 'Touch of the overlapping confluence node (S&D + Fib 0.618-0.786 + FVG)',
      description: 'Limit order at the confluence epicenter'
    },
    sl_rule: {
      bufferFormula: '0.5 * ATR(14)',
      anchor: 'Confluence zone structural boundary',
      description: 'SL placed 0.5x ATR beyond the outer confluence margin'
    },
    tp_rule: {
      tp1: '1:2.0 Risk-Reward (Equilibrium Target)',
      tp2: '1:3.0 Risk-Reward (Major Confluence Extreme)',
      minRR: 2.0,
      description: 'Target 1:2.0 to 1:3.0 R:R'
    },
    filter: {
      spreadMaxPips: 2.5,
      newsRestriction: 'No news within 15 minutes',
      sessionFilter: false
    },
    invalidation_rule: {
      conditions: [
        'Confluence overlap invalidated by full candle penetration',
        'H1 structure fails to hold',
        'Fewer than 2 confluence elements valid'
      ],
      action: 'Mark INVALIDATED and clear setup lock'
    },
    expiry_rule: {
      maxDurationMinutes: 240,
      condition: 'Expires after 4 hours without execution'
    },
    evidence_model: {
      requiredFields: ['trend', 'zoneUpper', 'zoneLower', 'fibLevel', 'overlapCount', 'entryPrice', 'slPrice', 'tp1Price'],
      description: 'Multi-confluence evidence documenting overlapping factor counts, Fibonacci levels, and calculated risk ratios'
    }
  }
};

export function getStrategyManifest(strategyId: string): StrategySpecification {
  return STRATEGY_MANIFESTS[strategyId] || STRATEGY_MANIFESTS['strategy-1-smc'];
}

export function getAllStrategyManifests(): StrategySpecification[] {
  return Object.values(STRATEGY_MANIFESTS);
}
