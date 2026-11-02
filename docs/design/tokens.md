# Leash Design System & UI Engineering Tokens

This document defines the verified design tokens, typography, and component styling for **Leash: Payment Firewall for AI Agents** (Next.js Console, Mobile Approvals PWA, and Demo Storefronts), adopted from the global `developer-ecosystem-ui` engineering skill.

---

## 🎨 1. Core Color Tokens (Modern Ecosystem Obsidian + Financial Defense)

Defined as CSS variables and Tailwind utilities:

```css
:root {
  /* Surface & Base Canvas */
  --bg-void: #08090d;                 /* Deep obsidian void background */
  --surface-flat: #0c0e13;            /* Elevated card surface */
  --surface-elevated: #12151c;        /* Hover cards & modals */
  --foreground: #fafafa;              /* Primary heading & text */
  --muted-foreground: #9f9fa9;        /* Secondary copy & timestamps */

  /* Blueprint Gridlines & Borders */
  --border: rgba(255, 255, 255, 0.1);
  --border-dashed: rgba(255, 255, 255, 0.12);
  --crosshair: #71717a;

  /* Firewall Verdict Status Tokens */
  /* ALLOW (Verified / Valid / Capturable) */
  --verdict-allow: #00c758;           /* Neon Emerald */
  --verdict-allow-bg: rgba(0, 199, 88, 0.12);
  --verdict-allow-border: rgba(0, 199, 88, 0.4);

  /* HOLD (Human Review / Step-up Signing Required) */
  --verdict-hold: #f0a830;            /* Safety Amber */
  --verdict-hold-bg: rgba(240, 168, 48, 0.12);
  --verdict-hold-border: rgba(240, 168, 48, 0.4);

  /* BLOCK (Tainted / Prompt Injection / Forged Mandate) */
  --verdict-block: #e05a4a;           /* Crimson Alert */
  --verdict-block-bg: rgba(224, 90, 74, 0.12);
  --verdict-block-border: rgba(224, 90, 74, 0.4);

  /* Signature Rails Accents */
  --paypal-blue: #0070ba;             /* PayPal signature blue */
  --paypal-dark: #003087;             /* Deep navy brand rail */
  --accent-saffron: #fe6e00;          /* Event highlight pins */
  --laser-wall: #ffc247;              /* Scope boundary perimeter glowing fence */

  /* Typography Stacks */
  --font-display: "Plus Jakarta Sans", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", Menlo, monospace;
}
```

---

## 📐 2. The Box Method Architectural Blueprint

All dashboard cards, header rows, and live feed containers implement **The Box Method**:
- Continuous dashed outer boundary (`border-dashed border-white/12`).
- Monospaced corner crosshairs (`+`) anchored to container vertices.
- High-density divide-x metric pills displaying real-time security counters:

```html
<!-- Divide-x Metric Pill -->
<div class="flex w-fit items-stretch divide-x divide-white/10 rounded-xl border border-white/12 bg-[#08090d]/80 backdrop-blur-md">
  <div class="flex flex-col gap-1 px-5 py-2.5">
    <span class="font-mono text-xl font-bold leading-none text-[#00c758]">$14,820</span>
    <span class="font-mono text-xs uppercase tracking-wider text-[#9f9fa9]">Protected Volume</span>
  </div>
  <div class="flex flex-col gap-1 px-5 py-2.5">
    <span class="font-mono text-xl font-bold leading-none text-[#f0a830]">4 Held</span>
    <span class="font-mono text-xs uppercase tracking-wider text-[#9f9fa9]">Awaiting Re-sign</span>
  </div>
  <div class="flex flex-col gap-1 px-5 py-2.5">
    <span class="font-mono text-xl font-bold leading-none text-[#e05a4a]">18 Blocked</span>
    <span class="font-mono text-xs uppercase tracking-wider text-[#9f9fa9]">Injections Stopped</span>
  </div>
  <div class="flex flex-col gap-1 px-5 py-2.5">
    <span class="font-mono text-xl font-bold leading-none text-white font-mono">1.82s</span>
    <span class="font-mono text-xs uppercase tracking-wider text-[#9f9fa9]">P95 Latency</span>
  </div>
</div>
```

---

## ⚡ 3. 5-Layer Inspection Pipeline Animated Stepper

The decision feed features an animated SVG pipeline visualizing the 5-layer decision flow in real time:

```text
[L0 Mandate] ───► [L1 Policy] ───┬──► [L2 Provenance] ──┬──► [L4 Risk ML] ───► [Arbiter]
                                 └──► [L3 Intent Judge] ┘
```

- Connecting bezier curves use stroke-dasharray animations (`hiw-draw`).
- Layer nodes pop on evaluation (`hiw-pop`).
- Tainted layers flash in pulsating alert crimson (`--verdict-block`).
- Clean layers lock with glowing emerald ring (`--verdict-allow`).

---

## 📊 4. AG Grid Community Immutable Ledger Theme

The AG Grid Community table is customized for dark obsidian auditability:
- Monospace styling for transaction hashes (`SHA-256`), nonces, and PayPal order IDs.
- Direct links to PayPal sandbox receipts.
- Expandable detail view showing full cryptographic signatures, policy traces, and quarantined LLM rationale.
- Interactive **"Verify Chain"** button calculating SHA-256 links client-side in the browser and displaying a green badge.

---

## 📱 5. Mobile Approvals PWA (Tactile Step-Up Card)

- Glassmorphic card surface with specular gradient foil.
- High-visibility hazard banner highlighting reason for hold (`Above mandate cap`, `New merchant`, `Quiet hours`).
- One-tap WebCrypto re-signing trigger with biometric/passkey support.
