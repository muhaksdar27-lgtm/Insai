from typing import Dict, Any, List, Tuple, Optional
from strategy.base_strategy import BaseStrategy, StrategyMetadata, StrategyEvaluationResult

class ConfluenceStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-5-smc-sd-confluence",
            name="STRATEGI 5 - SMC-SD Pattern Confluence",
            priority=1,
            version="2.0.0",
            dependencies=[],
            required_indicators=["trend", "zones", "liquidity", "trigger"],
            required_timeframes=[],
            required_market_conditions=["trending"],
            required_confirmations=["engulfing", "pin_bar"]
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

        slope = analysis.get('trend_slope', 0)
        h1_trend = analysis.get('trend_h1', 'neutral').lower()

        # Layer 1: Trend Alignment (25%)
        if direction_norm == 'LONG':
            if slope > -0.01 or h1_trend == "bullish":
                passed_rules.append("Layer 1 [Trend]: Trend Aligned Bullish")
                breakdown["trend"] = 25.0
            else:
                failed_rules.append("Layer 1 [Trend]: Counter-trend H1 Bearish")
                reasons.append("Trend is opposing (Bearish)")
                breakdown["trend"] = 0.0
        else:
            if slope < 0.01 or h1_trend == "bearish":
                passed_rules.append("Layer 1 [Trend]: Trend Aligned Bearish")
                breakdown["trend"] = 25.0
            else:
                failed_rules.append("Layer 1 [Trend]: Counter-trend H1 Bullish")
                reasons.append("Trend is opposing (Bullish)")
                breakdown["trend"] = 0.0

        # Layer 2: Zones Overlap - At least 2 of (OB, FVG, S&D) (25%)
        zones = 0
        if direction_norm == 'LONG':
            if analysis.get('ob_bull') or analysis.get('ob_fvg_bull'): zones += 1
            if analysis.get('fvg_bull_active'): zones += 1
            if analysis.get('snd_bull') or analysis.get('sd_zone_active'): zones += 1
            
            if zones >= 2:
                passed_rules.append(f"Layer 2 [Zones]: Confluence of {zones} Bullish Zones (OB/FVG/S&D)")
                breakdown["zones"] = 25.0
            else:
                failed_rules.append(f"Layer 2 [Zones]: Insufficient Zone Confluence ({zones}/2 required)")
                reasons.append("Requires at least 2 overlapping POI zones")
                breakdown["zones"] = 0.0
        else:
            if analysis.get('ob_bear') or analysis.get('ob_fvg_bear'): zones += 1
            if analysis.get('fvg_bear_active'): zones += 1
            if analysis.get('snd_bear') or analysis.get('sd_zone_active'): zones += 1

            if zones >= 2:
                passed_rules.append(f"Layer 2 [Zones]: Confluence of {zones} Bearish Zones (OB/FVG/S&D)")
                breakdown["zones"] = 25.0
            else:
                failed_rules.append(f"Layer 2 [Zones]: Insufficient Zone Confluence ({zones}/2 required)")
                reasons.append("Requires at least 2 overlapping POI zones")
                breakdown["zones"] = 0.0

        # Layer 3: Liquidity Sweep (25%)
        if direction_norm == 'LONG':
            if analysis.get('liq_sweep_bull'):
                passed_rules.append("Layer 3 [Liquidity]: Bullish Liquidity Sweep Confirmed")
                breakdown["liquidity"] = 25.0
            else:
                failed_rules.append("Layer 3 [Liquidity]: Missing Bullish Liquidity Sweep")
                reasons.append("Liquidity sweep required for SMC confluence")
                breakdown["liquidity"] = 0.0
        else:
            if analysis.get('liq_sweep_bear'):
                passed_rules.append("Layer 3 [Liquidity]: Bearish Liquidity Sweep Confirmed")
                breakdown["liquidity"] = 25.0
            else:
                failed_rules.append("Layer 3 [Liquidity]: Missing Bearish Liquidity Sweep")
                reasons.append("Liquidity sweep required for SMC confluence")
                breakdown["liquidity"] = 0.0

        # Layer 4: Reversal Candlestick Trigger (25%)
        if direction_norm == 'LONG':
            if analysis.get('bullish_engulfing') or analysis.get('engulfing_bull') or analysis.get('morning_star'):
                passed_rules.append("Layer 4 [Trigger]: Reversal Candlestick Trigger Confirmed")
                breakdown["trigger"] = 25.0
            else:
                failed_rules.append("Layer 4 [Trigger]: Missing Reversal Candlestick Trigger")
                reasons.append("Candlestick trigger (Engulfing/Morning Star) required")
                breakdown["trigger"] = 0.0
        else:
            if analysis.get('bearish_engulfing') or analysis.get('engulfing_bear') or analysis.get('evening_star'):
                passed_rules.append("Layer 4 [Trigger]: Reversal Candlestick Trigger Confirmed")
                breakdown["trigger"] = 25.0
            else:
                failed_rules.append("Layer 4 [Trigger]: Missing Reversal Candlestick Trigger")
                reasons.append("Candlestick trigger (Engulfing/Evening Star) required")
                breakdown["trigger"] = 0.0

        total_weighted = sum(breakdown.values())
        all_passed = len(failed_rules) == 0

        if entry > 0 and sl > 0 and tp > 0:
            risk = abs(entry - sl)
            reward = abs(tp - entry)
            rr = reward / risk if risk > 0 else 0
            if rr < 1.5:
                all_passed = False
                failed_rules.append(f"Rule 5 [Risk]: RR ratio {rr:.2f} below minimum 1.5")
                reasons.append("Confluence strategy requires RR >= 1.5")
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

