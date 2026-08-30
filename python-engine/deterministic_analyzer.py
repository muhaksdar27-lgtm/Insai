import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import math
from models.schemas import AnalysisRequest, AnalysisResponse, Candle
from shared_utilities import get_logger

logger = get_logger("DeterministicAnalyzer")

def _extract_ohlc(candles: List[Any]) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, List[str]]:
    """Helper to extract NumPy arrays for Open, High, Low, Close, and timestamp strings."""
    if not candles:
        return np.array([]), np.array([]), np.array([]), np.array([]), []
    
    timestamps = []
    opens = []
    highs = []
    lows = []
    closes = []
    
    for c in candles:
        if isinstance(c, dict):
            timestamps.append(str(c.get("timestamp", "")))
            opens.append(float(c.get("open", 0.0)))
            highs.append(float(c.get("high", 0.0)))
            lows.append(float(c.get("low", 0.0)))
            closes.append(float(c.get("close", 0.0)))
        else:
            timestamps.append(str(getattr(c, "timestamp", "")))
            opens.append(float(getattr(c, "open", 0.0)))
            highs.append(float(getattr(c, "high", 0.0)))
            lows.append(float(getattr(c, "low", 0.0)))
            closes.append(float(getattr(c, "close", 0.0)))
            
    return (
        np.array(opens, dtype=np.float64),
        np.array(highs, dtype=np.float64),
        np.array(lows, dtype=np.float64),
        np.array(closes, dtype=np.float64),
        timestamps
    )

# -----------------------------------------------------------------------------
# 1. ATR (Average True Range)
# -----------------------------------------------------------------------------
def calculate_atr(candles: List[Any], period: int = 14) -> Dict[str, Any]:
    N = len(candles)
    if N < period + 1:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"ATR requires at least {period + 1} candles, received {N}"
        }
    
    _, H, L, C, _ = _extract_ohlc(candles)
    
    tr = np.empty(N, dtype=np.float64)
    tr[0] = H[0] - L[0]
    for i in range(1, N):
        tr[i] = max(H[i] - L[i], abs(H[i] - C[i - 1]), abs(L[i] - C[i - 1]))
    
    # Wilder's Smoothing for ATR
    atr_values = np.empty(N, dtype=np.float64)
    atr_values[period] = np.mean(tr[1:period + 1])
    for i in range(period + 1, N):
        atr_values[i] = (atr_values[i - 1] * (period - 1) + tr[i]) / period
        
    current_atr = float(round(atr_values[-1], 3))
    last_tr = float(round(tr[-1], 3))
    
    return {
        "status": "SUCCESS",
        "detected": True,
        "values": {
            "atr": current_atr,
            "period": period,
            "current_tr": last_tr,
            "atr_pips": float(round(current_atr * 10, 1))
        },
        "evidence": {
            "last_tr": last_tr,
            "mean_tr_period": float(round(np.mean(tr[-period:]), 3)),
            "high": float(H[-1]),
            "low": float(L[-1]),
            "close": float(C[-1])
        }
    }

# -----------------------------------------------------------------------------
# 2. RSI (Relative Strength Index)
# -----------------------------------------------------------------------------
def calculate_rsi(candles: List[Any], period: int = 14, overbought: float = 70.0, oversold: float = 30.0) -> Dict[str, Any]:
    N = len(candles)
    if N < period + 1:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"RSI requires at least {period + 1} candles, received {N}"
        }
        
    _, _, _, C, _ = _extract_ohlc(candles)
    deltas = np.diff(C)
    
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
    if avg_loss == 0:
        rsi = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi = float(round(100.0 - (100.0 / (1.0 + rs)), 2))
        
    is_overbought = bool(rsi >= overbought)
    is_oversold = bool(rsi <= oversold)
    
    return {
        "status": "SUCCESS",
        "detected": True,
        "values": {
            "rsi": rsi,
            "period": period,
            "is_overbought": is_overbought,
            "is_oversold": is_oversold,
            "avg_gain": float(round(avg_gain, 4)),
            "avg_loss": float(round(avg_loss, 4))
        },
        "evidence": {
            "rsi": rsi,
            "condition": "OVERBOUGHT" if is_overbought else ("OVERSOLD" if is_oversold else "NEUTRAL"),
            "threshold_overbought": overbought,
            "threshold_oversold": oversold
        }
    }

# -----------------------------------------------------------------------------
# 3. MA50 & 4. MA200 (Moving Averages)
# -----------------------------------------------------------------------------
def calculate_ma(candles: List[Any], period: int = 50, ma_type: str = "EMA") -> Dict[str, Any]:
    N = len(candles)
    if N < min(period, 15):
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"MA{period} requires at least {min(period, 15)} candles, received {N}"
        }
        
    _, _, _, C, _ = _extract_ohlc(candles)
    effective_period = min(period, N)
    
    # Calculate SMA
    sma = float(round(np.mean(C[-effective_period:]), 2))
    
    # Calculate EMA
    alpha = 2.0 / (effective_period + 1.0)
    ema_arr = np.empty_like(C)
    ema_arr[0] = C[0]
    for i in range(1, len(C)):
        ema_arr[i] = alpha * C[i] + (1.0 - alpha) * ema_arr[i - 1]
    ema = float(round(ema_arr[-1], 2))
    
    selected_ma = ema if ma_type.upper() == "EMA" else sma
    last_close = float(C[-1])
    diff = float(round(last_close - selected_ma, 2))
    
    # Slope of last 5 bars
    slope = 0.0
    if len(ema_arr) >= 5:
        slope = float(round((ema_arr[-1] - ema_arr[-5]) / 5.0, 4))
        
    return {
        "status": "SUCCESS",
        "detected": True,
        "values": {
            f"ma{period}": selected_ma,
            f"sma{period}": sma,
            f"ema{period}": ema,
            "period": period,
            "type": ma_type.upper(),
            f"price_above_ma{period}": bool(last_close >= selected_ma),
            "slope": slope,
            "diff_pips": float(round(diff * 10, 1))
        },
        "evidence": {
            "ma_value": selected_ma,
            "current_close": last_close,
            "diff": diff,
            "position": "ABOVE" if last_close >= selected_ma else "BELOW"
        }
    }

