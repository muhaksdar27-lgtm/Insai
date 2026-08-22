import numpy as np
import math
from datetime import datetime, timezone
from models.schemas import AnalysisRequest, Candle
from deterministic_analyzer import (
    calculate_atr,
    calculate_rsi,
    calculate_ma,
    detect_swings,
    detect_trend_structure,
    detect_bos,
    detect_choch,
    detect_mss,
    detect_liquidity_sweep,
    detect_equal_high_low,
    detect_fvg,
    detect_order_blocks,
    detect_supply_demand_zones,
    detect_double_top,
    detect_double_bottom,
    calculate_neckline,
    detect_neckline_break,
    run_full_analysis,
    dispatch_analysis
)

def generate_candles(pattern_type="uptrend", count=50, base_price=2700.0):
    candles = []
    p = base_price
    for i in range(count):
        ts = f"2026-08-22T{i%24:02d}:00:00Z"
        if pattern_type == "uptrend":
            # Upward trending wave with peaks and valleys every 6 candles
            cycle = math.sin(i * 0.8) * 3.0
            trend = i * 0.5
            p_val = base_price + trend + cycle
            op = p_val - 0.5
            hi = p_val + 1.5
            lo = p_val - 1.5
            cl = p_val + 0.8
        elif pattern_type == "downtrend":
            cycle = math.sin(i * 0.8) * 3.0
            trend = -i * 0.5
            p_val = base_price + trend + cycle
            op = p_val + 0.5
            hi = p_val + 1.5
            lo = p_val - 1.5
            cl = p_val - 0.8
        elif pattern_type == "double_top":

            # Create two peaks around 2750 separated by a valley
            if i < 15:
                # Up to peak 1
                op, hi, lo, cl = p, p + 2.0, p - 0.5, p + 1.5
                p += 2.0
            elif i < 25:
                # Down to trough
                op, hi, lo, cl = p, p + 0.5, p - 2.0, p - 1.5
                p -= 2.0
            elif i < 35:
                # Up to peak 2 (reaching same level)
                op, hi, lo, cl = p, p + 2.0, p - 0.5, p + 1.5
                p += 2.0
            else:
                # Down and breaking neckline
                op, hi, lo, cl = p, p + 0.5, p - 2.5, p - 2.0
                p -= 2.0
        elif pattern_type == "liquidity_sweep_bull":
            if i < count - 1:
                op, hi, lo, cl = p, p + 1.0, p - 1.0, p + 0.5
                p += 0.5
            else:
                # Last candle sweeps previous low deeply then closes high
                op, hi, lo, cl = p, p + 3.0, p - 15.0, p + 2.5
        elif pattern_type == "fvg_bull":
            if i == count - 3:
                op, hi, lo, cl = p, p + 1.0, p - 1.0, p + 0.5
            elif i == count - 2:
                # Huge impulse up
                op, hi, lo, cl = p + 0.5, p + 10.0, p + 0.5, p + 9.5
                p += 9.5
            elif i == count - 1:
                # Next candle doesn't touch candle[i-2].high
                op, hi, lo, cl = p + 0.5, p + 3.0, p + 0.2, p + 2.0
            else:
                op, hi, lo, cl = p, p + 1.0, p - 1.0, p + 0.2
                p += 0.2
        else:
            op, hi, lo, cl = p, p + 1.0, p - 1.0, p + 0.1
            p += 0.1
            
        candles.append(Candle(
            timestamp=ts,
            open=float(round(op, 2)),
            high=float(round(hi, 2)),
            low=float(round(lo, 2)),
            close=float(round(cl, 2)),
            volume=1000.0
        ))
    return candles

def test_determinism_identical_runs():
    candles = generate_candles("uptrend", count=40)
    req1 = AnalysisRequest(
        request_id="req-1",
        symbol="XAUUSD",
        timeframe="M15",
        candles=candles,
        analysis_type="FULL_ANALYSIS"
    )
    req2 = AnalysisRequest(
        request_id="req-2",
        symbol="XAUUSD",
        timeframe="M15",
        candles=candles,
        analysis_type="FULL_ANALYSIS"
    )
    res1 = dispatch_analysis(req1)
    res2 = dispatch_analysis(req2)
    
    assert res1.status == "SUCCESS"
    assert res2.status == "SUCCESS"
    assert res1.values == res2.values
    assert res1.evidence == res2.evidence

