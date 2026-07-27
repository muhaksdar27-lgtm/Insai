#!/bin/bash
if ! python3 -c "import uvicorn, fastapi" &> /dev/null; then
    echo "Python dependencies missing, installing..."
    # Try installing globally if pip is available
    if command -v pip3 &> /dev/null; then
        pip3 install -r requirements.txt --break-system-packages || true
    else
        # Install get-pip and then install
        curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages
        python3 -m pip install -r requirements.txt --break-system-packages
    fi
fi
