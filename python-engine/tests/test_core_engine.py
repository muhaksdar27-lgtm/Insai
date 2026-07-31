import pytest
import numpy as np
import time
from core_engine import CoreEngine

@pytest.fixture
def core_engine():
    return CoreEngine()

def test_cache_key_generation(core_engine):
    candles = [
        {"timestamp": "1", "open": 10, "high": 20, "low": 5, "close": 15},
        {"timestamp": "2", "open": 15, "high": 25, "low": 10, "close": 20}
    ]
    key1 = core_engine._generate_cache_key(candles)
    key2 = core_engine._generate_cache_key(candles.copy())
    assert key1 == key2
    
    candles.append({"timestamp": "3", "open": 20, "high": 30, "low": 15, "close": 25})
    key3 = core_engine._generate_cache_key(candles)
    assert key1 != key3

def test_analyze_empty_data(core_engine):
    with pytest.raises(ValueError, match="Insufficient data"):
        core_engine.analyze([])

def test_analyze_trend_and_volatility(core_engine):
    # Create an upward trend
    candles = []
    for i in range(30):
        base = 1000 + i * 10
        candles.append({
            "timestamp": str(i),
            "open": base,
            "high": base + 5,
            "low": base - 5,
            "close": base + 2
        })
    
    analysis = core_engine.analyze(candles)
    assert "trend_slope" in analysis
    assert "volatility" in analysis
    assert "atr" in analysis
    assert analysis["trend_slope"] > 0
    assert analysis["atr"] > 0

def test_engulfing_detection(core_engine):
    candles = []
    for i in range(35):
        base = 2000.0 + i
        candles.append({
            "timestamp": str(i),
            "open": base,
            "high": base + 2,
            "low": base - 2,
            "close": base + 1
        })
    # Add a bearish candle followed by a strong bullish engulfing candle
    candles[-2] = {"timestamp": "33", "open": 2035.0, "high": 2036.0, "low": 2030.0, "close": 2031.0}
    candles[-1] = {"timestamp": "34", "open": 2030.0, "high": 2045.0, "low": 2029.0, "close": 2042.0}
    
    analysis = core_engine.analyze(candles, symbol="TEST", timeframe="M15")
    assert analysis["bullish_engulfing"] is True

def test_fvg_detection(core_engine):
    candles = []
    for i in range(35):
        base = 1900.0
        candles.append({
            "timestamp": str(i),
            "open": base,
            "high": base + 1,
            "low": base - 1,
            "close": base + 0.5
        })
    # Create a Bullish FVG gap at the end
    candles[-3] = {"timestamp": "32", "open": 1900.0, "high": 1905.0, "low": 1898.0, "close": 1902.0}
    candles[-2] = {"timestamp": "33", "open": 1905.0, "high": 1925.0, "low": 1904.0, "close": 1922.0}
    candles[-1] = {"timestamp": "34", "open": 1922.0, "high": 1930.0, "low": 1912.0, "close": 1928.0}
    # Notice candle[-1].low (1912) > candle[-3].high (1905), creating an active FVG gap
    
    analysis = core_engine.analyze(candles, symbol="TEST_FVG", timeframe="M15")
    assert analysis["fvg_bull_active"] is True

def test_execution_latency(core_engine):
    candles = []
    for i in range(100):
        base = 2000 + (i % 5) * 2
        candles.append({
            "timestamp": str(i),
            "open": base,
            "high": base + 3,
            "low": base - 3,
            "close": base + 1
        })
    
    t0 = time.perf_counter()
    for _ in range(50):
        core_engine.analyze(candles, symbol="PERF", timeframe="M15")
    t1 = time.perf_counter()
    
    avg_latency_ms = ((t1 - t0) / 50) * 1000
    assert avg_latency_ms < 5.0, f"Average latency too high: {avg_latency_ms:.3f}ms"