# -----------------------------------------------------------------------------
# 5. SWING POINTS (Highs & Lows)
# -----------------------------------------------------------------------------
def detect_swings(candles: List[Any], window: int = 3) -> Dict[str, Any]:
    N = len(candles)
    if N < window * 2 + 1:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Swing point detection requires at least {window * 2 + 1} candles, received {N}"
        }
        
    _, H, L, C, timestamps = _extract_ohlc(candles)
    
    sh_indices = []
    sl_indices = []
    
    for i in range(window, N - window):
        # Swing High
        if all(H[i] > H[i - k] for k in range(1, window + 1)) and all(H[i] >= H[i + k] for k in range(1, window + 1)):
            sh_indices.append(i)
        # Swing Low
        if all(L[i] < L[i - k] for k in range(1, window + 1)) and all(L[i] <= L[i + k] for k in range(1, window + 1)):
            sl_indices.append(i)
            
    swing_highs = [{"index": idx, "price": float(H[idx]), "timestamp": timestamps[idx]} for idx in sh_indices]
    swing_lows = [{"index": idx, "price": float(L[idx]), "timestamp": timestamps[idx]} for idx in sl_indices]
    
    last_sh = swing_highs[-1]["price"] if swing_highs else float(np.max(H[-5:]))
    last_sl = swing_lows[-1]["price"] if swing_lows else float(np.min(L[-5:]))
    
    return {
        "status": "SUCCESS",
        "detected": bool(len(swing_highs) > 0 or len(swing_lows) > 0),
        "values": {
            "swing_highs_count": len(swing_highs),
            "swing_lows_count": len(swing_lows),
            "last_swing_high": last_sh,
            "last_swing_low": last_sl,
            "swing_highs": swing_highs[-5:],
            "swing_lows": swing_lows[-5:]
        },
        "evidence": {
            "recent_sh": swing_highs[-3:],
            "recent_sl": swing_lows[-3:],
            "window": window
        }
    }

# -----------------------------------------------------------------------------
# 6. TREND STRUCTURE (Higher Highs / Higher Lows or Lower Highs / Lower Lows)
# -----------------------------------------------------------------------------
def detect_trend_structure(candles: List[Any], window: int = 3) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Trend structure requires at least 15 candles, received {N}"
        }
        
    swings = detect_swings(candles, window=window)
    if swings["status"] != "SUCCESS":
        return swings
        
    sh_list = swings["values"]["swing_highs"]
    sl_list = swings["values"]["swing_lows"]
    
    _, _, _, C, _ = _extract_ohlc(candles)
    
    if len(sh_list) >= 2 and len(sl_list) >= 2:
        higher_high = sh_list[-1]["price"] > sh_list[-2]["price"]
        higher_low = sl_list[-1]["price"] > sl_list[-2]["price"]
        lower_high = sh_list[-1]["price"] < sh_list[-2]["price"]
        lower_low = sl_list[-1]["price"] < sl_list[-2]["price"]
        
        if higher_high and higher_low:
            trend = "BULLISH"
        elif lower_high and lower_low:
            trend = "BEARISH"
        elif higher_high and not lower_low:
            trend = "BULLISH"
        elif lower_low and not higher_high:
            trend = "BEARISH"
        else:
            trend = "NEUTRAL"
    else:
        # Fallback to linear slope & EMA comparison on recent bars
        c_recent = C[-15:]
        slope = float(c_recent[-1] - c_recent[0])
        trend = "BULLISH" if slope > 0.5 else ("BEARISH" if slope < -0.5 else "NEUTRAL")
        higher_high = slope > 0
        higher_low = slope > 0
        lower_high = slope < 0
        lower_low = slope < 0

    return {
        "status": "SUCCESS",
        "detected": trend in ["BULLISH", "BEARISH"],
        "values": {
            "trend": trend,
            "is_bullish": trend == "BULLISH",
            "is_bearish": trend == "BEARISH",
            "is_neutral": trend == "NEUTRAL",
            "higher_high": higher_high,
            "higher_low": higher_low,
            "lower_high": lower_high,
            "lower_low": lower_low
        },
        "evidence": {
            "trend": trend,
            "last_sh": sh_list[-1]["price"] if sh_list else float(C[-1]),
            "prev_sh": sh_list[-2]["price"] if len(sh_list) >= 2 else None,
            "last_sl": sl_list[-1]["price"] if sl_list else float(C[-1]),
            "prev_sl": sl_list[-2]["price"] if len(sl_list) >= 2 else None
        }
    }

