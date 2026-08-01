from typing import Dict, Any, List, Tuple, Optional
from abc import ABC, abstractmethod
from pydantic import BaseModel

class StrategyMetadata(BaseModel):
    id: str
    name: str
    priority: int
    version: str
    dependencies: List[str] = []
    required_indicators: List[str] = []
    required_timeframes: List[str] = []
    required_market_conditions: List[str] = []
    required_confirmations: List[str] = []

class StrategyEvaluationResult(BaseModel):
    strategy_id: str
    passed: bool
    score: int
    confidence: int
    passed_rules: List[str]
    failed_rules: List[str]
    reasons: List[str]
    weighted_breakdown: Dict[str, float]

class BaseStrategy(ABC):
    @property
    @abstractmethod
    def metadata(self) -> StrategyMetadata:
        raise NotImplementedError("Subclasses must implement metadata")

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        meta = self.metadata
        if meta.required_timeframes:
            normalized_tf = timeframe.upper().replace("M", "")
            valid_tfs = [tf.upper().replace("M", "") for tf in meta.required_timeframes]
            if normalized_tf not in valid_tfs and timeframe not in meta.required_timeframes:
                return False
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        if risk == 0:
            return False
        return (reward / risk) >= 1.0

    @abstractmethod
    def evaluate_detailed(
        self, 
        direction: str, 
        analysis: Dict[str, Any], 
        z_score: float, 
        entry: float, 
        sl: float, 
        tp: float,
        session: Optional[str] = None,
        spread: Optional[float] = 0.0,
        news_active: Optional[bool] = False
    ) -> StrategyEvaluationResult:
        raise NotImplementedError("Subclasses must implement evaluate_detailed")

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        res = self.evaluate_detailed(direction, analysis, z_score, 0, 0, 0)
        return res.score, res.reasons

    def evaluate(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        return self.calculate_confidence(direction, analysis, z_score)

