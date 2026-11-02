import type { HiddenTextExtraction, HiddenTextType } from "./types.js";

// Unicode zero-width characters commonly used in steganography and prompt injection
export const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF\u2060\u200E\u200F]/;
export const ZERO_WIDTH_GLOBAL_REGEX =
  /[\u200B\u200C\u200D\uFEFF\u2060\u200E\u200F]/g;

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Basic HTML entity decoder
 */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return Number.isFinite(num) ? String.fromCharCode(num) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const num = parseInt(code, 16);
      return Number.isFinite(num) ? String.fromCharCode(num) : "";
    });
}

/**
 * Strips HTML tags and decodes entities to get plain text
 */
export function stripHtmlTags(html: string): string {
  const withoutTags = html.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/**
 * Normalizes CSS color values (hex, named, rgb) to compare foreground vs background
 */
export function normalizeCssColor(rawColor: string): string {
  const c = rawColor.trim().toLowerCase();
  if (
    c === "transparent" ||
    c === "rgba(0,0,0,0)" ||
    c === "rgba(255,255,255,0)"
  ) {
    return "transparent";
  }
  if (
    c === "#fff" ||
    c === "#ffffff" ||
    c === "white" ||
    c === "rgb(255,255,255)" ||
    c === "rgb(255, 255, 255)"
  ) {
    return "white";
  }
  if (
    c === "#000" ||
    c === "#000000" ||
    c === "black" ||
    c === "rgb(0,0,0)" ||
    c === "rgb(0, 0, 0)"
  ) {
    return "black";
  }
  // Standardize 3-digit hex to 6-digit hex
  const hexMatch = c.match(/^#([0-9a-f]{3})$/);
  if (hexMatch && hexMatch[1]) {
    const [r, g, b] = hexMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return c;
}

/**
 * Checks if inline CSS has matching text and background color (invisible text)
 */
export function hasInvisibleColorContrast(styleStr: string): boolean {
  const clean = styleStr.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();

  // Explicit transparent or zero-alpha text color
  if (/color\s*:\s*transparent\b/.test(clean)) return true;
  if (/color\s*:\s*rgba\([^)]*,\s*0(?:\.0+)?\)/.test(clean)) return true;

  // Extract color and background-color / background
  const colorMatch = clean.match(/\bcolor\s*:\s*([^;"]+)/);
  const bgMatch = clean.match(/\bbackground(?:-color)?\s*:\s*([^;"]+)/);

  if (colorMatch && bgMatch && colorMatch[1] && bgMatch[1]) {
    const textColor = normalizeCssColor(colorMatch[1]);
    const bgColor = normalizeCssColor(bgMatch[1]);
    if (textColor && bgColor && textColor === bgColor) {
      return true;
    }
  }

  return false;
}

/**
 * Decodes steganographic binary encoded using zero-width characters:
 * \u200B = 0, \u200C = 1 (8 bits per ASCII character)
 */
export function decodeZeroWidthBinary(rawText: string): string | null {
  const zwChars = rawText.match(/[\u200B\u200C]/g);
  if (!zwChars || zwChars.length < 8) return null;

  const bits = zwChars.map((ch) => (ch === "\u200B" ? "0" : "1")).join("");
  let decoded = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const byteStr = bits.slice(i, i + 8);
    const code = parseInt(byteStr, 2);
    // printable ASCII range
    if (code >= 32 && code <= 126) {
      decoded += String.fromCharCode(code);
    }
  }
  return decoded.length >= 3 ? decoded : null;
}

/**
 * Parses raw HTML attribute string into key-value pairs
 */
function parseAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z0-9-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(rawAttrs)) !== null) {
    const key = m[1]?.toLowerCase();
    if (key) {
      const val = m[2] ?? m[3] ?? m[4] ?? "";
      attrs[key] = val;
    }
  }
  return attrs;
}

/**
 * Checks if a DOM element is hidden via inline CSS or HTML attributes
 */
function checkElementHiddenType(
  attrs: Record<string, string>,
  tag: string,
): HiddenTextType | undefined {
  if (attrs["aria-hidden"] === "true") {
    return "aria_hidden";
  }

  if ("hidden" in attrs || tag === "template") {
    return "css_display_none";
  }

  const rawStyle = attrs["style"];
  if (rawStyle) {
    const cleanStyle = rawStyle.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();

    if (/\bdisplay\s*:\s*none\b/.test(cleanStyle)) {
      return "css_display_none";
    }
    if (/\bvisibility\s*:\s*hidden\b/.test(cleanStyle)) {
      return "css_visibility_hidden";
    }
    if (/\bfont-size\s*:\s*0(?:px|pt|em|rem|%|vw|vh)?\b/.test(cleanStyle)) {
      return "css_font_size_zero";
    }
    if (/\bopacity\s*:\s*0(?:\.0+)?\b/.test(cleanStyle)) {
      return "css_opacity_zero";
    }
    if (hasInvisibleColorContrast(rawStyle)) {
      return "css_color_contrast";
    }
  }

  return undefined;
}

interface StackElement {
  tag: string;
  hiddenType?: HiddenTextType;
  textChunks: string[];
}

/**
 * Extracts hidden elements from raw HTML using DOM provenance rules
 */
export function extractHiddenContent(html: string): HiddenTextExtraction[] {
  const extractions: HiddenTextExtraction[] = [];
  const seenTexts = new Set<string>();

  const addExtraction = (
    type: HiddenTextType,
    rawText: string,
    rawSnippet?: string,
    tag?: string,
    attribute?: string,
  ) => {
    const cleanText = stripHtmlTags(rawText);
    if (!cleanText || cleanText.length < 2) return;
    const key = `${type}:${cleanText}`;
    if (!seenTexts.has(key)) {
      seenTexts.add(key);
      extractions.push({
        type,
        text: cleanText,
        rawSnippet: rawSnippet ? rawSnippet.slice(0, 300) : undefined,
        tag,
        attribute,
      });
    }
  };

  // 1. HTML Comments: <!-- ... -->
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(html)) !== null) {
    const commentBody = match[1];
    if (commentBody) {
      addExtraction("html_comment", commentBody, match[0]);
    }
  }

  // 2. Zero-Width Unicode Characters
  if (ZERO_WIDTH_REGEX.test(html)) {
    // A) Try decoding binary steganography
    const binaryDecoded = decodeZeroWidthBinary(html);
    if (binaryDecoded) {
      addExtraction(
        "zero_width_chars",
        binaryDecoded,
        "Binary steganography decoded via \\u200B/\\u200C",
      );
    }

    // B) Find text nodes with embedded zero-width characters (e.g. "g\u200Bi\u200Bf\u200Bt")
    const zwTextRegex =
      /(?:[^\s<>]|\u200B|\u200C|\u200D|\uFEFF|\u2060|\u200E|\u200F){4,}/g;
    let zwMatch: RegExpExecArray | null;
    while ((zwMatch = zwTextRegex.exec(html)) !== null) {
      const rawRun = zwMatch[0];
      if (rawRun && ZERO_WIDTH_REGEX.test(rawRun)) {
        const stripped = rawRun.replace(ZERO_WIDTH_GLOBAL_REGEX, "").trim();
        if (stripped.length >= 3) {
          addExtraction("zero_width_chars", stripped, rawRun);
        }
      }
    }
  }

  // 3. DOM Tokenizer Stack: Tokenize HTML tags and text nodes
  const tokenRegex = /(<(\/)?([a-zA-Z0-9-]+)([^>]*)>)|([^<]+)/g;
  const stack: StackElement[] = [];

  while ((match = tokenRegex.exec(html)) !== null) {
    const [, fullTag, isClosing, rawTagName, rawAttrs, rawText] = match;

    if (rawText) {
      // Text node
      const cleanChunk = rawText.trim();
      if (cleanChunk) {
        // Feed text chunk to any ancestor in the stack that has a hiddenType
        for (const el of stack) {
          if (el.hiddenType) {
            el.textChunks.push(cleanChunk);
          }
        }
      }
    } else if (fullTag && rawTagName) {
      const tagName = rawTagName.toLowerCase();

      if (isClosing) {
        // Closing tag </tag>
        // Find matching tag from top of stack
        for (let i = stack.length - 1; i >= 0; i--) {
          const el = stack[i];
          if (el && el.tag === tagName) {
            // Found matching open tag
            if (el.hiddenType && el.textChunks.length > 0) {
              addExtraction(
                el.hiddenType,
                el.textChunks.join(" "),
                fullTag,
                el.tag,
              );
            }
            stack.splice(i);
            break;
          }
        }
      } else {
        // Opening tag <tag attrs>
        const attrs = parseAttributes(rawAttrs || "");

        // Check attributes for alt, title, and aria-label
        const altText = attrs["alt"];
        if (
          altText &&
          altText.length >= 15 &&
          /\b(ignore|system|instruction|instead|buy|override)\b/i.test(altText)
        ) {
          addExtraction("alt_or_title_attr", altText, fullTag, tagName, "alt");
        }

        const titleText = attrs["title"];
        if (
          titleText &&
          titleText.length >= 15 &&
          /\b(ignore|system|instruction|instead|buy|override)\b/i.test(
            titleText,
          )
        ) {
          addExtraction(
            "alt_or_title_attr",
            titleText,
            fullTag,
            tagName,
            "title",
          );
        }

        const ariaLabel = attrs["aria-label"];
        if (
          ariaLabel &&
          ariaLabel.length >= 15 &&
          /\b(ignore|system|instruction|instead|buy|override)\b/i.test(
            ariaLabel,
          )
        ) {
          addExtraction(
            "alt_or_title_attr",
            ariaLabel,
            fullTag,
            tagName,
            "aria-label",
          );
        }

        // Determine if this element is hidden
        const hiddenType = checkElementHiddenType(attrs, tagName);

        // Void tags don't get pushed to the stack
        if (!VOID_TAGS.has(tagName)) {
          stack.push({
            tag: tagName,
            hiddenType,
            textChunks: [],
          });
        }
      }
    }
  }

  // Any remaining unclosed elements in stack
  for (const el of stack) {
    if (el.hiddenType && el.textChunks.length > 0) {
      addExtraction(el.hiddenType, el.textChunks.join(" "), undefined, el.tag);
    }
  }

  return extractions;
}
