import assert from "node:assert/strict";
import {
  SIMULATION_MANIFEST,
  assertBalanceImpactCovered,
  assertRuntimeMechanismsFired,
  assertValidSimulationManifest,
  currentChangedFiles,
  discoverSimulationRunnerFiles,
  EXECUTABLE_MEASUREMENT_RUNNERS,
  isExecutableMeasurementRunner,
  inspectSimulationMetadata,
  scanStaleSimulationReferences,
  validateSimulationManifest
} from "./simulation_manifest.js";

assert.doesNotThrow(() => assertValidSimulationManifest());
assert.deepEqual(validateSimulationManifest({
  ...SIMULATION_MANIFEST,
  canonical: { ...SIMULATION_MANIFEST.canonical, covers: [] }
}).filter(error => error.includes("coverage")), ["canonical runner coverage is missing"]);
assert.throws(
  () => assertValidSimulationManifest({
    ...SIMULATION_MANIFEST,
    canonical: { ...SIMULATION_MANIFEST.canonical, criticalRuntimeMechanisms: [] }
  }),
  /critical runtime mechanisms are missing/
);
assert.throws(
  () => assertValidSimulationManifest({
    ...SIMULATION_MANIFEST,
    runnerLifecycleRules: [{ pattern: "scratch/sim_bad.js", lifecycle: "unknown" }]
  }),
  /unknown runner lifecycle/
);

const staleFixture = new Map([
  ["scratch/sim_issue_999.js", "// sim-scope: run\nconst retired = trapSense;\n"]
]);
assert.deepEqual(scanStaleSimulationReferences({
  files: ["scratch/sim_issue_999.js"],
  sourceByPath: staleFixture
}), [{ file: "scratch/sim_issue_999.js", reference: "trapSense" }]);
assert.ok(inspectSimulationMetadata({
  files: ["scratch/sim_unclassified.js"],
  sourceByPath: new Map([["scratch/sim_unclassified.js", "// no metadata\n"]])
}).some(error => error.includes("lifecycle metadata")));

assertBalanceImpactCovered(["src/rules/status_effect_rules.js", "src/ui.js"]);
assert.throws(
  () => assertBalanceImpactCovered(["src/new_balance_rule.js"]),
  /unknown production path/
);
const narrowCoverageManifest = {
  ...SIMULATION_MANIFEST,
  canonical: { ...SIMULATION_MANIFEST.canonical, covers: ["combat"] },
  balanceImpactPaths: [{ pattern: "src/rules/status_effect_rules.js", domains: ["status"] }]
};
assert.throws(
  () => assertBalanceImpactCovered(["src/rules/status_effect_rules.js"], narrowCoverageManifest),
  /not covered/
);

const discoveredRunners = discoverSimulationRunnerFiles();
assert.deepEqual(
  EXECUTABLE_MEASUREMENT_RUNNERS.filter(file => !discoveredRunners.includes(file)),
  [],
  `executable measurement runners omitted: ${discoveredRunners.join(", ")}`
);
assert.ok(discoveredRunners.includes("scratch/sim_depth_material_ev.js"));
assert.equal(
  isExecutableMeasurementRunner(
    "scratch/issue999_new_runner.js",
    "// sim-scope: run\nconst SIM_RUNS = 1; function main() {} main();"
  ),
  true
);
const metadataErrors = inspectSimulationMetadata();
assert.deepEqual(metadataErrors, [], metadataErrors.join("\n"));
const staleReferences = scanStaleSimulationReferences();
assert.deepEqual(staleReferences, [], JSON.stringify(staleReferences));
const sourceCoverage = assertBalanceImpactCovered(currentChangedFiles());

const { getScenarioById, simulateRun } = await import("./sim_depth_material_ev.js");
const smokeScenario = { ...getScenarioById("workshop-empty"), departureCraftMeasurement: true };

function runCanonicalSmoke() {
  return simulateRun({
    className: "Fighter",
    startFloor: 1,
    targetDepth: 8,
    runIndex: 0,
    seriesId: "simulation-follow-smoke",
    scoringProfile: null,
    scenario: smokeScenario,
    workshop: smokeScenario.workshop
  });
}

const firstSmoke = runCanonicalSmoke();
const secondSmoke = runCanonicalSmoke();
assert.deepEqual(secondSmoke, firstSmoke, "canonical N=1 smoke is not deterministic");
assert.ok(firstSmoke.floorsTraversed > 0, "canonical smoke did not traverse beyond its entry floor");
const firing = assertRuntimeMechanismsFired(firstSmoke);
assert.throws(
  () => assertRuntimeMechanismsFired({ ...firstSmoke, floorsTraversed: 0, reachedFloor: 999 }),
  /maps\.run-floor-traversal/
);

console.log("[PASS] simulation manifest, stale-reference, and balance-impact checks");
console.log(`[PASS] canonical N=1 smoke deterministic; fired=${Object.keys(firing).join(",")}`);
console.log(`[INFO] changed balance paths=${sourceCoverage.impacts.length}; modeled=${SIMULATION_MANIFEST.canonical.smoke.modeled.join(" | ")}`);
console.log(`[INFO] omitted=${SIMULATION_MANIFEST.canonical.smoke.omitted.join(" | ")}`);
