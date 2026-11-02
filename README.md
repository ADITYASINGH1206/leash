# 🛡️ Leash: Payment Firewall for AI Agents

> **Agents can now spend money; Leash makes sure they only spend it the way you meant.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hackathon](https://img.shields.io/badge/PayPal-AI%20Hackathon%202026-003087?logo=paypal)](https://paypalaihackathon.devpost.com/)
[![Protocol](https://img.shields.io/badge/Mandates-AP2%20Compatible-brightgreen)](https://eco.com/support/en/articles/15192002)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

**Leash** is an institutional-grade payment firewall sitting between autonomous AI shopping agents and **PayPal**. Every agent payment must trace back to a cryptographically signed human mandate. Before money is authorized, payments pass a 5-layer deterministic and AI inspection engine. Crucially, Leash enforces an **authorize-then-capture** lifecycle where money only moves upon signed merchant delivery, and auto-voids after 72 hours if unfulfilled.

> ⚖️ **For Hackathon Judges:** Evaluate the entire firewall live in under 30 seconds with **zero configuration or credentials** using our hosted **Judge Mode**. See the [**Judge Quickstart Guide (docs/quickstart.md)**](docs/quickstart.md).

---

## 🏛️ System Architecture

```mermaid
flowchart LR
    subgraph Human ["Human Principal"]
        PWA["Mobile Approvals PWA\n(WebCrypto P-256)"]
        Console["Leash Console\n(AG Grid & Analytics)"]
    end

    subgraph Agentic ["Autonomous Agents"]
        Shopper["Buyer Agent\n(Claude / Vercel AI SDK)"]
        Merchants["Demo Store Agents\n(PayPal Agent Toolkit)"]
    end

    subgraph Firewall ["Leash Gateway (Fastify + MCP)"]
        L0["Layer 0: Mandate & Budget Lock (ES256)"]
        L1["Layer 1: Policy Engine (CEL Rules)"]
        L2["Layer 2: Provenance Scanner (DOM Hidden-Text)"]
        L3["Layer 3: Intent Judge (Isolated LLM)"]
        L4["Layer 4: Risk Anomaly (Isolation Forest)"]
        Decide{"Fail-Closed\nArbiter"}
        Ledger[("Tamper-Evident Ledger\nSHA-256 Hash Chain")]
    end

    subgraph PayPalRails ["PayPal Rails (Sandbox)"]
        Vault["Vault v3\n(Saved User Wallet)"]
        Orders["Orders v2\n(intent: AUTHORIZE, payee: Merchant)"]
        Capture["Payments v2\n(Capture on Fulfilment / 72h Void)"]
    end

    Human -->|Sign Intent Mandate| L0
    Shopper -->|Call request_payment(cart, evidence)| Firewall
    Firewall --> L0 --> L1 --> L2 & L3 --> L4 --> Decide
    Decide -->|Block / Hold| Ledger
    Decide -->|Hold| PWA
    Decide -->|Allow| Orders
    Orders -->|Authorized Hold| Capture
    Merchants -->|Signed Fulfilment Tracking| Capture
    Firewall --> Ledger
    Console --> Ledger
```

---

## ⚡ 5-Layer Inspection Engine

| Layer | Type | What It Catches | Fail-Safe Behavior |
| :--- | :--- | :--- | :--- |
| **0. Mandate Verification** | Cryptographic & Deterministic | Forged signatures (ES256), expired mandates, budget overruns, replay attacks, concurrent spending races (`SELECT FOR UPDATE`). | **BLOCK** immediately |
| **1. Policy as Code** | Deterministic CEL | Enterprise & user policies: blocked categories (crypto, gift cards), velocity thresholds, off-hours execution, novel merchant step-ups. | **BLOCK** or **HOLD** for human approval |
| **2. Provenance Scanner** | DOM Extraction & Classifier | Hidden-text prompt injections on cited product pages (`display:none`, zero-opacity, HTML comments, `aria-hidden`, zero-width characters). | **BLOCK** if payload matches cart items; else **HOLD** |
| **3. Intent Judge** | Isolated LLM (Strict Schema) | Semantic goal drift: agent passes budget caps but buys items that do not fulfill human intent. Never sees raw untrusted web content. | **BLOCK** if inconsistent ($\ge 0.8$); **HOLD** if unsure |
| **4. Risk Engine** | Anomaly Model & ML | Isolation Forest (FastAPI service) analyzing anomaly vectors (amount novelty, category drift, just-under-limit threshold splitting). | **HOLD** if risk score $40 \dots 70$; **BLOCK** if $>70$ |

---

## 💳 The PayPal Money Path

1. **Vault v3 (Zero Credential Leakage):** User connects their PayPal wallet once during onboarding. Leash holds the `vault_id`. The agent never sees cards, bank accounts, or tokens.
2. **Orders v2 (intent: AUTHORIZE with Payee):** On approved carts, Leash creates an authorization specifying the merchant as the payee. Funds are held, never immediately debited.
3. **Payments v2 (Capture on Fulfilment):** Leash captures funds only when the merchant agent submits a cryptographically signed fulfilment notice with verified carrier tracking.
4. **Auto-Void within 72 Hours:** If unfulfilled within PayPal's 3-day honor window, the authorization is automatically voided via `pg-boss` scheduled jobs and the user's mandate budget is unlocked.
5. **Tamper-Evident Ledger:** Every event is recorded in an append-only SHA-256 hash chain with browser-side verification.

---

## 📂 Monorepo Structure

```text
leash/
├── apps/
│   ├── gateway/         # Fastify Node 20 + MCP TypeScript SDK + Drizzle ORM + REST API
│   ├── console/         # Next.js 15 + Tailwind CSS + AG Grid Community + Web Push PWA
│   ├── stores/          # 3 Demo Storefronts (GadgetHub, TrendBoutique, DailyMart) + PayPal Agent Toolkit
│   └── buyer-agent/     # Shopper agent with interactive chat UI & Attack-Mode injection toggle
├── services/
│   └── ml/              # FastAPI Python 3.11 service (Isolation Forest + Prompt Injection detector)
├── packages/
│   ├── mandates/        # jose ES256 signing, RFC 8785 canonicalisation, Zod schemas
│   ├── policy/          # Common Expression Language (CEL) policy engine & default ruleset
│   ├── paypal/          # Typed PayPal REST client (Vault, Orders, Payments, Webhook verification)
│   └── shared/          # Tamper-evident SHA-256 chain utilities & domain models
├── bench/
│   ├── scenarios/       # 60 YAML benchmark attack & control test scenarios
│   └── runner/          # AgentPay-Bench automated execution harness & ablation table generator
├── docs/                # Architecture diagrams, threat model specs, developer integration, judge quickstart
├── LICENSE              # MIT License
└── render.yaml          # Render deployment blueprint
```

---

## 📊 AgentPay-Bench

We open-source **AgentPay-Bench**, an automated 60-scenario evaluation benchmark assessing agent transaction security:
- **40 Attack Scenarios:** Hidden-text prompt injections, review injections, look-alike merchants, scope drift, post-signature price escalations, threshold splitting, replay/expiry exploits, and goal hijacking via tool outputs.
- **20 Normal Control Purchases:** High-dollar items within limits, first-time merchants, multi-item bundled carts.
- **Metrics Evaluated:** Attack Success Rate (With vs. Without Leash), False Positive Block/Hold Rate, and 95th Percentile Latency.

---

## 🛠️ Development Setup

### Prerequisites
- Node.js $\ge$ 20.x
- pnpm $\ge$ 9.x
- Python $\ge$ 3.11
- PostgreSQL database
- PayPal Developer Sandbox Account (REST App credentials)

```bash
# Clone the repository
git clone https://github.com/ADITYASINGH1206/leash.git
cd leash

# Install monorepo dependencies
pnpm install

# Configure environment variables
cp .env.example .env

# Run database migrations
pnpm db:migrate

# Start the full stack in development mode
pnpm dev
```

### Console pages

| Route | What it is |
| :--- | :--- |
| `/` | Homepage: the problem, the five checks, the money path, an interactive hash-chain demo, benchmark results |
| `/judge` | Judge mode: runs the full story against the live gateway (no scripted steps) |
| `/console` | Overview of captured, held-at-PayPal, waiting and blocked payments |
| `/console/feed` | Live decisions with each check's verdict and message; approve or deny held payments |
| `/console/ledger` | AG Grid ledger, 3D hash chain, in-browser verification, CSV export |
| `/console/mandates` | Write a mandate in plain words, read it back, sign it with the device key |
| `/console/bench` | AgentPay-Bench results, synced from `bench/results/summary.json` at build time |
| `/console/ask` | Questions answered from ledger entries (rule-based, no LLM) |
| `/approvals` | Phone approvals PWA with step-up re-signing |
| `/developers` | MCP endpoint, tools and REST reference |

When the gateway is offline the console shows a recorded sample (regenerate with `pnpm --filter @leash/console record-sample` while the gateway runs) and disables every action.

---

## 📜 License
Distributed under the [MIT License](LICENSE).
