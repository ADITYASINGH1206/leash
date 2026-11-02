'use client';

import React, { useState } from 'react';
import { SiteHeader } from '../../components/home/SiteHeader';
import { SiteFooter } from '../../components/home/SiteFooter';
import { GATEWAY_BASE_URL } from '../../lib/api';

const TOOLS = [
  {
    name: 'request_payment',
    body: 'The only way your agent can pay. Send the mandate id, the merchant’s signed cart, a short rationale and the pages that led to the choice. Returns AUTHORIZED (money held at PayPal), HELD (waiting for the user) or BLOCKED, with every check’s reason.',
  },
  { name: 'check_mandate_budget', body: 'How much of a mandate is left, and whether it is still active.' },
  { name: 'verify_ledger_integrity', body: 'Recomputes the ledger’s hash chain and reports the first broken entry, if any.' },
];

const REST = [
  ['POST', '/api/v1/mandates', 'Register a mandate, optionally with a device signature that is verified'],
  ['POST', '/api/v1/payment/request', 'Same as the request_payment tool, over plain HTTP'],
  ['GET', '/api/v1/transactions', 'Recent decisions with their current status'],
  ['GET', '/api/v1/transactions/held', 'Payments waiting for the user'],
  ['POST', '/api/v1/transactions/:id/action', 'APPROVE (needs a device signature over the held amount) or DENY'],
  ['POST', '/api/v1/fulfillment/submit', 'Merchant shipping notice; triggers the PayPal capture'],
  ['GET', '/api/v1/ledger', 'The full hash-chained ledger'],
  ['GET', '/api/v1/ledger/verify', 'Server-side chain verification'],
  ['GET', '/health', 'Liveness, ledger height and PayPal mode'],
];

function Code({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="overflow-hidden rounded-sheet border border-ink/80 bg-ink">
      <figcaption className="flex items-center justify-between border-b border-paper-raised/10 px-4 py-2 text-[0.75rem] text-paper-raised/70">
        {label}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-note px-2 py-0.5 text-paper-raised/80 hover:bg-paper-raised/10"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[0.78rem] leading-relaxed text-paper-raised">{code}</pre>
    </figure>
  );
}

export default function DevelopersPage() {
  const mcp = `${GATEWAY_BASE_URL}/mcp`;
  const snippet = `// Any MCP client: give your agent Leash as its only payment tool
const res = await fetch("${mcp}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "request_payment", arguments: {
      mandateId: "mdt_…",            // signed by the user
      cart: signedCartFromMerchant,  // items, total, merchantId
      rationale: "User asked for a USB-C case under $20",
      evidence: [{ url: productPageUrl }],
      idempotencyKey: crypto.randomUUID(),
    }},
  }),
});
// result.status: "AUTHORIZED" | "HELD" | "BLOCKED"`;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[72rem] px-5 py-14 sm:px-8 md:py-20">
        <h1 className="font-display text-step-6 leading-none text-ink">For developers</h1>
        <p className="mt-5 max-w-[42rem] text-step-1 text-ink-soft">
          Give your agent one payment tool and no PayPal credentials. Leash checks each request, holds the money at PayPal,
          and captures it when the merchant ships.
        </p>

        <section className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-step-2 font-semibold text-ink">MCP endpoint</h2>
            <p className="mt-2 font-mono text-step--1 text-intaglio">{mcp}</p>
            <p className="mt-3 text-step--1 text-ink-soft">JSON-RPC over HTTP. Call tools/list to discover the tools below.</p>
            <ul className="mt-6 divide-y divide-rule border-y border-rule">
              {TOOLS.map((t) => (
                <li key={t.name} className="py-4">
                  <p className="font-mono text-step--1 font-semibold text-ink">{t.name}</p>
                  <p className="mt-1 text-step--1 text-ink-soft">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <Code code={snippet} label="Ten lines to integrate" />
        </section>

        <section className="mt-16">
          <h2 className="text-step-2 font-semibold text-ink">REST API</h2>
          <div className="mt-5 overflow-x-auto rounded-sheet border border-rule bg-paper-raised">
            <table className="w-full min-w-[40rem] text-left text-step--1">
              <thead className="border-b border-rule bg-paper text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Path</th>
                  <th className="px-4 py-3 font-medium">What it does</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {REST.map(([m, p, d]) => (
                  <tr key={p + m}>
                    <td className={`px-4 py-2.5 font-mono text-[0.75rem] font-semibold ${m === 'GET' ? 'text-allow' : 'text-intaglio'}`}>{m}</td>
                    <td className="px-4 py-2.5 font-mono text-[0.78rem] text-ink">{p}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            ['Fail closed', 'Any check that errors or runs past 2.4 seconds holds the payment. An outage never turns into an approval.'],
            ['Authorize, then capture', 'Allowed payments only reserve money. Capture needs a shipping notice; unshipped holds are voided after 72 hours.'],
            ['Isolated judge', 'The intent judge never reads raw web pages. Your agent’s rationale is capped at 500 characters and treated as a claim.'],
          ].map(([t, b]) => (
            <div key={t} className="border-t-2 border-intaglio pt-4">
              <h3 className="text-step-1 font-semibold text-ink">{t}</h3>
              <p className="mt-2 text-step--1 text-ink-soft">{b}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
