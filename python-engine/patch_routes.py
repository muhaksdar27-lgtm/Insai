import re

with open('python-engine/api/routes.py', 'r') as f:
    content = f.read()

ws_import = "from fastapi import APIRouter, HTTPException, Path, WebSocket, WebSocketDisconnect"
content = content.replace("from fastapi import APIRouter, HTTPException, Path", ws_import)

ws_endpoint = """
@router.websocket("/ws/analyze")
async def analyze_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        loop = asyncio.get_running_loop()
        while True:
            data_str = await websocket.receive_text()
            import json
            req = json.loads(data_str)
            req_id = req.get("req_id")
            payload = req.get("payload", {})
            
            # run analysis
            result = await loop.run_in_executor(None, analyzer.analyze, payload)
            
            await websocket.send_text(json.dumps({"req_id": req_id, "data": result}))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
"""

if "analyze_websocket" not in content:
    content += ws_endpoint

with open('python-engine/api/routes.py', 'w') as f:
    f.write(content)
