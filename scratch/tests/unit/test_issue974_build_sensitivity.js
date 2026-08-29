import assert from "node:assert/strict";
import {
  createEncounterFixture,
  deriveSharedCaseSeed,
  getBuildDefinitions,
  getEncounterDefinitions,
  runEncounterSample,
  runMeasurement
} from "../../measurements/issue973_build_sensitivity.js";
import { CORE_AFFIXES, SUPPORT_AFFIXES } from "../../../src/data/affixes.js";
import { ITEMS } from "../../../src/data/items.js";
import { SPELLS } from "../../../src/data/spells.js";

const coreIds = new Set(CORE_AFFIXES.map(affix => affix.id));
const supportIds = new Set(SUPPORT_AFFIXES.map(affix => affix.id));

const first = createEncounterFixture("magic-denial", 13);
const second = createEncounterFixture("magic-denial", 13);
assert.deepEqual(first, second, "production encounter fixtures must be deterministic");
assert.notDeepEqual(
  first.monsters.map(monster => monster.maxHp),
  createEncounterFixture("magic-denial", 18).monsters.map(monster => monster.maxHp),
  "depth scaling must remain visible in fixture stats"
);

const builds = getBuildDefinitions();
assert.equal(builds.length, 4, "the v0 measurement must expose four Mage archetypes");
builds.forEach(build => {
  assert.equal(build.className || "Mage", "Mage");
  build.spells.forEach(spellName => assert.ok(SPELLS[spellName], `unknown spell ${spellName}`));
  Object.entries(build.equipment).forEach(([slot, item]) => {
    assert.ok(ITEMS[item.baseId], `unknown item ${item.baseId}`);
    if (item.coreId) assert.ok(coreIds.has(item.coreId), `unknown core ${item.coreId}`);
    (item.supports || []).forEach(support => assert.ok(supportIds.has(support.id), `unknown support ${support.id}`));
    assert.ok(slot, "equipment slot must be named");
  });
});

const sharedSeed = deriveSharedCaseSeed("fixture-seed", 7, 13, "mp-pressure");
assert.equal(
  sharedSeed,
  deriveSharedCaseSeed("fixture-seed", 7, 13, "mp-pressure"),
  "the same case inputs must derive the same seed"
);
const sampleA = runEncounterSample({ buildId: "hybrid-fallback", encounterId: "mp-pressure", depth: 13, seed: sharedSeed });
const sampleB = runEncounterSample({ buildId: "hybrid-fallback", encounterId: "mp-pressure", depth: 13, seed: sharedSeed });
assert.deepEqual(sampleA, sampleB, "production combat sample must be deterministic");

const report = runMeasurement({ seed: "schema-seed", runs: 1 });
assert.equal(report.schemaVersion, 1);
assert.equal(report.measurement.configuration.runs, 1);
assert.deepEqual(report.measurement.configuration.depths, [8, 13, 18]);
assert.equal(report.builds.length, 4);
assert.equal(report.encounters.length, 6);
assert.equal(report.cases.length, 72);
assert.equal(report.pairwiseRanking.length, 18);
assert.ok(Array.isArray(report.rankReversals));
assert.equal(report.redFlags.flags.length, 6);
assert.ok(Object.hasOwn(report.cases[0], "failureAttribution"));
assert.ok(Object.hasOwn(report.cases[0], "resourceSignature"));
assert.ok(Object.hasOwn(report.cases[0].mechanisms, "totals"));
assert.ok(Object.hasOwn(report.cases[0].mechanisms, "averagePerRun"));

console.log("[PASS] Issue #974 build definitions, fixture determinism, shared seeds, production combat determinism, and output schema verified");
