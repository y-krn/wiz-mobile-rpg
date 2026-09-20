import assert from "assert";
import {
  getMonumentPropGeometry,
  getSpringPropGeometry,
  getStairsPropGeometry
} from "../../../src/dungeon_prop.js";

const nearPlane = { leftBottom: 110, rightBottom: 290, bottom: 208 };
const farPlane = { leftBottom: 176, rightBottom: 224, bottom: 142 };

const spring = getSpringPropGeometry(nearPlane);
const monument = getMonumentPropGeometry(nearPlane);
const stairs = getStairsPropGeometry(nearPlane, "down", "rough_stone");

assert.ok(spring.basin.radiusX > spring.water.radiusX, "spring has a basin around the water surface");
assert.equal(spring.fountain.length, 5, "spring has a raised fountain silhouette");
assert.equal(spring.pedestal.length, 4, "spring has a grounded pedestal");
assert.equal(monument.face.length, 6, "monument has an upright tablet silhouette");
assert.equal(monument.inscriptionLines.length, 3, "monument has inscription-like face marks");
assert.ok(stairs.steps.length >= 3, "stairs have multiple readable treads");
assert.equal(stairs.well.length, 4, "stairs have an integrated descending well");
assert.ok(spring.shadow.y > spring.baseY && monument.shadow.y > monument.baseY && stairs.shadow.y > stairs.baseY, "all props have floor-contact shadows");

const farSpring = getSpringPropGeometry(farPlane);
const farMonument = getMonumentPropGeometry(farPlane);
const farStairs = getStairsPropGeometry(farPlane, "down", "rough_stone");
assert.ok(farSpring.width < spring.width, "spring follows projection depth");
assert.ok(farMonument.height < monument.height, "monument follows projection depth");
assert.ok(farStairs.width < stairs.width, "stairs follow projection depth");
assert.notDeepStrictEqual(spring.basin, monument.face, "spring and monument are not color-only variants");
assert.notDeepStrictEqual(monument.face, stairs.steps[0].points, "monument and stairs have distinct silhouettes");

const shortPortraitPlane = {
  ...nearPlane,
  bottom: 520,
  viewport: { orientation: "portrait", height: 568 }
};
const shortPortraitSpring = getSpringPropGeometry(shortPortraitPlane);
const shortPortraitMonument = getMonumentPropGeometry(shortPortraitPlane);
const shortPortraitStairs = getStairsPropGeometry(shortPortraitPlane, "down", "rough_stone");
assert.ok(shortPortraitSpring.baseY < shortPortraitPlane.bottom, "short portrait spring follows the projected floor");
assert.ok(shortPortraitMonument.baseY < shortPortraitPlane.bottom, "short portrait monument follows the projected floor");
assert.ok(shortPortraitStairs.baseY < shortPortraitPlane.bottom, "short portrait stairs follow the projected floor");
assert.ok(shortPortraitSpring.shadow.y < shortPortraitPlane.viewport.height, "short portrait spring stays inside the viewport");

console.log("[PASS] dungeon spring, monument, and stairs prop geometry contracts");
