from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class SNDStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-2-snd",
            name="STRATEGI 2 - S&D + Engulfing",
            priority=4,
            version="1.0.0",
            dependencies=[],
            required_indicators=["ma", "sd_zone", "engulfing", "atr"],
            required_timeframes=[],
            required_market_conditions=["trending"],
            required_confirmations=["engulfing"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        return True

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []

        # We will assume MA50 vs MA200 is positive if trend_slope > 0 or MA_20 > MA_50 in future, but we use trend_slope here
        slope = analysis.get('trend_slope', 0)

        if direction == 'LONG':
            if slope > 0:
                score += 20
                reasons.append("Trend MA Alignment (Bullish)")
            else:
                score -= 10
                reasons.append("Trend MA Berlawanan (Bearish)")

            if analysis.get('snd_bull'):
                score += 30
                reasons.append("Demand Zone Touch")
            else:
                score -= 30
                reasons.append("Tidak berada di area Demand")

            if analysis.get('bullish_engulfing'):
                score += 30
                reasons.append("Bullish Engulfing Trigger")
            elif analysis.get('morning_star'):
                score += 20
                reasons.append("Morning Star Trigger (Konfirmasi lemah)")
            else:
                score -= 30
                reasons.append("Tidak ada konfirmasi candlestick (Engulfing)")

        elif direction == 'SHORT':
            if slope < 0:
                score += 20
                reasons.append("Trend MA Alignment (Bearish)")
            else:
                score -= 10
                reasons.append("Trend MA Berlawanan (Bullish)")

            if analysis.get('snd_bear'):
                score += 30
                reasons.append("Supply Zone Touch")
            else:
                score -= 30
                reasons.append("Tidak berada di area Supply")

            if analysis.get('bearish_engulfing'):
                score += 30
                reasons.append("Bearish Engulfing Trigger")
            elif analysis.get('evening_star'):
                score += 20
                reasons.append("Evening Star Trigger (Konfirmasi lemah)")
            else:
                score -= 30
                reasons.append("Tidak ada konfirmasi candlestick (Engulfing)")

        return score, reasons
