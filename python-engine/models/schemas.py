from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class Candle(BaseModel):
    timestamp: str
    open: Optional[float] = 0.0
    high: Optional[float] = 0.0
    low: Optional[float] = 0.0
    close: Optional[float] = 0.0
    volume: Optional[float] = 0.0

class ValidationRequest(BaseModel):
    symbol: str
    timeframe: str
    direction: str
    entry_price: float
    sl_price: float
    tp_price: float
    candles: List[Candle]
    strategy_id: Optional[str] = None
    spread: Optional[float] = 0.0
    news_active: Optional[bool] = False
    session: Optional[str] = None
    multi_tf_candles: Optional[Dict[str, List[Candle]]] = None

class AnalysisResult(BaseModel):
    fvg_bull_active: bool
    fvg_bear_active: bool
    bullish_engulfing: bool
    bearish_engulfing: bool
    morning_star: bool
    evening_star: bool
    double_top: bool
    double_bottom: bool
    bos_bull: bool
    bos_bear: bool
    choch_bull: bool
    choch_bear: bool
    liq_sweep_bull: bool
    liq_sweep_bear: bool
    ob_bull: bool
    ob_bear: bool
    volatility: float
    ma_20: float
    std_20: float
    trend_slope: float

class ValidationResponseMetrics(BaseModel):
    volatility: float
    z_score: float
    rr_ratio: float
    trend_slope: float
    fvg_bull: bool
    fvg_bear: bool
    liq_sweep_bull: bool
    liq_sweep_bear: bool
    bos_bull: bool
    bos_bear: bool
    choch_bull: bool
    choch_bear: bool

class ValidationResponse(BaseModel):
    status: str
    decision: str  # "APPROVED" | "WAIT" | "REJECTED"
    quant_score: int
    confidence: int
    passed_rules: List[str]
    failed_rules: List[str]
    reasons: List[str]
    metrics: ValidationResponseMetrics
    explainability: Optional[Dict[str, Any]] = None

