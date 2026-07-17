import pytest
import numpy as np
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
    result = core_engine.analyze([])
    assert result == {}

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
    assert "trend" in analysis
    assert "volatility" in analysis
    assert analysis["trend"] == "UP"
