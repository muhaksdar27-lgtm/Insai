import time
import hashlib
from typing import Dict, Any, Tuple, List, Optional
from shared_utilities import get_logger
from strategy.strategy_registry import registry
from strategy.base_strategy import StrategyEvaluationResult
from config.settings import settings

logger = get_logger("StrategyEngine")

class StrategyEngine:
    """
    Strategy Engine that dynamically runs registered strategies for lowest latency.
    Supports detailed rule-by-rule evaluation, weighted scoring, and explainability.
    """
    def __init__(self):
        self.strategies = registry.get_sorted_strategies()
        from collections import OrderedDict
        self._cache = OrderedDict()
        self._max_cache_size = 512

    def _generate_cache_key(self, direction: str, analysis: Dict[str, Any], z_score: float, timeframe: str, entry: float, sl: float, tp: float, target_strat_id: str) -> str:
        sig = f"{direction}_{timeframe}_{entry}_{sl}_{tp}_{target_strat_id}_{z_score:.4f}"
        if analysis:
            sig += f"_{analysis.get('trend_slope', 0):.4f}_{analysis.get('volatility', 0):.6f}"
        return sig

    def evaluate_strategy_detailed(
        self,
        direction: str,
        analysis: Dict[str, Any],
        z_score: float,
        timeframe: str,
        entry: float,
        sl: float,
        tp: float,
        target_strat_id: Optional[str] = None,
        session: Optional[str] = None,
        spread: Optional[float] = 0.0,
        news_active: Optional[bool] = False
    ) -> StrategyEvaluationResult:
        strategies_to_run = self.strategies
        if target_strat_id:
            strategies_to_run = [s for s in self.strategies if target_strat_id == s.metadata.id]

        if not strategies_to_run:
            logger.warning(f"No strategy matched target '{target_strat_id}'")
            return StrategyEvaluationResult(
                strategy_id=target_strat_id or "unknown",
                passed=False,
                score=0,
                confidence=0,
                passed_rules=[],
                failed_rules=["Strategy Error: Target strategy not registered or found"],
                reasons=["Strategy not found in strategy engine registry"],
                weighted_breakdown={}
            )

        best_result: Optional[StrategyEvaluationResult] = None

        for strategy in strategies_to_run:
            try:
                res = strategy.evaluate_detailed(
                    direction=direction,
                    analysis=analysis,
                    z_score=z_score,
                    entry=entry,
                    sl=sl,
                    tp=tp,
                    session=session,
                    spread=spread,
                    news_active=news_active
                )
                if target_strat_id or res.passed:
                    return res

                if best_result is None or res.score > best_result.score:
                    best_result = res
            except Exception as e:
                logger.error(f"Strategy Error ({strategy.metadata.id}): {e}")

        return best_result or StrategyEvaluationResult(
            strategy_id="none",
            passed=False,
            score=0,
            confidence=0,
            passed_rules=[],
            failed_rules=["All strategy evaluations failed"],
            reasons=["No strategy passed evaluation"],
            weighted_breakdown={}
        )

    def run_all(self, direction: str, analysis: Dict[str, Any], z_score: float, timeframe: str, entry: float, sl: float, tp: float, target_strat_id: str = None) -> Tuple[int, List[str]]:
        res = self.evaluate_strategy_detailed(direction, analysis, z_score, timeframe, entry, sl, tp, target_strat_id)
        all_reasons = res.passed_rules + res.failed_rules + res.reasons
        return res.score, all_reasons

