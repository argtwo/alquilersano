"""Tests básicos de la API (sin DB — solo health y estructura de rutas)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_openapi_schema_has_expected_routes():
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    assert "/api/v1/barrios" in paths
    assert "/api/v1/ier" in paths
    assert "/api/v1/alertas" in paths
    assert "/api/v1/stats" in paths
