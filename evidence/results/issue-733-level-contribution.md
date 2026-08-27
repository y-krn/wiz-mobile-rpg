# Issue #733 level contribution measurement

## Scope and provenance

The level-up rule gives the canonical class main stat `+1` at levels 3, 6, 9,
... while preserving exactly one `rng()` consumption for each stat-growth
event. Unknown classes retain the legacy `vit` fallback and the same one-draw
consumption. The simulation uses the real `scratch/simulations/sim_depth_material_ev.js`
run path, including source level-up rewards, combat, equipment, status-cure EV,
retreat, death, and material accounting.

- Base SHA: `b833750b4fa071579fe6373303582105b6e9c757`
- Fixed SHA: `9a091b75f7874438f49bfd839cbdc9b34aef1a83`
- Runner: `scratch/simulations/sim_depth_material_ev.js`, Node `v26.7.0`
- Configuration: `SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100`,
  `SIM_PARALLEL` unset, `STATUS_CURE_POLICY=ev`; all other values are runner
  defaults, including the default seven scenarios.
- Smoke: base and fixed `N=1` runs passed.
- Full runs: each source/configuration was run twice; all four runs exited 0.
- Denominator: every scenario × target-depth cell is `N=500`; the four
  round-robin class cells are `N=125` each.

Exact reproduction command:

```text
env -u SIM_PARALLEL SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 STATUS_CURE_POLICY=ev node scratch/simulations/sim_depth_material_ev.js
```

Exact raw stdout SHA-256:

| case | run 1 | run 2 | deterministic |
| --- | --- | --- | --- |
| base | `d48b4a8da3e7ffa699d1d99d253877dc8bf3c3eec7d7cc962714c2351da0476f` | same | yes |
| fixed | `70a60cd027c14e241e7dc1c86d04425aa8d1c536004c76c9bd540493a109bc55` | same | yes |

The exact `MP_SCARCITY_JSON=` line SHA-256 is `a25f03acb5b8cad6598cfb7ade7f9a9157435e1acf829358f0f681c7020996d1`
for base and `d2e396e3a6aef46aa32eb5daafecc45e056737730f50e2712c85697fb4c648d9`
for fixed. Raw stdout remains outside the repository under `/private/tmp`.

## Default seven-scenario reached-floor series

Values are mean reached floor at each retreat target. Each cell is `base /
fixed`, with `N=500`.

| scenario | B5 | B10 | B15 | B20 |
| --- | ---: | ---: | ---: | ---: |
| workshop-empty | 2.67 / 2.67 | 2.72 / 2.73 | 2.82 / 2.88 | 2.93 / 2.91 |
| workshop-stats | 2.95 / 2.95 | 3.20 / 3.18 | 3.25 / 3.23 | 3.28 / 3.30 |
| workshop-gear | 3.15 / 3.15 | 3.57 / 3.56 | 3.73 / 3.71 | 3.87 / 3.90 |
| workshop-blood-wand | 3.16 / 3.17 | 3.62 / 3.70 | 3.76 / 3.71 | 4.14 / 4.06 |
| workshop-blood-wand-spells | 3.20 / 3.22 | 3.78 / 3.78 | 4.02 / 3.98 | 4.42 / 4.33 |
| workshop-core-pools | 3.15 / 3.17 | 3.67 / 3.69 | 3.73 / 3.72 | 4.31 / 4.35 |
| workshop-complete | 3.38 / 3.39 | 4.00 / 4.00 | 4.36 / 4.44 | 4.69 / 4.50 |

The RNG compatibility fix intentionally preserves the sequence of subsequent
random choices; the remaining level-growth difference is the deterministic
canonical main-stat increment itself. The simulation is a paired progression
measurement, not a balance acceptance claim for small conditional entrant
subsets.
