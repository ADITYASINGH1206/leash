# Open Questions, Risks & Trade-Offs

This document tracks unresolved design questions, risks, and documented fallbacks for Leash.

---

## 1. PayPal API Feasibility Risks & Fallbacks

| Risk | Likelihood | Impact | Fallback Strategy | Status |
| :--- | :---: | :---: | :--- | :---: |
| **Vault v3 + Merchant Payee:** One application authorizing a vaulted buyer wallet to pay a third-party merchant sandbox account (`payee`). | Low | High | **Fallback B:** Leash acts as merchant-of-record, collects authorized payment, and executes instant distribution via PayPal Payouts API upon verified fulfilment.<br>**Fallback C:** Human-present standard PayPal checkout pop-up with Leash pre-authorization checks. | Investigating in Spike (#1) |
| **Webhook Delivery Latency:** Webhooks delayed during live recording/demo. | Med | Med | Ground-truth polling fallback: every critical transition re-fetches `GET /v2/checkout/orders/{id}` directly from PayPal rather than solely relying on webhooks. | Mitigated |
| **72-Hour Honor Window:** PayPal recommended authorization window is 3 days. | Low | Low | Enforce automatic voiding at exactly 72 hours via scheduled `pg-boss` jobs, unlocking user budget. | Architected (#15) |

---

## 2. Decision Engine Trade-Offs

| Decision Point | Chosen Approach | Alternative Evaluated | Why Chosen |
| :--- | :--- | :--- | :--- |
| **Policy Language** | Common Expression Language (CEL) | JSONLogic | CEL is standard in Envoy/Kubernetes, strongly typed, and fast. JSONLogic remains as an instant drop-in fallback if needed. |
| **ML Model Runtime** | Python FastAPI with scikit-learn | ONNX runtime in Node.js | FastAPI allows straightforward model iteration, training script sharing, and natural separation of CPU-heavy anomaly calculation. |
| **Job Queue** | `pg-boss` on PostgreSQL | Redis + BullMQ | Keeps architecture clean with a single datastore on Render without requiring extra Redis provisioning. |