# -----------------------------------------------------------------------------
# 7. BOS (Break of Structure)
# -----------------------------------------------------------------------------
def detect_bos(candles: List[Any], window: int = 3, lookback: int = 20) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"BOS detection requires at least 15 candles, received {N}"
        }
        
    _, H, L, C, _ = _extract_ohlc(candles)
    current_close = float(C[-1])
    
    swings = detect_swings(candles[:-1], window=window)
    sh_list = swings["values"]["swing_highs"] if swings["status"] == "SUCCESS" else []
    sl_list = swings["values"]["swing_lows"] if swings["status"] == "SUCCESS" else []
    
    bos_bull = False
    bos_bear = False
    broken_level = 0.0
    
    if sh_list and current_close > sh_list[-1]["price"]:
        bos_bull = True
        broken_level = sh_list[-1]["price"]
    elif sl_list and current_close < sl_list[-1]["price"]:
        bos_bear = True
        broken_level = sl_list[-1]["price"]
    else:
        # Fallback to high/low of prior range
        recent_high = float(np.max(H[-lookback:-1]))
        recent_low = float(np.min(L[-lookback:-1]))
        if current_close > recent_high:
            bos_bull = True
            broken_level = recent_high
        elif current_close < recent_low:
            bos_bear = True
            broken_level = recent_low
            
    detected = bos_bull or bos_bear
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "bos_bull": bos_bull,
            "bos_bear": bos_bear,
            "broken_level": broken_level,
            "close_price": current_close
        },
        "evidence": {
            "type": "bullish" if bos_bull else ("bearish" if bos_bear else "none"),
            "broken_level": broken_level,
            "current_close": current_close,
            "displacement": float(round(abs(current_close - broken_level), 2))
        }
    }

# -----------------------------------------------------------------------------
# 8. CHOCH (Change of Character)
# -----------------------------------------------------------------------------
def detect_choch(candles: List[Any], window: int = 3, lookback: int = 30) -> Dict[str, Any]:
    N = len(candles)
    if N < 20:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"CHoCH detection requires at least 20 candles, received {N}"
        }
        
    _, H, L, C, _ = _extract_ohlc(candles)
    current_close = float(C[-1])
    
    # Assess prior trend structure
    trend_res = detect_trend_structure(candles[:-1], window=window)
    prior_trend = trend_res["values"]["trend"] if trend_res["status"] == "SUCCESS" else "NEUTRAL"
    
    swings = detect_swings(candles[:-1], window=window)
    sh_list = swings["values"]["swing_highs"] if swings["status"] == "SUCCESS" else []
    sl_list = swings["values"]["swing_lows"] if swings["status"] == "SUCCESS" else []
    
    choch_bull = False
    choch_bear = False
    key_level = 0.0
    
    if prior_trend == "BEARISH" or prior_trend == "NEUTRAL":
        if sh_list and current_close > sh_list[-1]["price"]:
            choch_bull = True
            key_level = sh_list[-1]["price"]
        elif current_close > float(np.max(H[-min(lookback, N):-1])):
            choch_bull = True
            key_level = float(np.max(H[-min(lookback, N):-1]))
            
    if prior_trend == "BULLISH" or prior_trend == "NEUTRAL":
        if sl_list and current_close < sl_list[-1]["price"]:
            choch_bear = True
            key_level = sl_list[-1]["price"]
        elif current_close < float(np.min(L[-min(lookback, N):-1])):
            choch_bear = True
            key_level = float(np.min(L[-min(lookback, N):-1]))
            
    detected = choch_bull or choch_bear
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "choch_bull": choch_bull,
            "choch_bear": choch_bear,
            "prior_trend": prior_trend,
            "key_level": key_level,
            "close_price": current_close
        },
        "evidence": {
            "type": "bullish" if choch_bull else ("bearish" if choch_bear else "none"),
            "key_level": key_level,
            "prior_trend": prior_trend,
            "current_close": current_close
        }
    }

# -----------------------------------------------------------------------------
# 9. MSS (Market Structure Shift with Displacement)
# -----------------------------------------------------------------------------
def detect_mss(candles: List[Any], lookback: int = 20, displacement_threshold: float = 1.5) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"MSS detection requires at least 15 candles, received {N}"
        }
        
    O, H, L, C, _ = _extract_ohlc(candles)
    body_sizes = np.abs(C - O)
    avg_body = float(np.mean(body_sizes[-min(20, N):-1]))
    if avg_body == 0:
        avg_body = 0.5
        
    current_body = float(body_sizes[-1])
    has_displacement = current_body >= (avg_body * displacement_threshold)
    
    choch_res = detect_choch(candles, lookback=lookback)
    bos_res = detect_bos(candles, lookback=lookback)
    
    is_structural_break = (choch_res.get("detected") or bos_res.get("detected"))
    mss_bull = bool((choch_res["values"].get("choch_bull") or bos_res["values"].get("bos_bull")) and has_displacement and (C[-1] > O[-1]))
    mss_bear = bool((choch_res["values"].get("choch_bear") or bos_res["values"].get("bos_bear")) and has_displacement and (C[-1] < O[-1]))
    
    detected = mss_bull or mss_bear
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "mss_bull": mss_bull,
            "mss_bear": mss_bear,
            "has_displacement": has_displacement,
            "current_body": current_body,
            "avg_body": avg_body,
            "body_ratio": float(round(current_body / avg_body, 2))
        },
        "evidence": {
            "type": "bullish" if mss_bull else ("bearish" if mss_bear else "none"),
            "has_displacement": has_displacement,
            "structural_break": is_structural_break,
            "body_ratio": float(round(current_body / avg_body, 2))
        }
    }

