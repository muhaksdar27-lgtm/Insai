import pytest
from fastapi.testclient import TestClient
from main import create_app

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)

def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "uptime" in data
    assert "version" in data

def test_ready_endpoint(client):
    response = client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"

def test_smc_sd_confluence_endpoint_empty(client):
    response = client.post("/v1/strategy/smc-sd-confluence", json={})
    assert response.status_code == 200
    data = response.json()
    assert "signal" in data
    assert data["signal"] == "NEUTRAL"
    assert "score" in data
