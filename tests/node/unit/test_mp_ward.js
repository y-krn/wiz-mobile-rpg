import assert from "node:assert/strict";
import { createStartingKitCharacter } from "../../../src/state/initial_state.js";
import { getCharDerivedStats } from "../../../src/rules/character_stats.js";

const arcana = createStartingKitCharacter("arcana");
const vanguard = createStartingKitCharacter("vanguard");
assert.equal(Object.hasOwn(arcana, "mpWard"), false);
assert.equal(Object.hasOwn(vanguard, "mpWard"), false);
assert.equal(getCharDerivedStats(arcana).magic, 10);
assert.equal(getCharDerivedStats(vanguard).magic, 0);
console.log("[PASS] legacy class MP ward is absent from the current-run model.");
