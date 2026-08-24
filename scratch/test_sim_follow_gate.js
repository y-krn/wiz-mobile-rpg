import assert from "node:assert/strict";
import {
  SIMULATION_MANIFEST,
  assertBalanceImpactCovered,
  analyzeBalanceImpact,
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
    balanceImpactNoneDiffs: [{ pattern: "src/**", marker: "// balance-impact: none", reason: "test" }]
  }),
  /balance-impact none diff path must be exact/
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
@@ -416,0 +417,5 @@
+  trackChestAction(chest, action, {
+    state,
+    character: state.party[0],
+    combat: state.combatState,
+    source: state.map?.[state.y]?.[state.x]?.event,
`;
assert.equal(isTelemetryOnlyDiff(anchoredTelemetryDiff), true);
assert.doesNotThrow(
  () => assertBalanceImpactCovered(["src/chest.js"], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([["src/chest.js", anchoredTelemetryDiff]]) }),
  "telemetry-only mapped-module diff should not require balance runtime evidence"
);
const chestStateBoundaryDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -28,0 +29,4 @@
+// balance-impact: none — chest phase and transient-state boundary only
+  trackChestAction(chest, action, { state });
+  state.chestState.phase = nextPhase;
`;
const chestStateBoundaryReport = assertBalanceImpactCovered(
  ["src/chest.js"],
  SIMULATION_MANIFEST,
  undefined,
  { diffByFile: new Map([["src/chest.js", chestStateBoundaryDiff]]) }
);
assert.deepEqual(
  chestStateBoundaryReport.impacts,
  [{ file: "src/chest.js", domains: [], balanceImpactNone: true, runtimeUnsupported: [], runtimeUnfired: [] }],
  "explicit state-boundary declaration must classify the mapped chest path as balance-impact none for this diff"
);
const saveStateBoundaryDiff = `diff --git a/src/state/save_payload.js b/src/state/save_payload.js
@@ -1,0 +2,2 @@
+// balance-impact: none — persistence boundary only
+  state.chestState = null;
`;
assert.doesNotThrow(
  () => assertBalanceImpactCovered(
    ["src/state/save_payload.js"],
    SIMULATION_MANIFEST,
    undefined,
    { diffByFile: new Map([["src/state/save_payload.js", saveStateBoundaryDiff]]) }
  ),
  "explicit persistence declaration must classify an otherwise unknown path as balance-impact none"
);
assert.throws(
  () => assertBalanceImpactCovered(
    ["src/chest.js"],
    SIMULATION_MANIFEST,
    undefined,
    { diffByFile: new Map([["src/chest.js", "diff --git a/src/chest.js b/src/chest.js\n@@ -1,0 +1,1 @@\n+  state.chestState.phase = nextPhase;\n"]]) }
  ),
  /canonical runtime evidence result is required/,
  "future chest changes without the one-off marker must retain normal balance mapping"
);
const mixedTelemetryDiff = `${anchoredTelemetryDiff}+    state.currentRun.materials.blackHorn += 1;\n`;
assert.equal(isTelemetryOnlyDiff(mixedTelemetryDiff), false);
const mixedSameLineTelemetryDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+  trackChestAction(chest, action, {}); state.currentRun.materials.blackHorn += 1;
`;
assert.equal(isTelemetryOnlyDiff(mixedSameLineTelemetryDiff), false, "a line mixing telemetry and gameplay mutation is not telemetry-only");
for (const file of ["src/telemetry.js", "src/spell_menu.js"]) {
  const validTelemetryDiff = `diff --git a/${file} b/${file}
@@ -1,0 +1,1 @@
+  trackEvent("x", { state });
`;
  assert.doesNotThrow(
    () => assertBalanceImpactCovered([file], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([[file, validTelemetryDiff]]) }),
    `${file} valid telemetry-only changes remain exempt`
  );
  const mixedDiff = `diff --git a/${file} b/${file}
@@ -1,0 +1,1 @@
+  trackEvent("x", { state }); state.currentRun.materials.blackHorn += 1;
`;
  assert.equal(isTelemetryOnlyDiff(mixedDiff), false, `${file} mixed telemetry/gameplay line is not telemetry-only`);
  assert.throws(
    () => assertBalanceImpactCovered([file], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([[file, mixedDiff]]) }),
    /telemetry anchor mixed/,
    `${file} mixed telemetry/gameplay changes are rejected before balance classification`
  );
}
for (const [label, call] of [
  ["raw state spread", 'trackEvent("x", { ...state });'],
  ["raw collection read", 'trackEvent("x", state.inventory);'],
  ["unknown member read", 'trackEvent("x", { source: state.currentRun });'],
  ["getter-capable member read", 'trackEvent("x", { source: object.value });']
]) {
  const unvalidatedArgumentDiff = `diff --git a/src/telemetry.js b/src/telemetry.js
@@ -1,0 +1,1 @@
+  ${call}
`;
  assert.equal(isTelemetryOnlyDiff(unvalidatedArgumentDiff), false, `${label} is not telemetry-only`);
}
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
for (const [label, expression] of [
  ["delete computed key", "[delete state.inventory[0]]: 1"],
  ["computed key", "[state.inventory[0]]: 1"],
  ["void expression", "value: void state.inventory[0]"],
  ["new expression", "value: new InventoryState"]
]) {
  const sideEffectingExpressionDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+  trackEvent("x", { ${expression} });
`;
  assert.equal(isTelemetryOnlyDiff(sideEffectingExpressionDiff), false, `${label} is not telemetry-only`);
}
for (const expression of ["state.inventory.splice(0, 1)", "getMutableState()", "state.inventory.push(item)"]) {
  const contextCallDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,1 @@
+  trackEvent("x", { state: ${expression} });
`;
  assert.equal(isTelemetryOnlyDiff(contextCallDiff), false, `context value ${expression} is not telemetry-only`);
}
for (const [label, key, expression] of [
  ["multiline getter-capable member read", "character", "object.value"],
  ["multiline collection read", "state", "state.inventory"],
  ["multiline indexed collection read", "state", "state.inventory[0]"],
  ["multiline party collection read", "character", "state.party"]
]) {
  const multilineContextDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,3 @@
+  trackEvent("x", {
+    ${key}: ${expression},
+  });
`;
  assert.equal(isTelemetryOnlyDiff(multilineContextDiff), false, `${label} is not telemetry-only`);
}
for (const expression of [
  "state.combatState",
  "state.party[0]",
  "state.party[equipState.actorIdx]",
  "state.map?.[state.y]?.[state.x]?.event",
  "preview?.oldEq"
]) {
  const safeContextDiff = `diff --git a/src/chest.js b/src/chest.js
@@ -416,0 +417,3 @@
+  trackEvent("x", {
+    state: ${expression},
+  });
`;
  assert.equal(isTelemetryOnlyDiff(safeContextDiff), true, `${expression} remains telemetry-only`);
}
assert.throws(
  () => assertBalanceImpactCovered(["src/chest.js"], SIMULATION_MANIFEST, undefined, { diffByFile: new Map([["src/chest.js", mixedTelemetryDiff]]) }),
  /telemetry anchor mixed/
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
for (const file of ["src/telemetry.js", "src/spell_menu.js"]) {
  const mixedRuntimeDiff = `diff --git a/${file} b/${file}
@@ -1,0 +1,1 @@
+  trackEvent("x", { state }); state.currentRun.materials.blackHorn += 1;
`;
  assert.throws(
    () => assertBalanceImpactCovered([file], SIMULATION_MANIFEST, firstSmoke, { diffByFile: new Map([[file, mixedRuntimeDiff]]) }),
    /telemetry anchor mixed/,
    `${file} mixed changes are rejected even when runtime coverage exists`
  );
}
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
assert.doesNotThrow(
  () => {
    const summaryImpactReport = assertBalanceImpactCovered(
      ["src/combat_ui/spell_summary.js"],
      SIMULATION_MANIFEST,
      undefined,
      { diffByFile: new Map([["src/combat_ui/spell_summary.js", "summary-only UI copy change"]]) }
    );
    assert.deepEqual(summaryImpactReport.impacts, [], "summary-only UI changes must remain exempt");
  },
  "summary-only UI changes remain balance-impact none"
);
const spellMenuImpactReport = assertBalanceImpactCovered(
  ["src/combat_ui/spell_menu.js"],
  SIMULATION_MANIFEST,
  firstSmoke,
  { diffByFile: new Map([["src/combat_ui/spell_menu.js", "target availability logic change"]]) }
);
assert.deepEqual(
  spellMenuImpactReport.impacts,
  [{ file: "src/combat_ui/spell_menu.js", domains: ["combat"], uncovered: [], runtimeUnsupported: [], runtimeUnfired: [] }],
  "target-availability changes must remain balance-impact covered"
);
const finalDiffReport = analyzeBalanceImpact(
  currentChangedFiles({ baseRef: process.env.BASE_REF || "origin/main" }),
  SIMULATION_MANIFEST,
  firstSmoke,
  { baseRef: process.env.BASE_REF || "origin/main" }
);
assert.deepEqual(
  finalDiffReport.errors,
  [],
  `actual final diff balance-impact gate failed: ${finalDiffReport.errors.join("; ")}`
);
assert.throws(
  () => assertRuntimeMechanismsFired({ ...firstSmoke, floorsTraversed: 0, reachedFloor: 999 }),
  /maps\.run-floor-traversal/
);

console.log("[PASS] simulation manifest, stale-reference, and balance-impact checks");
console.log(`[PASS] canonical N=1 smoke deterministic; fired=${Object.keys(firing).join(",")}`);
console.log(`[INFO] modeled=${SIMULATION_MANIFEST.canonical.smoke.modeled.join(" | ")}`);
console.log(`[INFO] omitted=${SIMULATION_MANIFEST.canonical.smoke.omitted.join(" | ")}`);
