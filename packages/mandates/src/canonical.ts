/**
 * RFC 8785 (JSON Canonicalization Scheme - JCS) implementation
 * https://datatracker.ietf.org/doc/html/rfc8785
 *
 * Guarantees identical byte-for-byte serialization for cryptographic signing
 * and hash chaining regardless of JSON key insertion order.
 */

/**
 * Deterministically serializes any JavaScript value to an RFC 8785 canonical JSON string.
 */
export function canonicalizeJson(data: unknown): string {
  if (data === null) {
    return "null";
  }

  const type = typeof data;

  if (type === "boolean") {
    return data ? "true" : "false";
  }

  if (type === "number") {
    if (!Number.isFinite(data)) {
      throw new TypeError(
        `RFC 8785 error: Cannot serialize non-finite number: ${data}`,
      );
    }
    // Handle -0: in RFC 8785, -0 must serialize as 0
    if (Object.is(data, -0)) {
      return "0";
    }
    return JSON.stringify(data);
  }

  if (type === "string") {
    return JSON.stringify(data);
  }

  if (type === "bigint") {
    throw new TypeError("RFC 8785 error: BigInt is not supported in JSON");
  }

  if (type === "symbol" || type === "function" || type === "undefined") {
    return "null";
  }

  if (Array.isArray(data)) {
    const items = data.map((item) => {
      // In arrays, undefined/function/symbol becomes null
      if (
        item === undefined ||
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        return "null";
      }
      return canonicalizeJson(item);
    });
    return "[" + items.join(",") + "]";
  }

  if (type === "object") {
    const obj = data as Record<string, unknown>;
    // Sort keys lexicographically by UTF-16 code units
    const sortedKeys = Object.keys(obj).sort();
    const pairs: string[] = [];

    for (const key of sortedKeys) {
      const val = obj[key];
      // RFC 8785: properties with undefined, function, or symbol values MUST be omitted
      if (
        val === undefined ||
        typeof val === "function" ||
        typeof val === "symbol"
      ) {
        continue;
      }
      pairs.push(`${JSON.stringify(key)}:${canonicalizeJson(val)}`);
    }

    return "{" + pairs.join(",") + "}";
  }

  return JSON.stringify(data);
}

/**
 * Alias for canonicalizeJson for seamless interoperability
 */
export const canonicalJson = canonicalizeJson;
