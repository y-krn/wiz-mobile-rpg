import { strict as assert } from "node:assert";
import { createDefaultCurrentRun, createSoloCharacter, state } from "../src/state.js";
import { menuContext } from "../src/navigation.js";
import { checkCellEvents } from "../src/movement.js";
import {
  MILESTONE_CLEARED_STRUCTURE_MESSAGE,
  MILESTONE_STRUCTURE_MESSAGE
} from "../src/ui/milestone_disclosure.js";

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
  state.party = [createSoloCharacter("Fighter")];
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

check("守護者の階でボス未撃破なら下り操作を含む階段メニューを開く", () => {
  withDocumentStub(() => {
    setupStairsCell(5);
    state.currentRun.defeatedMilestones = [];
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(state.floor, 5);
    assert.match(state.logs.at(-1), /下り階段は封じられている/);
  });
});

check("守護者の階でもボス撃破済みなら選択サブメニューが開く", () => {
  withDocumentStub(() => {
    setupStairsCell(5);
    state.currentRun.defeatedMilestones = [5];
    checkCellEvents();
    assert.equal(state.gameState, "submenu");
    assert.equal(menuContext.type, "stairs_down");
    assert.equal(state.floor, 5);
  });
});

check("節目の階の構造メッセージは表示文言を固定する", () => {
  assert.match(MILESTONE_STRUCTURE_MESSAGE, /階層守護者・深層商人・帰還の門/);
  assert.match(MILESTONE_CLEARED_STRUCTURE_MESSAGE, /深層商人・帰還の門/);
  assert.match(MILESTONE_CLEARED_STRUCTURE_MESSAGE, /撃破済み/);
});

if (failures > 0) {
  console.error(`${failures} stairs down choice checks failed`);
  process.exit(1);
}
