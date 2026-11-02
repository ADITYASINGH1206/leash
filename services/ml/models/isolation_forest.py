import numpy as np

class RiskAnomalyModel:
    def __init__(self):
        # Stub weights representing an isolation forest scoring profile
        self.mean_amount = 25.0

    def score_transaction(self, amount: float, txns_last_hour: int, novelty_score: float) -> tuple[int, list[str]]:
        reasons = []
        score = 10

        # Amount deviation
        if amount > self.mean_amount * 3:
            score += 35
            reasons.append("Spend significantly higher than historical average")

        # Velocity anomaly
        if txns_last_hour >= 3:
            score += 30
            reasons.append("High transaction frequency in trailing hour")

        # Merchant novelty
        if novelty_score > 0.8:
            score += 20
            reasons.append("First-time merchant interaction")

        score = min(100, score)
        return score, reasons[:3]
