import assert from "node:assert/strict";
import {
  boundedFiniteOrNull,
  DEFAULT_TELEMETRY_ENUM_ARRAY_CAP,
  finiteOrNull,
  MAX_TELEMETRY_RESOURCE_VALUE,
  normalizeBoundedEnumArray,
  normalizeOptionalStableValue,
  normalizeStableValue
} from "../../../src/telemetry_normalization.ts";

assert.equal(finiteOrNull(12.5), 12.5);
assert.equal(finiteOrNull("12.5"), 12.5);
assert.equal(finiteOrNull(null), 0);
assert.equal(finiteOrNull(""), 0);
assert.equal(finiteOrNull(true), 1);
assert.equal(finiteOrNull(false), 0);
assert.equal(finiteOrNull(Number.NaN), null);
assert.equal(finiteOrNull(Number.POSITIVE_INFINITY), null);
assert.equal(finiteOrNull({}), null);

assert.equal(MAX_TELEMETRY_RESOURCE_VALUE, 1_000_000);
assert.equal(boundedFiniteOrNull(-1), 0);
assert.equal(boundedFiniteOrNull(1_000_001), MAX_TELEMETRY_RESOURCE_VALUE);
assert.equal(boundedFiniteOrNull(1.25), 1.25);
assert.equal(boundedFiniteOrNull("invalid"), null);

const allowed = new Set(["safe", 7]);
assert.equal(normalizeStableValue("safe", allowed), "safe");
assert.equal(normalizeStableValue(7, allowed), 7);
assert.equal(normalizeStableValue(" safe ", allowed), "other");
assert.equal(normalizeStableValue("7", allowed), "other");
assert.equal(normalizeStableValue("unsafe", allowed), "other");

assert.equal(normalizeOptionalStableValue(null, allowed), null);
assert.equal(normalizeOptionalStableValue(undefined, allowed), null);
assert.equal(normalizeOptionalStableValue("", allowed), null);
assert.equal(normalizeOptionalStableValue(" ", allowed), "other");
assert.equal(normalizeOptionalStableValue(false, allowed), "other");
assert.equal(normalizeOptionalStableValue(0, allowed), "other");

assert.deepEqual(normalizeBoundedEnumArray("safe", allowed), []);
assert.deepEqual(
  normalizeBoundedEnumArray(["safe", "unsafe", 7, "safe"], allowed),
  ["safe", "other", 7, "safe"]
);
assert.deepEqual(
  normalizeBoundedEnumArray(["unsafe", "safe", "safe"], allowed, 2),
  ["other", "safe"]
);
const slicedBeforeMap = ["safe", "safe", "safe"];
Object.defineProperty(slicedBeforeMap, 2, { get() { throw new Error("read beyond cap"); } });
assert.deepEqual(normalizeBoundedEnumArray(slicedBeforeMap, allowed, 2), ["safe", "safe"]);
assert.equal(DEFAULT_TELEMETRY_ENUM_ARRAY_CAP, 24);
assert.equal(normalizeBoundedEnumArray(Array(25).fill("safe"), allowed).length, 24);

console.log("[PASS] TypeScript telemetry normalizers preserve legacy semantics");
