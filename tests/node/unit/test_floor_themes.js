import assert from "node:assert/strict";
import {
  getFloorDisplayName,
  getFloorLabel,
  revealFloor
} from "../../../src/data/floor_themes.js";
import { normalizeSavePayload } from "../../../src/state/save_migrations.js";
import { describeFloor } from "../../../src/ui/floor_label.js";

let failed = false;

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed = true;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("未踏階は名前を隠し、進入で開示する", () => {
  const state = { dungeonMemory: { mapFragments: {}, visitedFloors: [1] } };
  assert.equal(getFloorLabel(state, 2), "???（地下2階）");
  assert.equal(revealFloor(state, 2), true);
  assert.equal(getFloorDisplayName(state, 2), "崩れた坑道");
  assert.equal(revealFloor(state, 2), false);
  assert.deepEqual(state.dungeonMemory.visitedFloors, [1, 2]);
});

check("旧セーブは到達済み最深階まで訪問済みにする", () => {
  const normalized = normalizeSavePayload({
    floor: 3,
    codex: { stats: { deepestFloor: 4 } },
    dungeonMemory: { mapFragments: {} }
  });
  assert.deepEqual(normalized.dungeonMemory.visitedFloors, [1, 2, 3, 4]);
});

check("画面では、未踏階を階数だけで呼ぶ", () => {
  const state = { dungeonMemory: { mapFragments: {}, visitedFloors: [1] } };
  assert.equal(describeFloor(state, 2), "地下2階");
  revealFloor(state, 2);
  assert.equal(describeFloor(state, 2), "崩れた坑道（地下2階）");
});

if (failed) process.exit(1);
