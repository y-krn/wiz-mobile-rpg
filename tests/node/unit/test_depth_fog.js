import assert from "node:assert/strict";
import { getDepthFog } from "../../../src/pixel_art_painters.js";

// #1972: mid-step frames ask for fractional depths, so haze follows the
// dolly and the cut at the end of a step does not change brightness.
const PLANES = [0, 0.12, 0.26, 0.4, 0.52];
PLANES.forEach((fog, depth) => assert.equal(getDepthFog(depth), fog, `plane ${depth} keeps its haze`));
assert.ok(Math.abs(getDepthFog(1.5) - (0.12 + 0.26) / 2) < 1e-9, "half a step blends the two planes");
assert.ok(getDepthFog(0.25) > 0 && getDepthFog(0.25) < 0.12, "a quarter step sits between the camera and the next plane");
assert.equal(getDepthFog(-1), 0, "nearer than the camera clamps to no haze");
assert.equal(getDepthFog(9), 0.52, "beyond the last plane clamps to the far haze");
let previous = -1;
for (let depth = 0; depth <= 4; depth += 0.1) {
  const fog = getDepthFog(depth);
  assert.ok(fog >= previous, `haze never thins with depth (${depth.toFixed(1)})`);
  previous = fog;
}

console.log("[PASS] Issue #1972 depth haze interpolates between planes for mid-step frames.");
