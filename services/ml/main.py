from fastapi import FastAPI
from pydantic import BaseModel
from services.ml.models.isolation_forest import RiskAnomalyModel

app = FastAPI(title="Leash ML Service", version="0.1.0")
risk_model = RiskAnomalyModel()

class RiskScoreRequest(BaseModel):
    amount: float
    txns_last_hour: int = 0
    novelty_score: float = 0.0

class RiskScoreResponse(BaseModel):
    risk_score: int
    top_factors: list[str]
    verdict_suggestion: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "leash-ml"}

@app.post("/risk/score", response_model=RiskScoreResponse)
def evaluate_risk(req: RiskScoreRequest):
    score, reasons = risk_model.score_transaction(req.amount, req.txns_last_hour, req.novelty_score)
    verdict = "ALLOW"
    if score > 70:
        verdict = "BLOCK"
    elif score >= 40:
        verdict = "HOLD"

    return RiskScoreResponse(
        risk_score=score,
        top_factors=reasons,
        verdict_suggestion=verdict
    )
