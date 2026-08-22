from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone

class Candle(BaseModel):
    timestamp: str
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    volume: Optional[float] = 0.0

class AnalysisRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str = "XAUUSD"
    timeframe: str = "M15"
    candles: List[Candle] = Field(default_factory=list)
    timestamp: Optional[str] = None
    session: Optional[str] = None
    strategy_id: Optional[str] = None
    analysis_type: str = "FULL_ANALYSIS"
    analysis_parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    market_context: Optional[Dict[str, Any]] = Field(default_factory=dict)
    # Multi-timeframe support for backward compatibility
    multi_tf_candles: Optional[Dict[str, List[Candle]]] = None

class AnalysisResponse(BaseModel):
    request_id: str
    status: str  # "SUCCESS" | "INSUFFICIENT_DATA" | "ANALYSIS_ERROR" | "TIMEOUT" | "INVALID_INPUT"
    detected: Optional[bool] = None
    analysis_type: str
    values: Dict[str, Any] = Field(default_factory=dict)
    evidence: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    source: str = "python_engine"
    error: Optional[str] = None

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


