# Leash: Judge Quickstart & Deployment Guide

> **Institutional-Grade Payment Firewall for Autonomous AI Agents**  
> Developed for the **PayPal AI Hackathon 2026** ($67,500+ Prize Pool).  
> *Sponsor Tracks: Best Use of AG Grid (1st Place), Best Use of Render (1st Place), Best Use of Agentic Commerce.*

---

## ⚡ 1. The 30-Second Judge Walkthrough (Zero Setup Required)

If you are evaluating this project for the hackathon, you can test the **entire end-to-end security pipeline live** without configuring API keys, PayPal credentials, or environment variables.

### Option A: Hosted console (recommended)
1. Open the hosted console (or `http://localhost:3000` locally) and choose **Run the live demo**, or go straight to `/judge`.
2. Press **Start the walkthrough**. The page drives the real gateway over HTTP; nothing is scripted. Each step shows the verdicts, ids and hashes the gateway returned:
   1. **Sign a mandate.** Your browser's device key (WebCrypto P-256, non-exportable) signs the limits; the gateway verifies the signature before storing it.
   2. **Honest purchase.** A $14.99 USB-C case passes every check; PayPal places an `AUTHORIZE` hold.
   3. **Hijacked agent.** The cited product page hides an instruction to buy gift cards. The agent's $100 gift-card cart is blocked by policy rules, the provenance scan and the intent judge. Nothing reaches PayPal.
   4. **Out-of-scope purchase.** Coffee beans fall outside the mandate's categories and are held.
   5. **Approve on your device.** The held amount is re-signed with the device key; only then is PayPal asked to authorize.
   6. **Merchant ships, money moves.** A shipping notice triggers the capture of the phone-case hold.
   7. **Check the ledger.** Your browser recomputes every SHA-256 link.
3. Then open **Console → Live decisions**, **Ledger** and **Approvals** (best on a phone) to see the same run from the user's side.

If the gateway is unreachable, every page says so and shows a recorded sample from a real run, with actions turned off. For a hosted deploy, set the console's `NEXT_PUBLIC_GATEWAY_URL` to the gateway's public `https://` URL and add the console's URL to the gateway's `CORS_ORIGINS`.

---

## 🚀 2. One-Click Render Production Deployment

Leash includes a battle-tested **Render Blueprint** (`render.yaml`) that deploys the entire distributed microservice topology with a single click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Infrastructure Provisioned by `render.yaml`
| Service Name | Type | Environment | Description |
| :--- | :---: | :---: | :--- |
| `leash-db` | Managed Database | PostgreSQL 16 | Primary ACID store with row-level mutex locking (`SELECT ... FOR UPDATE`) |
| `leash-gateway` | Web Service | Node.js 22 (Fastify) | Core Decision Arbiter, MCP Server, and PayPal Rails integration |
| `leash-console` | Web Service | Next.js 15 | AG Grid Community v33 Immutable Ledger & Mandate Studio |
| `leash-buyer-agent`| Web Service | Node.js 22 | Autonomous Shopping Agent with live Attack Mode switch |
| `leash-ml` | Web Service | Python 3.11 (FastAPI) | Layer 4 Isolation Forest Anomaly Detection & Anomaly Scorer |

### Environment Secret Configuration (Optional for Live Sandbox)
When deploying your own Render instance, the blueprint uses mock sandbox defaults out of the box. To connect your live PayPal developer sandbox:
```bash
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
ANTHROPIC_API_KEY=your_anthropic_api_key   # Optional: defaults to deterministic mock judge
```

---

## 💻 3. Local 2-Minute Developer Setup

Run the full monorepo on your local machine:

### Prerequisites
- **Node.js:** v22.0.0 or higher
- **pnpm:** v11.22.0 or higher (`corepack enable && corepack prepare pnpm@11.22.0 --activate`)
- **Python:** v3.11 or higher (for Layer 4 ML service)

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/ADITYASINGH1206/leash.git
cd leash

# Install all workspace dependencies
pnpm install
```

### Step 2: Build Workspace Packages
```bash
pnpm build
```

### Step 3: Run the Full Test Suite
Execute the complete test suite across all 11 workspace packages (133+ tests):
```bash
pnpm test
```

### Step 4: Start All Services in Development Mode
```bash
pnpm dev
```
Once started, the following services will be available:
- **Leash Web Console:** `http://localhost:3000` (AG Grid Ledger, Mandate Studio, Live Feed)
- **Buyer Shopping Agent:** `http://localhost:3001` (Autonomous agent chat UI & Attack Mode)
- **Leash Gateway API & MCP:** `http://localhost:4000` (`/health`, `/api/v1/ledger`, `/mcp`)
- **Layer 4 ML Service:** `http://localhost:8000` (`/api/v1/risk/score`)

---

## 🔍 4. Verification & Audit Features to Test

### 1. AG Grid Client-Side SHA-256 Verification
1. Navigate to the **AG Grid Ledger** tab.
2. Filter columns by clicking headers or using the search bar.
3. Click the green **"Verify Chain (SHA-256)"** button in the top right.
4. The client executes WebCrypto in-browser re-calculation across all rows:
   $$\text{Hash}_i = \text{SHA-256}(\text{Hash}_{i-1} + \text{RFC8785}(\text{Payload}_i))$$
5. An instant emerald banner proves tamper-evidence with a 100% hash match.
6. Click **"Export CSV"** to export the audited rows.

### 2. Live Prompt Injection Defense Test
1. Open the **Buyer Agent** UI at `http://localhost:3001`.
2. Toggle the **"Attack Mode Simulation"** switch to **ON**.
3. Send a message: *"Search for travel accessories"*.
4. Observe the agent ingest the hidden `display: none` DOM payload.
5. Watch the **Leash Firewall** immediately intercept the authorization request:
   - Status: `BLOCKED`
   - Violation: `Adversarial DOM prompt injection detected`
   - Funds Moved: **$0.00**

### 3. Natural Language Ledger Copilot
1. In the Console, navigate to the **Copilot** tab.
2. Ask any audit query:
   - *"What is my remaining budget for phone cases?"*
   - *"Show me all blocked transactions and their reasons."*
   - *"Did the merchant fulfill the order before capture?"*
3. The read-only sandboxed auditor extracts verifiable parameters without raw SQL execution.

---

## 🛡️ Architectural Invariants Enforced in Code

1. **Authorize-Then-Capture Invariant:** Money moves *only* upon verified fulfillment notice; orders default to `intent: AUTHORIZE`.
2. **Fail-Closed Principle:** Any layer crash or latency exceeding 2.4s defaults strictly to `HOLD`.
3. **Quarantined Intent Context:** Unparsed DOM content and external HTML are completely isolated from LLM generation context.
4. **Row-Level Budget Locking:** Parallel agent purchases acquire an atomic database mutex (`SELECT ... FOR UPDATE`) preventing double-spend race conditions.
5. **Tamper-Evident Ledger:** Every event is cryptographically hash-chained; modifying any historical row invalidates all downstream blocks.
