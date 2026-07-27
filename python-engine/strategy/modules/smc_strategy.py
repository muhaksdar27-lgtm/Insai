from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata
try:
    from scoring.session_analyzer import get_session_info
except ModuleNotFoundError:
    try:
        from session_analyzer import get_session_info
    except ModuleNotFoundError:
        from ...scoring.session_analyzer import get_session_info

class SMCStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-1-smc",
            name="STRATEGI 1 - SMC + Sesi London + M15",
            priority=5,
            version="1.0.0",
            dependencies=[],
            required_indicators=["bos", "choch", "liq_sweep", "fvg", "ob", "atr"],
            required_timeframes=["M15"],
            required_market_conditions=["london_session"],
            required_confirmations=["choch"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        if timeframe != "15m" and timeframe != "M15":
            return False
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        return True # Handled in scoring

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []

        session = get_session_info()
        if "London" not in session.get("sessions", []):
            score -= 50
            reasons.append("Sesi tidak valid (Bukan London)")
        else:
            score += 20
            reasons.append("Sesi London aktif")

        bias = analysis.get("trend_h1", "neutral")

        if direction == 'LONG':
            if bias == "bearish":
                score -= 30
                reasons.append("Bias H1 berlawanan (Bearish)")
            else:
                score += 20
                reasons.append("Bias H1 Bullish/Netral")
                
            if analysis.get('liq_sweep_bull'):
                score += 20
                reasons.append("Asia Liquidity Sweep Bullish")
            else:
                score -= 20
                reasons.append("Tidak ada Liquidity Sweep")

            if analysis.get('choch_bull'):
                score += 20
                reasons.append("Bullish CHoCH Konfirmasi")
            else:
                score -= 20
                reasons.append("Tidak ada CHoCH Konfirmasi")

            if analysis.get('ob_bull') or analysis.get('fvg_bull_active'):
                score += 20
                reasons.append("OB/FVG Entry Valid")
            else:
                score -= 20
                reasons.append("Tidak ada OB/FVG di area Entry")

        elif direction == 'SHORT':
            if bias == "bullish":
                score -= 30
                reasons.append("Bias H1 berlawanan (Bullish)")
            else:
                score += 20
                reasons.append("Bias H1 Bearish/Netral")
                
            if analysis.get('liq_sweep_bear'):
                score += 20
                reasons.append("Asia Liquidity Sweep Bearish")
            else:
                score -= 20
                reasons.append("Tidak ada Liquidity Sweep")

            if analysis.get('choch_bear'):
                score += 20
                reasons.append("Bearish CHoCH Konfirmasi")
            else:
                score -= 20
                reasons.append("Tidak ada CHoCH Konfirmasi")

            if analysis.get('ob_bear') or analysis.get('fvg_bear_active'):
                score += 20
                reasons.append("OB/FVG Entry Valid")
            else:
                score -= 20
                reasons.append("Tidak ada OB/FVG di area Entry")

        return score, reasons
