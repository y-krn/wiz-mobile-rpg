import assert from "node:assert/strict";

const saveValues = new Map();
globalThis.localStorage = {
  getItem: key => saveValues.get(key) ?? null,
  setItem: (key, value) => saveValues.set(key, String(value)),
  removeItem: key => saveValues.delete(key)
};

const { state } = await import("../../../src/state/state_core.js");
const { createStartingKitCharacter } = await import("../../../src/state/initial_state.js");
const { applySavePayload, createSavePayload } = await import("../../../src/state/save_payload.js");
const {
  SAVE_PAYLOAD_FIELDS,
  TRANSIENT_STATE_FIELDS,
  normalizeSavePayload
} = await import("../../../src/state/save_migrations.js");
const {
  isNormalizedSavePayload
} = await import("../../../src/state/save_contract.js");

state.party = [createStartingKitCharacter("vanguard")];
state.gameState = "town";
const valid = normalizeSavePayload(createSavePayload());

assert.equal(isNormalizedSavePayload(valid), true, "normalized payload satisfies the canonical contract");

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

console.log("[PASS] canonical normalized save contract, guards, allowlist, roundtrip, and apply atomicity");