# -----------------------------------------------------------------------------
# 10. LIQUIDITY (Liquidity Sweep)
# -----------------------------------------------------------------------------
def detect_liquidity_sweep(candles: List[Any], lookback: int = 20, session_range: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
    N = len(candles)
    if N < 10:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Liquidity sweep detection requires at least 10 candles, received {N}"
        }
        
    O, H, L, C, _ = _extract_ohlc(candles)
    curr_h, curr_l, curr_c, curr_o = float(H[-1]), float(L[-1]), float(C[-1]), float(O[-1])
    
    # Target range to check for sweep
    if session_range and "high" in session_range and "low" in session_range:
        target_high = float(session_range["high"])
        target_low = float(session_range["low"])
    else:
        target_high = float(np.max(H[-min(lookback, N):-1]))
        target_low = float(np.min(L[-min(lookback, N):-1]))
        
    # Bullish Liquidity Sweep (Low Sweep): Wick below target low, close above target low or upper 30% of bar
    candle_range = curr_h - curr_l
    liq_sweep_bull = (curr_l < target_low) and (curr_c > target_low or (candle_range > 0 and curr_c > curr_l + (candle_range * 0.3)))
    
    # Bearish Liquidity Sweep (High Sweep): Wick above target high, close below target high or lower 30% of bar
    liq_sweep_bear = (curr_h > target_high) and (curr_c < target_high or (candle_range > 0 and curr_c < curr_h - (candle_range * 0.3)))
    
    detected = liq_sweep_bull or liq_sweep_bear
    swept_level = target_low if liq_sweep_bull else (target_high if liq_sweep_bear else 0.0)
    
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "liq_sweep_bull": bool(liq_sweep_bull),
            "liq_sweep_bear": bool(liq_sweep_bear),
            "swept_level": float(round(swept_level, 2)),
            "target_high": float(round(target_high, 2)),
            "target_low": float(round(target_low, 2))
        },
        "evidence": {
            "type": "bullish" if liq_sweep_bull else ("bearish" if liq_sweep_bear else "none"),
            "swept_level": swept_level,
            "candle_high": curr_h,
            "candle_low": curr_l,
            "candle_close": curr_c
        }
    }

# -----------------------------------------------------------------------------
# 11. EQUAL HIGH / LOW (EQH / EQL)
# -----------------------------------------------------------------------------
def detect_equal_high_low(candles: List[Any], tolerance_pips: float = 1.0, window: int = 3) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Equal High/Low detection requires at least 15 candles, received {N}"
        }
        
    swings = detect_swings(candles, window=window)
    if swings["status"] != "SUCCESS":
        return swings
        
    sh_list = swings["values"]["swing_highs"]
    sl_list = swings["values"]["swing_lows"]
    
    tolerance = tolerance_pips * 0.1  # For gold/forex standard point scaling
    
    eqh_detected = False
    eqh_level = 0.0
    if len(sh_list) >= 2:
        diff_h = abs(sh_list[-1]["price"] - sh_list[-2]["price"])
        if diff_h <= tolerance:
            eqh_detected = True
            eqh_level = float(round((sh_list[-1]["price"] + sh_list[-2]["price"]) / 2.0, 2))
            
    eql_detected = False
    eql_level = 0.0
    if len(sl_list) >= 2:
        diff_l = abs(sl_list[-1]["price"] - sl_list[-2]["price"])
        if diff_l <= tolerance:
            eql_detected = True
            eql_level = float(round((sl_list[-1]["price"] + sl_list[-2]["price"]) / 2.0, 2))
            
    detected = eqh_detected or eql_detected
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "eqh_detected": eqh_detected,
            "eql_detected": eql_detected,
            "eqh_level": eqh_level,
            "eql_level": eql_level,
            "tolerance_used": tolerance
        },
        "evidence": {
            "eqh": {"detected": eqh_detected, "level": eqh_level},
            "eql": {"detected": eql_detected, "level": eql_level}
        }
    }

# -----------------------------------------------------------------------------
# 12. FVG (Fair Value Gap)
# -----------------------------------------------------------------------------
def detect_fvg(candles: List[Any], lookback: int = 20) -> Dict[str, Any]:
    N = len(candles)
    if N < 5:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"FVG detection requires at least 5 candles, received {N}"
        }
        
    O, H, L, C, timestamps = _extract_ohlc(candles)
    lb = min(lookback, N)
    
    bullish_fvgs = []
    bearish_fvgs = []
    
    current_price = float(C[-1])
    
    for i in range(N - lb + 2, N):
        # Bullish FVG: Low[i] > High[i-2]
        if L[i] > H[i - 2]:
            gap_size = float(round(L[i] - H[i - 2], 2))
            if gap_size > 0.1:
                is_active = (current_price >= H[i - 2]) and (current_price <= L[i] + 1.0)
                bullish_fvgs.append({
                    "index": i,
                    "timestamp": timestamps[i],
                    "top": float(L[i]),
                    "bottom": float(H[i - 2]),
                    "gap_size": gap_size,
                    "is_active": is_active
                })
        # Bearish FVG: High[i] < Low[i-2]
        if H[i] < L[i - 2]:
            gap_size = float(round(L[i - 2] - H[i], 2))
            if gap_size > 0.1:
                is_active = (current_price <= L[i - 2]) and (current_price >= H[i] - 1.0)
                bearish_fvgs.append({
                    "index": i,
                    "timestamp": timestamps[i],
                    "top": float(L[i - 2]),
                    "bottom": float(H[i]),
                    "gap_size": gap_size,
                    "is_active": is_active
                })
                
    fvg_bull_active = bool(len(bullish_fvgs) > 0 and any(f["is_active"] for f in bullish_fvgs))
    fvg_bear_active = bool(len(bearish_fvgs) > 0 and any(f["is_active"] for f in bearish_fvgs))
    
    detected = fvg_bull_active or fvg_bear_active or len(bullish_fvgs) > 0 or len(bearish_fvgs) > 0
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "fvg_bull_active": fvg_bull_active,
            "fvg_bear_active": fvg_bear_active,
            "bullish_fvg_count": len(bullish_fvgs),
            "bearish_fvg_count": len(bearish_fvgs),
            "bullish_fvgs": bullish_fvgs[-3:],
            "bearish_fvgs": bearish_fvgs[-3:]
        },
        "evidence": {
            "active_bullish_gap": bullish_fvgs[-1] if bullish_fvgs else None,
            "active_bearish_gap": bearish_fvgs[-1] if bearish_fvgs else None
        }
    }