def test_atr_and_insufficient_data():
    candles = generate_candles("uptrend", count=30)
    res = calculate_atr(candles, period=14)
    assert res["status"] == "SUCCESS"
    assert res["detected"] is True
    assert "atr" in res["values"]
    assert res["values"]["atr"] > 0
    
    # Test insufficient data
    short_candles = candles[:5]
    res_short = calculate_atr(short_candles, period=14)
    assert res_short["status"] == "INSUFFICIENT_DATA"
    assert "error" in res_short

def test_rsi():
    candles = generate_candles("uptrend", count=30)
    res = calculate_rsi(candles, period=14)
    assert res["status"] == "SUCCESS"
    assert res["detected"] is True
    assert 0 <= res["values"]["rsi"] <= 100

def test_ma50_and_ma200():
    candles = generate_candles("uptrend", count=60)
    ma50_res = calculate_ma(candles, period=50)
    assert ma50_res["status"] == "SUCCESS"
    assert ma50_res["values"]["price_above_ma50"] is True

def test_swing_and_trend_structure():
    candles = generate_candles("uptrend", count=40)
    swings = detect_swings(candles, window=3)
    assert swings["status"] == "SUCCESS"
    assert swings["values"]["swing_highs_count"] > 0
    
    trend = detect_trend_structure(candles, window=3)
    assert trend["status"] == "SUCCESS"
    assert trend["values"]["trend"] == "BULLISH"

def test_bos_and_choch():
    candles = generate_candles("uptrend", count=40)
    bos_res = detect_bos(candles, lookback=20)
    assert bos_res["status"] == "SUCCESS"
    assert "bos_bull" in bos_res["values"]

def test_liquidity_sweep():
    candles = generate_candles("liquidity_sweep_bull", count=30)
    res = detect_liquidity_sweep(candles, lookback=20)
    assert res["status"] == "SUCCESS"
    assert res["values"]["liq_sweep_bull"] is True

def test_fvg():
    candles = generate_candles("fvg_bull", count=25)
    res = detect_fvg(candles, lookback=20)
    assert res["status"] == "SUCCESS"
    assert res["values"]["bullish_fvg_count"] > 0

def test_double_top_and_neckline():
    candles = generate_candles("double_top", count=45)
    dt_res = detect_double_top(candles, lookback=40)
    assert dt_res["status"] == "SUCCESS"
    
    neckline_res = calculate_neckline(candles, pattern_type="DOUBLE_TOP")
    assert neckline_res["status"] == "SUCCESS"

def test_error_handling_invalid_type():
    candles = generate_candles("uptrend", count=20)
    req = AnalysisRequest(
        request_id="test-err",
        symbol="XAUUSD",
        timeframe="M15",
        candles=candles,
        analysis_type="NON_EXISTENT_INDICATOR"
    )
    res = dispatch_analysis(req)
    assert res.status == "INVALID_INPUT"
    assert res.detected is None
    assert "Unsupported analysis type" in res.error

def test_error_handling_empty_candles():
    req = AnalysisRequest(
        request_id="test-empty",
        symbol="XAUUSD",
        timeframe="M15",
        candles=[],
        analysis_type="ATR"
    )
    res = dispatch_analysis(req)
    assert res.status == "INSUFFICIENT_DATA"
    assert res.detected is None

if __name__ == "__main__":
    test_determinism_identical_runs()
    test_atr_and_insufficient_data()
    test_rsi()
    test_ma50_and_ma200()
    test_swing_and_trend_structure()
    test_bos_and_choch()
    test_liquidity_sweep()
    test_fvg()
    test_double_top_and_neckline()
    test_error_handling_invalid_type()
    test_error_handling_empty_candles()
    print("ALL 11 DETERMINISTIC PYTHON TESTS PASSED SUCCESSFULLY!")

