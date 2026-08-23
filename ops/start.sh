#!/bin/bash
set -e

echo "[BOOT] INSAi container startup script initiating..."
echo "[BOOT] Runtime Environment: NODE_ENV=${NODE_ENV:-production}, PORT=${PORT:-3000}, HOST=${HOST:-0.0.0.0}"

# Determine Python port
PY_PORT=${PYTHON_PORT:-8181}

# Start Python analytical engine in background if available
start_python_engine() {
  echo "[BOOT] Attempting to start Python analytical engine on 127.0.0.1:${PY_PORT}..."
  
  if [ -x "/app/venv/bin/uvicorn" ]; then
    echo "[BOOT] Found uvicorn at /app/venv/bin/uvicorn"
    /app/venv/bin/uvicorn main:app --host 127.0.0.1 --port "$PY_PORT" --app-dir python-engine &
  elif [ -x "./venv/bin/uvicorn" ]; then
    echo "[BOOT] Found uvicorn at ./venv/bin/uvicorn"
    ./venv/bin/uvicorn main:app --host 127.0.0.1 --port "$PY_PORT" --app-dir python-engine &
  elif command -v uvicorn >/dev/null 2>&1; then
    echo "[BOOT] Found system uvicorn in PATH"
    uvicorn main:app --host 127.0.0.1 --port "$PY_PORT" --app-dir python-engine &
  elif command -v python3 >/dev/null 2>&1; then
    echo "[BOOT] Using python3 -m uvicorn"
    python3 -m uvicorn main:app --host 127.0.0.1 --port "$PY_PORT" --app-dir python-engine &
  else
    echo "[WARN][BOOT][PYTHON] Python 3 / uvicorn not found in container PATH. Node.js deterministic analyzer fallback will be active."
  fi
}

start_python_engine || {
  echo "[WARN][BOOT][PYTHON] Background python start yielded non-zero exit code, proceeding with Node.js service."
}

# Start Node.js Application
echo "[BOOT] Starting Node.js Next.js server on 0.0.0.0:${PORT:-3000}..."
exec npm run start
