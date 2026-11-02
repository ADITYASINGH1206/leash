import re
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

class InjectionDetectRequest(BaseModel):
    text: str
    cart_items: list[str] = []

class InjectionDetectResponse(BaseModel):
    is_injection: bool
    confidence: float
    categories: list[str]
    matched_cart_items: list[str]
    verdict_suggestion: str

INJECTION_PATTERNS = [
    ("system_override", re.compile(r"(?:important\s+)?(?:system|admin)\s+override|ignore\s+(?:all\s+|any\s+|prior\s+|previous\s+)?(?:user\s+)?(?:instructions?|prompts?|rules?)|disregard\s+(?:all\s+|any\s+|prior\s+|previous\s+)?(?:user\s+)?(?:instructions?|prompts?|rules?)|critical\s+instructions?|you\s+must\s+(?:instead|now|immediately)\s+(?:buy|purchase|order)", re.I)),
    ("budget_override", re.compile(r"(?:disregard|ignore|bypass|override)\s+budget|no\s+budget\s+limit|unlimited\s+spending", re.I)),
    ("purchase_redirection", re.compile(r"(?:buy|purchase|order)\s+(?:five|ten|\d+\s+|a\s+|some\s+)?([^.,;!]+?)(?:\s+instead|\s+immediately|\s+now|\.|$)|gift\s*cards?|crypto(?:currency)?|bitcoin|luxury\s*items?", re.I)),
    ("data_exfiltration", re.compile(r"(?:send|exfiltrate|transmit|post)\b.*?\b(?:secrets?|keys?|tokens?|credentials?)|(?:curl|fetch|webhook)\b.*?https?://", re.I)),
]

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

@app.post("/injection/detect", response_model=InjectionDetectResponse)
def detect_prompt_injection(req: InjectionDetectRequest):
    matched_categories = []
    for cat, pattern in INJECTION_PATTERNS:
        if pattern.search(req.text):
            matched_categories.append(cat)

    if not matched_categories:
        return InjectionDetectResponse(
            is_injection=False,
            confidence=0.0,
            categories=[],
            matched_cart_items=[],
            verdict_suggestion="ALLOW"
        )

    # Check cart items against injection text
    matched_items = []
    text_lower = req.text.lower()
    for item in req.cart_items:
        clean_item = item.lower().strip()
        if len(clean_item) >= 3 and clean_item in text_lower:
            matched_items.append(item)
        elif "gift card" in text_lower and "gift card" in clean_item:
            matched_items.append(item)

    verdict = "BLOCK" if matched_items else "HOLD"

    return InjectionDetectResponse(
        is_injection=True,
        confidence=0.92,
        categories=matched_categories,
        matched_cart_items=matched_items,
        verdict_suggestion=verdict
    )
