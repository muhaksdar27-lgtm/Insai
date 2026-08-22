import os
import sys
import asyncio
import time
import platform

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fastapi import APIRouter, HTTPException, Path, WebSocket, WebSocketDisconnect
import json
from fastapi.responses import ORJSONResponse
from models.schemas import ValidationRequest, ValidationResponse, AnalysisRequest, AnalysisResponse
from validation.signal_validator import validate_signal
from config.settings import settings
from utils.exceptions import InsaiValidationException
from utils.logger import logger
from analyzer import TechnicalAnalyzer
from deterministic_analyzer import dispatch_analysis

router = APIRouter(default_response_class=ORJSONResponse)
START_TIME = time.time()
analyzer = TechnicalAnalyzer()


@router.websocket("/ws/analyze")
async def analyze_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                correlation_id = payload.get("correlation_id") or payload.get("request_id")
                req_data = payload.get("payload", payload)
                
                loop = asyncio.get_running_loop()
                # Run deterministic analysis
                if isinstance(req_data, dict) and "candles" in req_data:
                    req_obj = AnalysisRequest(**req_data)
                    response = await loop.run_in_executor(None, dispatch_analysis, req_obj)
                    result_dict = response.model_dump()
                else:
                    result_dict = await loop.run_in_executor(None, analyzer.analyze, req_data)
                
                await websocket.send_text(json.dumps({
                    "correlation_id": correlation_id,
                    "result": result_dict
                }))
            except Exception as e:
                logger.error(f"Analysis WS error: {e}")
                if "correlation_id" in locals() and correlation_id:
                    await websocket.send_text(json.dumps({
                        "correlation_id": correlation_id,
                        "status": "ANALYSIS_ERROR",
                        "error": str(e)
                    }))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket fatal error: {e}")

@router.post("/v1/analyze")
async def analyze_endpoint(data: dict):
    try:
        loop = asyncio.get_running_loop()
        # If standard AnalysisRequest structure is sent
        if "candles" in data:
            req_obj = AnalysisRequest(**data)
            response = await loop.run_in_executor(None, dispatch_analysis, req_obj)
            return response.model_dump()
        else:
            result = await loop.run_in_executor(None, analyzer.analyze, data)
            return result
    except Exception as e:
        logger.error(f"Analysis engine error: {e}")
        return {
            "request_id": data.get("request_id", "unknown"),
            "status": "ANALYSIS_ERROR",
            "detected": None,
            "analysis_type": data.get("analysis_type", "UNKNOWN"),
            "values": {},
            "evidence": {},
            "error": str(e),
            "source": "python_engine"
        }

@router.post("/v1/analyze-deterministic", response_model=AnalysisResponse)
async def analyze_deterministic_endpoint(req: AnalysisRequest):
    try:
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, dispatch_analysis, req)
        return response
    except Exception as e:
        logger.error(f"Deterministic analysis error: {e}")
        return AnalysisResponse(
            request_id=req.request_id,
            status="ANALYSIS_ERROR",
            detected=None,
            analysis_type=req.analysis_type,
            values={},
            evidence={},
            error=str(e),
            source="python_engine"
        )


@router.get("/health")
async def health():
    uptime_seconds = time.time() - START_TIME
    return {
        "status": "ok", 
        "uptime": uptime_seconds,
        "version": settings.VERSION,
        "dependencies": ["fastapi", "uvicorn", "numpy"],
        "python_version": platform.python_version()
    }

@router.get("/ready")
async def ready():
    return {"status": "ready"}

@router.post("/validate", response_model=ValidationResponse)
@router.post("/v1/predict", response_model=ValidationResponse)
async def validate_endpoint(req: ValidationRequest):
    try:
        # Run CPU-bound validation in a threadpool
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, validate_signal, req)
        return result
    except InsaiValidationException as e:
        logger.warning(f"Validation error: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Internal server error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
