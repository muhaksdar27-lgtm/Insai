import asyncio
import time
import platform
from fastapi import APIRouter, HTTPException, Path, WebSocket, WebSocketDisconnect
import json
from fastapi.responses import ORJSONResponse
from models.schemas import ValidationRequest, ValidationResponse
from validation.signal_validator import validate_signal
from config.settings import settings
from utils.exceptions import InsaiValidationException
from utils.logger import logger
from analyzer import TechnicalAnalyzer

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
                correlation_id = payload.get("correlation_id")
                req_data = payload.get("payload", {})
                
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, analyzer.analyze, req_data)
                
                await websocket.send_text(json.dumps({
                    "correlation_id": correlation_id,
                    "result": result
                }))
            except Exception as e:
                logger.error(f"Analysis WS error: {e}")
                if "correlation_id" in locals():
                    await websocket.send_text(json.dumps({
                        "correlation_id": correlation_id,
                        "error": str(e)
                    }))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket fatal error: {e}")

@router.post("/v1/analyze")

async def analyze_endpoint(data: dict):
    try:
        # Run CPU-bound technical analysis in a threadpool to prevent blocking the event loop
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, analyzer.analyze, data)
        return result
    except Exception as e:
        logger.error(f"Analysis engine error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
