# Issue #733 level contribution measurement

## Decision and scope

Level-up stat growth now gives the canonical class main stat `+1` at levels 3,
6, 9, ... . No direct `level` term was added to a damage or spell expression.
Initial stats, EXP thresholds, HP/MP growth, spell learning, `spellPower`,
Ninja bare-hand `weaponAtk`, and Ninja critical chance were not changed.

The depth measurement uses the real `scratch/sim_depth_material_ev.js`
run-scope path, including source level-up rewards, combat, equipment, status
cure EV, retreat, death, and material accounting. It omits no mechanism newly
needed by this change; UI/browser paths are outside scope. Default scenario
means the runner's default scenario set; the tables below identify its first
and baseline scenario explicitly as `workshop-empty` (`工房空`).

## Provenance and reproduction

- Base source SHA: `b833750b4fa071579fe6373303582105b6e9c757`
- After source SHA: `9ff5618350a28a4e789fd55767ccef799e9922ae`
- Runner: `scratch/sim_depth_material_ev.js`, Node `v26.7.0`
- Configuration: `SIM_SEED=231`, `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`,
  `SIM_PARALLEL` unset, `STATUS_CURE_POLICY=ev`; all other environment values
  were runner defaults.
- Smoke: `N=1` (`SIM_RUNS=1 SIM_CALIBRATION_RUNS=1`) passed after source and
  after commit; node checks passed for the changed modules and runner.

Exact full-run commands:

```text
env -u SIM_PARALLEL SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 STATUS_CURE_POLICY=ev SIM_RESULT_BASENAME=issue-733-before node scratch/sim_depth_material_ev.js
env -u SIM_PARALLEL SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 STATUS_CURE_POLICY=ev SIM_RESULT_BASENAME=issue-733-after-committed node scratch/sim_depth_material_ev.js
```

Each command was run twice. Exact raw stdout SHA-256:

| case | run 1 | run 2 | deterministic |
| --- | --- | --- | --- |
| before | `d48b4a8da3e7ffa699d1d99d253877dc8bf3c3eec7d7cc962714c2351da0476f` | same | yes |
| after | `62285d524cf9570c3685378ba9c972aa602ee2bc9609163760399776bb7cfe4d` | same | yes |

The exact `MP_SCARCITY_JSON=` payload line SHA-256 is:

- before: `a25f03acb5b8cad6598cfb7ade7f9a9157435e1acf829358f0f681c7020996d1`
- after: `7e538fa56bfb67dcdd6349606c1095be0eda14f30113e6c625a21a7a08f01703`

Raw stdout and payload files remain outside the repository under `/private/tmp`.

## Default `workshop-empty` depth series

`平均到達階` is the mean over all runs, denominator `N=500` for every row.

| retreat target | before mean reached floor | after mean reached floor | delta |
| --- | ---: | ---: | ---: |
| B5 | 2.67 | 2.64 | -0.03 |
| B10 | 2.72 | 2.71 | -0.01 |
| B15 | 2.82 | 2.88 | +0.06 |
| B20 | 2.93 | 2.81 | -0.12 |

At the B20 endpoint, the class rows also use all runs for their reached-floor
mean (`N=125` per class; `N=500` in aggregate):

| class | before | after | delta |
| --- | ---: | ---: | ---: |
| Fighter | 2.30 | 2.26 | -0.04 |
| Thief | 4.53 | 4.34 | -0.19 |
| Priest | 2.03 | 2.04 | +0.01 |
| Mage | 2.87 | 2.61 | -0.26 |

## B5/B10 gate denominators at B20 endpoint

`entrant` uses the full-run denominator `N=500`. Conditional breakthrough,
death, and retreat rates use only entrants to that floor, whose denominators
are shown separately.

| case | floor | entrant | entrant count / 500 | conditional denominator | breakthrough | death | retreat |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| before | B5 | 21.8% | 109/500 | 109 | 14.7% | 68.8% | 16.5% |
| before | B10 | 2.0% | 10/500 | 10 | 90.0% | 0.0% | 10.0% |
| after | B5 | 21.6% | 108/500 | 108 | 10.2% | 79.6% | 10.2% |
| after | B10 | 1.2% | 6/500 | 6 | 83.3% | 16.7% | 0.0% |

The B5/B10 conditional cells are marked uncertain by the runner at these small
entrant counts; they are not interpreted as a balance acceptance criterion.
