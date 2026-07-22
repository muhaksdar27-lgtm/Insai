import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_strategy_endpoint_not_found():
    response = client.post("/v1/strategy/invalid-id", json={})
    assert response.status_code == 404
    assert "not implemented" in response.json()["detail"]

def test_strategy_5_endpoint():
    # Pass minimal data to avoid errors but check if it routes
    payload = {
        "H1": {"candles": [{"close": 2000, "high": 2010, "low": 1990, "open": 2000}] * 30},
        "M15": {"candles": [{"close": 2000, "high": 2010, "low": 1990, "open": 2000}] * 30},
        "M5": {"candles": [{"close": 2000, "high": 2010, "low": 1990, "open": 2000}] * 30},
        "M1": {"candles": [{"close": 2000, "high": 2010, "low": 1990, "open": 2000}] * 30}
    }
    response = client.post("/v1/strategy/strategy-5-smc-sd-confluence", json=payload)
    # Could be 200 or return no_signal but shouldn't 500
    assert response.status_code == 200
    assert "signal" in response.json()
