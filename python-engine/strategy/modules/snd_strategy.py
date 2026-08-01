from typing import Dict, Any, List, Tuple, Optional
from strategy.base_strategy import BaseStrategy, StrategyMetadata, StrategyEvaluationResult

class SNDStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-2-snd",
            name="STRATEGI 2 - S&D + Engulfing",
            priority=4,
            version="2.0.0",
            dependencies=[],
            required_indicators=["ma", "sd_zone", "engulfing", "atr"],
            required_timeframes=[],
            required_market_conditions=["trending"],
            required_confirmations=["engulfing"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        return True

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

        # 1. Trend MA / Slope Alignment (30%)
        slope = analysis.get('trend_slope', 0)
        h1_trend = analysis.get('trend_h1', 'neutral').lower()
        if direction_norm == 'LONG':
            if slope > -0.01 or h1_trend != 'bearish':
                passed_rules.append("Rule 1 [Trend]: Trend Alignment Bullish/Neutral")
                breakdown["trend"] = 30.0
            else:
                failed_rules.append("Rule 1 [Trend]: Counter-trend against MA/Slope")
                reasons.append("Trend slope is opposing (Bearish)")
                breakdown["trend"] = 0.0
        else:
            if slope < 0.01 or h1_trend != 'bullish':
                passed_rules.append("Rule 1 [Trend]: Trend Alignment Bearish/Neutral")
                breakdown["trend"] = 30.0
            else:
                failed_rules.append("Rule 1 [Trend]: Counter-trend against MA/Slope")
                reasons.append("Trend slope is opposing (Bullish)")
                breakdown["trend"] = 0.0

        # 2. Supply / Demand Zone Touch (35%)
        if direction_norm == 'LONG':
            if analysis.get('snd_bull') or analysis.get('sd_zone_active'):
                passed_rules.append("Rule 2 [Zone]: Price inside Demand Zone")
                breakdown["zone"] = 35.0
            else:
                failed_rules.append("Rule 2 [Zone]: Price NOT in Demand Zone")
                reasons.append("Price is outside Demand Zone")
                breakdown["zone"] = 0.0
        else:
            if analysis.get('snd_bear') or analysis.get('sd_zone_active'):
                passed_rules.append("Rule 2 [Zone]: Price inside Supply Zone")
                breakdown["zone"] = 35.0
            else:
                failed_rules.append("Rule 2 [Zone]: Price NOT in Supply Zone")
                reasons.append("Price is outside Supply Zone")
                breakdown["zone"] = 0.0

        # 3. Engulfing Candlestick Trigger (35%)
        if direction_norm == 'LONG':
            if analysis.get('bullish_engulfing') or analysis.get('engulfing_bull'):
                passed_rules.append("Rule 3 [Trigger]: Bullish Engulfing Pattern Confirmed")
                breakdown["trigger"] = 35.0
            elif analysis.get('morning_star'):
                passed_rules.append("Rule 3 [Trigger]: Morning Star Candlestick Confirmed")
                breakdown["trigger"] = 25.0
            else:
                failed_rules.append("Rule 3 [Trigger]: Missing Bullish Engulfing Trigger")
                reasons.append("No Engulfing candlestick trigger detected")
                breakdown["trigger"] = 0.0
        else:
            if analysis.get('bearish_engulfing') or analysis.get('engulfing_bear'):
                passed_rules.append("Rule 3 [Trigger]: Bearish Engulfing Pattern Confirmed")
                breakdown["trigger"] = 35.0
            elif analysis.get('evening_star'):
                passed_rules.append("Rule 3 [Trigger]: Evening Star Candlestick Confirmed")
                breakdown["trigger"] = 25.0
            else:
                failed_rules.append("Rule 3 [Trigger]: Missing Bearish Engulfing Trigger")
                reasons.append("No Engulfing candlestick trigger detected")
                breakdown["trigger"] = 0.0

        total_weighted = sum(breakdown.values())
        all_passed = len(failed_rules) == 0

        if entry > 0 and sl > 0 and tp > 0:
            risk = abs(entry - sl)
            reward = abs(tp - entry)
            rr = reward / risk if risk > 0 else 0
            if rr < 1.5:
                all_passed = False
                failed_rules.append(f"Rule 4 [Risk]: RR ratio {rr:.2f} below minimum 1.5")
                reasons.append("Risk/Reward ratio is too low")
            else:
                passed_rules.append(f"Rule 4 [Risk]: Valid RR ratio ({rr:.2f})")

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

