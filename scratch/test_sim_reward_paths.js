import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scratchDir = path.dirname(fileURLToPath(import.meta.url));
const simulationFiles = fs.readdirSync(scratchDir)
  .filter(name => /^sim_.*\.js$/.test(name));
const failures = [];

for (const name of simulationFiles) {
  const source = fs.readFileSync(path.join(scratchDir, name), "utf8");
  if (/applyCombatRewards\s*\(/.test(source)) {
    failures.push(`${name}: applyCombatRewards must be reached through round resolution`);
  }
  if (/checkCharLevelUp\s*\(/.test(source)) {
    failures.push(`${name}: checkCharLevelUp must not be repeated after round rewards`);
  }
}

for (const name of [
  "sim_depth_material_ev.js",
  "sim_workshop_progression.js",
  "sim_inflow_reduction.js"
]) {
  const source = fs.readFileSync(path.join(scratchDir, name), "utf8");
  const usesGeneratedRun = source.includes("generateRunFloor(")
    || source.includes('from "./sim_depth_material_ev.js"')
    || source.includes('import("./sim_depth_material_ev.js")');
  if (!usesGeneratedRun) {
    failures.push(`${name}: simulation must use the generateRunFloor-backed path`);
  }
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${simulationFiles.length} sim files use a single source reward/level path`);
