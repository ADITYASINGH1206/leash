/**
 * Rule-based mandate compiler (runs in the browser, no model call).
 *
 * The build plan has an LLM compile mandates; until that is wired in, this
 * extracts budget, per-purchase cap, duration and categories with plain rules
 * and always plays the result back so the user can check it before signing.
 */

export interface CompiledMandate {
  maxAmount: number;
  maxPerTxn: number;
  categories: string[];
  itemTerms: string[];
  days: number;
  validUntil: string;
  playback: string;
  warnings: string[];
}

const CATEGORY_TERMS: Array<[string, string[]]> = [
  ['phone_accessories', ['phone case', 'case', 'screen protector', 'phone strap', 'car mount', 'phone']],
  ['cables', ['cable', 'cord', 'usb-c cable']],
  ['chargers', ['charger', 'charging pad', 'power adapter']],
  ['audio', ['earbuds', 'headphones', 'speaker']],
  ['apparel', ['t-shirt', 'tee', 'shirt', 'hoodie', 'chinos', 'clothes', 'clothing', 'sweater']],
  ['footwear', ['shoes', 'sneakers', 'trainers']],
  ['accessories', ['tote', 'bag', 'beanie', 'hat']],
  ['grocery', ['coffee', 'oat milk', 'groceries', 'food', 'tea']],
  ['pantry', ['olive oil', 'almond butter', 'pantry']],
  ['household', ['cleaning', 'household']],
  ['travel_accessories', ['travel adapter', 'travel']],
];

const NAMES: Record<string, string> = {
  phone_accessories: 'phone accessories',
  cables: 'cables',
  chargers: 'chargers',
  audio: 'audio',
  apparel: 'clothing',
  footwear: 'shoes',
  accessories: 'bags and hats',
  grocery: 'groceries',
  pantry: 'pantry items',
  household: 'household goods',
  travel_accessories: 'travel accessories',
};

const money = (s: string) => Number(s.replace(/,/g, ''));

export function compileMandate(text: string, now = new Date()): CompiledMandate {
  const t = text.toLowerCase();
  const warnings: string[] = [];

  const perTxn =
    t.match(/\$?\s?([\d,]+(?:\.\d{1,2})?)\s*(?:per|each|a)\s*(?:purchase|order|transaction|item)/) ??
    t.match(/(?:max(?:imum)?|at most)\s*\$?\s?([\d,]+(?:\.\d{1,2})?)\s*(?:per|each)/);
  const total =
    t.match(/(?:under|below|less than|up to|at most|max(?:imum)?|budget of|no more than)\s*\$\s?([\d,]+(?:\.\d{1,2})?)(?![\d.])(?!\s*(?:per|each))/) ??
    t.match(/\$\s?([\d,]+(?:\.\d{1,2})?)\s*(?:in total|total|budget)/) ??
    t.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);

  let maxAmount = total ? money(total[1]!) : 0;
  if (!maxAmount) {
    maxAmount = 50;
    warnings.push('No budget found, so $50.00 was assumed. Add one, for example “under $40”.');
  }
  const maxPerTxn = perTxn ? Math.min(money(perTxn[1]!), maxAmount) : maxAmount;

  let days = 7;
  const nDays = t.match(/(?:for|within|next)\s+(\d{1,3})\s+days?/);
  if (nDays) days = Number(nDays[1]);
  else if (/\btoday\b/.test(t)) days = 1;
  else if (/\bthis month\b|\b30 days\b/.test(t)) days = 30;
  else if (/\bthis week\b|\b7 days\b/.test(t)) days = 7;
  else warnings.push('No time limit found, so it expires in 7 days.');

  const categories: string[] = [];
  const itemTerms: string[] = [];
  for (const [cat, terms] of CATEGORY_TERMS) {
    const hit = terms.find((term) => t.includes(term));
    if (hit) {
      categories.push(cat);
      itemTerms.push(hit);
    }
  }
  if (!categories.length) warnings.push('No product type recognised, so any category is allowed. Name what to buy to narrow it.');

  const validUntil = new Date(now.getTime() + days * 86400_000);
  const what = categories.length ? categories.map((c) => NAMES[c] ?? c).join(', ') : 'anything';
  const playback =
    `${what[0]!.toUpperCase()}${what.slice(1)}; at most $${maxAmount.toFixed(2)} in total` +
    (maxPerTxn < maxAmount ? ` and $${maxPerTxn.toFixed(2)} per purchase` : '') +
    `; until ${validUntil.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`;

  return { maxAmount, maxPerTxn, categories, itemTerms, days, validUntil: validUntil.toISOString(), playback, warnings };
}

/**
 * Compiles a mandate via AI (Gemini 2.5 Flash on the gateway) with seamless rule fallback.
 */
export async function compileMandateAsync(
  text: string,
  now = new Date(),
): Promise<CompiledMandate> {
  const gatewayUrl =
    typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000"
      : "http://localhost:4000";

  try {
    const res = await fetch(`${gatewayUrl}/api/v1/mandates/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text }),
    });
    if (res.ok) {
      const compiled = (await res.json()) as any;
      return {
        maxAmount: Number(compiled.maxAmount) || 50,
        maxPerTxn: Number(compiled.maxPerTxn) || 25,
        categories: Array.isArray(compiled.categories) ? compiled.categories : [],
        itemTerms: Array.isArray(compiled.itemTerms) ? compiled.itemTerms : [],
        days: Number(compiled.days) || 7,
        validUntil:
          compiled.validUntil ||
          new Date(now.getTime() + 7 * 86400_000).toISOString(),
        playback: compiled.playback || "Compiled spending mandate",
        warnings: Array.isArray(compiled.warnings) ? compiled.warnings : [],
      };
    }
  } catch {
    // offline / fallback
  }

  return compileMandate(text, now);
}
