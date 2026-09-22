import assert from "node:assert/strict";

const saveValues = new Map();
globalThis.localStorage = {
  getItem: key => saveValues.get(key) ?? null,
  setItem: (key, value) => saveValues.set(key, String(value)),
  removeItem: key => saveValues.delete(key)
};

const { state } = await import("../../../src/state/state_core.js");
const { createDefaultCurrentRun, createStartingKitCharacter } = await import("../../../src/state/initial_state.js");
const { applySavePayload, createSavePayload } = await import("../../../src/state/save_payload.js");
const {
  SAVE_PAYLOAD_FIELDS,
  TRANSIENT_STATE_FIELDS,
  normalizeSavePayload
} = await import("../../../src/state/save_migrations.js");
const {
  isNormalizedSavePayload
} = await import("../../../src/state/save_contract.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { MATERIAL_TYPES } = await import("../../../src/data/materials.js");

state.party = [createStartingKitCharacter("vanguard")];
state.gameState = "town";
const valid = normalizeSavePayload(createSavePayload());

assert.equal(isNormalizedSavePayload(valid), true, "normalized payload satisfies the canonical contract");
assert.deepEqual(Object.keys(valid.metaMaterials), MATERIAL_TYPES,
  "normalized save payload persists the exact MATERIAL_TYPES key set");
assert.equal(isNormalizedSavePayload({ ...valid, metaMaterials: {} }), false,
  "save contract rejects missing meta material keys");
assert.equal(isNormalizedSavePayload({
  ...valid,
  metaMaterials: { ...valid.metaMaterials, unexpected: 1 }
}), false, "save contract rejects unknown meta material keys");

const normalizedRunPayload = normalizeSavePayload({
  ...valid,
  currentRun: createDefaultCurrentRun()
});
const normalizedRun = normalizedRunPayload.currentRun;
assert.equal(isNormalizedCurrentRun(normalizedRun), true, "normalized currentRun satisfies the canonical contract");
assert.equal(isNormalizedCurrentRun(null), false, "null is outside the currentRun contract");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, townInventory: new Array(1) }), false,
  "sparse currentRun item collection is rejected");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, unbankedObjectLoot: [{ id: "bad", item: {} }] }), false,
  "malformed unbanked object loot is rejected");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, startedAt: "invalid" }), false,
  "malformed numeric core field is rejected");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, floorSteps: [] }), false,
  "malformed container core field is rejected");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, outcome: "invalid" }), false,
  "invalid outcome is rejected");
assert.equal(isNormalizedSavePayload({ ...valid, deathLogs: [{ id: "raw" }] }), false,
  "unnormalized global death history is rejected");
assert.equal(isNormalizedCurrentRun({ ...normalizedRun, runSeed: undefined }), true,
  "runSeed is not required");

const legacyRunItem = { baseId: "WAND", instanceId: "legacy-run-item", affixes: [] };
const legacyRun = normalizeSavePayload({
  ...valid,
  party: [{
    ...valid.party[0],
    equipment: {
      ...valid.party[0].equipment,
      weapon: { baseId: "DAGGER", affixes: [] }
    }
  }],
  currentRun: {
    ...createDefaultCurrentRun(),
    townInventory: ["TOWN_SENTINEL"],
    bankedObjectLoot: [legacyRunItem],
    lostObjectLoot: [legacyRunItem],
    returnedTownItems: [legacyRunItem],
    itemsFound: [legacyRunItem],
    equipmentFound: [legacyRunItem],
    departureItems: [legacyRunItem],
    firstKillsBefore: ["legacy-kill"],
    keyItemsBefore: ["legacy-key"],
    departureEquipment: {
      weapon: {
        baseId: "SHORT_SWORD",
        statsBonus: { atk: 999 },
        affixes: [{ type: "str", value: 999 }]
      }
    },
    unbankedObjectLoot: [{ id: "legacy-run-loot", item: legacyRunItem }]
  }
});
assert.equal(isNormalizedCurrentRun(legacyRun.currentRun), true,
  "supported legacy equipment remains accepted in currentRun collections");
assert.equal(Object.hasOwn(createDefaultCurrentRun(), "departureEquipment"), false,
  "fresh currentRun does not create the retired field");
assert.equal(Object.hasOwn(legacyRun.currentRun, "departureEquipment"), false,
  "legacy departureEquipment is removed from normalized currentRun");
assert.deepEqual(legacyRun.currentRun.townInventory, ["TOWN_SENTINEL"],
  "legacy departureEquipment does not repair townInventory");