# -----------------------------------------------------------------------------
# 13. OB (Order Block)
# -----------------------------------------------------------------------------
def detect_order_blocks(candles: List[Any], lookback: int = 20) -> Dict[str, Any]:
    N = len(candles)
    if N < 10:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Order Block detection requires at least 10 candles, received {N}"
        }
        
    O, H, L, C, timestamps = _extract_ohlc(candles)
    lb = min(lookback, N)
    
    current_price = float(C[-1])
    bullish_obs = []
    bearish_obs = []
    
    for i in range(N - lb, N - 2):
        is_bearish_candle = C[i] < O[i]
        is_bullish_candle = C[i] > O[i]
        
        # Bullish OB: Bearish candle followed by strong bullish displacement
        if is_bearish_candle:
            displacement = (C[i + 2] - O[i + 1]) if i + 2 < N else (C[i + 1] - O[i + 1])
            if displacement > (abs(C[i] - O[i]) * 1.5):
                bullish_obs.append({
                    "index": i,
                    "timestamp": timestamps[i],
                    "top": float(H[i]),
                    "bottom": float(L[i]),
                    "mitigated": bool(current_price < L[i])
                })
                
        # Bearish OB: Bullish candle followed by strong bearish displacement
        if is_bullish_candle:
            displacement = (O[i + 1] - C[i + 2]) if i + 2 < N else (O[i + 1] - C[i + 1])
            if displacement > (abs(C[i] - O[i]) * 1.5):
                bearish_obs.append({
                    "index": i,
                    "timestamp": timestamps[i],
                    "top": float(H[i]),
                    "bottom": float(L[i]),
                    "mitigated": bool(current_price > H[i])
                })
                
    ob_bull = bool(len(bullish_obs) > 0 and not bullish_obs[-1]["mitigated"])
    ob_bear = bool(len(bearish_obs) > 0 and not bearish_obs[-1]["mitigated"])
    
    detected = ob_bull or ob_bear
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "ob_bull": ob_bull,
            "ob_bear": ob_bear,
            "bullish_obs": bullish_obs[-3:],
            "bearish_obs": bearish_obs[-3:],
            "active_bull_ob": bullish_obs[-1] if bullish_obs else None,
            "active_bear_ob": bearish_obs[-1] if bearish_obs else None
        },
        "evidence": {
            "ob_bull": ob_bull,
            "ob_bear": ob_bear,
            "last_bull_ob_zone": bullish_obs[-1] if bullish_obs else None,
            "last_bear_ob_zone": bearish_obs[-1] if bearish_obs else None
        }
    }

# -----------------------------------------------------------------------------
# 14. SUPPLY & DEMAND (S&D Zones: DBR, RBD, RBR, DBD)
# -----------------------------------------------------------------------------
def detect_supply_demand_zones(candles: List[Any], lookback: int = 30) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Supply/Demand detection requires at least 15 candles, received {N}"
        }
        
    O, H, L, C, timestamps = _extract_ohlc(candles)
    current_price = float(C[-1])
    
    demand_zones = []
    supply_zones = []
    
    for i in range(2, min(lookback, N)):
        idx = N - i
        # Check patterns:
        c0_o, c0_c = O[idx - 2], C[idx - 2]
        c1_o, c1_c = O[idx - 1], C[idx - 1]
        c2_o, c2_c = O[idx], C[idx]
        
        # Drop-Base-Rally (DBR) -> Demand
        if (c0_c < c0_o) and abs(c1_c - c1_o) < abs(c0_c - c0_o) * 0.5 and (c2_c > c2_o and c2_c > c0_o):
            demand_zones.append({
                "type": "demand",
                "pattern": "DBR",
                "top": float(max(H[idx - 1], O[idx - 1])),
                "bottom": float(L[idx - 1]),
                "timestamp": timestamps[idx - 1],
                "freshness": "FRESH" if current_price >= L[idx - 1] else "BREACHED"
            })
            
        # Rally-Base-Drop (RBD) -> Supply
        if (c0_c > c0_o) and abs(c1_c - c1_o) < abs(c0_c - c0_o) * 0.5 and (c2_c < c2_o and c2_c < c0_o):
            supply_zones.append({
                "type": "supply",
                "pattern": "RBD",
                "top": float(H[idx - 1]),
                "bottom": float(min(L[idx - 1], O[idx - 1])),
                "timestamp": timestamps[idx - 1],
                "freshness": "FRESH" if current_price <= H[idx - 1] else "BREACHED"
            })
            
    fresh_demand = [d for d in demand_zones if d["freshness"] == "FRESH"]
    fresh_supply = [s for s in supply_zones if s["freshness"] == "FRESH"]
    
    snd_bull = len(fresh_demand) > 0 and any(abs(current_price - d["top"]) <= 2.0 or (current_price >= d["bottom"] and current_price <= d["top"]) for d in fresh_demand)
    snd_bear = len(fresh_supply) > 0 and any(abs(current_price - s["bottom"]) <= 2.0 or (current_price >= s["bottom"] and current_price <= s["top"]) for s in fresh_supply)
    
    detected = snd_bull or snd_bear or len(fresh_demand) > 0 or len(fresh_supply) > 0
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "snd_bull": snd_bull,
            "snd_bear": snd_bear,
            "demand_zones_count": len(fresh_demand),
            "supply_zones_count": len(fresh_supply),
            "primary_demand": fresh_demand[-1] if fresh_demand else None,
            "primary_supply": fresh_supply[-1] if fresh_supply else None
        },
        "evidence": {
            "snd_bull": snd_bull,
            "snd_bear": snd_bear,
            "active_demand_zone": fresh_demand[-1] if fresh_demand else None,
            "active_supply_zone": fresh_supply[-1] if fresh_supply else None
        }
    }

