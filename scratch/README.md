# Scratch ownership

`scratch/` contains executable development investigation assets, not test suites.
Every executable belongs to exactly one owner directory:

| Directory | Ownership | Naming | Lifecycle |
| --- | --- | --- | --- |
| `simulations/` | balance, progression, formula, map, and simulation infrastructure | `sim_<subject>.js`; infra may use an explicit descriptive name | canonical or historical; never auto-run by the unit runner |
| `measurements/` | statistical measurement, comparison, provenance, and measurement reports | `<verb>_<subject>.js` or `measurement_<subject>.js` | explicit command or CI workflow only |
| `benchmarks/` | performance probes | `bench_<subject>.js` | explicit command only |

All executable tests live under repository-level `tests/`; see `tests/README.md`.
Historical summaries, raw-result references, fixtures, and images belong in
`evidence/` (with generated/raw outputs under `evidence/results/`). Evidence is
preserved for provenance and is not executable test input.

Simulation lifecycle remains explicit in `simulations/simulation_manifest.js`:
the production-backed `sim_depth_material_ev.js` is canonical, while
Issue-specific runners remain historical unless deliberately promoted. This
preserves the existing stale-simulation handling and does not turn historical
scripts into CI measurements.

The ownership regression at `tests/node/regression/test_scratch_ownership.js`
enforces that `scratch/` contains only `benchmarks/`, `measurements/`, and
`simulations/`; `tests/node/` must not be recreated.
