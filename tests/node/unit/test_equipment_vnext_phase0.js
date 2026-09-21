import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CANONICAL_BASE_IDS,
  ITEM_ID_TO_VNEXT_BASE,
  NAMED_RULE_IDS,
  VNEXT_CORE_IDS,
  VNEXT_SUPPORT_IDS,
  getCanonicalBaseId,
  getNamedRuleId
} from "../../../src/data/equipment_vnext.js";
import { ITEMS } from "../../../src/data/items.js";
import {
  DIAGNOSTIC_BUILD_IDENTITY_SCHEMA_VERSION,
  getDiagnosticBuildIdentity,
  resolveDiagnosticBuildIdentity
} from "../../../src/rules/diagnostic_build_identity.js";
import {
  COMBAT_TIER_MAX,
  getCombatTierForDefeatedMilestones,
  getCombatTierForStartFloor,
  resolveCombatTier
} from "../../../src/rules/combat_tier.js";
import { resolveBuildSnapshot } from "../../../src/rules/build_snapshot.js";
import { createBuildFixture } from "../../../scratch/measurements/build_fixtures.js";

assert.equal(CANONICAL_BASE_IDS.length, 14);
assert.equal(new Set(CANONICAL_BASE_IDS).size, CANONICAL_BASE_IDS.length);
const equipmentItemIds = Object.values(ITEMS)
  .filter(item => ["weapon", "armor", "shield", "accessory"].includes(item.type))
  .map(item => item.id);
assert.equal(Object.keys(ITEM_ID_TO_VNEXT_BASE).length, equipmentItemIds.length);
assert.ok(equipmentItemIds.every(id => Object.hasOwn(ITEM_ID_TO_VNEXT_BASE, id)));
assert.equal(getCanonicalBaseId("NINJA_DAGGER"), "dagger");
assert.equal(getCanonicalBaseId("KNIGHT_SHIELD"), "largeShield");
assert.equal(getCanonicalBaseId("AMULET_MP"), "amulet");
assert.equal(getCanonicalBaseId("UNKNOWN_ITEM"), null);

assert.deepEqual(NAMED_RULE_IDS, [
  "venom_fang", "moonshadow", "flame_blade", "holy_oath", "muramasa",
  "excalibur", "archmage_staff", "aegis", "dragon_scale"
]);
assert.equal(getNamedRuleId("SEALED_EXCALIBUR"), "excalibur");
assert.ok(VNEXT_SUPPORT_IDS.includes("guardRuneBoost"));
assert.ok(VNEXT_CORE_IDS.includes("thin_ice_pact"));

assert.equal(getCombatTierForStartFloor(1), 0);
assert.equal(getCombatTierForStartFloor(5), 1);
assert.equal(getCombatTierForStartFloor(25), COMBAT_TIER_MAX);
assert.equal(getCombatTierForDefeatedMilestones([5, 10]), 2);
assert.equal(resolveCombatTier({ startFloor: 1, defeatedMilestone: "B10F" }), 2);
assert.equal(resolveCombatTier({ startFloor: 20, milestoneBand: { floor: 5 } }), 4);
assert.equal(resolveCombatTier({ startFloor: 1, defeatedMilestones: [999, "unknown"] }), 0);

const character = createBuildFixture("medium-multi-rune");
character.equipment.weapon = {
  baseId: "VENOM_FANG",
  affixes: [
    { id: "poisonAtk", kind: "support", value: 8 },
    { id: "CORE_THIN_ICE_PACT", kind: "core", value: 1 }
  ]
};
character.equipment.armor = { baseId: "DRAGON_SCALE", affixes: [] };
const diagnostic = resolveDiagnosticBuildIdentity(character, { startFloor: 5, defeatedMilestones: [10] });
assert.equal(diagnostic.schemaVersion, DIAGNOSTIC_BUILD_IDENTITY_SCHEMA_VERSION);
assert.equal(diagnostic.weaponBase, "dagger");
assert.equal(diagnostic.armorBase, "heavyArmor");
assert.equal(diagnostic.hands, 1);
assert.equal(diagnostic.load, "heavy");
assert.equal(diagnostic.namedRuleId, "venom_fang");
assert.deepEqual(diagnostic.vNextSupportIds, ["poisonAtk"]);
assert.deepEqual(diagnostic.vNextCoreIds, ["thin_ice_pact"]);
assert.equal(diagnostic.combatTier, 2);
assert.equal(diagnostic.identity, getDiagnosticBuildIdentity(diagnostic));

// Existing production snapshot remains v1 and is not replaced by diagnostic v2.
assert.equal(resolveBuildSnapshot(createBuildFixture("medium-multi-rune")).schemaVersion, 1);

// vNext vocabulary has no production calculation dependency.
for (const file of ["src/systems/equipment_generation.js", "src/rules/affix_rules.js", "src/telemetry.js"]) {
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(source, /equipment_vnext|diagnostic_build_identity|combat_tier/);
}

console.log("[PASS] Equipment vNext Phase 0 vocabulary, diagnostic identity, and production boundary");