# -----------------------------------------------------------------------------
# 15. DOUBLE TOP
# -----------------------------------------------------------------------------
def detect_double_top(candles: List[Any], lookback: int = 30, tolerance_pips: float = 1.5) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Double top detection requires at least 15 candles, received {N}"
        }
        
    swings = detect_swings(candles, window=3)
    if swings["status"] != "SUCCESS":
        return swings
        
    sh_list = swings["values"]["swing_highs"]
    sl_list = swings["values"]["swing_lows"]
    
    tolerance = tolerance_pips * 0.1
    double_top = False
    peak1 = 0.0
    peak2 = 0.0
    neckline = 0.0
    
    if len(sh_list) >= 2:
        p1, p2 = sh_list[-2], sh_list[-1]
        if abs(p1["price"] - p2["price"]) <= tolerance:
            # Find intermediate trough between peak1 and peak2
            troughs = [sl for sl in sl_list if p1["index"] < sl["index"] < p2["index"]]
            if troughs:
                intermediate_trough = min(troughs, key=lambda t: t["price"])
                peak_avg = (p1["price"] + p2["price"]) / 2.0
                if intermediate_trough["price"] < peak_avg - 0.5:
                    double_top = True
                    peak1 = float(p1["price"])
                    peak2 = float(p2["price"])
                    neckline = float(intermediate_trough["price"])
                    
    return {
        "status": "SUCCESS",
        "detected": double_top,
        "values": {
            "double_top": double_top,
            "peak1_price": peak1,
            "peak2_price": peak2,
            "neckline": neckline,
            "peak_diff": float(round(abs(peak1 - peak2), 2)) if double_top else 0.0
        },
        "evidence": {
            "pattern": "DOUBLE_TOP" if double_top else "NONE",
            "peak1": peak1,
            "peak2": peak2,
            "neckline": neckline
        }
    }

# -----------------------------------------------------------------------------
# 16. DOUBLE BOTTOM
# -----------------------------------------------------------------------------
def detect_double_bottom(candles: List[Any], lookback: int = 30, tolerance_pips: float = 1.5) -> Dict[str, Any]:
    N = len(candles)
    if N < 15:
        return {
            "status": "INSUFFICIENT_DATA",
            "error": f"Double bottom detection requires at least 15 candles, received {N}"
        }
        
    swings = detect_swings(candles, window=3)
    if swings["status"] != "SUCCESS":
        return swings
        
    sh_list = swings["values"]["swing_highs"]
    sl_list = swings["values"]["swing_lows"]
    
    tolerance = tolerance_pips * 0.1
    double_bottom = False
    trough1 = 0.0
    trough2 = 0.0
    neckline = 0.0
    
    if len(sl_list) >= 2:
        t1, t2 = sl_list[-2], sl_list[-1]
        if abs(t1["price"] - t2["price"]) <= tolerance:
            # Find intermediate peak between trough1 and trough2
            peaks = [sh for sh in sh_list if t1["index"] < sh["index"] < t2["index"]]
            if peaks:
                intermediate_peak = max(peaks, key=lambda p: p["price"])
                trough_avg = (t1["price"] + t2["price"]) / 2.0
                if intermediate_peak["price"] > trough_avg + 0.5:
                    double_bottom = True
                    trough1 = float(t1["price"])
                    trough2 = float(t2["price"])
                    neckline = float(intermediate_peak["price"])
                    
    return {
        "status": "SUCCESS",
        "detected": double_bottom,
        "values": {
            "double_bottom": double_bottom,
            "trough1_price": trough1,
            "trough2_price": trough2,
            "neckline": neckline,
            "trough_diff": float(round(abs(trough1 - trough2), 2)) if double_bottom else 0.0
        },
        "evidence": {
            "pattern": "DOUBLE_BOTTOM" if double_bottom else "NONE",
            "trough1": trough1,
            "trough2": trough2,
            "neckline": neckline
        }
    }

# -----------------------------------------------------------------------------
# 17. NECKLINE & 18. NECKLINE BREAK
# -----------------------------------------------------------------------------
def calculate_neckline(candles: List[Any], pattern_type: str = "AUTO") -> Dict[str, Any]:
    dt_res = detect_double_top(candles)
    db_res = detect_double_bottom(candles)
    
    neckline = 0.0
    pattern = "NONE"
    
    if pattern_type in ["DOUBLE_TOP", "AUTO"] and dt_res.get("detected"):
        neckline = dt_res["values"]["neckline"]
        pattern = "DOUBLE_TOP"
    elif pattern_type in ["DOUBLE_BOTTOM", "AUTO"] and db_res.get("detected"):
        neckline = db_res["values"]["neckline"]
        pattern = "DOUBLE_BOTTOM"
        
    detected = neckline > 0
    return {
        "status": "SUCCESS",
        "detected": detected,
        "values": {
            "neckline": neckline,
            "pattern": pattern,
            "is_valid": detected
        },
        "evidence": {
            "pattern": pattern,
            "neckline_level": neckline
        }
    }

def detect_neckline_break(candles: List[Any], pattern_type: str = "AUTO") -> Dict[str, Any]:
    neck_res = calculate_neckline(candles, pattern_type=pattern_type)
    if not neck_res.get("detected") or neck_res["values"]["neckline"] == 0:
        return {
            "status": "SUCCESS",
            "detected": False,
            "values": {
                "neckline_break": False,
                "direction": "none",
                "neckline": 0.0
            },
            "evidence": {
                "reason": "No valid neckline detected"
            }
        }
        
    neckline = neck_res["values"]["neckline"]
    pattern = neck_res["values"]["pattern"]
    _, _, _, C, _ = _extract_ohlc(candles)
    current_close = float(C[-1])
    
    neckline_break = False
    direction = "none"
    
    if pattern == "DOUBLE_TOP" and current_close < neckline:
        neckline_break = True
        direction = "bearish"
    elif pattern == "DOUBLE_BOTTOM" and current_close > neckline:
        neckline_break = True
        direction = "bullish"
        
    return {
        "status": "SUCCESS",
        "detected": neckline_break,
        "values": {
            "neckline_break": neckline_break,
            "direction": direction,
            "neckline": neckline,
            "close_price": current_close
        },
        "evidence": {
            "pattern": pattern,
            "neckline": neckline,
            "current_close": current_close,
            "break_distance": float(round(abs(current_close - neckline), 2))
        }
    }

