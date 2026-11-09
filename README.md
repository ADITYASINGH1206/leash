# 🛡️ Leash: Payment Firewall for AI Agents

> **Autonomous AI shopping agents can now spend money. Leash guarantees they only spend it the way you authorized.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hackathon](https://img.shields.io/badge/PayPal-AI%20Hackathon%202026-003087?logo=paypal)](https://paypalaihackathon.devpost.com/)
[![Vitest Test Suite](https://img.shields.io/badge/Vitest-191%20Passing-brightgreen?logo=vitest)](apps/e2e)
[![Python Risk ML](https://img.shields.io/badge/Pytest%20ML-16%20Passing-brightgreen?logo=python)](services/ml)
[![AgentPay-Bench](https://img.shields.io/badge/AgentPay--Bench-60%2F60%20(100%25%20Mitigated)-success)](bench/results/ablation_report.md)
[![Protocol](https://img.shields.io/badge/Mandates-AP2%20Compatible-brightgreen)](https://eco.com/support/en/articles/15192002)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

**Leash** is an institutional-grade payment firewall sitting between autonomous AI shopping agents and **PayPal**. Every agent payment must trace back to a cryptographically signed human mandate. Before money is authorized, requests pass through a 5-layer deterministic and AI inspection engine. Crucially, Leash enforces an **authorize-then-capture** lifecycle where money only moves upon signed merchant delivery, and auto-voids after 72 hours if unfulfilled.

> ⚖️ **For Hackathon Judges:** Evaluate the entire firewall live in under 30 seconds with **zero configuration or credentials** using our hosted **Judge Mode**. See the [**Judge Quickstart Guide (docs/quickstart.md)**](docs/quickstart.md).

---

## 📸 Console & Judge Mode Previews

| Banknote Design System (Console Home) | Interactive Judge Mode (Live Pipeline Walkthrough) |
| :---: | :---: |
| ![Leash Console Overview](docs/assets/preview-home.png) | ![Leash Judge Mode Walkthrough](docs/assets/preview-judge.png) |

---

## 🏛️ System Architecture

```mermaid
flowchart LR
    subgraph Human ["Human Principal"]
        PWA["Mobile Approvals PWA\n(WebCrypto P-256)"]
        Console["Leash Console (Next.js 15)\n(Banknote Design & AG Grid Ledger)"]
    end

    subgraph Agentic ["Autonomous Agents & Stores"]
        Shopper["Buyer Shopper Agent\n(Fastify + Attack-Mode Switch)"]
        Stores["Demo Storefronts (Port 3003)\n(GadgetHub, TrendBoutique, DailyMart)"]
    end

    subgraph Firewall ["Leash Gateway (Fastify + MCP Server)"]
        L0["Layer 0: Mandate & Mutex Lock\n(ES256, Nonce, SELECT FOR UPDATE)"]
        L1["Layer 1: Policy Engine\n(Google CEL Rules)"]
        L2["Layer 2: Provenance Scanner\n(DOM Hidden-Text & Injection Parser)"]
        L3["Layer 3: Intent Judge\n(Isolated Gemini / Anthropic LLM)"]
        L4["Layer 4: Risk Anomaly Engine\n(Isolation Forest FastAPI)"]
        Decide{"Fail-Closed\nDecision Arbiter\n(< 2,500ms)"}
        Ledger[("Tamper-Evident Ledger\nSHA-256 Hash Chain")]
    end

    subgraph PayPalRails ["PayPal Rails (Sandbox & Live)"]
        Vault["Vault v3\n(Zero Token Exposure)"]
        Orders["Orders v2\n(intent: AUTHORIZE, payee: Merchant)"]
        Capture["Payments v2\n(Capture on Fulfilment / 72h Void)"]
    end

    Human -->|Sign Intent Mandate| L0
    Shopper -->|Search Catalog & Build Cart| Stores
    Stores -->|Signed AP2 Cart Mandate (ES256)| Shopper
    Shopper -->|POST /api/v1/payment/request| Firewall
    Firewall --> L0 --> L1 --> L2 & L3 --> L4 --> Decide
    Decide -->|BLOCK / HOLD| Ledger
    Decide -->|HOLD (Step-Up)| PWA
    Decide -->|ALLOW| Orders
    Orders -->|Authorized Hold| Capture
    Stores -->|Cryptographically Signed Fulfilment| Capture
    Firewall --> Ledger
    Console --> Ledger
```

---

## ⚡ 5-Layer Inspection Engine

| Layer | Type | What It Catches | Fail-Safe Behavior |
| :--- | :--- | :--- | :--- |
| **0. Mandate Verification** | Cryptographic & Deterministic | Forged signatures (ES256), expired mandates, budget overruns, replay nonces, concurrent spending races (`SELECT ... FOR UPDATE`). | **BLOCK** immediately |
| **1. Policy as Code** | Deterministic Google CEL | Enterprise & user policies: blocked merchant categories (crypto, gift cards), velocity thresholds, late-night hours, untrusted merchants. | **BLOCK** or **HOLD** for step-up |
| **2. Provenance Scanner** | DOM Extraction & Classifier | Hidden prompt injections on cited product pages (`display:none`, zero-opacity, HTML comments, `aria-hidden`, zero-width characters). | **BLOCK** if payload matches cart items; else **HOLD** |
| **3. Intent Judge** | Isolated LLM (Strict Schema) | Semantic goal drift: agent passes budget caps but buys items that do not fulfill human intent. Raw untrusted web content is strictly quarantined. | **BLOCK** if inconsistent ($\ge 0.8$); **HOLD** if uncertain |
| **4. Risk Engine** | Anomaly Model & ML | Isolation Forest (FastAPI service) analyzing anomaly vectors (amount novelty, category drift, just-under-limit threshold splitting). | **HOLD** if risk score $40 \dots 70$; **BLOCK** if $>70$ |

---

## 💳 The PayPal Money Path

1. **Vault v3 (Zero Credential Leakage):** The user saves their PayPal payment source once during onboarding. Leash stores the `vault_id`. Autonomous agents never see cards, bank accounts, or API credentials.
2. **Orders v2 (intent: AUTHORIZE with Merchant Payee):** On approved carts, Leash creates an order specifying the merchant's verified payee email and merchant ID. Funds are **held**, never immediately debited.
3. **Payments v2 (Capture on Verified Fulfilment):** Leash captures funds **only** when the merchant agent submits a cryptographically signed fulfilment notice (`SignedFulfilmentNotice`) with verified tracking.
4. **Auto-Void within 72 Hours:** If unfulfilled within PayPal's 3-day authorization window, the authorization is automatically voided via scheduled background workers (`pg-boss`), unlocking the user's mandate budget.
5. **Tamper-Evident SHA-256 Ledger:** Every state transition (request, check verdicts, PayPal auth, hold, capture, void) is hashed into an append-only cryptographic chain verified live in the browser.

---

## 🚀 Can We Deploy It? (Yes! Deployment Guide)

Leash is designed as a cloud-native, 12-factor distributed system. You can deploy it instantly using multiple production strategies:

### Strategy 1: One-Click Render Blueprint (Recommended)

Leash includes a battle-tested [`render.yaml`](render.yaml) blueprint that spins up the full distributed microservice architecture with a single click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

#### Services Provisioned by `render.yaml`:
| Service | Type | Runtime | Port / Target | Purpose |
| :--- | :---: | :---: | :---: | :--- |
| `leash-db` | Managed DB | PostgreSQL 16 | Internal | ACID ledger storage & mutex row-level locking |
| `leash-gateway` | Web Service | Node.js 22 | `$PORT` (4000) | Fastify Gateway, Decision Arbiter, MCP Server, PayPal client |
| `leash-console` | Web Service | Node.js 22 | `$PORT` (3000) | Next.js 15 Web Console, AG Grid Ledger, Approvals PWA |
| `leash-stores` | Web Service | Node.js 22 | `$PORT` (3003) | Multi-tenant Demo Stores (GadgetHub, TrendBoutique, DailyMart) |
| `leash-buyer-agent`| Web Service | Node.js 22 | `$PORT` (4001) | Autonomous Shopper Agent with chat UI & Attack Mode |
| `leash-ml` | Web Service | Python 3.11 | `$PORT` (8000) | Layer 4 Isolation Forest Anomaly Detection Service |

---

### Strategy 2: Hybrid Deployment (Vercel + Cloud Gateway)

You can also deploy the **Next.js 15 Console** to **Vercel** and the backend microservices to **Render / Railway / Fly.io / AWS**:

1. **Deploy Frontend on Vercel:**
   - Root directory: `apps/console`
   - Build command: `pnpm build`
   - Output directory: `.next`
   - Environment variables:
     ```env
     NEXT_PUBLIC_GATEWAY_URL=https://your-leash-gateway.onrender.com
     ```
2. **Deploy Gateway on Render / Fly / Railway:**
   - Build: `pnpm install --ignore-scripts && pnpm build`
   - Start: `node apps/gateway/dist/server.js`
   - Set `CORS_ORIGINS=https://your-console.vercel.app`

---

### Strategy 3: Self-Hosted / Docker

To run the stack with standard Node and Python processes or container orchestrators:

```bash
# 1. Build all 11 packages in the monorepo
pnpm install
pnpm build

# 2. Start Gateway
node apps/gateway/dist/server.js

# 3. Start Console
pnpm --filter=@leash/console start

# 4. Start Demo Stores
node apps/stores/dist/index.js

# 5. Start Buyer Shopping Agent
node apps/buyer-agent/dist/index.js

# 6. Start Python ML Anomaly Service
uvicorn services.ml.main:app --host 0.0.0.0 --port 8000
```

---

## 🔑 Environment Variables Reference

Copy `.env.example` to `.env` to configure your environment:

| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `4000` | Port for Gateway HTTP & MCP server |
| `NODE_ENV` | Optional | `development` (`production` in cloud) | Execution environment mode |
| `DATABASE_URL` | Optional | `postgresql://postgres:postgres@localhost:5432/leash_db` | Postgres connection string (falls back to in-memory) |
| `PAYPAL_ENVIRONMENT` | Optional | `sandbox` | `sandbox` or `live` |
| `PAYPAL_CLIENT_ID` | Optional | `sandbox-client-id` | PayPal Developer REST App Client ID |
| `PAYPAL_CLIENT_SECRET` | Optional | `sandbox-client-secret` | PayPal Developer REST App Client Secret |
| `PAYPAL_WEBHOOK_ID` | Optional | `sandbox-webhook-id` | Webhook ID for PayPal event verification |
| `GEMINI_API_KEY` | Optional | `AIza...` | Google Gemini 2.5 Flash for natural language Mandate Compiler |
| `ANTHROPIC_API_KEY` | Optional | `sk-ant...` | Optional LLM provider for Intent Judge (falls back to mock) |
| `ML_SERVICE_URL` | Optional | `http://localhost:8000` | URL of the Layer 4 Python Isolation Forest service |
| `NEXT_PUBLIC_GATEWAY_URL`| Optional | `http://localhost:4000` | Gateway URL accessed by the Next.js console browser app |
| `CORS_ORIGINS` | Optional | `*` | Allowed CORS origins for the Gateway API |

*Note: The system features full zero-credential offline fallbacks. If no PayPal credentials or LLM keys are supplied, Leash defaults to high-fidelity mock implementations without failing.*

---

## 📊 AgentPay-Bench Evaluation Results

We evaluated Leash using **AgentPay-Bench**, an automated benchmark suite of **60 reproducible YAML scenarios** (40 adversarial attacks and 20 normal control purchases):

```text
======================================================
   AGENTPAY-BENCH: 60 ADVERSARIAL SCENARIOS EVALUATION
======================================================
• Attack Mitigation Rate:  100.0% (40/40 neutralized)
• Attack Success Rate:     0.0%   (Down from 97.5% baseline)
• False Positive Rate:     0.0%   (20/20 valid controls approved)
• p50 Decision Latency:    0.007 ms
• p95 Decision Latency:    0.325 ms
• Fail-Closed Reliability: 100.0%
```

### Layer Ablation Matrix (Defense-In-Depth Proof)

| Configuration | Active Layers | Attack Success Rate (ASR) | p95 Latency | Defense Grade |
| :--- | :--- | :---: | :---: | :--- |
| **Baseline (Raw LLM, No Leash)** | None (Direct Web/Prompt) | **97.5%** | 0.001 ms | Grade F (Vulnerable) |
| **Leash (L1 CEL Policy Only)** | Layer 1 Policy | **45.0%** | 0.000 ms | Grade C (Deterministic Rules) |
| **Leash (L1 Policy + L2 Provenance)** | Layer 1 Policy + Layer 2 Provenance Scanner | **45.0%** | 0.019 ms | Grade B+ (Web Attack Proof) |
| **Full Leash Firewall (L0 to L4)** | L0 Mandate + L1 Policy + L2 Provenance + L3 Intent + L4 Risk | **0.0%** | **0.325 ms** | **Grade A+ (Institutional Immunity)** |

---

## 💻 Local Quickstart (2 Minutes)

### Prerequisites
- **Node.js:** $\ge$ 20.x
- **pnpm:** $\ge$ 9.x (`corepack enable`)
- **Python:** $\ge$ 3.11

```bash
# 1. Clone repository
git clone https://github.com/ADITYASINGH1206/leash.git
cd leash

# 2. Install workspace dependencies
pnpm install

# 3. Build all workspace packages
pnpm build

# 4. Run full test suite across packages (191 tests)
pnpm test

# 5. Start all services in development mode
pnpm dev
```

### Active Port Matrix

| Service | Port | URL | Description |
| :--- | :---: | :--- | :--- |
| **Leash Web Console** | `3000` | [http://localhost:3000](http://localhost:3000) | Banknote UI, AG Grid Ledger, Approvals PWA |
| **Demo Storefronts** | `3003` | [http://localhost:3003](http://localhost:3003) | GadgetHub, TrendBoutique, DailyMart & PayPal Agent Toolkit |
| **Leash Gateway & MCP** | `4000` | [http://localhost:4000](http://localhost:4000) | Gateway REST API, MCP tool endpoint (`/mcp`), Ledger |
| **Buyer Shopping Agent** | `4001` | [http://localhost:4001](http://localhost:4001) | Shopper agent chat interface with live Attack Mode switch |
| **Layer 4 ML Anomaly** | `8000` | [http://localhost:8000](http://localhost:8000) | FastAPI Isolation Forest anomaly service |

---

## 🖥️ Console Pages & Walkthroughs

| Route | View | Description |
| :--- | :--- | :--- |
| `/` | **Overview** | Banknote design system, problem statement, 5 inspection checks, PayPal money path, and live benchmark stats |
| `/judge` | **Judge Mode** | 30-second live interactive walkthrough driving the real Gateway without pre-scripted steps |
| `/console` | **Financial Overview** | Aggregated spend breakdown (Captured, Authorized Holds, Pending Approvals, Blocked) |
| `/console/feed` | **Live Decision Feed** | Real-time decision stream with per-layer diagnostic traces, reason codes, and step-up actions |
| `/console/ledger` | **AG Grid Ledger** | Immutable audit trail, 3D hash-chain explorer, in-browser cryptographic verification & CSV export |
| `/console/mandates` | **Mandate Studio** | Natural language mandate compiler (Gemini 2.5 Flash + fallback), visual limits, WebCrypto device signing |
| `/console/bench` | **AgentPay-Bench** | Interactive 60-scenario matrix and 4-layer ablation table synced directly from runner output |
| `/console/ask` | **Ledger Inquirer** | Instant natural language question answering across audit events (deterministic, zero hallucinations) |
| `/approvals` | **Mobile Approvals** | Responsive PWA for on-the-go human step-up approvals with local biometric key re-signing |
| `/developers` | **Developer Specs** | Model Context Protocol (MCP) server endpoints, tool schemas, and REST API documentation |

---

## 👥 Hackathon Team & Workstreams

| Contributor | Focus & Workstreams |
| :--- | :--- |
| **Aditya Kumar Singh** ([@ADITYASINGH1206](https://github.com/ADITYASINGH1206)) | **Lead Architect:** PayPal Rails (Vault, Orders, Payments), Gateway & MCP Server, Tamper-Evident SHA-256 Ledger, Decision Arbiter, Render Deployment, E2E Regression |
| **Aditya Raj** ([@AdityaRaj1304](https://github.com/AdityaRaj1304)) | Intent Judge LLM schemas, `@leash/mandates` crypto package (RFC 8785 canonicalisation, ES256), Layer 2 DOM Provenance Scanner, Buyer Agent Attack Mode |
| **Sharad** ([@sharadpolackalsunil](https://github.com/sharadpolackalsunil)) | Demo Storefronts (`apps/stores`), PayPal Agent Toolkit, Google CEL Policy Engine, Layer 4 Risk ML Service, AgentPay-Bench (60 scenarios) |

---

## 📜 License
Distributed under the [MIT License](LICENSE).
