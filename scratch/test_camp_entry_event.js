import assert from "node:assert/strict";

globalThis.document = {
  getElementById: () => ({ style: {}, textContent: "", className: "", innerHTML: "" }),
  addEventListener() {}
};
globalThis.window = { addEventListener() {} };
globalThis.localStorage = (() => {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  };
})();

const { state, initNewGame, createDefaultCurrentRun, createSoloCharacter, saveAutosave, loadGame } =
  await import("../src/state.js");
const {
  beginCampEntry,
  completeCampEntry,
  getCampRestStatus,
  isCampEntryEligible,
  restAtCamp
} = await import("../src/systems/camp_rest.js");
const { floorHasCampEvent } = await import("../src/run_map_generator.js");

const targetFloors = [6, 11, 16, 21];
for (const floor of targetFloors) {
  assert.equal(floorHasCampEvent(floor), true, `B${floor} is a camp-entry floor`);

  const eligible = { floor, currentRun: { defeatedMilestones: [floor - 1] } };
  assert.equal(isCampEntryEligible(eligible, floor), true, `B${floor} requires preceding boss`);
  assert.equal(isCampEntryEligible({ floor, currentRun: { defeatedMilestones: [] } }, floor), false);
  assert.equal(
    isCampEntryEligible({ floor, currentRun: { defeatedMilestones: [floor] } }, floor),
    false,
    `direct B${floor} start must not self-qualify`
  );

  const run = { defeatedMilestones: [floor - 1], pendingCampEntryFloor: null, completedCampEntryFloors: [] };
  const entryState = { floor, currentRun: run };
  assert.equal(beginCampEntry(entryState, floor), true, `B${floor} starts Camp once`);
  assert.equal(run.pendingCampEntryFloor, floor);
  assert.equal(beginCampEntry(entryState, floor), false, `B${floor} cannot start twice while pending`);
  assert.equal(completeCampEntry(entryState, floor), true, `B${floor} continue choice completes Camp`);
  assert.equal(run.pendingCampEntryFloor, null);
  assert.deepEqual(run.completedCampEntryFloors, [floor]);
  assert.equal(beginCampEntry(entryState, floor), false, `B${floor} cannot fire twice`);
}

// Rest choice keeps the existing recovery and core multiplier, then completes the entry.
const restChar = createSoloCharacter("Fighter");
restChar.maxHp = 100;
restChar.hp = 50;
restChar.maxMp = 25;
restChar.mp = 5;
restChar.equipment.armor = {
  baseId: "LEATHER_ARMOR",
  identified: true,
  affixes: [{ id: "CORE_CAMP_MASTER", kind: "core" }]
};
const restState = {
  floor: 6,
  party: [restChar],
  currentRun: { defeatedMilestones: [5], pendingCampEntryFloor: null, completedCampEntryFloors: [] }
};
assert.equal(beginCampEntry(restState, 6), true);
assert.equal(getCampRestStatus(restState).available, true);
const restResult = restAtCamp(restState);
assert.equal(restResult.hpRecovered, 40, "CORE_CAMP_MASTER doubles HP recovery");
assert.equal(restResult.mpRecovered, 16, "CORE_CAMP_MASTER doubles MP recovery");
assert.equal(completeCampEntry(restState, 6), true);
assert.equal(restState.currentRun.pendingCampEntryFloor, null);
assert.deepEqual(restState.currentRun.completedCampEntryFloors, [6]);

// Pending entry state survives the existing save/load round trip.
initNewGame();
state.gameState = "explore";
state.floor = 6;
state.currentRun = createDefaultCurrentRun();
state.currentRun.defeatedMilestones = [5];
state.currentRun.pendingCampEntryFloor = 6;
state.currentRun.completedCampEntryFloors = [];
saveAutosave();
state.currentRun.pendingCampEntryFloor = null;
loadGame();
assert.equal(state.currentRun.pendingCampEntryFloor, 6, "pending Camp entry survives reload");
assert.deepEqual(state.currentRun.completedCampEntryFloors, []);

console.log("[PASS] camp entry floors, boss gate, both choices, core recovery, and save resume");
