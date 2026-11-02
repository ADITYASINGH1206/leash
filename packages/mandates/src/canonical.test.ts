import { describe, it, expect } from "vitest";
import { canonicalizeJson, canonicalJson } from "./canonical.js";

describe("RFC 8785 JSON Canonicalization Scheme (JCS)", () => {
  it("deterministically sorts object keys regardless of insertion order", () => {
    const obj1 = { z: 26, a: 1, m: 13 };
    const obj2 = { a: 1, m: 13, z: 26 };
    const obj3 = { m: 13, z: 26, a: 1 };

    const expected = '{"a":1,"m":13,"z":26}';
    expect(canonicalizeJson(obj1)).toBe(expected);
    expect(canonicalizeJson(obj2)).toBe(expected);
    expect(canonicalizeJson(obj3)).toBe(expected);
  });

  it("handles deeply nested structures with deterministic sorting", () => {
    const nestedA = {
      user: { id: "usr_1", profile: { age: 30, city: "SF" } },
      items: [
        { sku: "B", qty: 2 },
        { sku: "A", qty: 1 },
      ],
    };
    const nestedB = {
      items: [
        { sku: "B", qty: 2 },
        { sku: "A", qty: 1 },
      ],
      user: { profile: { city: "SF", age: 30 }, id: "usr_1" },
    };

    expect(canonicalizeJson(nestedA)).toBe(canonicalizeJson(nestedB));
    expect(canonicalizeJson(nestedA)).toBe(
      '{"items":[{"qty":2,"sku":"B"},{"qty":1,"sku":"A"}],"user":{"id":"usr_1","profile":{"age":30,"city":"SF"}}}',
    );
  });

  it("omits properties with undefined, function, and symbol values in objects", () => {
    const objWithUndefined = {
      valid: "yes",
      ignoredFunc: () => {},
      ignoredUndef: undefined,
      ignoredSym: Symbol("test"),
      num: 42,
    };

    expect(canonicalizeJson(objWithUndefined)).toBe('{"num":42,"valid":"yes"}');
  });

  it("serializes undefined, function, and symbol values in arrays to null", () => {
    const arr = [1, undefined, "text", () => {}, null];
    expect(canonicalizeJson(arr)).toBe('[1,null,"text",null,null]');
  });

  it("serializes negative zero (-0) as 0 per RFC 8785", () => {
    expect(canonicalizeJson(-0)).toBe("0");
    expect(canonicalizeJson({ zero: -0 })).toBe('{"zero":0}');
  });

  it("throws TypeError on non-finite numbers (NaN, Infinity)", () => {
    expect(() => canonicalizeJson(NaN)).toThrow(TypeError);
    expect(() => canonicalizeJson(Infinity)).toThrow(TypeError);
    expect(() => canonicalizeJson({ bad: -Infinity })).toThrow(TypeError);
  });

  it("correctly handles primitive types and null", () => {
    expect(canonicalizeJson(null)).toBe("null");
    expect(canonicalizeJson(true)).toBe("true");
    expect(canonicalizeJson(false)).toBe("false");
    expect(canonicalizeJson("hello")).toBe('"hello"');
    expect(canonicalizeJson(123.45)).toBe("123.45");
  });

  it("alias canonicalJson matches canonicalizeJson", () => {
    const sample = { b: 2, a: 1 };
    expect(canonicalJson(sample)).toBe(canonicalizeJson(sample));
  });
});
