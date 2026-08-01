from typing import Tuple, List, Dict, Any, TYPE_CHECKING
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if TYPE_CHECKING:
    from strategy_engine import StrategyEngine

from shared_utilities import get_logger
from scoring.session_analyzer import get_session_info

logger = get_logger("QuantScorer")

_global_strategy_engine = None

def get_global_strategy_engine():
    global _global_strategy_engine
    if _global_strategy_engine is None:
        from strategy_engine import StrategyEngine
        _global_strategy_engine = StrategyEngine()
    return _global_strategy_engine

class QuantScorer:
    def __init__(self, direction: str, entry_price: float, sl_price: float, tp_price: float, analysis: Dict[str, Any], timeframe: str = "15m", strategy_id: str = None, strategy_engine: Any = None):
        self.direction = direction.upper()
        self.entry_price = entry_price
        self.sl_price = sl_price
        self.tp_price = tp_price
        self.timeframe = timeframe
        self.analysis = analysis
        self.score = 0
        self.reasons: List[str] = []
        self.z_score = 0.0
        self.rr_ratio = 0.0
        self.strategy_id = strategy_id
        if strategy_engine:
            self.strategy_engine = strategy_engine
        else:
            self.strategy_engine = get_global_strategy_engine()

    def calculate_metrics(self):
        if self.analysis.get('std_20', 0) > 0:
            self.z_score = (self.entry_price - self.analysis.get('ma_20', self.entry_price)) / self.analysis['std_20']
        
        risk = abs(self.entry_price - self.sl_price)
        reward = abs(self.tp_price - self.entry_price)
        self.rr_ratio = reward / risk if risk > 0 else 0

    def get_decision(self) -> str:
        if self.score >= 80:
            return "APPROVED"
        elif self.score >= 50:
            return "WAIT"
        return "REJECTED"

    def score_setup(self) -> Tuple[str, int, List[str], float, float, List[str], List[str], int, Dict[str, Any]]:
        logger.info(f"Calculating metrics and RR for setup for strategy {self.strategy_id}...")
        self.calculate_metrics()
        
        eval_res = self.strategy_engine.evaluate_strategy_detailed(
            direction=self.direction,
            analysis=self.analysis,
            z_score=self.z_score,
            timeframe=self.timeframe,
            entry=self.entry_price,
            sl=self.sl_price,
            tp=self.tp_price,
            target_strat_id=self.strategy_id
        )

        self.score = eval_res.score
        self.reasons = eval_res.reasons
        
        if eval_res.passed:
            if eval_res.score >= 80:
                decision = "APPROVED"
            elif eval_res.score >= 50:
                decision = "WAIT"
            else:
                decision = "REJECTED"
        else:
            decision = "REJECTED"

        explainability = {
            "strategy_id": eval_res.strategy_id,
            "weighted_breakdown": eval_res.weighted_breakdown,
            "rule_checks": {
                "passed": eval_res.passed_rules,
                "failed": eval_res.failed_rules
            }
        }

        logger.info(f"Scoring completed. Final Decision: {decision}, Score: {self.score}, Confidence: {eval_res.confidence}")
        return (
            decision, 
            self.score, 
            self.reasons, 
            self.z_score, 
            self.rr_ratio,
            eval_res.passed_rules,
            eval_res.failed_rules,
            eval_res.confidence,
            explainability
        )

