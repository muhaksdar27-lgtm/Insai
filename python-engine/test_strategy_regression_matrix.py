import pytest
from datetime import datetime, timezone
from models.schemas import AnalysisRequest, ValidationRequest, Candle
from strategy_engine import StrategyEngine
from validation.signal_validator import validate_signal
from deterministic_analyzer import (
    calculate_atr,
    calculate_rsi,
    calculate_ma,
    detect_swings,
    detect_trend_structure,
    detect_liquidity_sweep,
    run_full_analysis,
    dispatch_analysis
)

def make_candles(count=40, base_price=2680.0):
    candles = []
    p = base_price
    for i in range(count):
        ts = f"2025-01-15T08:{i%60:02d}:00Z"
        op = p
        hi = p + 2.0
        lo = p - 1.0
        cl = p + 1.2
        p += 0.5
        candles.append(Candle(
            timestamp=ts,
            open=float(round(op, 2)),
            high=float(round(hi, 2)),
            low=float(round(lo, 2)),
            close=float(round(cl, 2)),
            volume=1200.0 + i * 10
        ))
    return candles

class TestPythonStrategyRegressionMatrix:
    @classmethod
    def setup_class(cls):
        cls.engine = StrategyEngine()

    def test_1_empty_candles_raises_validation_exception(self):
        req = ValidationRequest(
            symbol="XAUUSD",
            timeframe="M15",
            direction="BUY",
            entry_price=2680.0,
            sl_price=2670.0,
            tp_price=2700.0,
            candles=[],
            strategy_id="strategy-1-smc"
        )
        with pytest.raises(Exception) as exc_info:
            validate_signal(req)
        assert "Insufficient candle data" in str(exc_info.value)

    def test_2_insufficient_candles_count(self):
        short_candles = make_candles(10)
        req = ValidationRequest(
            symbol="XAUUSD",
            timeframe="M15",
            direction="BUY",
            entry_price=2680.0,
            sl_price=2670.0,
            tp_price=2700.0,
            candles=short_candles,
            strategy_id="strategy-1-smc"
        )
        with pytest.raises(Exception) as exc_info:
            validate_signal(req)
        assert "need >= 30" in str(exc_info.value)

    def test_3_strategy_isolation_and_dispatch(self):
        candles = make_candles(45)
        req = ValidationRequest(
            symbol="XAUUSD",
            timeframe="M15",
            direction="BUY",
            entry_price=2700.0,
            sl_price=2690.0,
            tp_price=2720.0,
            candles=candles,
            strategy_id="strategy-1-smc"
        )
        res = validate_signal(req)
        assert res.status == "success"
        assert res.decision in ["APPROVED", "REJECTED", "WAIT"]
        assert isinstance(res.passed_rules, list)
        assert isinstance(res.failed_rules, list)

    def test_4_all_5_strategy_modules_registered(self):
        strategy_ids = [s.metadata.id for s in self.engine.strategies]
        assert "strategy-1-smc" in strategy_ids
        assert "strategy-2-snd" in strategy_ids
        assert "strategy-3-scalping" in strategy_ids
        assert "strategy-4-news" in strategy_ids
        assert "strategy-5-smc-sd-confluence" in strategy_ids

    def test_5_unknown_strategy_id_fails_cleanly(self):
        res = self.engine.evaluate_strategy_detailed(
            direction="BUY",
            analysis={},
            z_score=0.0,
            timeframe="M15",
            entry=2700.0,
            sl=2690.0,
            tp=2720.0,
            target_strat_id="non-existent-strategy-id"
        )
        assert res.passed is False
        assert res.score == 0
        assert "Target strategy not registered" in res.failed_rules[0]

    def test_6_news_strategy_evaluates_news_requirement(self):
        # Strategy 4 evaluation with news_active=False
        res_no_news = self.engine.evaluate_strategy_detailed(
            direction="BUY",
            analysis={"trend": "BULLISH", "atr": 4.5},
            z_score=1.0,
            timeframe="M15",
            entry=2700.0,
            sl=2690.0,
            tp=2720.0,
            target_strat_id="strategy-4-news",
            news_active=False
        )
        assert res_no_news.strategy_id == "strategy-4-news"

    def test_7_missing_atr_fails_deterministic_indicator(self):
        short = make_candles(5)
        atr_res = calculate_atr(short, period=14)
        assert atr_res["status"] == "INSUFFICIENT_DATA"
        assert "atr" not in atr_res.get("values", {})
