from typing import Dict, Any, List, Tuple
from strategy.base_strategy import BaseStrategy, StrategyMetadata

class ConfluenceStrategy(BaseStrategy):
    @property
    def metadata(self) -> StrategyMetadata:
        return StrategyMetadata(
            id="strategy-5-smc-sd-confluence",
            name="STRATEGI 5 - SMC-SD Pattern Confluence",
            priority=1,
            version="1.0.0",
            dependencies=[],
            required_indicators=["trend", "zones", "liquidity", "trigger"],
            required_timeframes=[],
            required_market_conditions=["trending"],
            required_confirmations=["engulfing", "pin_bar"]
        )

    def validate(self, timeframe: str, analysis: Dict[str, Any]) -> bool:
        return True

    def validate_risk(self, entry: float, sl: float, tp: float) -> bool:
        return True

    def calculate_confidence(self, direction: str, analysis: Dict[str, Any], z_score: float) -> Tuple[int, List[str]]:
        score = 0
        reasons = []
        confluence_count = 0

        slope = analysis.get('trend_slope', 0)

        if direction == 'LONG':
            # Layer 1: Trend
            if slope > 0 or analysis.get("trend_h1") == "bullish":
                reasons.append("Layer 1: Trend Bullish (Passed)")
                confluence_count += 1
            else:
                reasons.append("Layer 1: Trend tidak Bullish (Failed)")

            # Layer 2: Zones (Minimal 2 dari 3: OB, FVG, S&D)
            zones = 0
            if analysis.get('ob_bull'): zones += 1
            if analysis.get('fvg_bull_active'): zones += 1
            if analysis.get('snd_bull'): zones += 1
            
            if zones >= 2:
                reasons.append(f"Layer 2: {zones} Bullish Zones Overlap (Passed)")
                confluence_count += 1
            else:
                reasons.append(f"Layer 2: Hanya {zones} Bullish Zone (Failed, butuh 2)")

            # Layer 3: Liquidity Sweep
            if analysis.get('liq_sweep_bull'):
                reasons.append("Layer 3: Liquidity Sweep Bullish (Passed)")
                confluence_count += 1
            else:
                reasons.append("Layer 3: Tidak ada Liquidity Sweep (Failed)")

            # Layer 4: Trigger
            if analysis.get('bullish_engulfing') or analysis.get('morning_star') or analysis.get('pin_bar_bull', False):
                reasons.append("Layer 4: Bullish Trigger Terdeteksi (Passed)")
                confluence_count += 1
            else:
                reasons.append("Layer 4: Tidak ada Bullish Trigger (Failed)")

        elif direction == 'SHORT':
            # Layer 1: Trend
            if slope < 0 or analysis.get("trend_h1") == "bearish":
                reasons.append("Layer 1: Trend Bearish (Passed)")
                confluence_count += 1
            else:
                reasons.append("Layer 1: Trend tidak Bearish (Failed)")

            # Layer 2: Zones (Minimal 2 dari 3: OB, FVG, S&D)
            zones = 0
            if analysis.get('ob_bear'): zones += 1
            if analysis.get('fvg_bear_active'): zones += 1
            if analysis.get('snd_bear'): zones += 1
            
            if zones >= 2:
                reasons.append(f"Layer 2: {zones} Bearish Zones Overlap (Passed)")
                confluence_count += 1
            else:
                reasons.append(f"Layer 2: Hanya {zones} Bearish Zone (Failed, butuh 2)")

            # Layer 3: Liquidity Sweep
            if analysis.get('liq_sweep_bear'):
                reasons.append("Layer 3: Liquidity Sweep Bearish (Passed)")
                confluence_count += 1
            else:
                reasons.append("Layer 3: Tidak ada Liquidity Sweep (Failed)")

            # Layer 4: Trigger
            if analysis.get('bearish_engulfing') or analysis.get('evening_star') or analysis.get('pin_bar_bear', False):
                reasons.append("Layer 4: Bearish Trigger Terdeteksi (Passed)")
                confluence_count += 1
            else:
                reasons.append("Layer 4: Tidak ada Bearish Trigger (Failed)")

        if confluence_count >= 3:
            score = 100 if confluence_count == 4 else 85
            reasons.append(f"Confluence Score: {confluence_count}/4 (VALID)")
        else:
            score = -100
            reasons.append(f"Confluence Score: {confluence_count}/4 (REJECTED, butuh minimal 3)")

        return score, reasons
