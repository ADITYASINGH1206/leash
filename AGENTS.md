# AGENTS.md — Leash: Payment Firewall for AI Agents

You are building **Leash**, an institutional-grade payment firewall sitting between autonomous AI shopping agents and PayPal, developed for the **PayPal AI Hackathon 2026**.

---

## 📖 Read First
1. [`README.md`](README.md) (high-level system overview, money path, and decision layers).
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (system architecture and component topology).
3. [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/QUESTIONS.md`](docs/QUESTIONS.md), [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

---

## 🛡️ Core Architectural Invariants (NEVER VIOLATE)

1. **Authorize-Then-Capture Invariant:**
   - Money must **never** move immediately at purchase time.
   - All orders use `intent: AUTHORIZE`.
   - Captures are executed **only** after receiving a cryptographically signed fulfilment notice from the merchant agent.
   - Stale authorizations are auto-voided after 72 hours via scheduled background jobs (`pg-boss`), releasing the reserved budget.

2. **Fail-Closed Principle:**
   - If any decision layer crashes, errors, returns unexpected output, or times out (> 2.5s), the transaction verdict **must be HOLD** (requiring human confirmation).
   - Under no circumstances should a system failure degrade to `ALLOW`.

3. **Isolated Intent Judge Context:**
   - The Intent Judge LLM must **never** ingest raw, unparsed web HTML or unverified tool outputs.
   - The buyer agent's rationale is treated as an adversarial claim, capped at 500 characters, and strictly quarantined.
   - The judge operates on verified structured data (signed mandate playback, verified cart from merchant registry).

4. **Cryptographic Mandate Verification:**
   - Mandates (Intent and Cart) must be canonically formatted per **RFC 8785** before signing/verification.
   - Nonces must be tracked and marked consumed.
   - Budget deduction must occur within an atomic database transaction using row-level mutex locking (`SELECT ... FOR UPDATE`).

5. **Tamper-Evident Ledger:**
   - Every transaction lifecycle event must be recorded in an append-only table.
   - Each row's hash is: `SHA-256(prev_hash + canonical_json(payload))`.
   - History is immutable; editing any past row invalidates all subsequent hashes.

6. **Evidence-Based Engineering (No Invented Data):**
   - Benchmark metrics, latency numbers, and attack success rates must be derived from actual executions of **AgentPay-Bench** against real or recorded fixtures.
   - Never invent or hardcode test numbers in presentation docs.

7. **Strict Secrets Protection:**
   - PayPal Client Secrets, Vault Tokens, Webhook Verification Secrets, VAPID Private Keys, and LLM API keys must never be committed to Git or printed in unmasked logs.

---

## 👥 Team Workstreams & Issue Assignments

| Contributor | GitHub Handle | Share | Assigned Workstreams & Focus |
| :--- | :--- | :---: | :--- |
| **Aditya Kumar Singh** (Lead) | `@ADITYASINGH1206` | 60% | PayPal Rails (Vault, Orders, Payments), Gateway MCP Server, Tamper-Evident Ledger, Decision Arbiter, Render Deployment, E2E Regression |
| **Aditya Raj** | `@AdityaRaj1304` | 20% | Intent Judge LLM prompting & schemas, `@leash/mandates` crypto package, Layer 2 DOM Provenance Scanner, Buyer Agent Attack Mode |
| **Sharad** | `@sharadpolackalsunil` | 20% | Demo Storefronts (`apps/stores`), PayPal Agent Toolkit, CEL Policy Engine, Layer 4 Risk ML Service, AgentPay-Bench (60 scenarios) |

---

## 🛠️ Monorepo Commands

```bash
# Install dependencies across all workspaces
pnpm install

# Run all services in development mode
pnpm dev

# Run unit and integration tests across packages
pnpm test

# Format and lint code
pnpm lint
pnpm format

# Run database migrations
pnpm db:migrate
```
