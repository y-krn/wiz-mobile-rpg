import assert from "assert";
import { SPELL_EFFECTS } from "../../../src/systems/spell_effects.js";

function createCell(overrides = {}) {
  return {
    walls: [false, false, false, false],
    blockEnter: [false, false, false, false],
    type: "empty",
    event: null,
    ...overrides
  };
}

function createState({ stair = null, visited = [], oneWay = false } = {}) {
  const map = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => createCell()));
  if (stair) map[stair.y][stair.x].type = "stairs-down";
  if (oneWay) map[1][2].blockEnter[3] = true;
  return {
    floor: 7,
    x: 1,
    y: 2,
    dir: 0,
    maps: [null, null, null, null, null, null, map],
    visitedMaps: [null, null, null, null, null, null, visited],
  };
}

function cast(state) {
  return SPELL_EFFECTS.DUMAPIC({ caster: { name: "Ged" }, target: state }).log;
}

const baselineState = createState({ stair: { x: 4, y: 0 }, visited: Array.from({ length: 5 }, () => Array(5).fill(true)), oneWay: true });
baselineState.maps[6][2][3].event = "chest";
baselineState.maps[6][3][1].event = "merchant";
baselineState.maps[6][0][4].secretDoor = [true, false, false, false];
const before = JSON.stringify(baselineState);
const baselineLog = cast(baselineState);

assert.match(baselineLog, /DUMAPIC — B7 \/ 北向き/);
assert.match(baselineLog, /測量座標 X:1 Y:2/);
assert.match(baselineLog, /北東のやや遠いに下層へ続く構造を感知した。/);
assert.match(baselineLog, /近辺の空間にわずかな歪みがある。/);
assert.doesNotMatch(baselineLog, /宝箱|商人|野営地|泉|石碑|強敵|巨大な気配|罠|secret|隠し扉|危険度/);
assert.equal((baselineLog.match(/X:\d+ Y:\d+/g) || []).length, 1);
assert.equal(JSON.stringify(baselineState), before, "DUMAPIC must not mutate the map or visited state");
assert.equal(Object.hasOwn(baselineState, "dumapicTurns"), false);
assert.equal(Object.hasOwn(baselineState, "dumapicHint"), false);

const unexploredState = createState({ visited: Array.from({ length: 5 }, () => Array(5).fill(true)) });
unexploredState.visitedMaps[6][2][2] = false;
assert.match(cast(unexploredState), /東方に未踏領域の広がりを感じる。/);

for (const [distance, stair, category] of [
  [1, { x: 2, y: 2 }, "近い"],
  [4, { x: 5, y: 2 }, "やや遠い"],
  [8, { x: 9, y: 2 }, "遠い"],
]) {
  const state = createState({ visited: Array.from({ length: 5 }, () => Array(5).fill(true)) });
  state.maps[6] = Array.from({ length: 3 }, () => Array.from({ length: distance + 2 }, () => createCell()));
  state.maps[6][stair.y][stair.x].type = "stairs-down";
  const log = cast(state);
  assert.match(log, new RegExp(`東の${category}に下層へ続く構造を感知した。`));
}

const noOneWayState = createState({ visited: Array.from({ length: 5 }, () => Array(5).fill(true)) });
assert.doesNotMatch(cast(noOneWayState), /空間にわずかな歪み/);

console.log("DUMAPIC instant survey checks passed.");
