import pytest
from strategy.modules.smc_strategy import SMCStrategy
from strategy.modules.snd_strategy import SNDStrategy
from strategy.modules.scalping_strategy import ScalpingStrategy
from strategy.modules.news_strategy import NewsStrategy
from strategy.modules.confluence_strategy import ConfluenceStrategy

def test_smc_strategy_pass_and_fail():
    strat = SMCStrategy()
    
    # 1. PASS dataset for SMC (BUY/LONG)
    pass_analysis = {
        "trend_slope": 0.05,
        "trend_h1": "bullish",
        "liq_sweep_bull": True,
        "bos_bull": True,
        "ob_bull": True,
        "fvg_bull_active": True
    }
    res_pass = strat.evaluate_detailed(
        direction="LONG",
        analysis=pass_analysis,
        z_score=-0.8,
        entry=2000.0,
        sl=1990.0,
        tp=2030.0,
        session="London",
        spread=1.0,
        news_active=False
    )
    assert res_pass.passed is True
    assert res_pass.confidence == 100
    assert len(res_pass.passed_rules) >= 5
    assert len(res_pass.failed_rules) == 0

    # 2. FAIL dataset for SMC (Missing Liquidity Sweep and Poor RR)
    fail_analysis = {
        "trend_slope": 0.05,
        "trend_h1": "bullish",
        "liq_sweep_bull": False, # MISSING
        "bos_bull": True,
        "ob_bull": True,
        "fvg_bull_active": True
    }
    res_fail = strat.evaluate_detailed(
        direction="LONG",
        analysis=fail_analysis,
        z_score=-0.8,
        entry=2000.0,
        sl=1995.0,
        tp=2002.0, # RR = 0.4 < 1.5
        session="London",
        spread=1.0,
        news_active=False
    )
    assert res_fail.passed is False
    assert res_fail.confidence <= 45
    assert len(res_fail.failed_rules) > 0


def test_snd_strategy_pass_and_fail():
    strat = SNDStrategy()
    
    # PASS dataset for S&D
    pass_analysis = {
        "trend_slope": 0.02,
        "snd_bull": True,
        "bullish_engulfing": True
    }
    res_pass = strat.evaluate_detailed(
        direction="LONG",
        analysis=pass_analysis,
        z_score=0.0,
        entry=2000.0,
        sl=1990.0,
        tp=2020.0
    )
    assert res_pass.passed is True
    assert res_pass.score == 100

    # FAIL dataset for S&D (Outside zone)
    fail_analysis = {
        "trend_slope": 0.02,
        "snd_bull": False, # Outside zone
        "bullish_engulfing": True
    }
    res_fail = strat.evaluate_detailed(
        direction="LONG",
        analysis=fail_analysis,
        z_score=0.0,
        entry=2000.0,
        sl=1990.0,
        tp=2020.0
    )
    assert res_fail.passed is False


def test_scalping_strategy_pass_and_fail():
    strat = ScalpingStrategy()

    # PASS dataset for Scalping
    pass_analysis = {
        "trend_h1": "bullish",
        "liq_sweep_bull": True,
        "double_bottom": True,
        "bos_bull": True
    }
    res_pass = strat.evaluate_detailed(
        direction="LONG",
        analysis=pass_analysis,
        z_score=-1.0,
        entry=2000.0,
        sl=1995.0,
        tp=2015.0 # RR = 3.0 >= 2.0
    )
    assert res_pass.passed is True
    assert res_pass.score == 100

    # FAIL dataset for Scalping (Counter-trend)
    fail_analysis = {
        "trend_h1": "bearish", # COUNTER TREND
        "liq_sweep_bull": True,
        "double_bottom": True,
        "bos_bull": True
    }
    res_fail = strat.evaluate_detailed(
        direction="LONG",
        analysis=fail_analysis,
        z_score=-1.0,
        entry=2000.0,
        sl=1995.0,
        tp=2015.0
    )
    assert res_fail.passed is False


def test_news_strategy_pass_and_fail():
    strat = NewsStrategy()

    # PASS dataset for News Strategy
    pass_analysis = {
        "spread_acceptable": True,
        "liq_sweep_bull": True,
        "bos_bull": True
    }
    res_pass = strat.evaluate_detailed(
        direction="LONG",
        analysis=pass_analysis,
        z_score=0.0,
        entry=2000.0,
        sl=1990.0,
        tp=2020.0,
        news_active=True
    )
    assert res_pass.passed is True

    # FAIL dataset for News Strategy (No news active)
    res_fail = strat.evaluate_detailed(
        direction="LONG",
        analysis=pass_analysis,
        z_score=0.0,
        entry=2000.0,
        sl=1990.0,
        tp=2020.0,
        news_active=False
    )
    assert res_fail.passed is False


def test_confluence_strategy_pass_and_fail():
    strat = ConfluenceStrategy()

    # PASS dataset for Confluence (All 4 layers)
    pass_analysis = {
        "trend_slope": 0.05,
        "ob_bull": True,
        "fvg_bull_active": True,
        "snd_bull": True,
        "liq_sweep_bull": True,
        "bullish_engulfing": True
    }
    res_pass = strat.evaluate_detailed(
        direction="LONG",
        analysis=pass_analysis,
        z_score=0.0,
        entry=2000.0,
        sl=1990.0,
        tp=2020.0
    )
    assert res_pass.passed is True
    assert res_pass.score == 100

    # FAIL dataset for Confluence (Missing candlestick trigger)
    fail_analysis = {
        "trend_slope": 0.05,
        "ob_bull": True,
        "fvg_bull_active": True,
        "snd_bull": True,
        "liq_sweep_bull": True,
        "bullish_engulfing": False # MISSING TRIGGER
    }
    res_fail = strat.evaluate_detailed(
        direction="LONG",
        analysis=fail_analysis,
        z_score=0.0,
        entry=2000.0,
        sl=1990.0,
        tp=2020.0
    )
    assert res_fail.passed is False
