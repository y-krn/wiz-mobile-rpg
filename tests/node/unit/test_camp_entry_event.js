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

const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter, saveAutosave, loadGame } =
  await import("../../../src/state.js");
const campRestFacade = await import("../../../src/systems/camp_rest.js");
const campRestOwner = await import("../../../src/systems/camp_rest.ts");
for (const exportName of [
  "isCampEntryEligible",
  "beginCampEntry",
  "completeCampEntry",
  "getCampRestStatus",
  "restAtCamp"
]) {
  assert.strictEqual(campRestFacade[exportName], campRestOwner[exportName],
    `Camp facade preserves ${exportName} identity`);
}

const {
  beginCampEntry,
  completeCampEntry,
  getCampRestStatus,
  isCampEntryEligible,
  restAtCamp
} = campRestFacade;
const { floorHasCampEvent } = await import("../../../src/run_map_generator.js");

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

const sortState = {
  floor: 6,
  currentRun: {
    defeatedMilestones: [5],
    pendingCampEntryFloor: null,
    completedCampEntryFloors: [11]
  }
};
assert.equal(beginCampEntry(sortState, 6), true);
assert.equal(completeCampEntry(sortState, 6), true);
assert.deepEqual(sortState.currentRun.completedCampEntryFloors, [6, 11],
  "completed Camp floors remain ascending");

// Rest choice keeps the existing recovery and core multiplier, then completes the entry.
const restChar = createStartingKitCharacter("vanguard");
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

const clampChar = {
  name: "Clamp",
  hp: 99,
  maxHp: 100,
  mp: 24,
  maxMp: 25,
  status: "ok",
  equipment: { weapon: null, shield: null, armor: null, accessory: null, accessory2: null }
};
const ashChar = {
  name: "Ash",
  hp: 1,
  maxHp: 100,
  mp: 1,
  maxMp: 25,
  status: "ash",
  equipment: { weapon: null, shield: null, armor: null, accessory: null, accessory2: null }
};
const clampState = {
  floor: 6,
  party: [clampChar, ashChar],
  currentRun: { campRested: {} }
};
const clampResult = restAtCamp(clampState);
assert.equal(clampResult.hpRecovered, 1, "Camp HP recovery clamps to derived max HP");
assert.equal(clampResult.mpRecovered, 1, "Camp MP recovery clamps to derived max MP");
assert.equal(clampChar.hp, 100);
assert.equal(clampChar.mp, 25);
assert.equal(ashChar.hp, 1, "ash characters are excluded from Camp recovery");
assert.equal(ashChar.mp, 1, "ash characters do not receive MP recovery");

// Pending entry state survives the existing save/load round trip.
initNewGame();
state.gameState = "explore";
state.floor = 6;
state.currentRun = createDefaultCurrentRun();
state.currentRun.runSeed = "camp-resume-test";
state.currentRun.defeatedMilestones = [5];
state.currentRun.pendingCampEntryFloor = 6;
state.currentRun.completedCampEntryFloors = [];
saveAutosave();
state.currentRun.pendingCampEntryFloor = null;
loadGame();
assert.equal(state.currentRun.pendingCampEntryFloor, 6, "pending Camp entry survives reload");
assert.deepEqual(state.currentRun.completedCampEntryFloors, []);

console.log("[PASS] camp entry floors, boss gate, both choices, core recovery, and save resume");
