import assert from "node:assert/strict";

const { STARTING_KITS, createDefaultCurrentRun, createSavePayload, createStartingKitCharacter } = await import("../../../src/state.js");
const {
  STARTING_KIT_IDS,
  isNormalizedStartingKitId,
  isStartingKitId,
  normalizeStartingKitId
} = await import("../../../src/state/starting_kit.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const { isNormalizedCurrentRun } = await import("../../../src/state/run_state.js");
const { BASIC_RUNE_ITEM_ID } = await import("../../../src/data/magic.js");

assert.deepEqual(
  STARTING_KITS.map(kit => kit.id),
  [...STARTING_KIT_IDS],
  "authored starting-kit IDs stay aligned with the canonical owner"
);
for (const kitId of STARTING_KIT_IDS) {
  assert.equal(isStartingKitId(kitId), true);
  assert.equal(normalizeStartingKitId(kitId), kitId);
}
for (const value of [null, undefined, "", " Vanguard ", "VANGUARD", "Fighter", "Mage", "scholar", 123]) {
  assert.equal(normalizeStartingKitId(value), null, `invalid starting-kit value: ${String(value)}`);
}
assert.equal(isNormalizedStartingKitId(null), true);
assert.equal(isNormalizedStartingKitId(undefined), false);

const basePayload = createSavePayload();
const normalize = overrides => normalizeSavePayload({
  ...basePayload,
  ...overrides
});

const validParty = normalize({ party: [createStartingKitCharacter("scout")] });
assert.equal(validParty.party[0].startingKit, "scout");
assert.equal(Object.hasOwn(validParty.party[0], "startingKit"), true);

const missingPartyKit = createStartingKitCharacter("scout");
delete missingPartyKit.startingKit;
const invalidPartyKit = normalize({
  party: [{ ...missingPartyKit, startingKit: " Fighter " }]
});
assert.equal(invalidPartyKit.party[0].startingKit, null);
assert.equal(Object.hasOwn(invalidPartyKit.party[0], "startingKit"), true);

const arcanaWithoutMedium = createStartingKitCharacter("arcana");
delete arcanaWithoutMedium.mediumState;
const arcana = normalize({ party: [arcanaWithoutMedium] });
assert.equal(arcana.party[0].startingKit, "arcana");
assert.deepEqual(arcana.party[0].mediumState.socketedRunes, [BASIC_RUNE_ITEM_ID]);

const invalidKitWithoutMedium = createStartingKitCharacter("arcana");
delete invalidKitWithoutMedium.mediumState;
invalidKitWithoutMedium.startingKit = "Mage";
const invalidArcana = normalize({ party: [invalidKitWithoutMedium] });
assert.equal(invalidArcana.party[0].startingKit, null);
assert.equal(Object.hasOwn(invalidArcana.party[0], "mediumState"), false);

const normalizedRun = normalize({
  currentRun: { ...createDefaultCurrentRun(), startingKit: "arcana" }
}).currentRun;
assert.equal(normalizedRun.startingKit, "arcana");
assert.equal(isNormalizedCurrentRun(normalizedRun), true);
const malformedRun = normalize({
  currentRun: { ...createDefaultCurrentRun(), startingKit: "Mage" }
}).currentRun;
assert.equal(malformedRun.startingKit, null);
const missingRun = { ...createDefaultCurrentRun() };
delete missingRun.startingKit;
assert.equal(normalize({ currentRun: missingRun }).currentRun.startingKit, null);
const missingRunField = { ...normalizedRun };
delete missingRunField.startingKit;
assert.equal(isNormalizedCurrentRun(missingRunField), false);

const history = normalize({
  party: [createStartingKitCharacter("scout")],
  runHistory: [
    { startingKit: "arcana", className: "Mage" },
    { startingKit: " Fighter ", class: "Fighter" },
    { className: "Mage" }
  ]
}).runHistory;
assert.equal(history[0].startingKit, "arcana");
assert.equal(history[1].startingKit, null);
assert.equal(history[2].startingKit, null);
assert.equal(Object.hasOwn(history[2], "startingKit"), true);
assert.equal(Object.hasOwn(history[0], "className"), false);
assert.equal(Object.hasOwn(history[1], "class"), false);

const normalizedIdentityPayload = normalize({
  party: [createStartingKitCharacter("arcana")],
  currentRun: { ...createDefaultCurrentRun(), startingKit: "arcana" },
  runHistory: [{ startingKit: "arcana" }]
});
const roundTrip = normalizeSavePayload(JSON.parse(JSON.stringify(normalizedIdentityPayload)));
assert.deepEqual(
  {
    party: roundTrip.party,
    currentRun: roundTrip.currentRun,
    runHistory: roundTrip.runHistory
  },
  {
    party: normalizedIdentityPayload.party,
    currentRun: normalizedIdentityPayload.currentRun,
    runHistory: normalizedIdentityPayload.runHistory
  },
  "starting-kit normalization is stable after JSON roundtrip"
);

console.log("[PASS] starting-kit identity contract and persistence regression");
