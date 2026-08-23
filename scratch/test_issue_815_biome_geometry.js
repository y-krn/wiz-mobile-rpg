import assert from "node:assert/strict";
import { BIOMES, getBiomeForFloor } from "../src/data/biomes.js";
import { getFloorTheme } from "../src/data/floor_themes.js";
import { BASE_GEOMETRY, BASE_PROJECTION, getProjectionColumn, getProjectionPlanes } from "../src/renderer.js";

const failures = [];
const check = (label, fn) => {
  try {
    fn();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
};

const allowedStyles = new Set(["flat", "arch"]);

check("all biome visual signatures expose valid geometry", () => {
  assert.equal(BIOMES.length, 6);
  BIOMES.forEach(({ visualSignature }) => {
    const geometry = visualSignature.geometry;
    assert.ok(geometry);
    ["corridorWidth", "ceilingHeight", "wallLean"].forEach(key => {
      assert.equal(typeof geometry[key], "number");
      assert.ok(Number.isFinite(geometry[key]));
    });
    assert.ok(geometry.corridorWidth > 0);
    assert.ok(geometry.ceilingHeight > 0);
    assert.ok(allowedStyles.has(geometry.ceilingStyle));
    assert.equal(Object.isFrozen(geometry), true);
  });
});

check("representative biome profiles differ from baseline in at least two shape dimensions", () => {
  const keys = ["corridorWidth", "ceilingHeight", "wallLean", "ceilingStyle"];
  [1, 6, 11, 16, 21, 26].forEach(floor => {
    const geometry = getBiomeForFloor(floor).visualSignature.geometry;
    const differences = keys.filter(key => geometry[key] !== BASE_GEOMETRY[key]);
    assert.ok(differences.length >= 2, `B${floor} only changes ${differences.join(", ")}`);
  });
});

check("baseline projection is equivalent to the legacy planes", () => {
  const projection = getProjectionPlanes(BASE_GEOMETRY);
  assert.deepEqual(projection.xl, BASE_PROJECTION.xl);
  assert.deepEqual(projection.xr, BASE_PROJECTION.xr);
  assert.deepEqual(projection.yt, BASE_PROJECTION.yt);
  assert.deepEqual(projection.yb, BASE_PROJECTION.yb);
  assert.deepEqual(projection.leftTop, BASE_PROJECTION.xl);
  assert.deepEqual(projection.leftBottom, BASE_PROJECTION.xl);
  assert.deepEqual(projection.rightTop, BASE_PROJECTION.xr);
  assert.deepEqual(projection.rightBottom, BASE_PROJECTION.xr);
  assert.equal(projection.ceilingStyle, "flat");
});

check("every geometry projection preserves left-right and top-bottom ordering", () => {
  BIOMES.forEach(({ visualSignature }) => {
    const projection = getProjectionPlanes(visualSignature.geometry);
    projection.xl.forEach((left, z) => {
      assert.ok(left < projection.xr[z], `plane ${z} is not left of right`);
      assert.ok(projection.yt[z] < projection.yb[z], `plane ${z} is not above bottom`);
      [-2, -1, 0, 1, 2].forEach(column => {
        const plane = getProjectionColumn(projection, z, column);
        assert.ok(plane.leftTop < plane.rightTop, `top ordering failed at z=${z}, column=${column}`);
        assert.ok(plane.leftBottom < plane.rightBottom, `bottom ordering failed at z=${z}, column=${column}`);
        assert.ok(plane.top < plane.bottom, `vertical ordering failed at z=${z}, column=${column}`);
      });
    });
    for (let z = 0; z < projection.xl.length - 1; z++) {
      assert.ok(
        projection.xr[z] - projection.xl[z] > projection.xr[z + 1] - projection.xl[z + 1],
        `depth width ordering failed at z=${z}`
      );
    }
  });
});

check("floor themes preserve the canonical geometry lookup", () => {
  [1, 6, 11, 16, 21, 26].forEach(floor => {
    assert.deepEqual(
      getFloorTheme(floor).visualSignature.geometry,
      getBiomeForFloor(floor).visualSignature.geometry
    );
  });
});

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] Issue #815 biome geometry signatures, baseline projection compatibility, and projection ordering verified.");
