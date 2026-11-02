# Architectural Decision Records (ADRs)

This log records major architectural decisions, technical trade-offs, and design rationales made during the development of Leash.

---

## ADR-001: Authorize-Then-Capture as Primary Payment Invariant
- **Date:** 2026-11-02
- **Status:** Accepted
- **Context:** Autonomous agents purchasing goods online are vulnerable to prompt injection, dynamic cart manipulation, or merchant fulfilment failure. Immediate debiting leaves the human exposed to chargebacks and disputes.
- **Decision:** All payments to merchants are authorized first via PayPal Orders v2 (`intent: AUTHORIZE`). Funds are held on the customer's vaulted payment method without being debited. Money is captured only when the merchant agent submits a cryptographically signed fulfilment notice with verified carrier tracking. If unfulfilled after 72 hours, the authorization is automatically voided.
- **Consequences:** Provides a fail-safe financial barrier. Even if an injection attack slips through the initial layers, money does not leave the user's account until goods are verified shipped.

---

## ADR-002: AP2-Aligned Cryptographic Mandates with RFC 8785 Canonicalization
- **Date:** 2026-11-02
- **Status:** Accepted
- **Context:** We need a verifiable proof of human intent and merchant cart pricing that cannot be tampered with in transit by an autonomous agent.
- **Decision:** Implement intent mandates signed on the user's device (WebCrypto ECDSA P-256) and cart mandates signed by merchant agents. Use RFC 8785 JSON canonicalization to guarantee deterministic signature generation and verification regardless of JSON key ordering.
- **Consequences:** Directly aligns with Google and PayPal's AP2 agent payment standard, providing cryptographic proof of authorization and merchant price commitments.

---

## ADR-003: Quarantined Intent Judge LLM Architecture
- **Date:** 2026-11-02
- **Status:** Accepted
- **Context:** An LLM evaluating an agent purchase must not be susceptible to the same indirect prompt injections that hijacked the shopping agent.
- **Decision:** The Intent Judge is strictly quarantined: it never receives raw external HTML, user reviews, or untrusted markdown. The buyer agent's rationale is treated as an adversarial claim, capped at 500 characters, and clearly partitioned in the prompt context. The judge outputs strict JSON schemas without tool calling.
- **Consequences:** Prevents recursive prompt injection attacks from compromising the firewall's AI judgment layer.

---

## ADR-004: Tamper-Evident SHA-256 Chained Ledger
- **Date:** 2026-11-02
- **Status:** Accepted
- **Context:** Judges and users need immutable auditability showing the exact decision trail for every dollar spent by an agent.
- **Decision:** Store every event (mandate creation, request, layer results, authorization, capture, void) in an append-only PostgreSQL table where each row's hash is `SHA-256(prev_hash + canonical_json(payload))`. Provide a browser-side "Verify Chain" utility in the AG Grid console.
- **Consequences:** Guarantees cryptographic auditability without requiring a full public blockchain, offering instant client-side verification.
