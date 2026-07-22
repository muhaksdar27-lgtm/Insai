from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class NewsStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-4-news",
            name="STRATEGI 4 - News Liquidity Sweep Reversal",
            priority=2,
            version="1.0.0",
            dependencies=[],
            required_indicators=["news", "liq_sweep", "rejection", "bos"],
            required_timeframes=["1m", "5m", "M1", "M5"],
            required_market_conditions=["high_impact_news"],
            required_confirmations=["bos"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        if timeframe not in ["1m", "5m", "M1", "M5"]:
            return False
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        return True

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []

        if not analysis.get('news_high_impact_active', False):
            score -= 50
            reasons.append("TIDAK ADA HIGH IMPACT NEWS (Filter aktif)")
        else:
            score += 30
            reasons.append("High Impact News Terdeteksi")

        if not analysis.get('spread_acceptable', True):
            score -= 50
            reasons.append("Spread terlalu tinggi untuk entry news")
        else:
            score += 10
            reasons.append("Spread/Slippage aman")

        if direction == 'LONG':
            if analysis.get('liq_sweep_bull'):
                score += 30
                reasons.append("Liquidity Sweep Bullish (Rejection valid)")
            else:
                score -= 30
                reasons.append("Tidak ada Liquidity Sweep")

            if analysis.get('bos_bull') or analysis.get('choch_bull'):
                score += 30
                reasons.append("Struktur Konfirmasi (BOS/CHoCH Bullish)")
            else:
                score -= 30
                reasons.append("Tunggu konfirmasi struktur (Jangan entry candle pertama)")

        elif direction == 'SHORT':
            if analysis.get('liq_sweep_bear'):
                score += 30
                reasons.append("Liquidity Sweep Bearish (Rejection valid)")
            else:
                score -= 30
                reasons.append("Tidak ada Liquidity Sweep")

            if analysis.get('bos_bear') or analysis.get('choch_bear'):
                score += 30
                reasons.append("Struktur Konfirmasi (BOS/CHoCH Bearish)")
            else:
                score -= 30
                reasons.append("Tunggu konfirmasi struktur (Jangan entry candle pertama)")

        return score, reasons
