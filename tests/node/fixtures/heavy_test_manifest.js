const unit = file => `tests/node/unit/${file}`;
const regression = file => `tests/node/regression/${file}`;

const entry = (file, ownership, category, dependencies = [], shardCount = 1) => ({
  file,
  ownership,
  category,
  dependencies,
  shardCount,
});

// Canonical #1421 ownership matrix. Gate wiring is defined by each ownership runner.
export const HEAVY_TEST_MANIFEST = [
  entry(unit('test_stairs_min_distance.js'), 'PR_CONDITIONAL', 'map', [], 4),
  entry(unit('test_heal_priority_policy.js'), 'PR_CONDITIONAL', 'simulation', [
    { path: 'scratch/simulations/simulation_manifest.js', kind: 'manifest', reason: 'simulation registry is an external contract' },
  ]),
  entry(unit('test_reachability_loop.js'), 'PR_CONDITIONAL', 'map', [], 4),
  entry(regression('test_cli_tsx_entrypoints.js'), 'PR_CONDITIONAL', 'tooling', [
    { path: 'package.json', kind: 'repository', reason: 'npm scripts are read and executed' },
    { path: 'scratch/simulations/sim_depth_material_ev.js', kind: 'child-process', reason: 'depth simulation is an npm entrypoint' },
    { path: 'scratch/measurements/measure_balance.js', kind: 'child-process', reason: 'balance measurement is an npm entrypoint' },
    { path: 'package-lock.json', kind: 'repository', reason: 'npm dependency graph backs the CLI' },
    { path: '.github/workflows/balance-measurement.yml', kind: 'workflow', reason: 'workflow entrypoints are part of the CLI contract' },
    { path: '.github/CODEOWNERS', kind: 'repository', reason: 'workflow-owned tooling contract' },
  ]),
  entry(unit('test_shared_wall_corridors.js'), 'PR_CONDITIONAL', 'map', [], 3),
  entry(unit('test_terrain_structures.js'), 'PR_CONDITIONAL', 'map'),
  entry(unit('test_evidence_storage_policy.js'), 'PR_CONDITIONAL', 'fixture-policy', [
    { path: '.agents/evidence-storage-policy.json', kind: 'policy', reason: 'policy document loaded with fs' },
    { path: '.agents/evidence-storage-policy.schema.json', kind: 'policy', reason: 'policy schema loaded with fs' },
  ]),
  entry(unit('test_camp_waypoints.js'), 'PR_CONDITIONAL', 'map'),
  entry(unit('test_return_wing_special_reward.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_maze_diversity.js'), 'PR_CONDITIONAL', 'map'),
  entry(unit('test_room_generation.js'), 'PR_CONDITIONAL', 'map'),
  entry(unit('test_chest_relief.js'), 'PR_CONDITIONAL', 'map'),
  entry(unit('test_roaming_elites.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_chest_count.js'), 'PR_CONDITIONAL', 'map'),
  entry(regression('test_sim_follow_gate.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(regression('test_sim_equipment_craft.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(regression('test_undefined_state_recovery.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_save.js'), 'PR_CONDITIONAL', 'save'),
  entry(regression('test_milestone_route.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_floor_trials.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_map_reachability.js'), 'PR_CONDITIONAL', 'map'),
  entry(regression('test_biome_depth.js'), 'PR_CONDITIONAL', 'map'),
  entry(regression('test_pareto_safe_policy.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_css_lint.js'), 'PR_CONDITIONAL', 'tooling'),
  entry(unit('test_submenu_resume.js'), 'PR_CONDITIONAL', 'ui'),
  entry(regression('test_sim_path_determinism.js'), 'PR_CONDITIONAL', 'simulation'),
  entry(unit('test_loot.js'), 'PR_CONDITIONAL', 'simulation'),

  entry(regression('test_observability_after_stairs.js'), 'MAIN_PUSH', 'simulation'),
  entry(regression('test_first_band_build_formation.js'), 'MAIN_PUSH', 'measurement', [
    { path: 'scratch/measurements/measurement_manifest.js', kind: 'manifest', reason: 'measurement registry is an external contract' },
  ]),
  entry(regression('test_first_band_levelup_recovery.js'), 'MAIN_PUSH', 'measurement'),
  entry(regression('test_first_band_transition_recovery.js'), 'MAIN_PUSH', 'measurement'),
  entry(regression('test_starting_kit_diagnostic.js'), 'MAIN_PUSH', 'measurement'),
  entry(regression('test_run_difficulty_measurement.js'), 'MAIN_PUSH', 'measurement'),

  entry(unit('test_explore_spell_usage.js'), 'SCHEDULED', 'simulation'),
  entry(regression('test_early_run_attrition_trajectory.js'), 'SCHEDULED', 'measurement'),
  entry(regression('test_fixture_snapshot_measurement.js'), 'SCHEDULED', 'fixture'),
  entry(regression('test_run_difficulty_policy_sensitivity.js'), 'SCHEDULED', 'simulation'),
  entry(regression('test_first_band_arcana_mp_supply.js'), 'SCHEDULED', 'measurement'),
  entry(regression('test_survival_policy_comparison.js'), 'SCHEDULED', 'simulation'),

  entry(regression('test_early_b1f_composition_diagnostic.js'), 'MANUAL_MEASUREMENT', 'measurement'),
  entry(regression('test_preparation_power_factorial.js'), 'MANUAL_MEASUREMENT', 'measurement'),
  entry(regression('test_b5_guardian_flee_ev_diagnostic.js'), 'MANUAL_MEASUREMENT', 'measurement'),
  entry(regression('test_first_kill_window_diagnostic.js'), 'MANUAL_MEASUREMENT', 'measurement'),
  entry(unit('test_build_sensitivity.js'), 'MANUAL_MEASUREMENT', 'measurement'),
  entry(regression('test_reached_run_measurement.js'), 'MANUAL_MEASUREMENT', 'measurement'),
  entry(regression('test_standard_class_axis.js'), 'MANUAL_MEASUREMENT', 'measurement'),
];

export const MAIN_PUSH_MANIFEST = HEAVY_TEST_MANIFEST.filter(
  entry => entry.ownership === 'MAIN_PUSH',
);

export const HEAVY_TEST_COUNT = 46;
export const SCHEDULED_MANIFEST = HEAVY_TEST_MANIFEST.filter(
  entry => entry.ownership === 'SCHEDULED',
);
export const MANUAL_MEASUREMENT_MANIFEST = HEAVY_TEST_MANIFEST.filter(
  entry => entry.ownership === 'MANUAL_MEASUREMENT',
);
export const HEAVY_TEST_OWNERSHIP_COUNTS = {
  PR_CONDITIONAL: 27,
  MAIN_PUSH: 6,
  SCHEDULED: 6,
  MANUAL_MEASUREMENT: 7,
};
