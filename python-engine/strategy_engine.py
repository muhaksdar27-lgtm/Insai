import time
import hashlib
from typing import Dict, Any, Tuple, List
from shared_utilities import get_logger
from strategy.strategy_registry import registry
from config.settings import settings

logger = get_logger("StrategyEngine")

class StrategyEngine:
    """
    Strategy Engine that dynamically runs registered strategies sequentially for lowest latency.
    Uses native caching to prevent duplicate evaluations for the same market conditions.
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

    def run_all(self, direction: str, analysis: Dict[str, Any], z_score: float, timeframe: str, entry: float, sl: float, tp: float, target_strat_id: str = None) -> Tuple[int, List[str]]:
        
        cache_key = self._generate_cache_key(direction, analysis, z_score, timeframe, entry, sl, tp, target_strat_id)
        if cache_key in self._cache:
            self._cache.move_to_end(cache_key)
            return self._cache[cache_key]
            
        logger.info(f"Running strategy engine sequentially for target: {target_strat_id}")
        
        strategies_to_run = self.strategies
        if target_strat_id:
            strategies_to_run = [s for s in self.strategies if target_strat_id == s.metadata.id]

        total_score = 0
        all_reasons = []

        if not strategies_to_run:
            logger.warning(f"No strategies matched target '{target_strat_id}'")
            return total_score, all_reasons

        for strategy in strategies_to_run:
            try:
                # If target explicitly specified, skip validate checks that might falsely drop it. 
                # Let the strategy scoring decide.
                if not target_strat_id:
                    if not strategy.validate(timeframe, analysis):
                        continue
                    if not strategy.validate_risk(entry, sl, tp):
                        continue
                
                score, reasons = strategy.evaluate(direction, analysis, z_score)
                total_score += score
                all_reasons.extend(reasons)
                
                if score > 0 and not target_strat_id:
                    break
            except Exception as e:
                logger.error(f"Strategy Error ({strategy.metadata.id}): {e}")
                all_reasons.append(f"Error in strategy {strategy.metadata.id}: {e}")

        logger.info(f"Strategy execution completed. Strat Score: {total_score}")
        
        result = (total_score, all_reasons)
        self._cache[cache_key] = result
        self._cache.move_to_end(cache_key)
        if len(self._cache) > self._max_cache_size:
            self._cache.popitem(last=False)
            
        return result