assert.deepEqual(legacyRun.currentRun.departureItems.map(item => item.baseId), ["WAND"],
  "legacy departureEquipment does not replace departureItems");
assert.equal(legacyRun.party[0].equipment.weapon.baseId, "DAGGER",
  "legacy departureEquipment does not repair party equipment");
assert.deepEqual(legacyRun.currentRun.firstKillsBefore, ["legacy-kill"],
  "legacy departureEquipment does not replace discovery snapshots");
assert.deepEqual(legacyRun.currentRun.keyItemsBefore, ["legacy-key"],
  "legacy departureEquipment does not replace key-item snapshots");
assert.equal(legacyRun.currentRun.runSeed, undefined, "normalization does not invent runSeed");

const legacyRoundTrip = normalizeSavePayload(JSON.parse(JSON.stringify(legacyRun)));
assert.deepEqual(legacyRoundTrip, legacyRun, "legacy retirement normalization is idempotent after JSON roundtrip");

const activeRun = normalizeSavePayload({
  ...valid,
  currentRun: { ...createDefaultCurrentRun(), runSeed: "active-run-seed" }
});
assert.equal(activeRun.currentRun.runSeed, "active-run-seed", "active-run runSeed is preserved");
assert.equal(isNormalizedCurrentRun(JSON.parse(JSON.stringify(activeRun.currentRun))), true,
  "normalized currentRun survives JSON roundtrip");

const supportedLegacyEquipment = structuredClone(valid);
const legacyEquipment = {
  baseId: "WAND",
  instanceId: "legacy-contract-equipment",
  affixes: []
};
supportedLegacyEquipment.party[0].equipment.weapon = legacyEquipment;
supportedLegacyEquipment.inventory.push(legacyEquipment);
const normalizedLegacy = normalizeSavePayload(supportedLegacyEquipment);
assert.equal(isNormalizedSavePayload(normalizedLegacy), true, "supported legacy equipment remains accepted after normalization");

assert.equal(
  isNormalizedSavePayload({ ...valid, x: "not-an-integer" }),
  false,
  "malformed required coordinate is rejected by the executable guard"
);
assert.equal(
  isNormalizedSavePayload({ ...valid, inventory: new Array(1) }),
  false,
  "sparse inventory is rejected by the collection guard"
);
assert.equal(
  isNormalizedSavePayload({ ...valid, storage: [undefined] }),
  false,
  "invalid storage item is rejected by the collection guard"
);
assert.equal(
  isNormalizedSavePayload({
    ...valid,
    party: [{ ...valid.party[0], equipment: { ...valid.party[0].equipment, accessory2: undefined } }]
  }),
  false,
  "invalid CharacterEquipment is rejected by the canonical equipment guard"
);
assert.equal(
  isNormalizedSavePayload({ ...valid, gameState: "submenu" }),
  false,
  "transient game state is outside the persisted contract"
);
assert.equal(
  isNormalizedSavePayload(JSON.parse(JSON.stringify(valid))),
  true,
  "normalized save survives JSON roundtrip"
);

assert.deepEqual(
  [...Object.keys(createSavePayload())].sort(),
  [...SAVE_PAYLOAD_FIELDS].sort(),
  "create payload fields match the canonical allowlist"
);
for (const transientField of TRANSIENT_STATE_FIELDS) {
  assert.equal(Object.hasOwn(createSavePayload(), transientField), false, `${transientField} is not persisted`);
}

const before = {
  x: state.x,
  y: state.y,
  gameState: state.gameState,
  party: state.party
};
assert.throws(
  () => applySavePayload({ ...valid, logs: [Symbol("unsupported-save-value")] }),
  error => error?.name === "MalformedSavePayloadError",
  "validation failure rejects before live mutation"
);
assert.equal(state.x, before.x);
assert.equal(state.y, before.y);
assert.equal(state.gameState, before.gameState);
assert.strictEqual(state.party, before.party);

assert.throws(
  () => applySavePayload({ ...valid, currentRun: { ...createDefaultCurrentRun(), startedAt: Symbol("invalid-run") } }),
  error => error?.name === "MalformedSavePayloadError",
  "malformed currentRun is rejected before live mutation"
);
assert.equal(state.x, before.x);
assert.equal(state.y, before.y);
assert.equal(state.gameState, before.gameState);
assert.strictEqual(state.party, before.party);

console.log("[PASS] canonical normalized save contract, guards, allowlist, roundtrip, and apply atomicity");
