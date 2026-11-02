import {
  type BuildJudgePromptParams,
  buildIntentJudgePrompt,
  sanitizeQuarantineText,
} from "./prompt.js";
import { type IntentJudgeVerdict, IntentJudgeVerdictSchema } from "./schema.js";

export interface IntentJudgeOptions {
  /**
   * Optional custom LLM execution function.
   * If not provided, the evaluator executes the deterministic baseline rules.
   */
  llmInvoker?: (systemPrompt: string, userPrompt: string) => Promise<string>;

  /**
   * Known merchant catalogue SKUs for checking hallucinations.
   */
  validStoreSkus?: string[];
}

/**
 * Creates an LLM invoker function targeting the Gemini API with structured JSON output.
 */
export function createGeminiLlmInvoker(
  apiKey?: string,
  model = "gemini-2.5-flash",
): (systemPrompt: string, userPrompt: string) => Promise<string> {
  const key =
    apiKey ||
    (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined);
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return async (systemPrompt: string, userPrompt: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini API returned empty response content");
    }
    return text;
  };
}

/**
 * Deterministic baseline intent alignment engine.
 * Evaluates intent consistency against budget, permitted categories,
 * semantic item terms, and known injection triggers.
 */
function evaluateDeterministicBaseline(
  params: BuildJudgePromptParams,
  validSkus?: string[],
): IntentJudgeVerdict {
  const violations: string[] = [];
  const reasons: string[] = [];

  const cartTotal = Number(params.cart.total);
  const maxTotal = Number(params.mandate.constraints.maxTotal);

  // 1. Budget ceiling check
  if (cartTotal > maxTotal) {
    violations.push("budget_exceeded");
    reasons.push(
      `Cart total ($${params.cart.total}) exceeds authorized mandate budget of $${params.mandate.constraints.maxTotal}.`,
    );
  }

  // 2. Category compliance check
  const allowedCategories = params.mandate.constraints.categories;
  for (const item of params.cart.items) {
    if (
      allowedCategories.length > 0 &&
      !allowedCategories.includes(item.category)
    ) {
      violations.push("category_mismatch");
      reasons.push(
        `Item "${item.name}" has category "${item.category}" not in permitted list: [${allowedCategories.join(", ")}].`,
      );
    }

    if (item.category === "gift_cards" || item.category === "crypto") {
      violations.push("prohibited_category");
      reasons.push(
        `Item "${item.name}" belongs to high-risk prohibited category "${item.category}".`,
      );
    }
  }

  // 3. Hallucinated / fake SKU check
  if (validSkus && validSkus.length > 0) {
    for (const item of params.cart.items) {
      if (!validSkus.includes(item.sku)) {
        violations.push("unverified_sku");
        reasons.push(
          `SKU "${item.sku}" does not exist in verified merchant catalog.`,
        );
      }
    }
  }

  // 4. Adversarial prompt injection signatures in untrusted rationale
  const sanitizedRationale = sanitizeQuarantineText(
    params.rawRationale ?? "",
  ).toLowerCase();
  const injectionTriggers = [
    "system override",
    "ignore prior",
    "gift card",
    "commanded me to",
    "disregard budget",
    "priority update",
  ];

  for (const trigger of injectionTriggers) {
    if (sanitizedRationale.includes(trigger)) {
      violations.push("prompt_injection");
      reasons.push(
        `Untrusted rationale contains adversarial injection signature: "${trigger}".`,
      );
      break;
    }
  }

  // 5. Semantic intent terms check
  const intentLower = params.mandate.intentText.toLowerCase();
  const itemTerms = params.mandate.constraints.itemTerms ?? [];
  const isBroadShopping =
    itemTerms.length === 0 &&
    (intentLower.includes("shopping") ||
      intentLower.includes("purchase") ||
      intentLower.includes("buy") ||
      intentLower.includes("store") ||
      intentLower.includes("item") ||
      intentLower.length <= 5);

  let matchingItemFound = isBroadShopping;

  if (!matchingItemFound) {
    for (const item of params.cart.items) {
      const itemNameLower = item.name.toLowerCase();
      const matchesIntent =
        itemTerms.some((term) => itemNameLower.includes(term.toLowerCase())) ||
        itemNameLower
          .split(/\s+/)
          .some((w) => w.length > 3 && intentLower.includes(w));
      if (matchesIntent) {
        matchingItemFound = true;
        break;
      }
    }
  }

  if (!matchingItemFound && violations.length === 0) {
    violations.push("scope_drift");
    reasons.push("Cart items do not semantically match user intent terms.");
  }

  // Determine score & verdict
  if (violations.includes("prompt_injection")) {
    return {
      verdict: "inconsistent",
      score: 1.0,
      violated: violations,
      reason: reasons.slice(0, 2).join(" "),
    };
  }

  if (violations.length > 0) {
    const isHardFailure =
      violations.includes("budget_exceeded") ||
      violations.includes("prohibited_category") ||
      violations.includes("unverified_sku");
    const score = isHardFailure ? 0.95 : 0.75;
    return {
      verdict: isHardFailure ? "inconsistent" : "unsure",
      score,
      violated: violations,
      reason: reasons.slice(0, 2).join(" "),
    };
  }

  return {
    verdict: "consistent",
    score: 0.05,
    violated: [],
    reason: `Cart items match authorized intent "${params.mandate.intentText}" within budget limits.`,
  };
}

/**
 * Evaluates alignment between human intent and the merchant cart.
 * If llmInvoker is provided, runs via isolated LLM and strictly validates JSON output;
 * otherwise executes deterministic baseline analysis.
 */
export async function evaluateIntentAlignment(
  params: BuildJudgePromptParams,
  options: IntentJudgeOptions = {},
): Promise<IntentJudgeVerdict> {
  const { llmInvoker, validStoreSkus } = options;

  if (!llmInvoker) {
    return evaluateDeterministicBaseline(params, validStoreSkus);
  }

  const { systemPrompt, userPrompt } = buildIntentJudgePrompt(params);

  try {
    const rawResponse = await llmInvoker(systemPrompt, userPrompt);
    // Parse JSON safely
    const cleanJson = rawResponse
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleanJson);
    return IntentJudgeVerdictSchema.parse(parsed);
  } catch (error) {
    // Fail-Closed Principle: If LLM fails or produces malformed JSON, return 'unsure' with high anomaly score
    return {
      verdict: "unsure",
      score: 0.85,
      violated: ["llm_evaluation_failed"],
      reason: `Fail-Closed: Intent Judge failed to produce valid verdict: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
