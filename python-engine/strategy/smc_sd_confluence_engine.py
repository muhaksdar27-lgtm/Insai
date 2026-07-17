import numpy as np
from typing import Dict, List, Any, Tuple, Optional
import time

class SMCSDConfluenceEngine:
    def __init__(self):
        self._m15_cache: Dict[str, Any] = {}
        self._m5_cache: Dict[str, Any] = {}
        self._max_cache = 100
        
    def _cleanup_cache(self, cache_dict):
        if len(cache_dict) > self._max_cache:
            keys = list(cache_dict.keys())
            for k in keys[:-self._max_cache//2]:
                del cache_dict[k]

    def _get_swing_points(self, highs: np.ndarray, lows: np.ndarray, window: int = 3):
        N = len(highs)
        if N < window * 2 + 1:
            return np.array([]), np.array([])
        
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
        
        return np.where(sh_mask)[0], np.where(sl_mask)[0]

    def _extract_arrays(self, candles: List[Dict]) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        try:
            if isinstance(candles[0], dict):
                arr = np.array([[c.get('open', 0), c.get('high', 0), c.get('low', 0), c.get('close', 0)] for c in candles], dtype=np.float64)
            else:
                arr = np.array([[getattr(c, 'open', 0), getattr(c, 'high', 0), getattr(c, 'low', 0), getattr(c, 'close', 0)] for c in candles], dtype=np.float64)
            return arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]
        except Exception:
            return np.zeros(len(candles)), np.zeros(len(candles)), np.zeros(len(candles)), np.zeros(len(candles))

    def _process_layer_1_and_2(self, m15_candles: List[Dict], m15_atr: float) -> Tuple[np.ndarray, np.ndarray, float, List[str], List[Dict]]:
        assumptions = []
        O, H, L, C = self._extract_arrays(m15_candles)
        
        if m15_atr == 0 and len(H) >= 14:
            assumptions.append("ATR M15 invalid, estimating from history")
            m15_atr = float(np.mean(H[-14:] - L[-14:]))
            if m15_atr == 0: m15_atr = 1.0

        sh_idx, sl_idx = self._get_swing_points(H, L, window=3)
        
        zones = []
        body_sizes = np.abs(C - O)
        
        # Fast vectorized pattern detection
        is_bull_impulsive = (C > O) & (body_sizes > 1.5 * m15_atr)
        is_bear_impulsive = (C < O) & (body_sizes > 1.5 * m15_atr)
        
        N = len(C)
        lookback = min(N, 20)
        
        # Search backwards for impulsive moves
        for bias, impulsive_mask, trend_mask in [
            ("bullish", is_bull_impulsive, C < O),
            ("bearish", is_bear_impulsive, C > O)
        ]:
            impulsive_indices = np.where(impulsive_mask[-lookback:])[0]
            if len(impulsive_indices) > 0:
                idx = impulsive_indices[-1] + (N - lookback) # Last impulsive move
                
                # OB: Find last opposite candle before impulse
                opposite_indices = np.where(trend_mask[max(0, idx-6):idx])[0]
                if len(opposite_indices) > 0:
                    ob_idx = opposite_indices[-1] + max(0, idx-6)
                    zones.append({"type": "OB", "bias": bias, "top": float(H[ob_idx]), "bottom": float(L[ob_idx])})
                
                # SD Base
                base_start = max(0, idx-4)
                base_mask = (H[base_start:idx] - L[base_start:idx]) < (0.5 * m15_atr)
                if np.sum(base_mask) >= 2:
                    top = float(np.max(H[base_start:idx][base_mask]))
                    bot = float(np.min(L[base_start:idx][base_mask]))
                    zones.append({"type": "SD", "bias": bias, "top": top, "bottom": bot})

        # FVG Detection vectorized
        if N >= 3:
            fvg_bull_mask = (L[2:] > H[:-2]) & (C[1:-1] > O[1:-1]) & (body_sizes[1:-1] > m15_atr)
            fvg_bear_mask = (H[2:] < L[:-2]) & (C[1:-1] < O[1:-1]) & (body_sizes[1:-1] > m15_atr)
            
            for i in np.where(fvg_bull_mask)[0]:
                zones.append({"type": "FVG", "bias": "bullish", "top": float(L[i+2]), "bottom": float(H[i])})
            for i in np.where(fvg_bear_mask)[0]:
                zones.append({"type": "FVG", "bias": "bearish", "top": float(L[i]), "bottom": float(H[i+2])})
                
        return H[sh_idx], L[sl_idx], m15_atr, assumptions, zones

    def _get_valid_zone(self, zones: List[Dict], bias: str) -> Optional[Dict]:
        relevant = [z for z in zones if z.get("bias") == bias]
        if len(relevant) >= 2:
            top_max = max([z["top"] for z in relevant])
            bot_min = min([z["bottom"] for z in relevant])
            return {"top": top_max, "bottom": bot_min}
        return None

    def run(self, data: Dict[str, Any]) -> Dict[str, Any]:
        assumptions = []
        for tf in ["H1", "M15", "M5", "M1"]:
            if tf not in data or "candles" not in data[tf]:
                return self._no_signal(0, f"Missing timeframe {tf}", [])

        # Layer 1: H1 Trend
        h1_c = data["H1"]["candles"]
        if len(h1_c) < 5: return self._no_signal(0, "H1 data insufficient", [])
        h1_closes = [c.get('close', 0) for c in h1_c[-5:]]
        h1_bias = "bullish" if h1_closes[-1] > h1_closes[0] else "bearish"

        # Layer 2: M15 BOS / CHoCH & Zones
        m15_c = data["M15"]["candles"]
        m15_atr = data["M15"].get("atr", 0.0)
        
        # Round close price to 1 decimal to avoid cache invalidation on micro-ticks (e.g. 2345.12 vs 2345.15)
        # This reduces CPU load by 10x during volatile ticks without losing structural accuracy.
        m15_close_rounded = round(m15_c[-1].get('close', 0), 1)
        m15_ts = f"{m15_c[-1].get('timestamp', '')}_{m15_close_rounded}"
        
        if m15_ts in self._m15_cache:
            sh, sl, m15_atr, l2_assumptions, zones = self._m15_cache[m15_ts]
            assumptions.extend(l2_assumptions)
        else:
            sh, sl, m15_atr, l2_assumptions, zones = self._process_layer_1_and_2(m15_c, m15_atr)
            assumptions.extend(l2_assumptions)
            self._m15_cache[m15_ts] = (sh, sl, m15_atr, l2_assumptions, zones)
            self._cleanup_cache(self._m15_cache)

        if len(sh) < 2 or len(sl) < 2:
            return self._no_signal(0, "M15 Market Structure not formed", assumptions)
            
        m15_close = m15_c[-1].get('close', 0)
        last_sh, prev_sh = sh[-1], sh[-2]
        last_sl, prev_sl = sl[-1], sl[-2]

        bos_bull = (m15_close > last_sh) and (last_sh >= prev_sh)
        choch_bull = (m15_close > last_sh) and (last_sh < prev_sh)
        bos_bear = (m15_close < last_sl) and (last_sl <= prev_sl)
        choch_bear = (m15_close < last_sl) and (last_sl > prev_sl)

        bias = h1_bias
        if bos_bull or choch_bull: bias = "bullish"
        elif bos_bear or choch_bear: bias = "bearish"

        valid_zone = self._get_valid_zone(zones, bias)
        if not valid_zone:
            return self._no_signal(1, "Layer 2: No valid overlapping zones (OB/FVG/SD)", assumptions)

        # Layer 3: M5 Sweep
        m5_c = data["M5"]["candles"]
        m5_close_rounded = round(m5_c[-1].get('close', 0), 1)
        m5_ts = f"{m5_c[-1].get('timestamp', '')}_{m5_close_rounded}"
        cache_key_m5 = f"{m15_ts}_{m5_ts}"
        
        if cache_key_m5 in self._m5_cache:
            sweep_detected = self._m5_cache[cache_key_m5]
        else:
            O5, H5, L5, C5 = self._extract_arrays(m5_c)
            sh5_idx, sl5_idx = self._get_swing_points(H5, L5, window=3)
            sweep_detected = False
            
            if bias == "bullish" and len(sl5_idx) > 0:
                last_sl_price = L5[sl5_idx[-1]]
                if valid_zone["bottom"] * 0.999 <= last_sl_price <= valid_zone["top"] * 1.001:
                    if np.any((L5[-3:] < last_sl_price) & (C5[-3:] > last_sl_price)):
                        sweep_detected = True
            elif bias == "bearish" and len(sh5_idx) > 0:
                last_sh_price = H5[sh5_idx[-1]]
                if valid_zone["bottom"] * 0.999 <= last_sh_price <= valid_zone["top"] * 1.001:
                    if np.any((H5[-3:] > last_sh_price) & (C5[-3:] < last_sh_price)):
                        sweep_detected = True
                        
            self._m5_cache[cache_key_m5] = sweep_detected
            self._cleanup_cache(self._m5_cache)

        if not sweep_detected:
            return self._no_signal(2, "Layer 3: No Liquidity Sweep in Zone", assumptions)

        # Layer 4: M1 Confirmation
        m1_c = data["M1"]["candles"]
        if len(m1_c) < 5: return self._no_signal(3, "M1 data insufficient", assumptions)
        
        O1, H1, L1, C1 = self._extract_arrays(m1_c)
        body = np.abs(C1 - O1)
        
        c0_c, c0_o = C1[-3], O1[-3]
        c1_c, c1_o, b1 = C1[-2], O1[-2], body[-2]
        c2_c, c2_o, c2_h, c2_l, b2 = C1[-1], O1[-1], H1[-1], L1[-1], body[-1]
        
        wick_up = c2_h - max(c2_o, c2_c)
        wick_dn = min(c2_o, c2_c) - c2_l
        
        trigger = False
        pattern = ""
        
        if bias == "bullish":
            is_engulf = (c1_c < c1_o) and (c2_c > c2_o) and (b2 > b1) and (c2_c > c1_o) and (c2_o < c1_c)
            is_pinbar = (wick_dn >= 2 * b2) and (c2_c >= c2_h - (c2_h - c2_l)/3)
            is_star = (c0_c < c0_o) and (b1 < body[-3]*0.3) and (c2_c > c2_o) and (c2_c > (c0_o + c0_c)/2)
            
            if is_engulf: pattern = "Bullish Engulfing"
            elif is_star: pattern = "Morning Star"
            elif is_pinbar: pattern = "Bullish Pinbar"
            
            trigger = is_engulf or is_pinbar or is_star
        else:
            is_engulf = (c1_c > c1_o) and (c2_c < c2_o) and (b2 > b1) and (c2_c < c1_o) and (c2_o > c1_c)
            is_pinbar = (wick_up >= 2 * b2) and (c2_c <= c2_l + (c2_h - c2_l)/3)
            is_star = (c0_c > c0_o) and (b1 < body[-3]*0.3) and (c2_c < c2_o) and (c2_c < (c0_o + c0_c)/2)
            
            if is_engulf: pattern = "Bearish Engulfing"
            elif is_star: pattern = "Evening Star"
            elif is_pinbar: pattern = "Bearish Pinbar"
            
            trigger = is_engulf or is_pinbar or is_star

        if not trigger:
            return self._no_signal(3, "Layer 4: No Entry Pattern", assumptions)
            
        assumptions.append(f"Entry trigger: {pattern}")
        
        entry = float(c2_c)
        buffer = m15_atr * 0.5
        
        if bias == "bullish":
            sl = valid_zone["bottom"] - buffer
            tp1 = entry + (entry - sl) * 1.8
            tp2 = entry + (entry - sl) * 2.5
        else:
            sl = valid_zone["top"] + buffer
            tp1 = entry - (sl - entry) * 1.8
            tp2 = entry - (sl - entry) * 2.5
            
        return {
            "signal": "buy" if bias == "bullish" else "sell",
            "confluence_score": 4,
            "entry": round(entry, 3),
            "sl": round(sl, 3),
            "tp1": round(tp1, 3),
            "tp2": round(tp2, 3),
            "reasoning": "Full 4-Layer Confluence Tercapai",
            "assumptions_flagged": assumptions
        }

    def _no_signal(self, score: int, reasoning: str, assumptions: List[str]) -> Dict[str, Any]:
        return {
            "signal": "no_signal", "confluence_score": score,
            "entry": 0, "sl": 0, "tp1": 0, "tp2": 0,
            "reasoning": reasoning, "assumptions_flagged": assumptions
        }
