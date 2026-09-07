import assert from "node:assert/strict";

process.env.SIM_RUNS = "6";
process.env.SIM_CALIBRATION_RUNS = "1";
process.env.SIM_SEED = "843";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const { runCalibratedDepthSimulationTask } =
  await import("../../simulations/sim_depth_material_ev.js");
const { BUILD_FIXTURE_IDS, createBuildFixture } =
  await import("../../measurements/build_fixtures.js");
const { resolveBuildSnapshot } = await import("../../../src/rules/build_snapshot.js");

for (const scenarioId of ["workshop-empty", "workshop-complete"]) {
  const task = runCalibratedDepthSimulationTask({
    kind: "scenario",
    scenarioId,
    identificationPolicyId: "powder",
    runCount: 1
  }, {});

  let observedEndingPivot = false;
  for (const result of task.results) {
    for (const fixtureId of BUILD_FIXTURE_IDS) {
      const expected = resolveBuildSnapshot(createBuildFixture(fixtureId));
      assert.deepEqual(
        result.startingBuildSnapshotsByFixtureId?.[fixtureId],
        expected,
        `${scenarioId}/B${result.targetDepth}/${fixtureId} starting fixture snapshot`
      );

      const ending = result.endingBuildSnapshotDistributionByFixtureId?.[fixtureId];
      assert.equal(ending?.runs, 1, `${scenarioId}/B${result.targetDepth}/${fixtureId} ending N`);
      assert.equal(
        Object.values(ending.byIdentity || {}).reduce((sum, entry) => sum + entry.count, 0),
        1,
        `${scenarioId}/B${result.targetDepth}/${fixtureId} ending identity counts`
      );
      if (!Object.hasOwn(ending.byIdentity, expected.identity)) observedEndingPivot = true;
      assert.equal(
        Object.hasOwn(result, "buildSnapshotsByFixtureId"),
        false,
        `${scenarioId}/B${result.targetDepth} must not expose ambiguous fixture snapshots`
      );
    }
  }
  if (scenarioId === "workshop-complete") {
    assert.equal(observedEndingPivot, true, "workshop-complete should expose a real ending Build Snapshot pivot");
  }
}

console.log("[PASS] workshop scenarios preserve starting fixture identity and aggregate ending Build Snapshots");