# -----------------------------------------------------------------------------
# DISPATCHER & FULL ANALYSIS
# -----------------------------------------------------------------------------
def run_full_analysis(request: AnalysisRequest) -> AnalysisResponse:
    candles = request.candles
    N = len(candles)
    
    if N < 5:
        return AnalysisResponse(
            request_id=request.request_id,
            status="INSUFFICIENT_DATA",
            detected=None,
            analysis_type=request.analysis_type,
            values={},
            evidence={},
            timestamp=datetime.now(timezone.utc).isoformat(),
            error=f"Insufficient candles for technical analysis (received {N}, minimum required: 5)"
        )
        
    try:
        atr_data = calculate_atr(candles, period=14)
        rsi_data = calculate_rsi(candles, period=14)
        ma50_data = calculate_ma(candles, period=50, ma_type="EMA")
        ma200_data = calculate_ma(candles, period=200, ma_type="EMA")
        swings_data = detect_swings(candles, window=3)
        trend_data = detect_trend_structure(candles, window=3)
        bos_data = detect_bos(candles, window=3)
        choch_data = detect_choch(candles, window=3)
        mss_data = detect_mss(candles)
        liq_data = detect_liquidity_sweep(candles)
        eq_data = detect_equal_high_low(candles)
        fvg_data = detect_fvg(candles)
        ob_data = detect_order_blocks(candles)
        sd_data = detect_supply_demand_zones(candles)
        dt_data = detect_double_top(candles)
        db_data = detect_double_bottom(candles)
        neck_data = calculate_neckline(candles)
        neck_break_data = detect_neckline_break(candles)
        
        _, _, _, C, _ = _extract_ohlc(candles)
        current_price = float(C[-1])
        
        composite_values = {
            "current_price": current_price,
            "atr": atr_data.get("values", {}).get("atr", 0.0),
            "rsi": rsi_data.get("values", {}).get("rsi", 0.0),
            "ma50": ma50_data.get("values", {}).get("ma50", 0.0),
            "ma200": ma200_data.get("values", {}).get("ma200", 0.0),
            "trend_h1": trend_data.get("values", {}).get("trend", "NEUTRAL").lower(),
            "trend": trend_data.get("values", {}).get("trend", "NEUTRAL"),
            "bos_bull": bos_data.get("values", {}).get("bos_bull", False),
            "bos_bear": bos_data.get("values", {}).get("bos_bear", False),
            "choch_bull": choch_data.get("values", {}).get("choch_bull", False),
            "choch_bear": choch_data.get("values", {}).get("choch_bear", False),
            "mss_bull": mss_data.get("values", {}).get("mss_bull", False),
            "mss_bear": mss_data.get("values", {}).get("mss_bear", False),
            "liq_sweep_bull": liq_data.get("values", {}).get("liq_sweep_bull", False),
            "liq_sweep_bear": liq_data.get("values", {}).get("liq_sweep_bear", False),
            "eqh_detected": eq_data.get("values", {}).get("eqh_detected", False),
            "eql_detected": eq_data.get("values", {}).get("eql_detected", False),
            "fvg_bull_active": fvg_data.get("values", {}).get("fvg_bull_active", False),
            "fvg_bear_active": fvg_data.get("values", {}).get("fvg_bear_active", False),
            "ob_bull": ob_data.get("values", {}).get("ob_bull", False),
            "ob_bear": ob_data.get("values", {}).get("ob_bear", False),
            "ob_fvg_bull": fvg_data.get("values", {}).get("fvg_bull_active", False) or ob_data.get("values", {}).get("ob_bull", False),
            "ob_fvg_bear": fvg_data.get("values", {}).get("fvg_bear_active", False) or ob_data.get("values", {}).get("ob_bear", False),
            "sd_zone_active": sd_data.get("values", {}).get("snd_bull", False) or sd_data.get("values", {}).get("snd_bear", False),
            "snd_bull": sd_data.get("values", {}).get("snd_bull", False),
            "snd_bear": sd_data.get("values", {}).get("snd_bear", False),
            "double_top": dt_data.get("values", {}).get("double_top", False),
            "double_bottom": db_data.get("values", {}).get("double_bottom", False),
            "neckline": neck_data.get("values", {}).get("neckline", 0.0),
            "neckline_break": neck_break_data.get("values", {}).get("neckline_break", False),
            "spread_acceptable": bool(request.market_context.get("spread_acceptable", False)) if request.market_context else False,
            "news_high_impact_active": bool(request.market_context.get("news_high_impact_active", False)) if request.market_context else False
        }
        
        composite_evidence = {
            "atr": atr_data.get("evidence", {}),
            "rsi": rsi_data.get("evidence", {}),
            "trend": trend_data.get("evidence", {}),
            "bos": bos_data.get("evidence", {}),
            "choch": choch_data.get("evidence", {}),
            "mss": mss_data.get("evidence", {}),
            "liquidity": liq_data.get("evidence", {}),
            "fvg": fvg_data.get("evidence", {}),
            "ob": ob_data.get("evidence", {}),
            "supply_demand": sd_data.get("evidence", {}),
            "chart_patterns": {
                "double_top": dt_data.get("evidence", {}),
                "double_bottom": db_data.get("evidence", {}),
                "neckline_break": neck_break_data.get("evidence", {})
            }
        }
        
        return AnalysisResponse(
            request_id=request.request_id,
            status="SUCCESS",
            detected=True,
            analysis_type="FULL_ANALYSIS",
            values=composite_values,
            evidence=composite_evidence,
            timestamp=datetime.now(timezone.utc).isoformat(),
            error=None
        )
        
    except Exception as e:
        logger.error(f"Full analysis execution error: {e}")
        return AnalysisResponse(
            request_id=request.request_id,
            status="ANALYSIS_ERROR",
            detected=None,
            analysis_type=request.analysis_type,
            values={},
            evidence={},
            timestamp=datetime.now(timezone.utc).isoformat(),
            error=f"Calculation error: {str(e)}"
        )

