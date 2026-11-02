import numpy as np
from sklearn.ensemble import IsolationForest

FEATURE_NAMES = [
    "spend_ratio",
    "novelty_score",
    "category_drift",
    "budget_consumed_ratio",
    "threshold_proximity",
    "velocity_last_hour",
    "recent_failed_attempts",
]

class RiskAnomalyModel:
    """
    Layer 4: Risk Anomaly Scoring Engine using scikit-learn IsolationForest
    combined with an explainable heuristic attribution engine.
    """

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.default_historical_mean = 25.0
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.08,
            random_state=self.random_state,
        )
        self._train_baseline_model()

    def _train_baseline_model(self, n_samples: int = 1500) -> None:
        """
        Train the Isolation Forest on synthesized normal shopping agent transactions.
        Features represent clean, routine agent shopping sessions.
        """
        rng = np.random.RandomState(self.random_state)

        # 1. spend_ratio: normal ~ N(1.0, 0.28), clipped to [0.3, 2.2]
        spend_ratio = np.clip(rng.normal(1.0, 0.28, n_samples), 0.3, 2.2)

        # 2. novelty_score: beta distribution biased towards 0, clipped to [0.0, 0.35]
        novelty_score = np.clip(rng.beta(1.2, 8.0, n_samples), 0.0, 0.35)

        # 3. category_drift: 96% zero, 4% tiny drift (< 0.15)
        drift_mask = rng.rand(n_samples) < 0.96
        category_drift = np.where(drift_mask, 0.0, rng.uniform(0.01, 0.15, n_samples))

        # 4. budget_consumed_ratio: uniform routine budget consumption [0.05, 0.55]
        budget_consumed_ratio = rng.uniform(0.05, 0.55, n_samples)

        # 5. threshold_proximity: safe distance from human threshold [0.0, 0.50]
        threshold_proximity = rng.uniform(0.0, 0.50, n_samples)

        # 6. velocity_last_hour: mostly 0 or 1, rarely 2
        velocity_last_hour = rng.choice([0, 1, 2], size=n_samples, p=[0.60, 0.32, 0.08])

        # 7. recent_failed_attempts: 98% 0, 2% 1
        recent_failed_attempts = rng.choice([0, 1], size=n_samples, p=[0.98, 0.02])

        X_train = np.column_stack([
            spend_ratio,
            novelty_score,
            category_drift,
            budget_consumed_ratio,
            threshold_proximity,
            velocity_last_hour,
            recent_failed_attempts,
        ])

        self.model.fit(X_train)

    def score_transaction(
        self,
        amount: float,
        txns_last_hour: int = 0,
        novelty_score: float = 0.0,
        historical_mean: float = 25.0,
        category_drift: float = 0.0,
        budget_consumed_ratio: float = 0.0,
        threshold_proximity: float = 0.0,
        recent_failed_attempts: int = 0,
    ) -> tuple[int, list[str], dict[str, float]]:
        """
        Evaluate transaction risk using the fitted IsolationForest and
        compute explainable attribution factors across the 7 feature dimensions.

        Returns:
            - risk_score: int in [0, 100]
            - top_factors: list of top 3 contributing explanation strings
            - contributions: dict of raw feature score contributions
        """
        effective_mean = max(historical_mean, 1.0)
        spend_ratio = amount / effective_mean

        # Construct input feature vector
        vector = np.array([[
            float(spend_ratio),
            float(novelty_score),
            float(category_drift),
            float(budget_consumed_ratio),
            float(threshold_proximity),
            float(txns_last_hour),
            float(recent_failed_attempts),
        ]])

        # 1. Unsupervised Isolation Forest decision function
        raw_df = float(self.model.decision_function(vector)[0])
        # raw_df ranges roughly from +0.22 (very normal) to -0.25 (extreme anomaly)
        ml_base = float(np.clip(35.0 - raw_df * 160.0, 5.0, 80.0))

        # 2. Explainable heuristic feature attributions
        contributions: dict[str, float] = {}
        factor_explanations: list[tuple[float, str]] = []

        # Feature 1: Spend deviation relative to historical mean
        if spend_ratio >= 3.0:
            weight = min(30.0, 20.0 + (spend_ratio - 3.0) * 2.0)
            contributions["spend_ratio"] = weight
            factor_explanations.append((
                weight,
                f"Spend significantly higher than historical average ({spend_ratio:.1f}x mean)",
            ))
        elif spend_ratio >= 2.0:
            weight = 12.0
            contributions["spend_ratio"] = weight
            factor_explanations.append((
                weight,
                f"Spend moderately elevated above historical average ({spend_ratio:.1f}x mean)",
            ))
        else:
            contributions["spend_ratio"] = 0.0

        # Feature 2: Merchant Novelty
        if novelty_score >= 0.8:
            weight = 22.0
            contributions["novelty_score"] = weight
            factor_explanations.append((
                weight,
                f"First-time merchant interaction (novelty: {novelty_score:.2f})",
            ))
        elif novelty_score >= 0.5:
            weight = 10.0
            contributions["novelty_score"] = weight
            factor_explanations.append((
                weight,
                f"Relatively novel merchant interaction (novelty: {novelty_score:.2f})",
            ))
        else:
            contributions["novelty_score"] = 0.0

        # Feature 3: Category Drift
        if category_drift >= 0.5:
            weight = 22.0
            contributions["category_drift"] = weight
            factor_explanations.append((
                weight,
                f"High category drift from authorized mandate scope ({category_drift:.2f})",
            ))
        elif category_drift >= 0.25:
            weight = 10.0
            contributions["category_drift"] = weight
            factor_explanations.append((
                weight,
                f"Noticeable category drift from authorized scope ({category_drift:.2f})",
            ))
        else:
            contributions["category_drift"] = 0.0

        # Feature 4: Budget Consumed Ratio
        if budget_consumed_ratio >= 0.85:
            weight = 22.0
            contributions["budget_consumed_ratio"] = weight
            factor_explanations.append((
                weight,
                f"High mandate budget consumption ratio ({budget_consumed_ratio * 100:.0f}%)",
            ))
        elif budget_consumed_ratio >= 0.70:
            weight = 10.0
            contributions["budget_consumed_ratio"] = weight
            factor_explanations.append((
                weight,
                f"Mandate budget nearing depletion ({budget_consumed_ratio * 100:.0f}%)",
            ))
        else:
            contributions["budget_consumed_ratio"] = 0.0

        # Feature 5: Split-transaction threshold proximity (staying just under threshold)
        if 0.85 <= threshold_proximity < 1.0:
            weight = 22.0
            contributions["threshold_proximity"] = weight
            factor_explanations.append((
                weight,
                "Suspicious micro-purchase proximity to approval threshold (split-transaction indicator)",
            ))
        elif threshold_proximity >= 1.0:
            # Over threshold is handled by approval threshold rule, not split-transaction evasion
            weight = 10.0
            contributions["threshold_proximity"] = weight
            factor_explanations.append((
                weight,
                f"Purchase amount exceeds approval threshold ({threshold_proximity * 100:.0f}%)",
            ))
        elif threshold_proximity >= 0.70:
            weight = 8.0
            contributions["threshold_proximity"] = weight
            factor_explanations.append((
                weight,
                f"Purchase amount approaching approval threshold ({threshold_proximity * 100:.0f}%)",
            ))
        else:
            contributions["threshold_proximity"] = 0.0

        # Feature 6: Velocity in trailing 60 minutes
        if txns_last_hour >= 4:
            weight = 30.0
            contributions["velocity"] = weight
            factor_explanations.append((
                weight,
                f"High transaction frequency in trailing hour ({txns_last_hour} txns)",
            ))
        elif txns_last_hour >= 3:
            weight = 20.0
            contributions["velocity"] = weight
            factor_explanations.append((
                weight,
                f"Elevated transaction frequency in trailing hour ({txns_last_hour} txns)",
            ))
        else:
            contributions["velocity"] = 0.0

        # Feature 7: Recent failed attempts
        if recent_failed_attempts >= 3:
            weight = 30.0
            contributions["recent_failed_attempts"] = weight
            factor_explanations.append((
                weight,
                f"Multiple recent failed payment attempts detected ({recent_failed_attempts} attempts)",
            ))
        elif recent_failed_attempts >= 2:
            weight = 18.0
            contributions["recent_failed_attempts"] = weight
            factor_explanations.append((
                weight,
                f"Repeated failed attempts detected ({recent_failed_attempts} attempts)",
            ))
        else:
            contributions["recent_failed_attempts"] = 0.0

        # 3. Combine Isolation Forest anomaly score and heuristic contributions
        total_heuristic = sum(contributions.values())
        if total_heuristic > 0:
            # Balanced ensemble
            raw_score = 0.35 * ml_base + 0.65 * (10.0 + total_heuristic)
        else:
            raw_score = ml_base

        final_score = int(round(np.clip(raw_score, 0.0, 100.0)))

        # Sort factors descending by contribution weight
        factor_explanations.sort(key=lambda x: x[0], reverse=True)
        top_factors = [expl for _, expl in factor_explanations[:3]]

        return final_score, top_factors, contributions
