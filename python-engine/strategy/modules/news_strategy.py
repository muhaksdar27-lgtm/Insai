from typing import Dict, Any, List, Tuple, Optional
from strategy.base_strategy import BaseStrategy, StrategyMetadata, StrategyEvaluationResult

class NewsStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-4-news",
            name="STRATEGI 4 - News Liquidity Sweep Reversal",
            priority=2,
            version="2.0.0",
            dependencies=[],
            required_indicators=["news", "liq_sweep", "rejection", "bos"],
            required_timeframes=["1m", "5m", "M1", "M5"],
            required_market_conditions=["high_impact_news"],
            required_confirmations=["bos"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        normalized_tf = timeframe.upper().replace("M", "")
        return normalized_tf in ["1", "1M", "5", "5M"]

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        if risk == 0:
            return False
        return (reward / risk) >= 1.5

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
        dir_upper = direction.upper()
        if dir_upper in ['BUY', 'LONG']:
            direction_norm = 'LONG'
        elif dir_upper in ['SELL', 'SHORT']:
            direction_norm = 'SHORT'
        else:
            direction_norm = dir_upper

        passed_rules: List[str] = []
        failed_rules: List[str] = []
        reasons: List[str] = []
        breakdown: Dict[str, float] = {}

        # 1. High Impact News Active Gate (25%)
        is_news_active = news_active or analysis.get('news_high_impact_active', False)
        if is_news_active:
            passed_rules.append("Rule 1 [News]: High Impact News Event Active")
            breakdown["news"] = 25.0
        else:
            failed_rules.append("Rule 1 [News]: No Active High Impact News Event")
            reasons.append("Strategy 4 requires high impact news release window")
            breakdown["news"] = 0.0

        # 2. Spread / Slippage Acceptable Gate (15%)
        is_spread_ok = analysis.get('spread_acceptable', True)
        if spread and spread > 5.0:
            is_spread_ok = False

        if is_spread_ok:
            passed_rules.append("Rule 2 [Spread]: Spread and Slippage within Tolerance")
            breakdown["spread"] = 15.0
        else:
            failed_rules.append("Rule 2 [Spread]: Spread / Slippage Exceeds Tolerance")
            reasons.append("Spread too wide for news trade execution")
            breakdown["spread"] = 0.0

        # 3. News Liquidity Sweep Gate (30%)
        if direction_norm == 'LONG':
            if analysis.get('liq_sweep_bull'):
                passed_rules.append("Rule 3 [Sweep]: News Liquidity Sweep Bullish Confirmed")
                breakdown["sweep"] = 30.0
            else:
                failed_rules.append("Rule 3 [Sweep]: Missing News Liquidity Sweep Bullish")
                reasons.append("Requires news spike liquidity sweep before reversal")
                breakdown["sweep"] = 0.0
        else:
            if analysis.get('liq_sweep_bear'):
                passed_rules.append("Rule 3 [Sweep]: News Liquidity Sweep Bearish Confirmed")
                breakdown["sweep"] = 30.0
            else:
                failed_rules.append("Rule 3 [Sweep]: Missing News Liquidity Sweep Bearish")
                reasons.append("Requires news spike liquidity sweep before reversal")
                breakdown["sweep"] = 0.0

        # 4. Post-News Structural Confirmation Gate (30%)
        if direction_norm == 'LONG':
            if analysis.get('bos_bull') or analysis.get('choch_bull'):
                passed_rules.append("Rule 4 [Structure]: Post-News Bullish BOS/CHoCH Confirmed")
                breakdown["structure"] = 30.0
            else:
                failed_rules.append("Rule 4 [Structure]: Missing Post-News Structural Confirmation")
                reasons.append("Do not enter on first spike candle; wait for structural break")
                breakdown["structure"] = 0.0
        else:
            if analysis.get('bos_bear') or analysis.get('choch_bear'):
                passed_rules.append("Rule 4 [Structure]: Post-News Bearish BOS/CHoCH Confirmed")
                breakdown["structure"] = 30.0
            else:
                failed_rules.append("Rule 4 [Structure]: Missing Post-News Structural Confirmation")
                reasons.append("Do not enter on first spike candle; wait for structural break")
                breakdown["structure"] = 0.0

        total_weighted = sum(breakdown.values())
        all_passed = len(failed_rules) == 0

        if entry > 0 and sl > 0 and tp > 0:
            risk = abs(entry - sl)
            reward = abs(tp - entry)
            rr = reward / risk if risk > 0 else 0
            if rr < 1.5:
                all_passed = False
                failed_rules.append(f"Rule 5 [Risk]: RR ratio {rr:.2f} below minimum 1.5")
                reasons.append("News strategy requires RR >= 1.5")
            else:
                passed_rules.append(f"Rule 5 [Risk]: Valid RR ratio ({rr:.2f})")

        confidence = int(total_weighted) if all_passed else min(45, int(total_weighted))

        return StrategyEvaluationResult(
            strategy_id=self.metadata.id,
            passed=all_passed,
            score=confidence,
            confidence=confidence,
            passed_rules=passed_rules,
            failed_rules=failed_rules,
            reasons=reasons,
            weighted_breakdown=breakdown
        )

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        res = self.evaluate_detailed(direction, analysis, z_score, 0, 0, 0)
        return res.confidence, res.passed_rules + res.failed_rules + res.reasons

