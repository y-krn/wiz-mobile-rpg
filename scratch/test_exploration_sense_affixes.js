import { getItemData, getPartyMaxAffix } from "../src/data.js";
import { state } from "../src/state.js";
import { detectAdjacentTrapsByTraceRead, startTrapEncounter } from "../src/systems/traps.js";
import { processExplorationResolution } from "../src/movement.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createChar(name, affixes = []) {
  return {
    name,
    hp: 10,
    status: "ok",
    equipment: {
      weapon: {
        baseId: "DAGGER",
        identified: true,
        affixes,
      },
    },
  };
}

function createEmptyMap(width = 5, height = 5) {
  return Array.from({ length: height }, () => (
    Array.from({ length: width }, () => ({
      type: "floor",
      walls: [false, false, false, false],
      secretDoor: [false, false, false, false],
      secretFound: [false, false, false, false],
      blockEnter: [false, false, false, false],
    }))
  ));
}

function assertPartyMaxAffix() {
  state.party = [
    createChar("A", [{ type: "hearRange", value: 1 }]),
    createChar("B", [{ type: "hearRange", value: 2 }]),
    createChar("C", [{ type: "hearRange", value: 4 }]),
  ];
  state.party[2].hp = 0;

  assert(getPartyMaxAffix(state.party, "hearRange") === 2, "party max should use max living member, not sum");
}

function assertItemDisplay() {
  const item = getItemData({
    baseId: "EXPLORER_CLOAK",
    identified: true,
    rarity: "magic",
    affixes: [
      { type: "hearRange", value: 2 },
      { type: "arcaneSense", value: 2 },
      { type: "traceRead", value: 3 },
    ],
  });

  assert(item.name.includes("地獄耳の"), "hearRange prefix missing");
  assert(item.desc.includes("聴覚+2"), "hearRange desc missing");
  assert(item.desc.includes("霊視2Lv"), "arcaneSense Lv desc missing");
  assert(item.desc.includes("痕跡3Lv"), "traceRead Lv desc missing");
}

function assertTraceReadDetectsAdjacentTrap() {
  state.floor = 1;
  state.x = 2;
  state.y = 2;
  state.maps = [createEmptyMap(), null, null, null, null];
  state.visitedMaps = [createEmptyMap().map(row => row.map(() => true)), null, null, null, null];
  state.party = [createChar("Trace", [{ type: "traceRead", value: 2 }])];
  state.map[2][3].trap = {
    id: "trap-test",
    floorId: "B1",
    type: "mpDrain",
    state: "hidden",
    difficulty: 10,
  };

  const detected = detectAdjacentTrapsByTraceRead();
  const trap = state.map[2][3].trap;

  assert(detected, "traceRead should report detection");
  assert(trap.state === "discovered", "traceRead should mark hidden adjacent trap discovered");
  assert(trap.traceReadLevel === 2, "traceRead level should be stored on detected trap");

  startTrapEncounter(trap);
  assert(state.activeTrapState.revealLevel === 2, "trap encounter should keep trace reveal level");
  assert(state.activeTrapState.expectedEffect.includes("MP減少"), "traceRead Lv2 should identify trap effect");
}

function assertTraceReadLv1HidesEffect() {
  state.floor = 1;
  state.x = 2;
  state.y = 2;
  state.maps = [createEmptyMap(), null, null, null, null];
  state.visitedMaps = [createEmptyMap().map(row => row.map(() => true)), null, null, null, null];
  state.party = [createChar("Trace", [{ type: "traceRead", value: 1 }])];
  state.map[2][1].trap = {
    id: "trap-test-lv1",
    floorId: "B1",
    type: "damage",
    state: "hidden",
    difficulty: 10,
  };

  assert(detectAdjacentTrapsByTraceRead(), "traceRead Lv1 should detect adjacent trap");
  startTrapEncounter(state.map[2][1].trap);
  assert(state.activeTrapState.revealLevel === 1, "traceRead Lv1 reveal level mismatch");
  assert(state.activeTrapState.expectedEffect === "不明", "traceRead Lv1 should not identify trap effect");
}

function assertMovementRunsTraceConsumer() {
  state.floor = 1;
  state.x = 2;
  state.y = 2;
  state.maps = [createEmptyMap(), null, null, null, null];
  state.visitedMaps = [createEmptyMap().map(row => row.map(() => true)), null, null, null, null];
  state.party = [createChar("Trace", [{ type: "traceRead", value: 3 }])];
  state.roamingMonsters = [];
  state.roamingMovementStepCount = 1;
  state.flameTrapCooldownTurns = 0;
  state.gameState = "explore";
  state.map[3][2].trap = {
    id: "trap-consumer",
    floorId: "B1",
    type: "alarm",
    state: "hidden",
    difficulty: 12,
  };

  processExplorationResolution(2, 1);
  assert(state.map[3][2].trap.state === "discovered", "movement resolution should call traceRead consumer");
  assert(state.map[3][2].trap.traceReadLevel === 3, "movement consumer should keep traceRead level");
}

assertPartyMaxAffix();
assertItemDisplay();
assertTraceReadDetectsAdjacentTrap();
assertTraceReadLv1HidesEffect();
assertMovementRunsTraceConsumer();

console.log("[PASS] exploration sense affixes");
