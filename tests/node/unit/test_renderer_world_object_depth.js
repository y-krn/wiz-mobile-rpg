import assert from "assert";
import { getChestPropGeometry } from "../../../src/chest_prop.js";
import {
  getMonumentPropGeometry,
  getSpringPropGeometry,
  getStairsPropGeometry
} from "../../../src/dungeon_prop.js";
import {
  BASE_GEOMETRY,
  getProjectionPlanes,
  getProjectionProfile,
  getWorldObjectProjection
} from "../../../src/rules/renderer_projection.js";

const VIEWPORTS = [[320, 568], [390, 844], [430, 932]];
const OBJECTS = [
  ["chest", plane => getChestPropGeometry(plane)],
  ["spring", plane => getSpringPropGeometry(plane)],
  ["monument", plane => getMonumentPropGeometry(plane)],
  ["stairs", plane => getStairsPropGeometry(plane, "down")]
];

function pointsFor(geometry, kind) {
  if (kind === "chest") return [...geometry.body, ...geometry.side, ...geometry.lid];
  if (kind === "spring") return [...geometry.fountain, ...geometry.pedestal];
  if (kind === "monument") return [...geometry.face, ...geometry.side, ...geometry.plinth];
  return [...geometry.well, ...geometry.steps.flatMap(step => step.points)];
}

function metrics(geometry, kind) {
  const points = pointsFor(geometry, kind);
  const top = Math.min(...points.map(point => point.y));
  const bottom = Math.max(...points.map(point => point.y));
  return {
    width: geometry.width,
    height: bottom - top,
    centerX: geometry.centerX,
    baseY: geometry.baseY,
    shadowY: geometry.shadow.y
  };
}

for (const [width, height] of VIEWPORTS) {
  const projection = getProjectionPlanes(BASE_GEOMETRY, getProjectionProfile(width, height));
  const planes = [1, 2, 3].map(depth => getWorldObjectProjection(projection, depth));

  for (const [kind, makeGeometry] of OBJECTS) {
    const samples = planes.map(plane => metrics(makeGeometry(plane), kind));
    const widths = samples.map(sample => sample.width);
    const heights = samples.map(sample => sample.height);
    const bases = samples.map(sample => sample.baseY);

    assert.ok(widths[0] > widths[1] && widths[1] > widths[2], `${kind} width is monotonic at ${width}x${height}`);
    assert.ok(heights[0] > heights[1] && heights[1] > heights[2], `${kind} height is monotonic at ${width}x${height}`);
    assert.ok(bases[0] > bases[1] && bases[1] > bases[2], `${kind} floor Y is monotonic at ${width}x${height}`);
    assert.ok(widths[0] / widths[1] < 1.65 && widths[1] / widths[2] < 1.65, `${kind} depth jump is bounded at ${width}x${height}`);
    assert.ok(samples.every(sample => sample.shadowY > sample.baseY), `${kind} keeps floor contact at ${width}x${height}`);
    assert.ok(samples.every(sample => Math.abs(sample.centerX - width / 2) < 0.001), `${kind} stays centered at ${width}x${height}`);
    assert.equal(new Set(samples.map(sample => sample.baseY)).size, 3, `${kind} has one placement per depth at ${width}x${height}`);
  }
}

console.log("[PASS] shared world-object projection keeps size, floor contact, and depth transitions monotonic");