def dispatch_analysis(request: AnalysisRequest) -> AnalysisResponse:
    """Deterministic routing to individual or full analysis based on analysis_type."""
    if not request.candles:
        return AnalysisResponse(
            request_id=request.request_id,
            status="INSUFFICIENT_DATA",
            detected=None,
            analysis_type=request.analysis_type,
            values={},
            evidence={},
            timestamp=datetime.now(timezone.utc).isoformat(),
            error="Candles array is empty"
        )
        
    t = (request.analysis_type or "FULL_ANALYSIS").upper()
    params = request.analysis_parameters or {}
    candles = request.candles
    
    try:
        if t in ["FULL_ANALYSIS", "MULTI_ANALYSIS", "ALL"]:
            return run_full_analysis(request)
            
        elif t == "ATR":
            res = calculate_atr(candles, period=int(params.get("period", 14)))
        elif t == "RSI":
            res = calculate_rsi(candles, period=int(params.get("period", 14)), overbought=float(params.get("overbought", 70)), oversold=float(params.get("oversold", 30)))
        elif t in ["MA50", "MA"]:
            res = calculate_ma(candles, period=int(params.get("period", 50)), ma_type=str(params.get("type", "EMA")))
        elif t == "MA200":
            res = calculate_ma(candles, period=int(params.get("period", 200)), ma_type=str(params.get("type", "EMA")))
        elif t in ["SWING", "SWINGS"]:
            res = detect_swings(candles, window=int(params.get("window", 3)))
        elif t in ["TREND", "TREND_STRUCTURE"]:
            res = detect_trend_structure(candles, window=int(params.get("window", 3)))
        elif t == "BOS":
            res = detect_bos(candles, window=int(params.get("window", 3)), lookback=int(params.get("lookback", 20)))
        elif t == "CHOCH":
            res = detect_choch(candles, window=int(params.get("window", 3)), lookback=int(params.get("lookback", 30)))
        elif t == "MSS":
            res = detect_mss(candles, lookback=int(params.get("lookback", 20)), displacement_threshold=float(params.get("displacement_threshold", 1.5)))
        elif t in ["LIQUIDITY", "LIQUIDITY_SWEEP"]:
            res = detect_liquidity_sweep(candles, lookback=int(params.get("lookback", 20)), session_range=params.get("session_range"))
        elif t in ["EQUAL_HIGH_LOW", "EQH_EQL", "EQH", "EQL"]:
            res = detect_equal_high_low(candles, tolerance_pips=float(params.get("tolerance_pips", 1.0)), window=int(params.get("window", 3)))
        elif t == "FVG":
            res = detect_fvg(candles, lookback=int(params.get("lookback", 20)))
        elif t in ["OB", "ORDER_BLOCK"]:
            res = detect_order_blocks(candles, lookback=int(params.get("lookback", 20)))
        elif t in ["SUPPLY_DEMAND", "SD_ZONES", "SND"]:
            res = detect_supply_demand_zones(candles, lookback=int(params.get("lookback", 30)))
        elif t == "DOUBLE_TOP":
            res = detect_double_top(candles, lookback=int(params.get("lookback", 30)), tolerance_pips=float(params.get("tolerance_pips", 1.5)))
        elif t == "DOUBLE_BOTTOM":
            res = detect_double_bottom(candles, lookback=int(params.get("lookback", 30)), tolerance_pips=float(params.get("tolerance_pips", 1.5)))
        elif t == "NECKLINE":
            res = calculate_neckline(candles, pattern_type=str(params.get("pattern_type", "AUTO")))
        elif t == "NECKLINE_BREAK":
            res = detect_neckline_break(candles, pattern_type=str(params.get("pattern_type", "AUTO")))
        else:
            return AnalysisResponse(
                request_id=request.request_id,
                status="INVALID_INPUT",
                detected=None,
                analysis_type=request.analysis_type,
                values={},
                evidence={},
                timestamp=datetime.now(timezone.utc).isoformat(),
                error=f"Unsupported analysis type: {request.analysis_type}"
            )
            
        status = res.get("status", "SUCCESS")
        return AnalysisResponse(
            request_id=request.request_id,
            status=status,
            detected=res.get("detected") if status == "SUCCESS" else None,
            analysis_type=request.analysis_type,
            values=res.get("values", {}),
            evidence=res.get("evidence", {}),
            timestamp=datetime.now(timezone.utc).isoformat(),
            error=res.get("error")
        )
        
    except Exception as e:
        logger.error(f"Dispatch error for {request.analysis_type}: {e}")
        return AnalysisResponse(
            request_id=request.request_id,
            status="ANALYSIS_ERROR",
            detected=None,
            analysis_type=request.analysis_type,
            values={},
            evidence={},
            timestamp=datetime.now(timezone.utc).isoformat(),
            error=str(e)
        )
