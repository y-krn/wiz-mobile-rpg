import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter, addEventLog } = await import("../../../src/state.js");
const { settleEventObservations } = await import("../../../src/movement.js");
const { EVENT_TYPES } = await import("../../../src/constants/events.js");

// Unresolved observations (#1821): what the event strip shows as "未解決" is
// retired once it no longer holds, without waiting for the next free step.

function openCell() {
  return {
    type: "empty",
    walls: [false, false, false, false],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false]
  };
}

function seed() {
  initNewGame();
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.floor = 1;
  state.maps = [Array.from({ length: 9 }, () => Array.from({ length: 9 }, openCell))];
  state.visitedMaps = [state.maps[0].map(row => row.map(() => false))];
  state.roamingMonsters = [];
  state.x = 4;
  state.y = 4;
  state.gameState = "explore";
}

const lifecycle = key => state.currentRun.eventObservations[key]?.lifecycle;
const observe = (key, scope) => addEventLog(`【気配】${key}`, { key, scope });

// A sensed chest: still unresolved while it is near and not yet reached.
seed();
state.map[4][5].event = EVENT_TYPES.CHEST;
observe("aura:1:chest:5:4", "aura:1");
settleEventObservations();
assert.equal(lifecycle("aura:1:chest:5:4"), "active", "a chest in range that was never reached stays unresolved");

// The adventurer has stood on the chest: it is known, not sensed.
state.visitedMap[4][5] = true;
settleEventObservations();
assert.equal(lifecycle("aura:1:chest:5:4"), "resolved", "a chest the adventurer has stood at is no longer an open question");

// The chest is gone from the map: resolved even without moving.
seed();
state.map[4][5].event = EVENT_TYPES.CHEST;
observe("aura:1:chest:5:4", "aura:1");
state.map[4][5].event = null;
settleEventObservations();
assert.equal(lifecycle("aura:1:chest:5:4"), "resolved", "an opened chest leaves no unresolved line");

// Settling raises nothing new: a chest in range that was not observed yet
// is announced by the next ordinary step, not here.
seed();
state.map[4][5].event = EVENT_TYPES.CHEST;
const logsBefore = state.logs.length;
settleEventObservations();
assert.equal(state.currentRun.eventObservations?.["aura:1:chest:5:4"], undefined);
assert.equal(state.logs.length, logsBefore, "settling adds no log line");

// A trap trace asks for a decision while the trap is the next step.
seed();
observe("trap:1:5:4", "trap:1");
settleEventObservations();
assert.equal(lifecycle("trap:1:5:4"), "active", "an adjacent trap is still an open question");
state.x = 2;
settleEventObservations();
assert.equal(lifecycle("trap:1:5:4"), "resolved", "a trap left behind is a mark on the map, not an open question");

// Observations of other kinds are left alone.
seed();
observe("combat:1:weakness", "combat:1");
observe("fit:custom", "floor:1");
settleEventObservations();
assert.equal(lifecycle("combat:1:weakness"), "active");
assert.equal(lifecycle("fit:custom"), "active");

console.log("[PASS] unresolved observations are retired when they no longer hold");
