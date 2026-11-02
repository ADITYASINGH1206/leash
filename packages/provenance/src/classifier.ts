import type {
  PromptInjectionCategory,
  PromptInjectionFinding,
  HiddenTextExtraction,
} from "./types.js";
import type { CartMandate } from "@leash/mandates";

interface InjectionRule {
  pattern: RegExp;
  category: PromptInjectionCategory;
  confidence: number;
  extractTarget?: (match: RegExpExecArray) => string | undefined;
}

const INJECTION_RULES: InjectionRule[] = [
  // 1. System Overrides & Instruction Hijacking
  {
    pattern: /(?:important\s+)?(?:system|admin)\s+override/i,
    category: "system_override",
    confidence: 0.95,
  },
  {
    pattern:
      /ignore\s+(?:all\s+|any\s+|prior\s+|previous\s+)?(?:user\s+)?(?:instructions?|prompts?|rules?|commands?)/i,
    category: "system_override",
    confidence: 0.98,
  },
  {
    pattern:
      /disregard\s+(?:all\s+|any\s+|prior\s+|previous\s+)?(?:user\s+)?(?:instructions?|prompts?|rules?|commands?)/i,
    category: "system_override",
    confidence: 0.98,
  },
  {
    pattern: /critical\s+instructions?(?:\s+for\s+(?:buyer\s+)?agent|\s*:)/i,
    category: "system_override",
    confidence: 0.95,
  },
  {
    pattern:
      /you\s+must\s+(?:instead|now|immediately)\s+(?:buy|purchase|order|add|execute)/i,
    category: "system_override",
    confidence: 0.9,
  },
  {
    pattern:
      /(?:new\s+instructions?|system\s+prompt\s+injection|jailbreak|developer\s+mode)\b/i,
    category: "jailbreak",
    confidence: 0.9,
  },

  // 2. Budget Overrides
  {
    pattern: /(?:disregard|ignore|bypass|override)\s+budget(?:\s+limits?)?/i,
    category: "budget_override",
    confidence: 0.95,
  },
  {
    pattern: /(?:no\s+budget\s+limit|unlimited\s+spending\s+authority)/i,
    category: "budget_override",
    confidence: 0.9,
  },

  // 3. Purchase Redirection & Target Extraction
  {
    pattern:
      /(?:buy|purchase|order)\s+(?:five|ten|\d+\s+|a\s+|some\s+)?([^.,;!]+?)(?:\s+instead|\s+immediately|\s+now|\.|$)/i,
    category: "purchase_redirection",
    confidence: 0.92,
    extractTarget: (m) => m[1]?.trim(),
  },
  {
    pattern: /add\s+([^.,;!]+?)\s+to\s+cart/i,
    category: "purchase_redirection",
    confidence: 0.9,
    extractTarget: (m) => m[1]?.trim(),
  },
  {
    pattern:
      /(?:gift\s*cards?|visa\s*gift\s*card|amazon\s*gift\s*card|crypto(?:currency)?|bitcoin|ethereum)/i,
    category: "purchase_redirection",
    confidence: 0.85,
    extractTarget: (m) => m[0]?.trim(),
  },

  // 4. Data Exfiltration
  {
    pattern:
      /(?:send|exfiltrate|transmit|post)\b.*?\b(?:secrets?|keys?|tokens?|credentials?|passwords?)\b/i,
    category: "data_exfiltration",
    confidence: 0.98,
  },
  {
    pattern: /\b(?:curl|fetch|webhook)\b.*?https?:\/\//i,
    category: "data_exfiltration",
    confidence: 0.8,
  },
];

/**
 * Normalizes text for target matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classifies whether a text string contains prompt injection instructions
 */
