#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
if ! python3 -c "import uvicorn, fastapi, numpy, pydantic" &> /dev/null; then
    echo "Python dependencies missing, installing from $DIR/requirements.txt..."
    if command -v pip3 &> /dev/null; then
        pip3 install -r "$DIR/requirements.txt" --break-system-packages || true
    else
        curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages
        python3 -m pip install -r "$DIR/requirements.txt" --break-system-packages
    fi
fi

