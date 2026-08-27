import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const simulationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../simulations");
const readSimulation = name => fs.readFileSync(path.join(simulationsDir, name), "utf8");
const failures = [];

const workshopSource = readSimulation("sim_workshop_progression.js");
const depthSource = readSimulation("sim_depth_material_ev.js");

if (!/IDENTIFICATION_BALANCE\.startingPowder/.test(workshopSource)) {
  failures.push("sim_workshop_progression.js: starting powder must use IDENTIFICATION_BALANCE");
}
if (!/IDENTIFICATION_BALANCE\.identifyCost/.test(workshopSource)) {
  failures.push("sim_workshop_progression.js: identify cost must use IDENTIFICATION_BALANCE");
}
if (!/IDENTIFICATION_BALANCE\.startingPowder/.test(depthSource)) {
  failures.push("sim_depth_material_ev.js: starting powder source fallback is missing");
}
if (!/IDENTIFICATION_BALANCE\.identifyCost/.test(depthSource)) {
  failures.push("sim_depth_material_ev.js: identify cost source fallback is missing");
}

const balanceFiles = fs.readdirSync(simulationsDir)
  .filter(name => /^(?:sim|measure)_.*\.js$/.test(name));
const staleFallbacks = [
  "IDENTIFICATION_STARTING_POWDER",
  "IDENTIFICATION_COST_OVERRIDE"
];
for (const name of balanceFiles) {
  const source = readSimulation(name);
  for (const key of staleFallbacks) {
    const pattern = new RegExp(
      `(?:process\\.env|SIM_ENV|RESOLVED_SIM_ENV)\\.${key}` +
      `\\s*(?:\\|\\||\\|\\|=|\\?\\?|\\?\\?=)\\s*[\"']?\\d+[\"']?`
    );
    if (pattern.test(source)) {
      failures.push(`${name}: ${key} has a hardcoded fallback; use the source balance`);
    }
  }
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${balanceFiles.length} sim/measure files checked for stale balance fallbacks`);
