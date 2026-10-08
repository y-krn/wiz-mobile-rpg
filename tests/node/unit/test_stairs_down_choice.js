import { strict as assert } from "node:assert";
import { createDefaultCurrentRun, createStartingKitCharacter, state } from "../../../src/state.js";
import { menuContext } from "../../../src/navigation.js";
import { checkCellEvents, descendToFloor } from "../../../src/movement.js";
import {
  MILESTONE_CLEARED_STRUCTURE_MESSAGE,
  MILESTONE_STRUCTURE_MESSAGE
} from "../../../src/ui/milestone_disclosure.js";

let failures = 0;
function check(label, test) {
  try {
    test();
    console.log(`[PASS] ${label}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${label}`);
    console.error(error);
  }
}

function createElementStub() {
  return { style: {}, textContent: "", className: "", replaceChildren: () => {} };
}

function withDocumentStub(fn) {
  const originalDocument = global.document;
  global.document = { getElementById: () => createElementStub() };
  try {
    return fn();
  } finally {
    global.document = originalDocument;
  }
}

function setupStairsCell(floor) {
  state.party = [createStartingKitCharacter("vanguard")];
  state.floor = floor;
  state.maps[floor - 1] = [[{ type: "stairs-down", event: null }]];
  state.x = 0;
  state.y = 0;
  state.gameState = "explore";
  state.currentRun = createDefaultCurrentRun();
  state.logs = [];
}

check("下り階段に入ってもフロアは変わらず選択サブメニューが開く", () => {
  withDocumentStub(() => {
    setupStairsCell(2);
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    assert.equal(state.floor, 2);
    assert.equal(state.x, 0);
    assert.equal(state.y, 0);
  });
});

// A dungeon ends on its fifth floor (#2060): the stairs there stay sealed
// whether or not the guardian is down, and the menu still opens.
check("迷宮の5階では、守護者を倒す前も階段メニューが開き、下り階段は封じられている", () => {
  withDocumentStub(() => {
    setupStairsCell(5);
    state.currentRun.defeatedMilestones = [];
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    assert.equal(state.floor, 5);
    assert.match(state.logs.at(-1), /下り階段は固く封じられている/);
  });
});

check("迷宮の5階では、守護者を倒した後も下り階段は封じられたままで、降りられない", () => {
  withDocumentStub(() => {
    setupStairsCell(5);
    state.currentRun.defeatedMilestones = [5];
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    assert.equal(state.floor, 5);
    assert.match(state.logs.at(-1), /下り階段は固く封じられている/);
    descendToFloor(6);
    assert.equal(state.floor, 5);
    assert.notEqual(state.transitioning, true, "a refused descent starts no transition");
  });
});

check("ほかの迷宮でも5階が底になる", () => {
  withDocumentStub(() => {
    setupStairsCell(10);
    state.currentRun.defeatedMilestones = [10];
    checkCellEvents();
    assert.match(state.logs.at(-1), /下り階段は固く封じられている/);
    descendToFloor(11);
    assert.equal(state.floor, 10);
  });
});

check("節目の階の構造メッセージは表示文言を固定する", () => {
  // There is no Portal in a dungeon (#2062).
  assert.match(MILESTONE_STRUCTURE_MESSAGE, /階層守護者と深層商人がいる/);
  assert.match(MILESTONE_CLEARED_STRUCTURE_MESSAGE, /深層商人がいる/);
  assert.doesNotMatch(MILESTONE_STRUCTURE_MESSAGE + MILESTONE_CLEARED_STRUCTURE_MESSAGE, /帰還の門/);
  assert.match(MILESTONE_CLEARED_STRUCTURE_MESSAGE, /撃破済み/);
});

if (failures > 0) {
  console.error(`${failures} stairs down choice checks failed`);
  process.exit(1);
}
