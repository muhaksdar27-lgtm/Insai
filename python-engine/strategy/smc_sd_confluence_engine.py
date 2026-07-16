import numpy as np
from typing import Dict, List, Any, Tuple, Optional
import time

class SMCSDConfluenceEngine:
    def __init__(self):
        # Hierarchical Caching to support incremental updates
        self._m15_cache: Dict[str, Any] = {}
        self._m5_cache: Dict[str, Any] = {}
        
        # Max entries
        self._max_cache = 100
        
    def _cleanup_cache(self, cache_dict):
        if len(cache_dict) > self._max_cache:
            # Remove oldest half
            keys = list(cache_dict.keys())
            for k in keys[:-self._max_cache//2]:
                del cache_dict[k]

    def _get_swing_highs_lows(self, highs: np.ndarray, lows: np.ndarray, window: int = 3):
        # Optimized swing points detection using strides and argrelextrema logic
        # For small arrays (e.g. 100 candles), basic array slicing is very fast.
        N = len(highs)
        if N < window * 2 + 1:
            return [], []
            
        sh_mask = np.ones(N, dtype=bool)
        sl_mask = np.ones(N, dtype=bool)
        
        for w in range(1, window + 1):
            sh_mask[w:] &= (highs[w:] > highs[:-w])
            sh_mask[:-w] &= (highs[:-w] >= highs[w:])
            sl_mask[w:] &= (lows[w:] < lows[:-w])
            sl_mask[:-w] &= (lows[:-w] <= lows[w:])
            
        sh_mask[:window] = False
        sh_mask[-window:] = False
        sl_mask[:window] = False
        sl_mask[-window:] = False
        
        sh_idx = np.where(sh_mask)[0]
        sl_idx = np.where(sl_mask)[0]
        
        sh = [{'index': int(i), 'price': float(highs[i])} for i in sh_idx]
        sl = [{'index': int(i), 'price': float(lows[i])} for i in sl_idx]
        return sh, sl

    def _process_layer_1_and_2_cache(self, m15_candles: List[Dict], m15_atr: float) -> Tuple[List, List, float, List[str], List[Dict]]:
        assumptions = []
        m15_arr = np.array([(c.get("open", 0), c.get("high", 0), c.get("low", 0), c.get("close", 0)) for c in m15_candles], dtype=np.float64)
        m15_opens, m15_highs, m15_lows, m15_closes = m15_arr.T
        
        if m15_atr == 0:
            assumptions.append("ATR M15 tidak valid, menggunakan estimasi")
            m15_atr = float(np.mean(m15_highs[-14:] - m15_lows[-14:])) if len(m15_highs) >= 14 else 1.0
            
        sh, sl = self._get_swing_highs_lows(m15_highs, m15_lows, window=3)
        
        zones = []
        body_sizes = np.abs(m15_closes - m15_opens)
        
        is_bull_impulsive = (m15_closes > m15_opens) & (body_sizes > 1.5 * m15_atr)
        is_bear_impulsive = (m15_closes < m15_opens) & (body_sizes > 1.5 * m15_atr)
        
        for bias_type in ["bullish", "bearish"]:
            impulsive_idx = -1
            for i in range(len(m15_candles)-15, len(m15_candles)):
                if (bias_type == "bullish" and is_bull_impulsive[i]) or (bias_type == "bearish" and is_bear_impulsive[i]):
                    impulsive_idx = i
                    break
                    
            if impulsive_idx != -1:
                for i in range(impulsive_idx-1, max(0, impulsive_idx-6), -1):
                    if (bias_type == "bullish" and m15_closes[i] < m15_opens[i]) or (bias_type == "bearish" and m15_closes[i] > m15_opens[i]):
                        zones.append({"type": "OB", "bias": bias_type, "top": m15_highs[i], "bottom": m15_lows[i]})
                        break
                
                base_mask = (m15_highs[max(0, impulsive_idx-4):impulsive_idx] - m15_lows[max(0, impulsive_idx-4):impulsive_idx]) < (0.5 * m15_atr)
                if np.sum(base_mask) >= 2:
                    idx_slice = slice(max(0, impulsive_idx-4), impulsive_idx)
                    top = float(np.max(m15_highs[idx_slice][base_mask]))
                    bot = float(np.min(m15_lows[idx_slice][base_mask]))
                    zones.append({"type": "SD", "bias": bias_type, "top": top, "bottom": bot})
                    
            for i in range(len(m15_candles)-15, len(m15_candles)-1):
                if i < 1: continue
                if bias_type == "bullish" and m15_lows[i+1] > m15_highs[i-1]:
                    if np.all(m15_lows[i+1:] >= m15_highs[i-1]):
                        zones.append({"type": "FVG", "bias": bias_type, "top": float(m15_lows[i+1]), "bottom": float(m15_highs[i-1])})
                elif bias_type == "bearish" and m15_highs[i+1] < m15_lows[i-1]:
                    if np.all(m15_highs[i+1:] <= m15_lows[i-1]):
                        zones.append({"type": "FVG", "bias": bias_type, "top": float(m15_lows[i-1]), "bottom": float(m15_highs[i+1])})
                        
        return sh, sl, m15_atr, assumptions, zones

    def _get_valid_zone(self, zones: List[Dict], bias: str) -> Optional[Dict]:
        relevant_zones = [z for z in zones if z.get("bias") == bias]
        if len(relevant_zones) >= 2:
            for i in range(len(relevant_zones)):
                for j in range(i+1, len(relevant_zones)):
                    z1, z2 = relevant_zones[i], relevant_zones[j]
                    overlap_top = min(z1["top"], z2["top"])
                    overlap_bot = max(z1["bottom"], z2["bottom"])
                    max_range = max(z1["top"] - z1["bottom"], z2["top"] - z2["bottom"])
                    
                    if (overlap_top - overlap_bot) > -0.2 * max_range:
                        return {"top": max(z1["top"], z2["top"]), "bottom": min(z1["bottom"], z2["bottom"])}
        return None

    def run(self, data: Dict[str, Any]) -> Dict[str, Any]:
        assumptions = []
        
        required_tfs = ["H1", "M15", "M5", "M1"]
        for tf in required_tfs:
            if tf not in data or "candles" not in data[tf]:
                return self._no_signal(0, f"Layer 1 Gagal: Missing {tf} data", assumptions)
        
        m15_candles = data["M15"]["candles"]
        if len(m15_candles) < 30:
            return self._no_signal(0, "Layer 1 Gagal: Butuh minimal 30 candle M15", assumptions)
            
        m15_close = float(m15_candles[-1].get('close', 0))
        m15_ts = f"{m15_candles[-1].get('timestamp', '')}"
        
        # INCREMENTAL UPDATE: Cache Layer 1 & 2 (M15)
        # We only fully recompute zones once per M15 candle. Live bias checks are extremely fast.
        if m15_ts in self._m15_cache:
            sh, sl, m15_atr, m15_assump, zones = self._m15_cache[m15_ts]
            assumptions.extend(m15_assump)
        else:
            sh, sl, m15_atr, m15_assump, zones = self._process_layer_1_and_2_cache(m15_candles, data["M15"].get("atr", 0))
            self._m15_cache[m15_ts] = (sh, sl, m15_atr, m15_assump, zones)
            self._cleanup_cache(self._m15_cache)
            assumptions.extend(m15_assump)
            
        # Fast LIVE Bias Evaluation
        bias = "neutral"
        if len(sh) >= 2 and len(sl) >= 2:
            last_sh, prev_sh = sh[-1]['price'], sh[-2]['price']
            last_sl, prev_sl = sl[-1]['price'], sl[-2]['price']
            
            bos_bull = (m15_close > last_sh) and (last_sh >= prev_sh)
            bos_bear = (m15_close < last_sl) and (last_sl <= prev_sl)
            choch_bull = (m15_close > last_sh) and (last_sh < prev_sh)
            choch_bear = (m15_close < last_sl) and (last_sl > prev_sl)
            
            if bos_bull or choch_bull: bias = "bullish"
            elif bos_bear or choch_bear: bias = "bearish"
            
        if bias == "neutral":
            return self._no_signal(0, "Layer 1 Gagal: Bias market neutral", assumptions)
            
        valid_zone = self._get_valid_zone(zones, bias)
        if not valid_zone:
            return self._no_signal(1, "Layer 2 Gagal: Tidak ada valid zone confluence (min 2 OB/FVG/SD overlap)", assumptions)
            
        # LAYER 3: Sweep Confirmation (M5)
        m5_candles = data["M5"]["candles"]
        if len(m5_candles) < 10:
             return self._no_signal(2, "Layer 3 Gagal: Candle M5 tidak cukup", assumptions)
             
        m5_close = m5_candles[-1].get('close', 0)
        m5_ts = f"{m5_candles[-1].get('timestamp', '')}_{round(float(m5_close), 1)}"
        cache_key_m5 = f"{m15_ts}_{m5_ts}"
        
        # INCREMENTAL UPDATE: Cache Layer 3 (M5)
        if cache_key_m5 in self._m5_cache:
            sweep_detected = self._m5_cache[cache_key_m5]
        else:
            m5_arr = np.array([(c["high"], c["low"], c["close"]) for c in m5_candles], dtype=np.float64)
            m5_highs, m5_lows, m5_closes = m5_arr.T
            sweep_detected = False
            m5_sh, m5_sl = self._get_swing_highs_lows(m5_highs, m5_lows, window=3)
            
            if bias == "bullish" and len(m5_sl) > 0:
                last_sl_price = m5_sl[-1]['price']
                if valid_zone["bottom"] * 0.999 <= last_sl_price <= valid_zone["top"] * 1.001:
                    recent_lows = m5_lows[-3:]
                    recent_closes = m5_closes[-3:]
                    if np.any((recent_lows < last_sl_price) & (recent_closes > last_sl_price)):
                        sweep_detected = True
            elif bias == "bearish" and len(m5_sh) > 0:
                last_sh_price = m5_sh[-1]['price']
                if valid_zone["bottom"] * 0.999 <= last_sh_price <= valid_zone["top"] * 1.001:
                    recent_highs = m5_highs[-3:]
                    recent_closes = m5_closes[-3:]
                    if np.any((recent_highs > last_sh_price) & (recent_closes < last_sh_price)):
                        sweep_detected = True
                        
            self._m5_cache[cache_key_m5] = sweep_detected
            self._cleanup_cache(self._m5_cache)
            
        if not sweep_detected:
            return self._no_signal(2, "Layer 3 Gagal: Tidak ada Liquidity Sweep ke area zone", assumptions)
            
        # LAYER 4: Entry Trigger (M1)
        m1_candles = data["M1"]["candles"]
        if len(m1_candles) < 5:
            return self._no_signal(3, "Layer 4 Gagal: Candle M1 tidak cukup", assumptions)
        
        c0, c1, c2 = m1_candles[-3], m1_candles[-2], m1_candles[-1]
        body0 = abs(c0["close"] - c0["open"])
        body1 = abs(c1["close"] - c1["open"])
        body2 = abs(c2["close"] - c2["open"])
        wick_up2 = c2["high"] - max(c2["open"], c2["close"])
        wick_dn2 = min(c2["open"], c2["close"]) - c2["low"]
        
        trigger = False
        pattern_name = ""
        
        # Double bottom / top detection using last 20 M1 candles
        recent_lows = [c["low"] for c in m1_candles[-20:]]
        recent_highs = [c["high"] for c in m1_candles[-20:]]
        min_low = min(recent_lows[:-2]) if len(recent_lows) > 2 else c2["low"]
        max_high = max(recent_highs[:-2]) if len(recent_highs) > 2 else c2["high"]
        
        if bias == "bullish":
            is_engulf = (c1["close"] < c1["open"]) and (c2["close"] > c2["open"]) and (body2 > body1) and (c2["close"] > c1["open"]) and (c2["open"] < c1["close"])
            is_pinbar = (wick_dn2 >= 2 * body2) and (c2["close"] >= c2["high"] - ((c2["high"] - c2["low"]) / 3))
            is_morning_star = (c0["close"] < c0["open"]) and (body1 < body0 * 0.3) and (c2["close"] > c2["open"]) and (c2["close"] > (c0["open"] + c0["close"])/2)
            is_double_bottom = abs(c2["low"] - min_low) / (min_low + 1e-9) < 0.0005 and is_pinbar
            
            if is_engulf: pattern_name = "Bullish Engulfing"
            elif is_morning_star: pattern_name = "Morning Star"
            elif is_double_bottom: pattern_name = "Double Bottom + Pinbar"
            elif is_pinbar: pattern_name = "Bullish Pinbar"
            
            trigger = is_engulf or is_pinbar or is_morning_star or is_double_bottom
        else:
            is_engulf = (c1["close"] > c1["open"]) and (c2["close"] < c2["open"]) and (body2 > body1) and (c2["close"] < c1["open"]) and (c2["open"] > c1["close"])
            is_pinbar = (wick_up2 >= 2 * body2) and (c2["close"] <= c2["low"] + ((c2["high"] - c2["low"]) / 3))
            is_evening_star = (c0["close"] > c0["open"]) and (body1 < body0 * 0.3) and (c2["close"] < c2["open"]) and (c2["close"] < (c0["open"] + c0["close"])/2)
            is_double_top = abs(c2["high"] - max_high) / (max_high + 1e-9) < 0.0005 and is_pinbar
            
            if is_engulf: pattern_name = "Bearish Engulfing"
            elif is_evening_star: pattern_name = "Evening Star"
            elif is_double_top: pattern_name = "Double Top + Pinbar"
            elif is_pinbar: pattern_name = "Bearish Pinbar"
            
            trigger = is_engulf or is_pinbar or is_evening_star or is_double_top
            
        if not trigger:
            return self._no_signal(3, "Layer 4 Gagal: Belum ada pattern konfirmasi (Engulf/Pinbar/Star/DB/DT)", assumptions)
        
        assumptions.append(f"Konfirmasi eksekusi: {pattern_name}")
            
        # RISK MANAGEMENT
        entry_price = c2["close"]
        buffer = m15_atr * 0.5
        
        if bias == "bullish":
            sl = valid_zone["bottom"] - buffer
            tp1_cands = [s['price'] for s in sh if s['price'] > entry_price]
            tp1 = min(tp1_cands) if tp1_cands else entry_price + (entry_price - sl) * 1.8
            tp2_cands = [s['price'] for s in sh if s['price'] > tp1]
            tp2 = min(tp2_cands) if tp2_cands else entry_price + (entry_price - sl) * 2.5
        else:
            sl = valid_zone["top"] + buffer
            tp1_cands = [s['price'] for s in sl if s['price'] < entry_price]
            tp1 = max(tp1_cands) if tp1_cands else entry_price - (sl - entry_price) * 1.8
            tp2_cands = [s['price'] for s in sl if s['price'] < tp1]
            tp2 = max(tp2_cands) if tp2_cands else entry_price - (sl - entry_price) * 2.5
            
        risk = abs(entry_price - sl)
        if risk == 0:
            return self._no_signal(4, "Risk Error: Risk 0", assumptions)
            
        rr1 = abs(tp1 - entry_price) / risk
        if rr1 < 0.8:
            return self._no_signal(4, f"Reject: Risk/Reward TP1 terlalu kecil ({rr1:.2f} < 0.8)", assumptions)
            
        if rr1 < 1.8:
             if bias == "bullish":
                 tp1 = max(tp1, entry_price + (risk * 1.8))
             else:
                 tp1 = min(tp1, entry_price - (risk * 1.8))
                 
        rr2 = abs(tp2 - entry_price) / risk
        if rr2 < 2.0:
             if bias == "bullish":
                 tp2 = max(tp2, entry_price + (risk * 2.0))
             else:
                 tp2 = min(tp2, entry_price - (risk * 2.0))
            
        return {
            "signal": "buy" if bias == "bullish" else "sell",
            "confluence_score": 4,
            "entry": round(entry_price, 3),
            "sl": round(sl, 3),
            "tp1": round(tp1, 3),
            "tp2": round(tp2, 3),
            "reasoning": "Full 4-Layer Confluence Tercapai",
            "assumptions_flagged": assumptions
        }

    def _no_signal(self, score: int, reasoning: str, assumptions: List[str]) -> Dict[str, Any]:
        return {
            "signal": "no_signal",
            "confluence_score": score,
            "entry": 0,
            "sl": 0,
            "tp1": 0,
            "tp2": 0,
            "reasoning": reasoning,
            "assumptions_flagged": assumptions
        }
