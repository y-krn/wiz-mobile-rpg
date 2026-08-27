# Scratch ownership

`scratch/` contains executable development verification assets. Every
executable belongs to exactly one owner directory:

| Directory | Ownership | Naming | Lifecycle |
| --- | --- | --- | --- |
| `tests/` | unit/regression suite entrypoint | `run_tests.js` | active; invoked by npm scripts |
| `tests/unit/` | deterministic source-level contracts | `test_<spec>.js` | active; run by `npm run test:unit` |
| `tests/regression/` | boundary, historical regression, runner, and preflight contracts | `test_<spec>.js` | active; run by `npm run test:unit` |
| `simulations/` | balance, progression, formula, map, and simulation infrastructure | `sim_<subject>.js`; infra may use an explicit descriptive name | canonical or historical; never auto-run by the unit runner |
| `measurements/` | statistical measurement, comparison, provenance, and measurement reports | `<verb>_<subject>.js` or `measurement_<subject>.js` | explicit command or CI workflow only |
| `benchmarks/` | performance probes | `bench_<subject>.js` | explicit command only |

Historical summaries, raw-result references, fixtures, and images belong in
`evidence/` (with generated/raw outputs under `evidence/results/`). Evidence is
preserved for provenance and is not executable test input.

Migration inventory (2026-08-27): 98 unit tests, 40 regression tests, 31
simulation runners plus 2 simulation-infrastructure files, 14 measurement
tools, and 2 benchmarks. All 130 evidence files were moved without deletion.
The ownership test enumerates these directories, so additions must either
follow the matching naming rule or fail CI.

The test runner discovers only `tests/unit/test_*.js` and
`tests/regression/test_*.js`. Directory ownership, filename rules, the absence
of Issue-numbered permanent test names, and the evidence directories are
checked by `tests/regression/test_scratch_ownership.js`.

Issue-specific tests that remain valuable are named for the contract they
protect. They are regression tests, not temporary Issue attachments:

| Former name | Permanent name |
| --- | --- |
| `test_issue718_trap_eater.js` | `test_trap_eater.js` |
| `test_issue732_damage_metrics.js` | `test_damage_metrics.js` |
| `test_issue733_level_contribution.js` | `test_level_contribution.js` |
| `test_issue737_damage_audit.js` | `test_damage_estimate_audit.js` |
| `test_issue_412_tactical_consumables.js` | `test_tactical_consumables.js` |
| `test_issue_453_map_generation.js` | `test_run_map_determinism.js` |
| `test_issue_454_measurement_utils.js` | `test_measurement_pairing.js` |
| `test_issue_457_map_sharing.js` | `test_map_sharing.js` |
| `test_issue_508_heal_unit_density.js` | `test_heal_unit_density.js` |
| `test_issue_512_blind_loop.js` | `test_trap_blind_loop.js` |
| `test_issue_648_mana_potion_measurement.js` | `test_mana_potion_measurement.js` |
| `test_issue_679_affix_inventory.js` | `test_affix_inventory.js` |
| `test_issue_705_biome_depth.js` | `test_biome_depth.js` |
| `test_issue_706_enemy_pools.js` | `test_enemy_pools.js` |
| `test_issue_793_measurement.js` | `test_bleeding_measurement_provenance.js` |
| `test_issue_799_undefined_state.js` | `test_undefined_state_recovery.js` |
| `test_issue_800_undefined_map_state.js` | `test_undefined_map_state_recovery.js` |
| `test_issue_815_biome_geometry.js` | `test_biome_geometry.js` |
| `test_issue_824_preflight.js` | `test_simulation_preflight.js` |
| `test_issue_831_landmark_styles.js` | `test_landmark_styles.js` |
| `test_issue_850_preflight.js` | `test_dependency_preflight_missing_package.js` |
| `test_issue_854_preflight.js` | `test_dependency_preflight_lockfile.js` |
| `test_issue_895_milestone_route.js` | `test_milestone_route.js` |
| `test_issue_914_diagnostics.js` | `test_balance_exit_diagnostics.js` |
| `test_sim_issue_894_paths.js` | `test_sim_path_determinism.js` |
| `test_sim_issue_896_equipment_craft.js` | `test_sim_equipment_craft.js` |

Simulation lifecycle remains explicit in `simulations/simulation_manifest.js`:
the production-backed `sim_depth_material_ev.js` is canonical, while the
Issue-specific runners remain historical unless deliberately promoted. This
preserves #672 stale-simulation handling and does not turn historical scripts
into CI measurements.

No executable was retired in this migration. Existing historical evidence and
provenance fixtures were moved, not deleted; no production behavior, save
schema, or balance rule changed.
