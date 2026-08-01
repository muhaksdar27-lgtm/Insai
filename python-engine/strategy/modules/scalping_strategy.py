from typing import Dict, Any, List, Tuple, Optional
from strategy.base_strategy import BaseStrategy, StrategyMetadata, StrategyEvaluationResult

class ScalpingStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-3-scalping",
            name="STRATEGI 3 - Scalping SMC + Liquidity Sweep + Double Top/Bottom",
            priority=3,
            version="2.0.0",
            dependencies=[],
            required_indicators=["trend", "retracement", "liquidity_sweep", "double_pattern", "neckline_break"],
            required_timeframes=["1m", "5m", "M1", "M5"],
            required_market_conditions=["trending", "high_volatility"],
            required_confirmations=["neckline_break"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        normalized_tf = timeframe.upper().replace("M", "")
        return normalized_tf in ["1", "1M", "5", "5M"]

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        if risk == 0:
            return False
        return (reward / risk) >= 2.0

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

        # 1. Trend Alignment Gate (25%)
        trend_h1 = analysis.get("trend_h1", "neutral").lower()
        if direction_norm == 'LONG':
            if trend_h1 == "bearish":
                failed_rules.append("Rule 1 [Trend]: Counter-trend H1 Bearish")
                reasons.append("Scalping LONG requires non-bearish H1 trend")
                breakdown["trend"] = 0.0
            else:
                passed_rules.append("Rule 1 [Trend]: H1 Trend Aligned (" + trend_h1.capitalize() + ")")
                breakdown["trend"] = 25.0
        else:
            if trend_h1 == "bullish":
                failed_rules.append("Rule 1 [Trend]: Counter-trend H1 Bullish")
                reasons.append("Scalping SHORT requires non-bullish H1 trend")
                breakdown["trend"] = 0.0
            else:
                passed_rules.append("Rule 1 [Trend]: H1 Trend Aligned (" + trend_h1.capitalize() + ")")
                breakdown["trend"] = 25.0

        # 2. Liquidity Sweep Gate (25%)
        if direction_norm == 'LONG':
            if analysis.get('liq_sweep_bull'):
                passed_rules.append("Rule 2 [Sweep]: Bullish Liquidity Sweep Confirmed")
                breakdown["sweep"] = 25.0
            else:
                failed_rules.append("Rule 2 [Sweep]: Missing Bullish Liquidity Sweep")
                reasons.append("No liquidity sweep detected prior to scalp entry")
                breakdown["sweep"] = 0.0
        else:
            if analysis.get('liq_sweep_bear'):
                passed_rules.append("Rule 2 [Sweep]: Bearish Liquidity Sweep Confirmed")
                breakdown["sweep"] = 25.0
            else:
                failed_rules.append("Rule 2 [Sweep]: Missing Bearish Liquidity Sweep")
                reasons.append("No liquidity sweep detected prior to scalp entry")
                breakdown["sweep"] = 0.0

        # 3. Double Pattern Gate (25%)
        if direction_norm == 'LONG':
            if analysis.get('double_bottom'):
                passed_rules.append("Rule 3 [Pattern]: Double Bottom Pattern Confirmed")
                breakdown["pattern"] = 25.0
            else:
                failed_rules.append("Rule 3 [Pattern]: Missing Double Bottom Pattern")
                reasons.append("Double Bottom chart pattern is required")
                breakdown["pattern"] = 0.0
        else:
            if analysis.get('double_top'):
                passed_rules.append("Rule 3 [Pattern]: Double Top Pattern Confirmed")
                breakdown["pattern"] = 25.0
            else:
                failed_rules.append("Rule 3 [Pattern]: Missing Double Top Pattern")
                reasons.append("Double Top chart pattern is required")
                breakdown["pattern"] = 0.0

        # 4. Neckline Break / BOS Gate (25%)
        if direction_norm == 'LONG':
            if analysis.get('bos_bull') or analysis.get('choch_bull'):
                passed_rules.append("Rule 4 [Break]: Neckline Break / Bullish BOS Confirmed")
                breakdown["break"] = 25.0
            else:
                failed_rules.append("Rule 4 [Break]: Missing Neckline Break / BOS")
                reasons.append("Structural break of pattern neckline required")
                breakdown["break"] = 0.0
        else:
            if analysis.get('bos_bear') or analysis.get('choch_bear'):
                passed_rules.append("Rule 4 [Break]: Neckline Break / Bearish BOS Confirmed")
                breakdown["break"] = 25.0
            else:
                failed_rules.append("Rule 4 [Break]: Missing Neckline Break / BOS")
                reasons.append("Structural break of pattern neckline required")
                breakdown["break"] = 0.0

        total_weighted = sum(breakdown.values())
        all_passed = len(failed_rules) == 0

        if entry > 0 and sl > 0 and tp > 0:
            risk = abs(entry - sl)
            reward = abs(tp - entry)
            rr = reward / risk if risk > 0 else 0
            if rr < 2.0:
                all_passed = False
                failed_rules.append(f"Rule 5 [Risk]: RR ratio {rr:.2f} below minimum 2.0")
                reasons.append("Scalping requires RR >= 2.0")
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

