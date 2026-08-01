from typing import Dict, Any, List, Optional
from models.schemas import ValidationResponse, ValidationResponseMetrics

def build_validation_response(
    decision: str, 
    score: int, 
    reasons: List[str], 
    z_score: float, 
    rr_ratio: float, 
    analysis: Dict[str, Any],
    passed_rules: Optional[List[str]] = None,
    failed_rules: Optional[List[str]] = None,
    confidence: Optional[int] = None,
    explainability: Optional[Dict[str, Any]] = None
) -> ValidationResponse:
    
    metrics = ValidationResponseMetrics(
        volatility=analysis.get('volatility', 0.0),
        z_score=float(z_score),
        rr_ratio=float(rr_ratio),
        trend_slope=analysis.get('trend_slope', 0.0),
        fvg_bull=analysis.get('fvg_bull_active', False),
        fvg_bear=analysis.get('fvg_bear_active', False),
        liq_sweep_bull=analysis.get('liq_sweep_bull', False),
        liq_sweep_bear=analysis.get('liq_sweep_bear', False),
        bos_bull=analysis.get('bos_bull', False),
        bos_bear=analysis.get('bos_bear', False),
        choch_bull=analysis.get('choch_bull', False),
        choch_bear=analysis.get('choch_bear', False)
    )

    p_rules = passed_rules or []
    f_rules = failed_rules or []
    conf = confidence if confidence is not None else max(0, min(100, score))
    
    return ValidationResponse(
        status="success",
        decision=decision,
        quant_score=score,
        confidence=conf,
        passed_rules=p_rules,
        failed_rules=f_rules,
        reasons=reasons,
        metrics=metrics,
        explainability=explainability
    )

