# Scratch ownership

`scratch/` contains executable development investigation assets, not test suites.
Every executable belongs to exactly one owner directory:

| Directory | Ownership | Naming | Lifecycle |
| --- | --- | --- | --- |
| `simulations/` | balance, progression, formula, map, and simulation infrastructure | `sim_<subject>.js`; infra may use an explicit descriptive name | canonical, reusable, or grandfathered historical; never auto-run by the unit runner |
| `measurements/` | statistical measurement, comparison, provenance, and measurement reports | `<verb>_<subject>.js` or `measurement_<subject>.js` | reusable infrastructure or explicit one-off command |
| `benchmarks/` | performance probes | `bench_<subject>.js` | explicit command only |

All executable tests live under repository-level `tests/`; see `tests/README.md`.
Historical summaries, raw-result references, fixtures, and images belong in
`evidence/` (with generated/raw outputs under `evidence/results/`). Evidence is
preserved for provenance and is not executable test input.

Simulation lifecycle is explicit in `simulations/simulation_manifest.js`.
The production-backed `sim_depth_material_ev.js` is canonical. Runners and
helpers that remain part of current regression or measurement infrastructure are
named for their behavior and use the `reusable` lifecycle, including `infra`
dependencies used by a canonical or reusable runner. `historical` is reserved
for runners retained only as historical evidence and no longer used by current
simulation or measurement infrastructure. Existing generic historical runners
may remain until separately retired.

Issue-specific one-off runners are temporary branch assets: before merge they
must either be deleted after their evidence is recorded or promoted to an
Issue-independent semantic name. Permanent files under `scratch/` must not use
Issue-numbered names or numeric Issue suffixes.

The ownership regression at `tests/node/regression/test_scratch_ownership.js`
enforces these directory and naming boundaries.