export function classifyTextForInjection(
  text: string,
): PromptInjectionFinding | null {
  if (!text || text.trim().length === 0) return null;

  const matchedCategories = new Set<PromptInjectionCategory>();
  const targetPhrases: string[] = [];
  let highestConfidence = 0;
  let primaryCategory: PromptInjectionCategory = "system_override";
  let matchedPattern = "";

  for (const rule of INJECTION_RULES) {
    const match = rule.pattern.exec(text);
    if (match) {
      matchedCategories.add(rule.category);
      if (rule.confidence > highestConfidence) {
        highestConfidence = rule.confidence;
        primaryCategory = rule.category;
        matchedPattern = match[0];
      }

      if (rule.extractTarget) {
        const target = rule.extractTarget(match);
        if (target && target.length > 2) {
          targetPhrases.push(normalizeText(target));
        }
      }
    }
  }

  // Also extract common illicit target keywords mentioned anywhere in the injected text
  const targetKeywords = [
    "gift card",
    "gift cards",
    "crypto",
    "bitcoin",
    "luxury item",
    "luxury items",
  ];
  const lowerText = text.toLowerCase();
  for (const kw of targetKeywords) {
    if (lowerText.includes(kw) && !targetPhrases.includes(kw)) {
      targetPhrases.push(kw);
    }
  }

  if (highestConfidence > 0) {
    return {
      isInjection: true,
      confidence: highestConfidence,
      category: primaryCategory,
      matchedPattern,
      extractedPayload: text.trim().slice(0, 500),
      targetPhrases,
    };
  }

  return null;
}

/**
 * Scans a list of hidden text extractions for prompt injections
 */
export function classifyExtractions(
  extractions: HiddenTextExtraction[],
): PromptInjectionFinding[] {
  const findings: PromptInjectionFinding[] = [];

  for (const extraction of extractions) {
    const finding = classifyTextForInjection(extraction.text);
    if (finding) {
      finding.sourceHiddenType = extraction.type;
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Checks whether any prompt injection findings target or match items present in the cart.
 * If an injected prompt says "buy five $100 gift cards" and the cart contains "$100 Gift Card"
 * or category "gift_cards", this identifies a critical indirect prompt injection hijack.
 */
export function matchInjectionsAgainstCart(
  injections: PromptInjectionFinding[],
  cart: CartMandate,
): string[] {
  const matchedItems: string[] = [];
  if (injections.length === 0 || !cart.items || cart.items.length === 0) {
    return matchedItems;
  }

  for (const item of cart.items) {
    const itemNameNorm = normalizeText(item.name);
    const itemCatNorm = normalizeText(item.category || "");
    const itemSkuNorm = normalizeText(item.sku || "");

    for (const injection of injections) {
      const payloadNorm = normalizeText(injection.extractedPayload);

      // Check direct mention of item name or SKU in injection payload
      const nameInPayload =
        itemNameNorm.length >= 4 && payloadNorm.includes(itemNameNorm);
      const skuInPayload =
        itemSkuNorm.length >= 4 && payloadNorm.includes(itemSkuNorm);
      const categoryInPayload =
        itemCatNorm.length >= 4 &&
        payloadNorm.includes(itemCatNorm.replace(/_/g, " "));

      // Check target phrases against item name or category
      const targetMatches = injection.targetPhrases.some((target) => {
        const t = normalizeText(target);
        if (t.length < 3) return false;
        return (
          itemNameNorm.includes(t) ||
          t.includes(itemNameNorm) ||
          itemCatNorm.includes(t) ||
          t.includes(itemCatNorm.replace(/_/g, " "))
        );
      });

      if (nameInPayload || skuInPayload || categoryInPayload || targetMatches) {
        matchedItems.push(item.name);
        break;
      }
    }
  }

  return Array.from(new Set(matchedItems));
}

/**
 * Remote ML Service response structure
 */
interface MLInjectionResponse {
  is_injection?: boolean;
  confidence?: number;
  categories?: string[];
  matched_cart_items?: string[];
  verdict_suggestion?: "ALLOW" | "HOLD" | "BLOCK";
}

/**
 * Optional query to Python services/ml /injection/detect endpoint
 */
export async function queryMlClassifier(
  text: string,
  cartItemNames: string[],
  mlServiceUrl: string,
): Promise<PromptInjectionFinding | null> {
  try {
    const url = `${mlServiceUrl.replace(/\/$/, "")}/injection/detect`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        cart_items: cartItemNames,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as MLInjectionResponse;

    if (data.is_injection) {
      return {
        isInjection: true,
        confidence: data.confidence ?? 0.85,
        category:
          (data.categories?.[0] as PromptInjectionCategory) ||
          "system_override",
        matchedPattern: "ML_INJECTION_CLASSIFIER_TRIGGERED",
        extractedPayload: text.slice(0, 500),
        targetPhrases: data.matched_cart_items || [],
      };
    }
    return null;
  } catch {
    // Graceful fallback to local classifier if ML service is unreachable
    return null;
  }
}
