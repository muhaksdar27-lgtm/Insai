from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class ScalpingStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-3-scalping",
            name="STRATEGI 3 - Scalping SMC + Liquidity Sweep + Double Top/Bottom",
            priority=3,
            version="1.0.0",
            dependencies=[],
            required_indicators=["trend", "retracement", "liquidity_sweep", "double_pattern", "neckline_break"],
            required_timeframes=["1m", "M1"],
            required_market_conditions=["trending", "high_volatility"],
            required_confirmations=["neckline_break"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        if timeframe not in ["1m", "M1"]:
            return False
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        if risk == 0:
            return False
        rr = reward / risk
        return rr >= 2.8 # Giving small buffer for spread, target is 1:3

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []

        trend_h1 = analysis.get("trend_h1", "neutral")
        
        if direction == 'LONG':
            if trend_h1 != "bullish":
                score -= 50
                reasons.append("Counter-trend (H1 tidak Bullish)")
            else:
                score += 20
                reasons.append("H1 Trend Alignment Bullish")

            if z_score < -0.5:
                score += 10
                reasons.append("M15 Retracement Valid")
            
            if analysis.get('liq_sweep_bull'):
                score += 20
                reasons.append("Liquidity Sweep Bullish (SMC)")
            else:
                score -= 30
                reasons.append("Belum ada Liquidity Sweep")

            if analysis.get('double_bottom'):
                score += 30
                reasons.append("Double Bottom Pattern Terbentuk")
            else:
                score -= 30
                reasons.append("Tidak ada Double Bottom")

            if analysis.get('bos_bull'):
                score += 20
                reasons.append("Neckline Break Confirmed (BOS Bullish)")
            else:
                score -= 20
                reasons.append("Belum ada Neckline Break (BOS)")

        elif direction == 'SHORT':
            if trend_h1 != "bearish":
                score -= 50
                reasons.append("Counter-trend (H1 tidak Bearish)")
            else:
                score += 20
                reasons.append("H1 Trend Alignment Bearish")

            if z_score > 0.5:
                score += 10
                reasons.append("M15 Retracement Valid")
            
            if analysis.get('liq_sweep_bear'):
                score += 20
                reasons.append("Liquidity Sweep Bearish (SMC)")
            else:
                score -= 30
                reasons.append("Belum ada Liquidity Sweep")

            if analysis.get('double_top'):
                score += 30
                reasons.append("Double Top Pattern Terbentuk")
            else:
                score -= 30
                reasons.append("Tidak ada Double Top")

            if analysis.get('bos_bear'):
                score += 20
                reasons.append("Neckline Break Confirmed (BOS Bearish)")
            else:
                score -= 20
                reasons.append("Belum ada Neckline Break (BOS)")

        return score, reasons
