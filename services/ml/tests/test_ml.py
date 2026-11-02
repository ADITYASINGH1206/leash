from fastapi.testclient import TestClient
from services.ml.main import app

client = TestClient(app)

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_risk_score_low():
    res = client.post("/risk/score", json={"amount": 15.0, "txns_last_hour": 1, "novelty_score": 0.1})
    assert res.status_code == 200
    data = res.json()
    assert data["risk_score"] < 40
    assert data["verdict_suggestion"] == "ALLOW"

def test_risk_score_high_anomaly():
    res = client.post("/risk/score", json={"amount": 250.0, "txns_last_hour": 4, "novelty_score": 0.9})
    assert res.status_code == 200
    data = res.json()
    assert data["risk_score"] >= 70
    assert data["verdict_suggestion"] == "BLOCK"
