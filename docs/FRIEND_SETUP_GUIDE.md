# Teammate Onboarding & Local Setup Guide

Welcome to **Leash: Payment Firewall for AI Agents**! This guide is for **Aditya Raj** (`@AdityaRaj1304`) and **Sharad** (`@sharadpolackalsunil`) to get up and running smoothly.

---

## 🚀 1. Quick Start (5 Minutes)

### Prerequisites
- Node.js $\ge$ 20.x
- pnpm $\ge$ 9.x (`corepack enable pnpm` or `npm install -g pnpm`)
- Python $\ge$ 3.11
- GitHub CLI (`gh`) authenticated with your GitHub account

### Clone & Install
```bash
# 1. Clone the repository
git clone https://github.com/ADITYASINGH1206/leash.git
cd leash

# 2. Install monorepo dependencies
pnpm install

# 3. Setup environment configuration
cp .env.example .env

# 4. Run development services
pnpm dev
```

---

## 👥 2. Issue Assignments & Workstream Ownership

### Aditya Kumar Singh (`@ADITYASINGH1206`) — Lead & Payments Rails (60%)
- **Focus:** PayPal Rails (Vault v3, Orders v2, Payments v2), Fastify Gateway MCP server, Postgres Drizzle ORM & mutex locking, Tamper-Evident SHA-256 ledger, Arbiter fail-closed logic, Render deployment, and E2E regression suite.
- **Assigned Issues:** #1, #2, #5, #6, #7, #13, #15, #17, #19, #20, #21, #22.

---

### Aditya Raj (`@AdityaRaj1304`) — AI, Security & Intent Pipeline (20%)
- **Focus:** Cryptographic Mandates package (`@leash/mandates`), Intent Judge system prompt & JSON schema calibration, Layer 2 DOM Provenance crawler (hidden-text injection parser), and Buyer Agent with Attack Mode UI.
- **Assigned Issues:**
  - **Issue #3:** `[Phase 0] Intent Judge Baseline Prompting & Store Product Fixtures`
  - **Issue #4:** `[Phase 1] Cryptographic Mandates Package (@leash/mandates)`
  - **Issue #10:** `[Phase 2] Layer 2 DOM Provenance Scanner & Prompt Injection Classifier`
  - **Issue #11:** `[Phase 2] Layer 3 Intent Judge with Isolated LLM & Strict Schema`
  - **Issue #18:** `[Phase 3] Buyer Shopping Agent with Interactive Chat UI & Attack Mode`

---

### Sharad (`@sharadpolackalsunil`) — Storefronts, Policy & Benchmark (20%)
- **Focus:** 3 Demo Storefronts (`apps/stores`), PayPal Agent Toolkit integration, CEL Policy Engine (`packages/policy`), Python ML Risk Service (`services/ml` Isolation Forest), Mobile Approvals PWA, and AgentPay-Bench 60 scenarios.
- **Assigned Issues:**
  - **Issue #8:** `[Phase 1] Demo Storefronts & Merchant Agents with PayPal Agent Toolkit (apps/stores)`
  - **Issue #9:** `[Phase 2] Layer 1 Policy Engine with CEL Rules (packages/policy)`
  - **Issue #12:** `[Phase 2] Layer 4 Risk Anomaly Scoring Engine (services/ml)`
  - **Issue #14:** `[Phase 2] Mobile Approvals Web App (PWA) & Step-Up Re-Signing Flow`
  - **Issue #16:** `[Phase 3] AgentPay-Bench: 60 YAML Scenarios & Automated Evaluation Runner (bench/)`

---

## 🔀 3. Git Workflow & Opening Pull Requests

Because the `main` branch is protected, all contributions must go through Pull Requests:

1. **Pick up your assigned issue** (e.g. Issue #3).
2. **Create a branch from `main`:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/intent-judge-prompting
   ```
3. **Commit your changes using Conventional Commits:**
   ```bash
   git add .
   git commit -m "feat(judge): implement baseline JSON schema and hand-tested edge cases"
   git push -u origin feat/intent-judge-prompting
   ```
4. **Create PR with GitHub CLI:**
   ```bash
   gh pr create --base main --title "feat(judge): implement baseline JSON schema" --body "Resolves #3"
   ```
5. **Gemini AI Review:**
   - The **Gemini AI PR Reviewer** bot will automatically review your PR diff against project invariants and post comments.
   - Address any `[BLOCKING]` findings.
   - Once approved by a teammate, merge into `main`!
