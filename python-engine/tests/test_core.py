import pytest
import numpy as np
from core_engine import CoreEngine

def test_core_engine_initialization():
    engine = CoreEngine()
    assert engine is not None

def test_core_engine_analyze_minimal():
    engine = CoreEngine()
    # Provide dummy candles with enough items
    candles = [
        {"close": 100 + i, "high": 102 + i, "low": 98 + i, "open": 99 + i, "volume": 1000}
        for i in range(30)
    ]
    analysis = engine.analyze(candles)
    assert analysis is not None
    assert "trend_slope" in analysis
    assert "volatility" in analysis
    assert "atr" in analysis
