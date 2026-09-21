import assert from "node:assert/strict";

const { createDefaultCurrentRun } = await import("../../../src/state/initial_state.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { isNormalizedRunSeed, normalizeRunSeed } = await import("../../../src/state/run_seed.js");
const canonicalRunSeed = await import("../../../src/state/run_seed.ts");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");

assert.strictEqual(isNormalizedRunSeed, canonicalRunSeed.isNormalizedRunSeed,
  "JS facade delegates to the canonical TypeScript run-seed owner");
assert.strictEqual(normalizeRunSeed, canonicalRunSeed.normalizeRunSeed,
  "JS facade preserves TypeScript normalizer identity");

const validSeeds = ["RUN-SEED", "  RUN-SEED  ", "\t", "記号/大文字:prefix"];
for (const seed of validSeeds) {
  assert.equal(isNormalizedRunSeed(seed), true, `non-empty seed accepted: ${JSON.stringify(seed)}`);
  assert.equal(normalizeRunSeed(seed), seed, "valid seed is preserved exactly");
}

for (const value of [undefined, "", 0, 1, false, true, null, {}, [], ["seed"]]) {
  assert.equal(isNormalizedRunSeed(value), false, `malformed seed rejected: ${String(value)}`);
  assert.equal(normalizeRunSeed(value), undefined, "malformed seed becomes canonical absence");
}

const baseRun = createDefaultCurrentRun();
assert.equal(isNormalizedCurrentRun(normalizeSavePayload({ currentRun: baseRun }).currentRun), true,
  "missing runSeed is accepted");
assert.equal(isNormalizedCurrentRun(normalizeSavePayload({
  currentRun: { ...baseRun, runSeed: undefined }
}).currentRun), true, "explicit undefined runSeed is accepted");

const validRun = normalizeSavePayload({
  currentRun: { ...baseRun, runSeed: "  Exact Seed / 01  " }
}).currentRun;
assert.equal(validRun.runSeed, "  Exact Seed / 01  ", "valid seed survives normalization exactly");
assert.equal(isNormalizedCurrentRun(validRun), true, "valid seed satisfies currentRun guard");
assert.equal(validRun.runSeed, normalizeSavePayload(JSON.parse(JSON.stringify({
  currentRun: validRun
}))).currentRun.runSeed, "JSON roundtrip preserves valid seed");

for (const malformedSeed of ["", 123, false, {}, [], null]) {
  const normalized = normalizeSavePayload({
    gameState: "unknown",
    currentRun: { ...baseRun, runSeed: malformedSeed }
  });
  assert.equal(Object.hasOwn(normalized.currentRun, "runSeed"), false,
    `malformed seed removed: ${String(malformedSeed)}`);
  assert.equal(normalized.currentRun !== null, true, "malformed seed does not drop currentRun");
  assert.equal(normalized.gameState, "town", "malformed truthy seed is not an active run seed");
}

const activeSave = normalizeSavePayload({
  gameState: "unknown",
  currentRun: { ...baseRun, runSeed: "active-run-seed" }
});
assert.equal(activeSave.gameState, "explore", "valid seed remains a seed-backed active run");
assert.equal(activeSave.currentRun.runSeed, "active-run-seed");
assert.equal(normalizeSavePayload({
  gameState: "submenu",
  currentRun: { ...baseRun, runSeed: "returned-run-seed", returnReason: "retreat" }
}).gameState, "explore", "submenu preserves canonical seeded run with returnReason");
assert.deepEqual(
  normalizeSavePayload(JSON.parse(JSON.stringify(activeSave))),
  activeSave,
  "run-seed normalization is idempotent after JSON roundtrip"
);

const malformedGuardInput = normalizeSavePayload({ currentRun: { ...baseRun, runSeed: {} } }).currentRun;
assert.equal(isNormalizedCurrentRun(malformedGuardInput), true,
  "normalization delegates malformed runSeed to canonical absence");
assert.equal(isNormalizedCurrentRun({ ...baseRun, runSeed: {} }), false,
  "currentRun guard rejects defined malformed runSeed");

console.log("[PASS] canonical run-seed type, guard, normalization, active-run fallback, and roundtrip");
