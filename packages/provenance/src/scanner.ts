import type { CartMandate, CartItem } from "@leash/mandates";
import type {
  HiddenTextExtraction,
  PromptInjectionFinding,
  ProvenanceScanOptions,
  ProvenanceScanResult,
} from "./types.js";
import { extractHiddenContent } from "./parser.js";
import {
  classifyExtractions,
  classifyTextForInjection,
  matchInjectionsAgainstCart,
  queryMlClassifier,
} from "./classifier.js";
import { fetchEvidenceUrl } from "./fetcher.js";

export class ProvenanceScanner {
  private defaultOptions: ProvenanceScanOptions;

  constructor(options: ProvenanceScanOptions = {}) {
    this.defaultOptions = options;
  }

  /**
   * Scans all evidence URLs cited in a payment request to independently verify
   * that product pages are free from adversarial indirect prompt injections.
   *
   * Enforces:
   * 1. Independent Crawl: Never trusts reported agent HTML; directly fetches cited URL.
   * 2. Hidden Text Detection: Uncovers display:none, font:0, opacity:0, background matching,
   *    HTML comments, aria-hidden, alt/title payloads, and zero-width characters.
   * 3. Fail-Closed Verdict:
   *    - Injected text matches cart items -> hard BLOCK
   *    - General injection detected -> HOLD
   *    - Fetch error or timeout (> 2s) -> HOLD
   *    - Verified clean -> ALLOW
   */
  async scanEvidence(
    evidence: Array<{ url: string; contentHash?: string }>,
    cart: CartMandate,
    overrideOptions: ProvenanceScanOptions = {},
  ): Promise<ProvenanceScanResult> {
    const opts = { ...this.defaultOptions, ...overrideOptions };
    const evidenceUrls = evidence.map((e) => e.url);

    // If no evidence was cited by the agent, fail-closed to HOLD
    if (evidence.length === 0) {
      return {
        verdict: "HOLD",
        code: "PROVENANCE_NO_EVIDENCE",
        message:
          "No evidence URLs provided by agent for provenance verification (Fail-Closed)",
        evidenceUrls: [],
        extractions: [],
        injections: [],
        matchedCartItems: [],
      };
    }

    const allExtractions: HiddenTextExtraction[] = [];
    const allInjections: PromptInjectionFinding[] = [];
    const cartItemNames = (cart.items || []).map((i: CartItem) => i.name);

    for (const item of evidence) {
      let html: string;

      try {
        const fetchResult = await fetchEvidenceUrl(item.url, opts);
        html = fetchResult.html;
      } catch (err) {
        // Fail-Closed: If any evidence page cannot be crawled or times out, transaction verdict is HOLD
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          verdict: "HOLD",
          code: "PROVENANCE_FETCH_FAILED",
          message: `Independent crawler failed for '${item.url}': ${errorMsg} (Fail-Closed)`,
          evidenceUrls,
          extractions: allExtractions,
          injections: allInjections,
          matchedCartItems: [],
        };
      }

      // 1. Extract hidden elements from DOM
      const pageExtractions = extractHiddenContent(html);
      allExtractions.push(...pageExtractions);

      // 2. Classify hidden extractions for prompt injections
      const hiddenInjections = classifyExtractions(pageExtractions);
      allInjections.push(...hiddenInjections);

      // 3. Check for visible page injection patterns as well
      const visibleInjection = classifyTextForInjection(html);
      if (visibleInjection) {
        // Only add if not duplicate payload
        if (
          !allInjections.some(
            (inj) => inj.matchedPattern === visibleInjection.matchedPattern,
          )
        ) {
          allInjections.push(visibleInjection);
        }
      }

      // 4. If ML microservice URL is configured, also query ML model
      if (opts.mlServiceUrl) {
        for (const ext of pageExtractions) {
          const mlFinding = await queryMlClassifier(
            ext.text,
            cartItemNames,
            opts.mlServiceUrl,
          );
          if (mlFinding) {
            allInjections.push(mlFinding);
          }
        }
      }
    }

    // 5. Evaluate Verdict Logic
    if (allInjections.length > 0) {
      // Check if injected instructions match an item in the shopping cart
      const matchedCartItems = matchInjectionsAgainstCart(allInjections, cart);

      if (matchedCartItems.length > 0) {
        // Hard BLOCK: Indirect prompt injection successfully hijacked purchase into cart
        return {
          verdict: "BLOCK",
          code: "INDIRECT_PROMPT_INJECTION_CART_MATCH",
          message: `Adversarial prompt injection detected on cited page matching cart item(s): ${matchedCartItems.join(", ")}`,
          evidenceUrls,
          extractions: allExtractions,
          injections: allInjections,
          matchedCartItems,
        };
      }

      // HOLD: General injection detected on cited page, but no direct cart match
      const primaryCategory = allInjections[0]?.category ?? "system_override";
      return {
        verdict: "HOLD",
        code: "INDIRECT_PROMPT_INJECTION_DETECTED",
        message: `Indirect prompt injection detected on cited page (${primaryCategory}). Held for human confirmation.`,
        evidenceUrls,
        extractions: allExtractions,
        injections: allInjections,
        matchedCartItems: [],
      };
    }

    // Verified Clean
    return {
      verdict: "ALLOW",
      code: "PROVENANCE_CLEAN",
      message: `All ${evidence.length} cited evidence page(s) independently verified clean of hidden prompt injections.`,
      evidenceUrls,
      extractions: allExtractions,
      injections: [],
      matchedCartItems: [],
    };
  }
}
