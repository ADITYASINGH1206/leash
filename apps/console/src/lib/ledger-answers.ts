/**
 * "Ask the ledger": answers plain questions by querying the ledger entries
 * themselves. No language model is involved, so every sentence can be traced
 * to the entries listed under it.
 */
import type { DecisionView, LedgerEventRow } from './api';
import { verifyLedgerChainBrowser } from './crypto';

export interface Answer {
  text: string;
  cites: Array<{ label: string; ref: string }>;
}

const merchant = (id: string) => id.replace(/^mer_/, '').replace(/[-_]/g, ' ');
const usd = (n: number) => `$${n.toFixed(2)}`;
const LAYER: Record<string, string> = {
  mandate: 'mandate check',
  policy: 'policy rules',
  provenance: 'provenance scan',
  intent: 'intent judge',
  risk: 'risk score',
};

function explain(d: DecisionView): string {
  const failing = Object.entries(d.layers).filter(([, r]) => r && r.verdict !== 'ALLOW');
  const base = `${usd(Number(d.amount))} at ${merchant(d.merchantId)} is ${d.status.toLowerCase()}.`;
  if (!failing.length) return `${base} Every check passed.`;
  return `${base} ${failing
    .map(([l, r]) => `The ${LAYER[l] ?? l} said ${r!.verdict.toLowerCase()}${r!.message ? `: ${r!.message}` : ''}`)
    .join(' ')}`;
}

export async function answerQuestion(q: string, rows: LedgerEventRow[], decisions: DecisionView[]): Promise<Answer> {
  const t = q.toLowerCase();
  const cite = (d: DecisionView) => ({ label: `${usd(Number(d.amount))} at ${merchant(d.merchantId)}`, ref: d.id });

  // A specific amount or merchant: explain that decision
  const amount = t.match(/\$?\s?(\d+(?:\.\d{1,2})?)/)?.[1];
  const byAmount = amount ? decisions.filter((d) => Number(d.amount) === Number(amount)) : [];
  const byMerchant = decisions.filter((d) => t.includes(merchant(d.merchantId).toLowerCase()));
  const specific = byAmount.length ? byAmount : /why|what happened|explain/.test(t) ? byMerchant : [];
  if (specific.length) {
    return { text: specific.slice(0, 3).map(explain).join('\n\n'), cites: specific.slice(0, 3).map(cite) };
  }

  if (/block|attack|inject|stop|fraud|gift/.test(t)) {
    const blocked = decisions.filter((d) => d.status === 'BLOCKED');
    if (!blocked.length) return { text: 'Nothing has been blocked.', cites: [] };
    return {
      text: `${blocked.length} payment${blocked.length > 1 ? 's were' : ' was'} blocked before reaching PayPal.\n\n${blocked
        .slice(0, 4)
        .map(explain)
        .join('\n\n')}`,
      cites: blocked.slice(0, 4).map(cite),
    };
  }

  if (/held|hold|wait|approv|pending|review/.test(t)) {
    const held = decisions.filter((d) => d.status === 'HELD');
    if (!held.length) return { text: 'Nothing is waiting for you right now.', cites: [] };
    return { text: held.map(explain).join('\n\n'), cites: held.map(cite) };
  }

  if (/spen|budget|how much|total|money|left|remaining/.test(t)) {
    const mandates = rows.filter((r) => r.kind === 'MANDATE_SIGNED');
    const lines = mandates.slice(-4).map((m) => {
      const mine = decisions.filter((d) => d.mandateId === m.refId);
      const captured = mine.filter((d) => d.status === 'CAPTURED').reduce((s, d) => s + Number(d.amount), 0);
      const reserved = mine.filter((d) => d.status === 'AUTHORIZED').reduce((s, d) => s + Number(d.amount), 0);
      const max = Number(m.payload.maxAmount ?? 0);
      return `Mandate ${m.refId}: ${usd(captured)} captured and ${usd(reserved)} on hold at PayPal, out of a ${usd(max)} budget, so ${usd(
        Math.max(0, max - captured - reserved),
      )} is left.`;
    });
    return {
      text: lines.length ? lines.join('\n') : 'No mandates have been signed yet.',
      cites: mandates.slice(-4).map((m) => ({ label: 'Mandate', ref: m.refId })),
    };
  }

  if (/merchant|store|where|shop/.test(t)) {
    const by = new Map<string, number>();
    decisions
      .filter((d) => d.status === 'CAPTURED' || d.status === 'AUTHORIZED')
      .forEach((d) => by.set(d.merchantId, (by.get(d.merchantId) ?? 0) + Number(d.amount)));
    if (!by.size) return { text: 'No money has been authorized at any merchant yet.', cites: [] };
    return {
      text: [...by.entries()].map(([m, v]) => `${merchant(m)}: ${usd(v)} authorized or captured.`).join('\n'),
      cites: [],
    };
  }

  if (/tamper|verify|chain|hash|integrit|trust/.test(t)) {
    const r = await verifyLedgerChainBrowser(rows);
    return {
      text: r.valid
        ? `Your browser just recomputed all ${r.verifiedCount} hashes. Every entry matches and every link points to the one before it.`
        : `The chain breaks at entry #${r.brokenSeq}: ${r.reason}`,
      cites: [],
    };
  }

  const counts = (s: string) => decisions.filter((d) => d.status === s).length;
  return {
    text: `The ledger has ${rows.length} entries covering ${decisions.length} payment decisions: ${counts('CAPTURED')} captured, ${counts(
      'AUTHORIZED',
    )} on hold at PayPal, ${counts('HELD')} waiting for you and ${counts('BLOCKED')} blocked. Try asking what was blocked, what is waiting, how much is left, or why a specific amount was decided the way it was.`,
    cites: [],
  };
}
