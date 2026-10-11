// The town picture (#2107) is painted pixel by pixel: every pixel is filled,
// the painting is deterministic, and a facility's house changes with whether
// its keeper is home.
import { strict as assert } from "node:assert";
import { TOWN_ART_HEIGHT, TOWN_ART_WIDTH, paintTownArt } from "../../../src/ui/town_art.js";
import { TOWN_BUILDING_AREAS, TOWN_FACILITY_PLOTS, getFacilityArea } from "../../../src/ui/town_scene.js";

const first = paintTownArt(["waiting"]);
assert.equal(first.pixels.length, TOWN_ART_WIDTH * TOWN_ART_HEIGHT * 4);
for (let index = 3; index < first.pixels.length; index += 4) assert.equal(first.pixels[index], 255, "every pixel is painted");
assert.deepEqual(paintTownArt(["waiting"]).pixels, first.pixels, "the same town paints the same picture");

const plotDiffers = (a, b, plotIndex) => {
  const { x, y, w, h } = getFacilityArea(plotIndex);
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const i = (py * TOWN_ART_WIDTH + px) * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return true;
    }
  }
  return false;
};
const open = paintTownArt(["open"]);
const empty = paintTownArt([]);
assert.ok(plotDiffers(first.pixels, open.pixels, 0), "a keeper brought home lights the house");
assert.ok(plotDiffers(first.pixels, empty.pixels, 0), "an empty plot differs from a waiting house");
assert.ok(!plotDiffers(first.pixels, open.pixels, 3), "other plots are untouched");

// Every building's button lies inside the picture.
for (const area of [...Object.values(TOWN_BUILDING_AREAS), ...TOWN_FACILITY_PLOTS.map((_, index) => getFacilityArea(index))]) {
  assert.ok(area.x >= 0 && area.y >= 0 && area.x + area.w <= TOWN_ART_WIDTH && area.y + area.h <= TOWN_ART_HEIGHT);
}

console.log("[PASS] the town picture is painted whole, deterministically, and shows who is home");
