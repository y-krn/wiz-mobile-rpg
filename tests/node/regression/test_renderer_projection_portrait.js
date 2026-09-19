import assert from "node:assert/strict";
import {
  BASE_GEOMETRY,
  BASE_PROJECTION,
  getCombatMonsterLayout,
  getProjectionColumn,
  getProjectionPlanes,
  getProjectionProfile,
  PORTRAIT_NEAR_COVERAGE_MIN
} from "../../../src/rules/renderer_projection.js";

const failures = [];
const check = (label, fn) => {
  try {
    fn();
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
};

check("wide canonical profile remains unchanged", () => {
  const projection = getProjectionPlanes(BASE_GEOMETRY, getProjectionProfile(400, 260));
  assert.deepEqual(projection.xl, BASE_PROJECTION.xl);
  assert.deepEqual(projection.xr, BASE_PROJECTION.xr);
  assert.deepEqual(projection.yt, BASE_PROJECTION.yt);
  assert.deepEqual(projection.yb, BASE_PROJECTION.yb);
});

for (const [width, height] of [[320, 568], [390, 844], [430, 932], [1024, 768]]) {
  check(`shared projection ${width}x${height} stays bounded`, () => {
    const profile = getProjectionProfile(width, height);
    const projection = getProjectionPlanes(BASE_GEOMETRY, profile);
    const normalizedWidths = projection.xr.map((right, index) => (right - projection.xl[index]) / width);
    if (width < height) {
      assert.equal(profile.orientation, "portrait");
      assert.ok(normalizedWidths[0] >= PORTRAIT_NEAR_COVERAGE_MIN, "near world must not collapse into a tunnel");
      assert.ok(normalizedWidths[4] < normalizedWidths[0], "far throat must remain narrower than the near plane");
      assert.ok(normalizedWidths[0] - normalizedWidths[1] > 0.10, "depth must converge after the near plane");
      normalizedWidths.forEach((value, index) => {
        assert.ok(Math.abs(value - profile.coverage[index]) < 1e-9, `coverage ${index} stays normalized`);
      });
      assert.ok(profile.edgeBlend, "portrait edge blending contract is shared");
    } else {
      assert.equal(profile.orientation, "wide");
      assert.equal(profile.edgeBlend, null);
    }
    assert.ok(profile.vanishingPoint.y / height > 0.35 && profile.vanishingPoint.y / height <= 0.5);
    if (width < height) {
      assert.equal(projection.yt[0], 0);
      assert.equal(projection.yb[0], height);
      assert.ok(projection.yb[1] > 260, "near floor must extend beyond the old logical frame");
      assert.ok(projection.yt[1] < profile.vanishingPoint.y);
    }

    if (width < height) {
      for (const z of [0, 1, 2, 3]) {
        for (const column of [-2, -1, 0, 1, 2]) {
          if (Math.abs(column) === 2 && z < 2) continue;
          const plane = getProjectionColumn(projection, z, column);
          assert.ok(plane.leftTop >= -1 && plane.rightTop <= width + 1, `${z}:${column} top clipped`);
          assert.ok(plane.leftBottom >= -1 && plane.rightBottom <= width + 1, `${z}:${column} bottom clipped`);
        }
      }
    }

    const monsters = Array.from({ length: 4 }, (_, index) => ({
      name: `検証敵${index}`,
      hp: 10,
      maxHp: 10,
      spriteType: "biter"
    }));
    getCombatMonsterLayout(monsters, profile).forEach(({ hitRegion }) => {
      assert.ok(hitRegion.x >= 0 && hitRegion.x + hitRegion.width <= width, "enemy hit region clips horizontally");
      assert.ok(hitRegion.y >= 0 && hitRegion.y + hitRegion.height <= height, "enemy hit region clips vertically");
    });
  });
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] portrait-aware shared projection bounds and combat regions verified");
