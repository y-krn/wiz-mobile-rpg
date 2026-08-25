import assert from "node:assert/strict";
import { BIOMES } from "../src/data/biomes.js";
import { getFloorTheme } from "../src/data/floor_themes.js";
import {
  BASE_GEOMETRY,
  DungeonRenderer,
  LANDMARK_STYLE_IDS,
  getLandmarkStyles,
  getProjectionPlanes
} from "../src/renderer.js";

const representativeFloors = [1, 6, 11, 16, 21, 26];
const failures = [];
const check = (label, fn) => {
  try {
    fn();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
};

check("all biomes define the three canonical landmark styles", () => {
  assert.equal(BIOMES.length, 6);
  BIOMES.forEach(({ visualSignature }) => {
    assert.ok(Object.isFrozen(visualSignature.landmarks));
    Object.entries({
      chestStyle: LANDMARK_STYLE_IDS.chest,
      trapStyle: LANDMARK_STYLE_IDS.trap,
      stairsStyle: LANDMARK_STYLE_IDS.stairs
    }).forEach(([key, allowed]) => {
      assert.ok(allowed.includes(visualSignature.landmarks[key]), `${key} is not registered`);
    });
  });
});

check("representative floors use six distinct signatures per landmark category", () => {
  ["chestStyle", "trapStyle", "stairsStyle"].forEach(key => {
    const styles = representativeFloors.map(floor => getFloorTheme(floor).visualSignature.landmarks[key]);
    assert.equal(new Set(styles).size, representativeFloors.length, `${key} styles should be unique`);
  });
});

check("unknown styles safely fall back to the baseline landmark", () => {
  assert.deepEqual(getLandmarkStyles({ landmarks: { chestStyle: "unknown", trapStyle: null } }), {
    chestStyle: LANDMARK_STYLE_IDS.chest[0],
    trapStyle: LANDMARK_STYLE_IDS.trap[0],
    stairsStyle: LANDMARK_STYLE_IDS.stairs[0]
  });
});

check("every registered style can render against the shared projection", () => {
  const ctx = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
  const projection = getProjectionPlanes(BASE_GEOMETRY);
  const renderer = DungeonRenderer.prototype;
  LANDMARK_STYLE_IDS.stairs.forEach(style => renderer.drawStairsIcon(ctx, 1, "stairs-down", style, projection));
  LANDMARK_STYLE_IDS.chest.forEach(style => renderer.drawChestIcon(ctx, 1, style, projection));
  LANDMARK_STYLE_IDS.trap.forEach(style => renderer.drawTrapIcon(ctx, 1, false, style, projection));
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] Issue #831 biome landmark signatures, safe fallback, and shared projection rendering verified.");
