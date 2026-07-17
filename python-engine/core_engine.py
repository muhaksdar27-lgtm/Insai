import numpy as np
from typing import Dict, Any, List
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
        self._cache = LRUCache(1024)
        
    def _generate_cache_key(self, candles: List[Any]):
        if not candles:
            return None
        # Use length and the last two candles to detect true changes (open, high, low, close)
        if len(candles) >= 2:
            c1, c2 = candles[-2], candles[-1]
            if isinstance(c2, dict):
                return hash((len(candles), c1.get('close',0), c2.get('high',0), c2.get('low',0), c2.get('close',0)))
            return hash((len(candles), getattr(c1, 'close', 0), getattr(c2, 'high', 0), getattr(c2, 'low', 0), getattr(c2, 'close', 0)))
        return None

    def analyze(self, candles: List[Any], provided_cache_key: str = None) -> Dict[str, Any]:
        """Vectorized Analysis Pipeline"""
        cache_key = provided_cache_key or self._generate_cache_key(candles)
        
        if cache_key:
            cached_result = self._cache.get(cache_key)
            if cached_result:
                return cached_result
            
        N = len(candles)
        if N < 30:
            raise ValueError("Insufficient data (need >= 30)")
            
        # Fast Extraction
        try:
            if isinstance(candles[0], dict):
                # Using direct key access for speed, fallback to get only if missing
                arr = np.array([[c.get('open',0), c.get('high',0), c.get('low',0), c.get('close',0), c.get('volume',0)] for c in candles], dtype=np.float64)
            elif hasattr(candles[0], 'model_dump'):
                arr = np.array([[c.open, c.high, c.low, c.close, c.volume] for c in candles], dtype=np.float64)
            else:
                arr = np.array([[getattr(c, 'open', 0), getattr(c, 'high', 0), getattr(c, 'low', 0), getattr(c, 'close', 0), getattr(c, 'volume', 0)] for c in candles], dtype=np.float64)
        except Exception:
            arr = np.zeros((N, 5), dtype=np.float64)

        O, H, L, C, V = arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3], arr[:, 4]
        
        body_size = np.abs(C - O)
        is_green = C > O
        is_red = C < O
        
        avg_body = float(np.mean(body_size[-20:])) if N >= 20 else float(np.mean(body_size))
        
        # Vectorized Patterns (Last 10)
        lookback = min(10, N)
        O_lb, H_lb, L_lb, C_lb = O[-lookback:], H[-lookback:], L[-lookback:], C[-lookback:]
        body_lb, grn_lb, red_lb = body_size[-lookback:], is_green[-lookback:], is_red[-lookback:]
        
        # Refined FVG: Gap must not be filled by subsequent candles
        fvg_bull_active = False
        fvg_bear_active = False
        if lookback >= 3:
            for i in range(lookback - 2):
                if L_lb[i+2] > H_lb[i] and grn_lb[i+1] and body_lb[i+1] > avg_body:
                    # check if gap filled by remaining candles
                    gap_filled = any(L_lb[j] <= H_lb[i] for j in range(i+2, lookback))
                    if not gap_filled: fvg_bull_active = True
                if H_lb[i+2] < L_lb[i] and red_lb[i+1] and body_lb[i+1] > avg_body:
                    gap_filled = any(H_lb[j] >= L_lb[i] for j in range(i+2, lookback))
                    if not gap_filled: fvg_bear_active = True
        
        bullish_engulfing = bool(red_lb[-2] and grn_lb[-1] and (C_lb[-1] > O_lb[-2]) and (O_lb[-1] < C_lb[-2])) if lookback >= 2 else False
        bearish_engulfing = bool(grn_lb[-2] and red_lb[-1] and (C_lb[-1] < O_lb[-2]) and (O_lb[-1] > C_lb[-2])) if lookback >= 2 else False
        
        morning_star = bool(red_lb[-3] and (body_lb[-2] < avg_body * 0.5) and grn_lb[-1] and (C_lb[-1] > (O_lb[-3] + C_lb[-3]) / 2)) if lookback >= 3 else False
        evening_star = bool(grn_lb[-3] and (body_lb[-2] < avg_body * 0.5) and red_lb[-1] and (C_lb[-1] < (O_lb[-3] + C_lb[-3]) / 2)) if lookback >= 3 else False

        # Market Structure (Optimized Rolling Window)
        window = 3 # Tighter window for faster structure detection
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
        
        sh_indices = np.where(sh_mask)[0]
        sl_indices = np.where(sl_mask)[0]
        
        # Require at least two swing points to define structure
        last_swing_high = float(H[sh_indices[-1]]) if len(sh_indices) > 0 else 0.0
        prev_swing_high = float(H[sh_indices[-2]]) if len(sh_indices) > 1 else last_swing_high
        
        last_swing_low = float(L[sl_indices[-1]]) if len(sl_indices) > 0 else 0.0
        prev_swing_low = float(L[sl_indices[-2]]) if len(sl_indices) > 1 else last_swing_low
        
        c_last, h_last, l_last = C[-1], H[-1], L[-1]
        
        # BOS: Price breaks recent structure in direction of prior structure
        bos_bull = bool((c_last > last_swing_high) and (last_swing_high > prev_swing_high) and (last_swing_high > 0))
        bos_bear = bool((c_last < last_swing_low) and (last_swing_low < prev_swing_low) and (last_swing_low > 0))
        
        # CHoCH: Price breaks recent structure in opposite direction of prior structure
        choch_bull = bool((c_last > last_swing_high) and (last_swing_high <= prev_swing_high) and (last_swing_high > 0))
        choch_bear = bool((c_last < last_swing_low) and (last_swing_low >= prev_swing_low) and (last_swing_low > 0))
        
        # Liquidity Sweep: Wick breaks swing point, but body closes inside
        liq_sweep_bull = bool((l_last < last_swing_low) and (c_last > last_swing_low) and (last_swing_low > 0))
        liq_sweep_bear = bool((h_last > last_swing_high) and (c_last < last_swing_high) and (last_swing_high > 0))
        
        # Precise Double Top / Bottom (within small threshold)
        threshold = avg_body * 0.3
        double_top = False
        if len(sh_indices) >= 2:
            if abs(last_swing_high - prev_swing_high) < threshold and is_red[-1] and (last_swing_high > 0):
                double_top = True
                
        double_bottom = False
        if len(sl_indices) >= 2:
            if abs(last_swing_low - prev_swing_low) < threshold and is_green[-1] and (last_swing_low > 0):
                double_bottom = True

        # Improved Order Block Mitigation Detection
        curr_ob_bull, curr_ob_bear = False, False
        if len(sh_indices) > 0 and len(sl_indices) > 0:
            # Look for recent unmitigated bullish OB (red candle before up move)
            for j in range(N-3, max(-1, N-30), -1):
                if is_red[j] and body_size[j] > avg_body * 0.5:
                    if L[j] <= c_last <= H[j]: # Current price is mitigating it
                        curr_ob_bull = True
                        break
            
            # Look for recent unmitigated bearish OB (green candle before down move)
            for j in range(N-3, max(-1, N-30), -1):
                if is_green[j] and body_size[j] > avg_body * 0.5:
                    if L[j] <= c_last <= H[j]: # Current price is mitigating it
                        curr_ob_bear = True
                        break

        # Supply & Demand Base Detection (Consolidation before impulse)
        snd_bull, snd_bear = False, False
        if len(body_size) >= 5:
            # Check if last 3 candles are small (base), and current is impulsive
            if np.all(body_size[-4:-1] < avg_body * 0.5) and body_size[-1] > avg_body * 1.5:
                if is_green[-1]: snd_bull = True
                if is_red[-1]: snd_bear = True

        # Volatility & Trend (Vectorized metrics over last 20 periods)
        C_20 = C[-20:]
        returns = np.diff(C_20) / C_20[:-1] if len(C_20) > 1 else np.array([0.0])
        volatility = float(np.std(returns)) if len(returns) > 0 else 0.0
        ma_20 = float(np.mean(C_20))
        std_20 = float(np.std(C_20))
        
        if len(C_20) > 1:
            x = np.arange(len(C_20))
            slope = float(np.sum((x - np.mean(x)) * (C_20 - np.mean(C_20))) / np.sum((x - np.mean(x))**2))
        else:
            slope = 0.0

        # Filter low probability setups (Flat trend + low volatility)
        is_low_prob = (abs(slope) < (avg_body * 0.1)) and (volatility < 0.0001)

        result = {
            "fvg_bull_active": fvg_bull_active,
            "fvg_bear_active": fvg_bear_active,
            "bullish_engulfing": bullish_engulfing,
            "bearish_engulfing": bearish_engulfing,
            "morning_star": morning_star,
            "evening_star": evening_star,
            "double_top": double_top,
            "double_bottom": double_bottom,
            "bos_bull": bos_bull if not is_low_prob else False,
            "bos_bear": bos_bear if not is_low_prob else False,
            "choch_bull": choch_bull,
            "choch_bear": choch_bear,
            "liq_sweep_bull": liq_sweep_bull,
            "liq_sweep_bear": liq_sweep_bear,
            "ob_bull": curr_ob_bull,
            "ob_bear": curr_ob_bear,
            "snd_bull": snd_bull,
            "snd_bear": snd_bear,
            "volatility": volatility,
            "ma_20": ma_20,
            "std_20": std_20,
            "trend_slope": slope,
            "is_low_prob": is_low_prob
        }
        
        if cache_key:
            self._cache.put(cache_key, result)
            
        return result


