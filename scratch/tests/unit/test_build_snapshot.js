import assert from "node:assert/strict";
import { BUILD_FIXTURE_IDS, createBuildFixture } from "../../measurements/build_fixtures.js";
import {
  BUILD_SNAPSHOT_SCHEMA_VERSION,
  getBuildSnapshotIdentity,
  resolveBuildSnapshot
} from "../../../src/rules/build_snapshot.js";

const snapshots = Object.fromEntries(BUILD_FIXTURE_IDS.map(id => [
  id,
  resolveBuildSnapshot(createBuildFixture(id))
]));

assert.equal(snapshots["light-shield"].weaponProfile, "light");
assert.equal(snapshots["light-shield"].weaponHands, 1);
assert.equal(snapshots["light-shield"].guardProfileId, "light");
assert.equal(snapshots["heavy-two-hand"].weaponProfile, "heavy");
assert.equal(snapshots["heavy-two-hand"].weaponHands, 2);
assert.equal(snapshots["heavy-two-hand"].guardProfileId, "universal_brace");
assert.deepEqual(snapshots["medium-shallow-rune"].activeRuneSpellIds, ["HALITO"]);
assert.deepEqual(snapshots["medium-multi-rune"].activeRuneSpellIds, ["HALITO", "KATINO"]);
assert.equal(snapshots["medium-multi-rune"].runeSlotCapacity, 2);
assert.ok(snapshots["main-core-conversion"].mainCoreIds.includes("CORE_BLOOD_WAND"));
assert.equal(snapshots["exploration-support"].explorationSupportValues.trapBonus, 30);
assert.equal(snapshots["exploration-support"].explorationSupportValues.treasureSense, 15);

for (const snapshot of Object.values(snapshots)) {
  assert.equal(snapshot.schemaVersion, BUILD_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.identity, getBuildSnapshotIdentity(snapshot));
  assert.equal(Object.hasOwn(snapshot, "hp"), false);
  assert.equal(Object.hasOwn(snapshot, "mp"), false);
  assert.equal(Object.hasOwn(snapshot, "floor"), false);
}

const reordered = createBuildFixture("medium-shallow-rune");
reordered.equipment = {
  accessory2: reordered.equipment.accessory2,
  armor: reordered.equipment.armor,
  shield: reordered.equipment.shield,
  weapon: reordered.equipment.weapon,
  accessory: reordered.equipment.accessory
};
assert.equal(
  resolveBuildSnapshot(reordered).identity,
  snapshots["medium-shallow-rune"].identity
);

console.log("[PASS] Build Snapshot resolver schema, bounds, and deterministic identity");
