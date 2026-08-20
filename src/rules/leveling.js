import { CLASSES } from "../data/classes.js";

export function rollInclusive(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function getClassMainStat(className) {
  // Preserve the previous unknown-class fallback (vit) without hiding the
  // mapping for any supported class, all of which are explicit in CLASSES.
  return CLASSES[className]?.mainStat || "vit";
}
