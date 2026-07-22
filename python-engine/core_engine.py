import numpy as np
from typing import Dict, Any, List, Tuple
from collections import OrderedDict
from shared_utilities import get_logger

logger = get_logger("CoreEngine")

class LRUCache:
    def __init__(self, capacity: int):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        self.cache[key] = value
        self.cache.move_to_end(key)
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)

class CoreEngine:
    """
    Highly Optimized Core Engine for Ultra-Low Latency.
    Implements incremental caching, precise market structure detection, 
    and robust low-quality setup filtering without EA features.
    """
    def __init__(self):
        self._cache = LRUCache(2048)
        self._historical_cache = LRUCache(1024)
        self._array_cache = LRUCache(1024)
        
    def _generate_cache_key(self, candles: List[Any], symbol: str = "UNKNOWN", timeframe: str = "UNKNOWN"):
        if not candles or len(candles) < 2:
            return None
        c1, c2 = candles[-2], candles[-1]
        try:
            if isinstance(c2, dict):
                return f"{symbol}_{timeframe}_{len(candles)}_{c2.get('timestamp', '')}_{c1.get('close',0)}_{c2.get('high',0)}_{c2.get('low',0)}_{c2.get('close',0)}"
            return f"{symbol}_{timeframe}_{len(candles)}_{getattr(c2, 'timestamp', '')}_{getattr(c1, 'close', 0)}_{getattr(c2, 'high', 0)}_{getattr(c2, 'low', 0)}_{getattr(c2, 'close', 0)}"
        except Exception:
            return None

    def _extract_arrays(self, candles: List[Any], symbol: str, timeframe: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        N = len(candles)
        if not candles:
            return np.zeros(N), np.zeros(N), np.zeros(N), np.zeros(N)
        
        try:
            prev_ts = candles[-2].get('timestamp', '') if isinstance(candles[-2], dict) else getattr(candles[-2], 'timestamp', '')
            start_ts = candles[0].get('timestamp', '') if isinstance(candles[0], dict) else getattr(candles[0], 'timestamp', '')
        except Exception:
            prev_ts, start_ts = "", ""
        
        full_key = f"{symbol}_{timeframe}_{N}_{start_ts}_{prev_ts}"
        cached = self._array_cache.get(full_key)
        is_dict = isinstance(candles[0], dict)
        
        if cached is not None:
            O, H, L, C = cached
            O = O.copy()
            H = H.copy()
            L = L.copy()
            C = C.copy()
            
            last_c = candles[-1]
            if is_dict:
                O[-1] = last_c.get('open', 0.0)
                H[-1] = last_c.get('high', 0.0)
                L[-1] = last_c.get('low', 0.0)
                C[-1] = last_c.get('close', 0.0)
            else:
                O[-1] = getattr(last_c, 'open', 0.0)
                H[-1] = getattr(last_c, 'high', 0.0)
                L[-1] = getattr(last_c, 'low', 0.0)
                C[-1] = getattr(last_c, 'close', 0.0)
                
            return O, H, L, C

        try:
            if is_dict:
                O = np.fromiter((c.get('open', 0.0) for c in candles), dtype=np.float64, count=N)
                H = np.fromiter((c.get('high', 0.0) for c in candles), dtype=np.float64, count=N)
                L = np.fromiter((c.get('low', 0.0) for c in candles), dtype=np.float64, count=N)
                C = np.fromiter((c.get('close', 0.0) for c in candles), dtype=np.float64, count=N)
            else:
                O = np.fromiter((getattr(c, 'open', 0.0) for c in candles), dtype=np.float64, count=N)
                H = np.fromiter((getattr(c, 'high', 0.0) for c in candles), dtype=np.float64, count=N)
                L = np.fromiter((getattr(c, 'low', 0.0) for c in candles), dtype=np.float64, count=N)
                C = np.fromiter((getattr(c, 'close', 0.0) for c in candles), dtype=np.float64, count=N)
            
            self._array_cache.put(full_key, (O.copy(), H.copy(), L.copy(), C.copy()))
            return O, H, L, C
        except Exception as e:
            logger.error(f"Failed to extract OHLC arrays: {e}")
            raise ValueError(f"Invalid candle data format: {e}")

    def _get_swing_points(self, H, L, window=3):
        # Fast vectorized swing point detection
        N = len(H)
        if N < window * 2 + 1:
            return np.array([]), np.array([])
            
        sh_mask = np.ones(N, dtype=bool)
        sl_mask = np.ones(N, dtype=bool)
        
        for w in range(1, window + 1):
            sh_mask[w:] &= (H[w:] > H[:-w])
            sh_mask[:-w] &= (H[:-w] >= H[w:])
            sl_mask[w:] &= (L[w:] < L[:-w])
            sl_mask[:-w] &= (L[:-w] <= L[w:])
            
        sh_mask[:window] = False
        sh_mask[-window:] = False
        sl_mask[:window] = False
        sl_mask[-window:] = False
        
        return np.where(sh_mask)[0], np.where(sl_mask)[0]

    def _process_historical(self, O, H, L, C):
        N = len(C)
        body_size = np.abs(C - O)
        is_green = C > O
        is_red = C < O
        
        avg_body = float(np.mean(body_size[-20:])) if N >= 20 else float(np.mean(body_size))
        if avg_body == 0: avg_body = 1.0
        
        C_20 = C[-20:]
        if len(C_20) > 1:
            returns = np.diff(C_20) / C_20[:-1]
            volatility = float(np.std(returns))
            ma_20 = float(np.mean(C_20))
            std_20 = float(np.std(C_20))
            x = np.arange(len(C_20))
            slope = float(np.sum((x - np.mean(x)) * (C_20 - np.mean(C_20))) / np.sum((x - np.mean(x))**2))
        else:
            volatility, ma_20, std_20, slope = 0.0, float(C[-1]), 0.0, 0.0

        if N >= 10:
            recent_H, recent_L = H[-10:], L[-10:]
            true_range = float(np.max(recent_H) - np.min(recent_L))
            avg_tr = float(np.mean(recent_H - recent_L))
            is_choppy = bool(true_range < (avg_tr * 2.5))
        else:
            avg_tr = 4.0
            is_choppy = False

        # Filter low probability setups strictly
        is_low_prob = bool(is_choppy or ((abs(slope) < (avg_body * 0.15)) and (volatility < 0.0002)))
        
        sh_indices, sl_indices = self._get_swing_points(H, L, window=3)
        
        return {
            "avg_body": avg_body,
            "atr": avg_tr,
            "volatility": volatility,
            "ma_20": ma_20,
            "std_20": std_20,
            "slope": slope,
            "is_low_prob": is_low_prob,
            "sh_indices": sh_indices,
            "sl_indices": sl_indices,
            "body_size": body_size,
            "is_green": is_green,
            "is_red": is_red
        }

    def analyze(self, candles: List[Any], provided_cache_key: str = None, symbol: str = None, timeframe: str = None) -> Dict[str, Any]:
        """Incremental Vectorized Analysis Pipeline"""
        cache_key = provided_cache_key or self._generate_cache_key(candles, symbol or 'UNKNOWN', timeframe or 'UNKNOWN')
        if cache_key:
            cached_result = self._cache.get(cache_key)
            if cached_result:
                return cached_result
            
        N = len(candles)
        if N < 30:
            raise ValueError("Insufficient data (need >= 30)")

        # Generate historical key based on the previous candle's timestamp to reuse history
        try:
            prev_ts = candles[-2].get('timestamp', '') if isinstance(candles[-2], dict) else getattr(candles[-2], 'timestamp', '')
            curr_ts = candles[-1].get('timestamp', '') if isinstance(candles[-1], dict) else getattr(candles[-1], 'timestamp', '')
        except Exception:
            prev_ts, curr_ts = "", ""
            
        hist_key = f"{symbol}_{timeframe}_{N}_{prev_ts}"
        
        O, H, L, C = self._extract_arrays(candles, symbol, timeframe)
        
        hist_data = self._historical_cache.get(hist_key)
        if not hist_data:
            hist_data = self._process_historical(O, H, L, C)
            self._historical_cache.put(hist_key, hist_data)
            
        avg_body = hist_data["avg_body"]
        is_low_prob = hist_data["is_low_prob"]
        sh_indices = hist_data["sh_indices"]
        sl_indices = hist_data["sl_indices"]

        body_size = np.abs(C - O)
        is_green = C > O
        is_red = C < O

        lookback = min(15, N)
        O_lb, H_lb, L_lb, C_lb = O[-lookback:], H[-lookback:], L[-lookback:], C[-lookback:]
        body_lb, grn_lb, red_lb = body_size[-lookback:], is_green[-lookback:], is_red[-lookback:]
        
        # Init result variables
        fvg_bull_active = False
        fvg_bear_active = False
        bullish_engulfing = False
        bearish_engulfing = False
        morning_star = False
        evening_star = False
        double_top = False
        double_bottom = False
        bos_bull = False
        bos_bear = False
        choch_bull = False
        choch_bear = False
        liq_sweep_bull = False
        liq_sweep_bear = False
        curr_ob_bull = False
        curr_ob_bear = False
        snd_bull = False
        snd_bear = False
        
        c_last = float(C[-1])
        
        if not is_low_prob:
            # FVG Detection
            if lookback >= 3:
                fvg_bull_mask = (L_lb[2:] > H_lb[:-2]) & grn_lb[1:-1] & (body_lb[1:-1] > avg_body * 0.8)
                fvg_bear_mask = (H_lb[2:] < L_lb[:-2]) & red_lb[1:-1] & (body_lb[1:-1] > avg_body * 0.8)
                
                # Check for active (unmitigated) FVG
                for i in np.where(fvg_bull_mask)[0]:
                    if not np.any(L_lb[i+2:] <= H_lb[i]):
                        fvg_bull_active = True
                        break
                for i in np.where(fvg_bear_mask)[0]:
                    if not np.any(H_lb[i+2:] >= L_lb[i]):
                        fvg_bear_active = True
                        break
            
            # Candlestick Patterns
            if lookback >= 3:
                # Engulfing (with robust body checks)
                bullish_engulfing = bool(red_lb[-2] and grn_lb[-1] and (C_lb[-1] > O_lb[-2]) and (O_lb[-1] <= C_lb[-2]) and body_lb[-1] > avg_body * 0.8)
                bearish_engulfing = bool(grn_lb[-2] and red_lb[-1] and (C_lb[-1] < O_lb[-2]) and (O_lb[-1] >= C_lb[-2]) and body_lb[-1] > avg_body * 0.8)
                
                # Stars
                morning_star = bool(red_lb[-3] and (body_lb[-2] < avg_body * 0.5) and grn_lb[-1] and (C_lb[-1] > (O_lb[-3] + C_lb[-3]) / 2))
                evening_star = bool(grn_lb[-3] and (body_lb[-2] < avg_body * 0.5) and red_lb[-1] and (C_lb[-1] < (O_lb[-3] + C_lb[-3]) / 2))
            
            # Market Structure based on swing points
            last_swing_high = float(H[sh_indices[-1]]) if len(sh_indices) > 0 else 0.0
            prev_swing_high = float(H[sh_indices[-2]]) if len(sh_indices) > 1 else last_swing_high
            last_swing_low = float(L[sl_indices[-1]]) if len(sl_indices) > 0 else 0.0
            prev_swing_low = float(L[sl_indices[-2]]) if len(sl_indices) > 1 else last_swing_low
            
            # BOS, ChoCh, Liquidity sweeps
            # Look at recent 5 candles compared to swing points
            if last_swing_high > 0 and prev_swing_high > 0:
                if np.any(C_lb[-5:] > last_swing_high):
                    if last_swing_high >= prev_swing_high:
                        bos_bull = True
                    else:
                        choch_bull = True
                elif np.any(H_lb[-5:] > last_swing_high) and np.any(C_lb[-5:] < last_swing_high):
                    liq_sweep_bear = True
                    
            if last_swing_low > 0 and prev_swing_low > 0:
                if np.any(C_lb[-5:] < last_swing_low):
                    if last_swing_low <= prev_swing_low:
                        bos_bear = True
                    else:
                        choch_bear = True
                elif np.any(L_lb[-5:] < last_swing_low) and np.any(C_lb[-5:] > last_swing_low):
                    liq_sweep_bull = True
            
            # Double Top / Double Bottom
            threshold = avg_body * 0.3
            if len(sh_indices) >= 2 and abs(last_swing_high - prev_swing_high) < threshold and is_red[-1]:
                double_top = True
            if len(sl_indices) >= 2 and abs(last_swing_low - prev_swing_low) < threshold and is_green[-1]:
                double_bottom = True

            # Optimized OB Detection (Look for unmitigated Order Blocks)
            # Find impulsive moves
            is_bull_impulsive = (is_green) & (body_size > avg_body * 1.5)
            is_bear_impulsive = (is_red) & (body_size > avg_body * 1.5)
            
            if lookback >= 10:
                search_start = max(0, N - 40)
                bull_impulse_idx = np.where(is_bull_impulsive[search_start:])[0]
                for idx in reversed(bull_impulse_idx + search_start):
                    # Look for the last bearish candle before the impulse
                    opp_idx = np.where(is_red[max(0, idx-8):idx])[0]
                    if len(opp_idx) > 0:
                        ob_idx = opp_idx[-1] + max(0, idx-8)
                        top, bot = float(H[ob_idx]), float(L[ob_idx])
                        # Mitigated if any subsequent candle went below the top of the OB
                        if idx + 1 < N - 1:
                            mitigated = np.any(L[idx+1:-1] <= top)
                        else:
                            mitigated = False
                        
                        if not mitigated and (bot * 0.998 <= c_last <= top * 1.002):
                            curr_ob_bull = True
                            break
                            
                bear_impulse_idx = np.where(is_bear_impulsive[search_start:])[0]
                for idx in reversed(bear_impulse_idx + search_start):
                    opp_idx = np.where(is_green[max(0, idx-8):idx])[0]
                    if len(opp_idx) > 0:
                        ob_idx = opp_idx[-1] + max(0, idx-8)
                        top, bot = float(H[ob_idx]), float(L[ob_idx])
                        if idx + 1 < N - 1:
                            mitigated = np.any(H[idx+1:-1] >= bot)
                        else:
                            mitigated = False
                            
                        if not mitigated and (bot * 0.998 <= c_last <= top * 1.002):
                            curr_ob_bear = True
                            break

            # Supply & Demand Base Detection
            if N >= 5:
                base_candles = body_size[-4:-1]
                if np.mean(base_candles) < avg_body * 0.8 and body_size[-1] > avg_body * 1.5:
                    if is_green[-1]: snd_bull = True
                    if is_red[-1]: snd_bear = True

        result = {
            "fvg_bull_active": fvg_bull_active,
            "fvg_bear_active": fvg_bear_active,
            "bullish_engulfing": bullish_engulfing,
            "bearish_engulfing": bearish_engulfing,
            "morning_star": morning_star,
            "evening_star": evening_star,
            "double_top": double_top,
            "double_bottom": double_bottom,
            "bos_bull": bos_bull,
            "bos_bear": bos_bear,
            "choch_bull": choch_bull,
            "choch_bear": choch_bear,
            "liq_sweep_bull": liq_sweep_bull,
            "liq_sweep_bear": liq_sweep_bear,
            "ob_bull": curr_ob_bull,
            "ob_bear": curr_ob_bear,
            "snd_bull": snd_bull,
            "snd_bear": snd_bear,
            "volatility": hist_data["volatility"],
            "atr": hist_data.get("atr", 4.0),
            "ma_20": hist_data["ma_20"],
            "std_20": hist_data["std_20"],
            "trend_slope": hist_data["slope"],
            "is_low_prob": is_low_prob
        }
        
        if cache_key:
            self._cache.put(cache_key, result)
            
        return result
