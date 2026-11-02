/**
 * Judge walkthrough: drives the real gateway end to end.
 *
 * Every verdict, id and hash shown in Judge mode comes from these calls; nothing
 * is scripted. The same function records the offline sample data
 * (scripts/record-sample.mjs), so the sample is real engine output too.
 */
import { gateway, type PaymentRequestInput, type PaymentResult, type LedgerEventRow } from './api';
import { canonicalJson, verifyLedgerChainBrowser } from './crypto';
import { getOrCreateDeviceKey, getDevicePublicKeyBase64, signApprovalPayload } from './device-wallet';

export type StepState = 'pending' | 'running' | 'done' | 'failed';

export interface JudgeStep {
  key: string;
  title: string;
  expectation: string;
  state: StepState;
  outcome?: 'ALLOW' | 'HOLD' | 'BLOCK' | 'CAPTURED' | 'VERIFIED' | 'SIGNED' | 'APPROVED';
  summary?: string;
  details?: Array<[string, string]>;
  error?: string;
}

export const JUDGE_STEPS: Array<Pick<JudgeStep, 'key' | 'title' | 'expectation'>> = [
  { key: 'mandate', title: 'Sign a mandate', expectation: 'Your device key signs the limits; the gateway verifies the signature.' },
  { key: 'honest', title: 'Honest purchase', expectation: 'A $14.99 phone case passes every check and PayPal places a hold.' },
  { key: 'attack', title: 'Hijacked agent', expectation: 'A hidden line on a product page tells the agent to buy a gift card. Leash blocks it.' },
  { key: 'drift', title: 'Out-of-scope purchase', expectation: 'Coffee beans are outside the mandate, so the payment waits for you.' },
  { key: 'approve', title: 'Approve on your device', expectation: 'You re-sign the held amount; only then is PayPal asked to authorize.' },
  { key: 'capture', title: 'Merchant ships, money moves', expectation: 'A shipping notice arrives and Leash captures the phone-case hold.' },
  { key: 'verify', title: 'Check the ledger', expectation: 'Your browser recomputes every SHA-256 link in the chain.' },
];

const rand = (n = 8) => Math.random().toString(36).slice(2, 2 + n);

function paymentRequest(
  mandateId: string,
  store: string,
  evidenceSku: string,
  items: PaymentRequestInput['cart']['items'],
  rationale: string,
): PaymentRequestInput {
  const totalCents = items.reduce((s, i) => s + Math.round(Number(i.unitAmount) * 100) * i.qty, 0);
  return {
    mandateId,
    cart: {
      id: `cart_${rand()}`,
      merchantId: `mer_${store}`,
      items,
      shipping: '0.00',
      total: (totalCents / 100).toFixed(2),
      currency: 'USD',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    },
    rationale,
    evidence: [{ url: `https://${store}.demo.leash.dev/products/${evidenceSku}` }],
    idempotencyKey: `idem_${rand(12)}`,
  };
}

const LAYER_LABEL: Record<string, string> = {
  mandate: 'Mandate check',
  policy: 'Policy rules',
  provenance: 'Provenance scan',
  intent: 'Intent judge',
  risk: 'Risk score',
};

function reasonsToDetails(r: PaymentResult): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const reason of r.trace?.reasons ?? []) {
    rows.push([`${LAYER_LABEL[reason.layer] ?? reason.layer}: ${reason.verdict.toLowerCase()}`, reason.message]);
  }
  if (r.authorizationId) rows.push(['PayPal authorization', r.authorizationId]);
  if (r.trace?.decisionId) rows.push(['Decision id', r.trace.decisionId]);
  return rows;
}

function outcomeOf(r: PaymentResult): JudgeStep['outcome'] {
  return r.status === 'AUTHORIZED' ? 'ALLOW' : r.status === 'HELD' ? 'HOLD' : 'BLOCK';
}

