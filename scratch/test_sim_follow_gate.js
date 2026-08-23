import assert from "node:assert/strict";
import {
  SIMULATION_MANIFEST,
  assertBalanceImpactCovered,
  assertRuntimeMechanismsFired,
  assertValidSimulationManifest,
  currentChangedFiles,
  discoverSimulationRunnerFiles,
  EXECUTABLE_MEASUREMENT_RUNNERS,
  evaluateRuntimeMechanisms,
  evaluateRuntimeDomainCoverage,
  isTelemetryOnlyDiff,
  isExecutableMeasurementRunner,
  inspectSimulationMetadata,
  SIMULATION_RUNNER_INVENTORY,
  scanStaleSimulationReferences,
  validateSimulationManifest
} from "./simulation_manifest.js";

assert.doesNotThrow(() => assertValidSimulationManifest());
assert.equal(Object.hasOwn(SIMULATION_MANIFEST.canonical.runtimeCoverage, "status"), false);
assert.equal(Object.hasOwn(SIMULATION_MANIFEST.canonical.runtimeCoverage, "merchant"), false);
assert.match(
  SIMULATION_MANIFEST.canonical.smoke.omitted.join(" | "),
  /status-effect application/
);
assert.match(
  SIMULATION_MANIFEST.canonical.smoke.omitted.join(" | "),
  /merchant purchase policy/
);
const balanceDomainsFor = file => SIMULATION_MANIFEST.balanceImpactPaths.find(rule => rule.pattern === file)?.domains;
assert.deepEqual(balanceDomainsFor("src/combat_logic/auto_action.js"), ["combat", "recovery"]);
assert.deepEqual(balanceDomainsFor("src/combat_logic/item_resolution.js"), ["combat", "status", "recovery"]);
assert.deepEqual(balanceDomainsFor("src/data.js"), ["combat", "equipment", "maps", "progression", "status", "recovery"]);
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
    telemetryOnlyPaths: ["src/**"]
  }),
  /telemetry-only path must be exact/
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
assert.throws(
  () => assertBalanceImpactCovered(["src/rules/status_effect_rules.js"]),
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
const telemetryOnlyDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,3 @@
+    state,
+    character: state.party[0],
+    combat: state.combatState,
`;
assert.equal(isTelemetryOnlyDiff(telemetryOnlyDiff), false, "context-only hunks require an existing telemetry anchor");
const anchoredTelemetryDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,4 @@
+  trackChestAction(chest, action, {
+    state,
+    character: state.party[0],
+    combat: state.combatState,
`;
assert.equal(isTelemetryOnlyDiff(anchoredTelemetryDiff), true);
assert.doesNotThrow(
  () => assertBalanceImpactCovered(["src/chest.js"], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([["src/chest.js", anchoredTelemetryDiff]]) }),
  "telemetry-only mapped-module diff should not require balance runtime evidence"
);
const mixedTelemetryDiff = `${anchoredTelemetryDiff}+    state.currentRun.materials.blackHorn += 1;\n`;
assert.equal(isTelemetryOnlyDiff(mixedTelemetryDiff), false);
const mixedSameLineTelemetryDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+  trackChestAction(chest, action, {}); state.currentRun.materials.blackHorn += 1;
`;
assert.equal(isTelemetryOnlyDiff(mixedSameLineTelemetryDiff), false, "a line mixing telemetry and gameplay mutation is not telemetry-only");
const mutationInTelemetryArgumentsDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+  trackChestAction(chest, action, { state.currentRun.materials.blackHorn += 1 });
`;
assert.equal(isTelemetryOnlyDiff(mutationInTelemetryArgumentsDiff), false, "telemetry-call arguments containing mutation are not telemetry-only");
const mutationAfterContextPrefixDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+    state, state.currentRun.materials.blackHorn += 1;
`;
assert.equal(isTelemetryOnlyDiff(mutationAfterContextPrefixDiff), false, "context-prefix lines containing mutation are not telemetry-only");
for (const [label, expression] of [
  ["splice", "state.inventory.splice(0, 1)"],
  ["push", "state.inventory.push(item)"],
  ["pop", "state.inventory.pop()"],
  ["helper", "removeInventoryItem(state.inventory)"],
  ["member helper", "state.inventory.removeItem()"]
]) {
  const mutatingCallDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+  trackChestAction(chest, action, { inventory: ${expression} });
`;
  assert.equal(isTelemetryOnlyDiff(mutatingCallDiff), false, `nested ${label} call is not telemetry-only`);
}
assert.throws(
  () => assertBalanceImpactCovered(["src/chest.js"], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([["src/chest.js", mixedTelemetryDiff]]) }),
  /no declared runtime evidence: economy/
);
assert.throws(
  () => assertBalanceImpactCovered(["src/unknown_telemetry.js"], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([["src/unknown_telemetry.js", anchoredTelemetryDiff]]) }),
  /unknown production path/
);
assert.doesNotThrow(
  () => assertBalanceImpactCovered(["src/combat_ui/action_selection.js"], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([["src/combat_ui/action_selection.js", anchoredTelemetryDiff]]) }),
  "known telemetry caller path should use the conservative diff-aware exemption"
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
const smokeScenario = {
  ...getScenarioById("workshop-empty"),
  departureCraftMeasurement: true
};

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
assert.equal(domainFiring.equipment.fired, true, "equipment call-level runtime domain did not fire");
assert.equal(domainFiring.chests.fired, true, "chest call-level runtime domain did not fire");
assert.equal(domainFiring.traps.fired, true, "trap call-level runtime domain did not fire");
assert.equal(domainFiring.recovery.fired, true, "recovery runtime domain did not fire");
assert.equal(firing["equipment.generation"].callLevelFired, true);
assert.equal(firing["equipment.generation"].valueFired, true);
assert.equal(firing["chests.open"].callLevelFired, true);
assert.equal(firing["recovery.combat-policy"].callLevelFired, true);
assert.equal(firing["traps.chest-roll"].callLevelFired, true);
const disconnectedEquipment = {
  ...firstSmoke,
  runtimeCalls: {
    ...firstSmoke.runtimeCalls,
    equipment: { ...firstSmoke.runtimeCalls.equipment, generate: 0 }
  }
};
const disconnectedEquipmentFiring = evaluateRuntimeMechanisms(disconnectedEquipment);
assert.equal(disconnectedEquipmentFiring["equipment.generation"].valueFired, true);
assert.equal(disconnectedEquipmentFiring["equipment.generation"].callLevelFired, false);
assert.equal(disconnectedEquipmentFiring["equipment.generation"].fired, false);
assert.throws(
  () => assertRuntimeMechanismsFired(disconnectedEquipment),
  /equipment\.generation/,
  "positive result values must not mask a disconnected production call"
);
assert.doesNotThrow(() => assertBalanceImpactCovered(["src/combat.js"], SIMULATION_MANIFEST, firstSmoke));
assert.doesNotThrow(
  () => assertBalanceImpactCovered(["src/rules/recovery_rules.js"], SIMULATION_MANIFEST, firstSmoke),
  "pure recovery rule changes should use recovery evidence only"
);
assert.doesNotThrow(
  () => assertBalanceImpactCovered(["src/combat_logic/auto_action.js"], SIMULATION_MANIFEST, firstSmoke),
  "auto-action combat and recovery mapping should use fired evidence"
);
assert.throws(
  () => assertBalanceImpactCovered(["src/combat_logic/item_resolution.js"], SIMULATION_MANIFEST, firstSmoke),
  /no declared runtime evidence: status/
);
assert.throws(
  () => assertBalanceImpactCovered(["src/data.js"], SIMULATION_MANIFEST, firstSmoke),
  /no declared runtime evidence: status/
);
const declaredUnsupportedManifest = {
  ...SIMULATION_MANIFEST,
  balanceImpactPaths: [{ pattern: "src/rules/status_effect_rules.js", domains: ["status"] }]
};
assert.throws(
  () => assertBalanceImpactCovered(["src/rules/status_effect_rules.js"], declaredUnsupportedManifest, firstSmoke),
  /no declared runtime evidence: status/
);
assert.throws(
  () => assertBalanceImpactCovered(["src/combat.js"], SIMULATION_MANIFEST, { ...firstSmoke, combatRounds: 0 }),
  /declared runtime evidence did not fire: combat/
);
assert.throws(
  () => assertBalanceImpactCovered(["src/rules/status_effect_rules.js"], SIMULATION_MANIFEST, firstSmoke),
  /unknown production path/
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
