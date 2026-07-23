const fs = require('fs');

let content = fs.readFileSync('python-engine/api/routes.py', 'utf-8');

if (!content.includes('from fastapi import APIRouter, HTTPException, Path, WebSocket, WebSocketDisconnect')) {
    content = content.replace('from fastapi import APIRouter, HTTPException, Path', 'from fastapi import APIRouter, HTTPException, Path, WebSocket, WebSocketDisconnect\nimport json');
}

const wsEndpoint = `
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
`;

if (!content.includes('@router.websocket("/ws/analyze")')) {
    content = content.replace('@router.post("/v1/analyze")', wsEndpoint);
}

fs.writeFileSync('python-engine/api/routes.py', content);