export async function runJudgeWalkthrough(
  onStep: (key: string, patch: Partial<JudgeStep>) => void,
  opts: { pauseMs?: number } = {},
): Promise<{ ledger: LedgerEventRow[]; ok: boolean }> {
  const pause = (ms = opts.pauseMs ?? 500) => new Promise((r) => setTimeout(r, ms));
  let current = 'mandate';
  try {
    /* 1. Mandate */
    onStep('mandate', { state: 'running' });
    const mandateId = `mdt_judge_${rand()}`;
    const signedMandate = {
      id: mandateId,
      maxAmount: 150,
      intentText: 'Buy a USB-C phone case and a cable, under $150 in total, this week',
      categories: ['phone_accessories', 'cables', 'chargers'],
      validUntil: new Date(Date.now() + 7 * 86400_000).toISOString(),
    };
    const keyPair = await getOrCreateDeviceKey();
    const publicKey = await getDevicePublicKeyBase64(keyPair);
    const sigBuf = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      new TextEncoder().encode(canonicalJson(signedMandate)),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    const mandate = await gateway.createMandate({
      id: mandateId,
      maxAmount: signedMandate.maxAmount,
      intentText: signedMandate.intentText,
      playback: 'Phone accessories, cables or chargers; at most $150.00 in total; for 7 days',
      validUntil: signedMandate.validUntil,
      constraints: { maxTotal: '150.00', maxPerTxn: '150.00', currency: 'USD', categories: signedMandate.categories },
      signature,
      publicKey,
      signedMandate,
    });
    onStep('mandate', {
      state: 'done',
      outcome: 'SIGNED',
      summary: mandate.signatureVerified ? 'Signature verified by the gateway' : 'Registered without a signature',
      details: [
        ['Mandate', mandate.id],
        ['Budget', '$150.00'],
        ['Categories', signedMandate.categories.join(', ')],
      ],
    });
    await pause();

    /* 2. Honest purchase */
    current = 'honest';
    onStep('honest', { state: 'running' });
    const honest = await gateway.requestPayment(
      paymentRequest(
        mandateId,
        'gadgethub',
        'GH-USBC-CASE',
        [{ sku: 'GH-USBC-CASE', name: 'Slim Matte USB-C Phone Case', category: 'phone_accessories', qty: 1, unitAmount: '14.99' }],
        'The user asked for a USB-C phone case; this one is $14.99 at GadgetHub.',
      ),
    );
    onStep('honest', {
      state: 'done',
      outcome: outcomeOf(honest),
      summary: honest.status === 'AUTHORIZED' ? '$14.99 held on PayPal, not charged' : honest.holdReason,
      details: reasonsToDetails(honest),
    });
    await pause();

    /* 3. Hijacked agent */
    current = 'attack';
    onStep('attack', { state: 'running' });
    const attack = await gateway.requestPayment(
      paymentRequest(
        mandateId,
        'gadgethub',
        'GH-ATTACK-PRODUCT',
        [{ sku: 'GC-100', name: '$100 Digital Gift Card', category: 'gift_cards', qty: 1, unitAmount: '100.00' }],
        'The product page says the user now wants gift cards instead.',
      ),
    );
    onStep('attack', {
      state: 'done',
      outcome: outcomeOf(attack),
      summary: attack.status === 'BLOCKED' ? 'Blocked. Nothing reached PayPal.' : attack.holdReason,
      details: reasonsToDetails(attack),
    });
    await pause();

    /* 4. Scope drift */
    current = 'drift';
    onStep('drift', { state: 'running' });
    const drift = await gateway.requestPayment(
      paymentRequest(
        mandateId,
        'dailymart',
        'DM-COFFEE-BEANS',
        [{ sku: 'DM-COFFEE-BEANS', name: 'Artisan Espresso Whole Beans 12oz', category: 'grocery', qty: 1, unitAmount: '16.00' }],
        'The user mentioned they were out of coffee.',
      ),
    );
    onStep('drift', {
      state: 'done',
      outcome: outcomeOf(drift),
      summary: drift.status === 'HELD' ? 'Held for your decision' : drift.holdReason,
      details: reasonsToDetails(drift),
    });
    await pause();

    /* 5. Approve the held payment */
    current = 'approve';
    onStep('approve', { state: 'running' });
    const heldId = drift.trace?.decisionId;
    if (drift.status !== 'HELD' || !heldId) {
      onStep('approve', { state: 'done', summary: 'Nothing was held, so there is nothing to approve.' });
    } else {
      const tx = await gateway.transaction(heldId);
      const signed = await signApprovalPayload({
        transactionId: tx.id,
        mandateId: tx.mandateId,
        approvedAmount: Number(tx.amount).toFixed(2),
        currency: tx.currency,
      });
      const approved = await gateway.approve(heldId, signed, 'Approved in Judge mode with this browser’s device key');
      onStep('approve', {
        state: 'done',
        outcome: 'APPROVED',
        summary: `Signed and authorized: ${approved.status}`,
        details: [
          ['Transaction', approved.id],
          ['PayPal authorization', approved.paypalAuthId ?? 'none'],
        ],
      });
    }
    await pause();

    /* 6. Fulfilment and capture */
    current = 'capture';
    onStep('capture', { state: 'running' });
    if (!honest.authorizationId) {
      onStep('capture', { state: 'done', summary: 'The honest purchase was not authorized, so there is nothing to capture.' });
    } else {
      const cap = await gateway.fulfil({
        authorizationId: honest.authorizationId,
        merchantId: 'mer_gadgethub',
        fulfillmentNotice: {
          trackingNumber: `TRK-${rand(10).toUpperCase()}`,
          carrier: 'USPS_PRIORITY',
          shippedItems: [{ sku: 'GH-USBC-CASE', quantity: 1 }],
        },
      });
      onStep('capture', {
        state: 'done',
        outcome: 'CAPTURED',
        summary: `$${cap.amount} captured after shipping`,
        details: [
          ['Authorization', cap.authorizationId],
          ['Capture', cap.captureId],
        ],
      });
    }
    await pause();

    /* 7. Verify the chain locally */
    current = 'verify';
    onStep('verify', { state: 'running' });
    const ledger = await gateway.ledger();
    const local = await verifyLedgerChainBrowser(ledger);
    onStep('verify', {
      state: local.valid ? 'done' : 'failed',
      outcome: local.valid ? 'VERIFIED' : undefined,
      summary: local.valid
        ? `${local.verifiedCount} entries, every link intact`
        : `Chain broken at #${local.brokenSeq}: ${local.reason}`,
      details: ledger.length ? [['Latest hash', ledger[ledger.length - 1]!.hash]] : [],
    });
    return { ledger, ok: local.valid };
  } catch (err) {
    onStep(current, { state: 'failed', error: err instanceof Error ? err.message : String(err) });
    return { ledger: [], ok: false };
  }
}
