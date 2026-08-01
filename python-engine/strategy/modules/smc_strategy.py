from typing import Dict, Any, List, Tuple, Optional
from strategy.base_strategy import BaseStrategy, StrategyMetadata, StrategyEvaluationResult
from scoring.session_analyzer import get_session_info

class SMCStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-1-smc",
            name="STRATEGI 1 - SMC + Sesi London + M15",
            priority=5,
            version="2.0.0",
            dependencies=[],
            required_indicators=["bos", "choch", "liq_sweep", "fvg", "ob", "atr"],
            required_timeframes=["M15", "15m"],
            required_market_conditions=["london_session"],
            required_confirmations=["choch"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        normalized_tf = timeframe.upper().replace("M", "")
        return normalized_tf in ["15", "15M"]

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

        # 1. Session Gate (20%)
        curr_session = session or ""
        if not curr_session:
            sess_info = get_session_info()
            if "London" in sess_info.get("sessions", []):
                curr_session = "London"

        if "London" in curr_session or curr_session == "London":
            passed_rules.append("Rule 1 [Session]: Active London Session")
            breakdown["session"] = 20.0
        else:
            failed_rules.append("Rule 1 [Session]: Outside London Session (Got: " + str(curr_session) + ")")
            reasons.append("Strat 1 requires active London session")
            breakdown["session"] = 0.0

        # 2. H1 Trend Alignment Gate (20%)
        h1_trend = analysis.get("trend_h1", "neutral").lower()
        if direction_norm == 'LONG':
            if h1_trend == "bearish":
                failed_rules.append("Rule 2 [Trend]: Counter-trend H1 Bearish")
                reasons.append("H1 trend is opposing (Bearish)")
                breakdown["trend"] = 0.0
            else:
                passed_rules.append("Rule 2 [Trend]: H1 Trend Aligned (" + h1_trend.capitalize() + ")")
                breakdown["trend"] = 20.0
        else:
            if h1_trend == "bullish":
                failed_rules.append("Rule 2 [Trend]: Counter-trend H1 Bullish")
                reasons.append("H1 trend is opposing (Bullish)")
                breakdown["trend"] = 0.0
            else:
                passed_rules.append("Rule 2 [Trend]: H1 Trend Aligned (" + h1_trend.capitalize() + ")")
                breakdown["trend"] = 20.0

        # 3. Liquidity Sweep Gate (20%)
        if direction_norm == 'LONG':
            if analysis.get('liq_sweep_bull'):
                passed_rules.append("Rule 3 [Sweep]: Bullish Liquidity Sweep Confirmed")
                breakdown["liquidity"] = 20.0
            else:
                failed_rules.append("Rule 3 [Sweep]: No Bullish Liquidity Sweep")
                reasons.append("Missing liquidity sweep before setup")
                breakdown["liquidity"] = 0.0
        else:
            if analysis.get('liq_sweep_bear'):
                passed_rules.append("Rule 3 [Sweep]: Bearish Liquidity Sweep Confirmed")
                breakdown["liquidity"] = 20.0
            else:
                failed_rules.append("Rule 3 [Sweep]: No Bearish Liquidity Sweep")
                reasons.append("Missing liquidity sweep before setup")
                breakdown["liquidity"] = 0.0

        # 4. CHoCH / BOS Confirmation Gate (20%)
        if direction_norm == 'LONG':
            if analysis.get('choch_bull') or analysis.get('bos_bull'):
                passed_rules.append("Rule 4 [Structure]: Bullish CHoCH/BOS Confirmed")
                breakdown["structure"] = 20.0
            else:
                failed_rules.append("Rule 4 [Structure]: No Bullish CHoCH/BOS")
                reasons.append("Missing CHoCH or BOS structural confirmation")
                breakdown["structure"] = 0.0
        else:
            if analysis.get('choch_bear') or analysis.get('bos_bear'):
                passed_rules.append("Rule 4 [Structure]: Bearish CHoCH/BOS Confirmed")
                breakdown["structure"] = 20.0
            else:
                failed_rules.append("Rule 4 [Structure]: No Bearish CHoCH/BOS")
                reasons.append("Missing CHoCH or BOS structural confirmation")
                breakdown["structure"] = 0.0

        # 5. POI / OB / FVG Gate (20%)
        if direction_norm == 'LONG':
            if analysis.get('ob_bull') or analysis.get('fvg_bull_active') or analysis.get('ob_fvg_bull'):
                passed_rules.append("Rule 5 [POI]: Bullish Order Block / FVG Active")
                breakdown["poi"] = 20.0
            else:
                failed_rules.append("Rule 5 [POI]: No Bullish OB / FVG in Entry Zone")
                reasons.append("Missing active Order Block or FVG")
                breakdown["poi"] = 0.0
        else:
            if analysis.get('ob_bear') or analysis.get('fvg_bear_active') or analysis.get('ob_fvg_bear'):
                passed_rules.append("Rule 6 [POI]: Bearish Order Block / FVG Active")
                breakdown["poi"] = 20.0
            else:
                failed_rules.append("Rule 5 [POI]: No Bearish OB / FVG in Entry Zone")
                reasons.append("Missing active Order Block or FVG")
                breakdown["poi"] = 0.0

        total_weighted = sum(breakdown.values())
        all_passed = len(failed_rules) == 0

        # Risk check
        if entry > 0 and sl > 0 and tp > 0:
            risk = abs(entry - sl)
            reward = abs(tp - entry)
            rr = reward / risk if risk > 0 else 0
            if rr < 1.5:
                all_passed = False
                failed_rules.append(f"Rule 6 [Risk]: RR ratio {rr:.2f} below minimum 1.5")
                reasons.append("Risk/Reward ratio is too low")
            else:
                passed_rules.append(f"Rule 6 [Risk]: Valid RR ratio ({rr:.2f})")

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
        all_r = res.passed_rules + res.failed_rules + res.reasons
        return res.confidence, all_r

