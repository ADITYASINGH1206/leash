import type { DecisionVerdict } from "@leash/shared";

export type HiddenTextType =
  | "css_display_none"
  | "css_visibility_hidden"
  | "css_font_size_zero"
  | "css_opacity_zero"
  | "css_color_contrast"
  | "html_comment"
  | "aria_hidden"
  | "alt_or_title_attr"
  | "zero_width_chars";

export interface HiddenTextExtraction {
  type: HiddenTextType;
  text: string;
  rawSnippet?: string;
  tag?: string;
  attribute?: string;
}

export type PromptInjectionCategory =
  | "system_override"
  | "purchase_redirection"
  | "budget_override"
  | "data_exfiltration"
  | "jailbreak";

export interface PromptInjectionFinding {
  isInjection: boolean;
  confidence: number;
  category: PromptInjectionCategory;
  matchedPattern: string;
  extractedPayload: string;
  targetPhrases: string[];
  sourceHiddenType?: HiddenTextType;
}

export interface ProvenanceScanOptions {
  /** Timeout in milliseconds per evidence fetch (default 1500ms, strictly <= 2000ms) */
  timeoutMs?: number;
  /** Injected custom fetch implementation for testing or specialized environments */
  fetchFn?: (
    url: string,
    init?: RequestInit,
  ) => Promise<{ status: number; text: () => Promise<string> } | Response>;
  /** Optional Python ML microservice URL (e.g. http://localhost:8000/injection/detect) */
  mlServiceUrl?: string;
  /** Whether to permit fetching from localhost or 127.0.0.1 (default true in test/dev, false in prod) */
  allowLocalhost?: boolean;
  /** Maximum bytes to read from response body (default 2MB) */
  maxBodyBytes?: number;
}

export interface ProvenanceScanResult {
  verdict: DecisionVerdict;
  code: string;
  message: string;
  evidenceUrls: string[];
  extractions: HiddenTextExtraction[];
  injections: PromptInjectionFinding[];
  matchedCartItems: string[];
}
