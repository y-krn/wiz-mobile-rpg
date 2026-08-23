import assert from "node:assert/strict";
import {
  SIMULATION_MANIFEST,
  assertBalanceImpactCovered,
  assertRuntimeMechanismsFired,
  assertValidSimulationManifest,
  currentChangedFiles,
  discoverSimulationRunnerFiles,
  EXECUTABLE_MEASUREMENT_RUNNERS,
  evaluateRuntimeDomainCoverage,
  isExecutableMeasurementRunner,
  inspectSimulationMetadata,
  SIMULATION_RUNNER_INVENTORY,
  scanStaleSimulationReferences,
  validateSimulationManifest
} from "./simulation_manifest.js";

assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(validateSimulationManifest({
  ...SIMULATION_MANIFEST,
  canonical: { ...SIMULATION_MANIFEST.canonical, modelDomains: [] }
}).includes("canonical model coverage is missing"));
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
assert.throws(
  () => assertValidSimulationManifest({
    ...SIMULATION_MANIFEST,
    runnerLifecycleRules: [
      { pattern: SIMULATION_MANIFEST.canonical.path, lifecycle: "canonical", scope: "run" },
      { pattern: "scratch/sim_issue_*.js", lifecycle: "historical", scope: "run" }
    ]
  }),
  /must be explicit/
);
assert.throws(
  () => assertValidSimulationManifest({
    ...SIMULATION_MANIFEST,
    canonical: {
      ...SIMULATION_MANIFEST.canonical,
      runtimeCoverage: { ...SIMULATION_MANIFEST.canonical.runtimeCoverage, combat: ["missing-mechanism"] }
    }
  }),
  /references unknown mechanism/
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
assert.throws(
  () => assertBalanceImpactCovered(["src/new_balance_rule.js"]),
  /unknown production path/
);
const narrowCoverageManifest = {
  ...SIMULATION_MANIFEST,
  canonical: { ...SIMULATION_MANIFEST.canonical, modelDomains: ["combat"] },
  balanceImpactPaths: [{ pattern: "src/rules/status_effect_rules.js", domains: ["status"] }]
};
assert.throws(
  () => assertBalanceImpactCovered(["src/rules/status_effect_rules.js"], narrowCoverageManifest),
  /not covered by canonical model/
);

const discoveredRunners = discoverSimulationRunnerFiles();
assert.deepEqual(
  EXECUTABLE_MEASUREMENT_RUNNERS.filter(file => !discoveredRunners.includes(file)),
  [],
  `executable measurement runners omitted: ${discoveredRunners.join(", ")}`
);
assert.deepEqual(
  discoveredRunners.slice().sort(),
  SIMULATION_RUNNER_INVENTORY.map(runner => runner.path).sort(),
  "runner discovery and explicit inventory diverged"
);
assert.equal(SIMULATION_RUNNER_INVENTORY.length, 34, "unexpected current runner inventory size");
assert.ok(discoveredRunners.includes("scratch/sim_depth_material_ev.js"));
assert.equal(
  SIMULATION_RUNNER_INVENTORY.filter(runner => runner.lifecycle === "canonical").length,
  1,
  "runner inventory must have exactly one canonical runner"
);
assert.equal(
  isExecutableMeasurementRunner(
    "scratch/issue999_new_runner.js",
    "// sim-scope: run\nconst SIM_RUNS = 1; function main() {} main();"
  ),
  true
);
assert.equal(
  inspectSimulationMetadata({
    files: ["scratch/issue999_new_runner.js"],
    sourceByPath: new Map([["scratch/issue999_new_runner.js", "// sim-scope: run\nconst SIM_RUNS = 1; function main() {} main();"]])
  }).some(error => error.includes("lifecycle metadata")),
  true,
  "new executable runner was silently accepted without inventory metadata"
);
assert.equal(
  inspectSimulationMetadata({
    files: ["scratch/sim_issue_999.js"],
    sourceByPath: new Map([["scratch/sim_issue_999.js", "// sim-scope: run\n"]])
  }).some(error => error.includes("lifecycle metadata")),
  true,
  "new Issue runner was silently accepted by lifecycle metadata"
);
const metadataErrors = inspectSimulationMetadata();
assert.deepEqual(metadataErrors, [], metadataErrors.join("\n"));
const staleReferences = scanStaleSimulationReferences();
assert.deepEqual(staleReferences, [], JSON.stringify(staleReferences));

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
const domainFiring = evaluateRuntimeDomainCoverage(firstSmoke);
assert.equal(domainFiring.combat.fired, true, "combat runtime domain did not fire");
assert.doesNotThrow(() => assertBalanceImpactCovered(["src/combat.js"], SIMULATION_MANIFEST, firstSmoke));
assert.throws(
  () => assertBalanceImpactCovered(["src/combat.js"], SIMULATION_MANIFEST, { ...firstSmoke, combatRounds: 0 }),
  /declared runtime evidence did not fire: combat/
);
assert.throws(
  () => assertBalanceImpactCovered(["src/rules/status_effect_rules.js"], SIMULATION_MANIFEST, firstSmoke),
  /no declared runtime evidence: status/
);
const sourceCoverage = assertBalanceImpactCovered(currentChangedFiles(), SIMULATION_MANIFEST, firstSmoke);
assert.throws(
  () => assertRuntimeMechanismsFired({ ...firstSmoke, floorsTraversed: 0, reachedFloor: 999 }),
  /maps\.run-floor-traversal/
);

console.log("[PASS] simulation manifest, stale-reference, and balance-impact checks");
console.log(`[PASS] canonical N=1 smoke deterministic; fired=${Object.keys(firing).join(",")}`);
console.log(`[INFO] changed balance paths=${sourceCoverage.impacts.length}; modeled=${SIMULATION_MANIFEST.canonical.smoke.modeled.join(" | ")}`);
console.log(`[INFO] omitted=${SIMULATION_MANIFEST.canonical.smoke.omitted.join(" | ")}`);
