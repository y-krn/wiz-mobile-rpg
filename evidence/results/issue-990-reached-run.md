# Issue #990 actual reached-run progression measurement

- runner: `issue990-reached-run-v1`
- source commit: `c3166dc7c64e49d6a41dd236b21801fdfe38a46a`
- production baseline SHA: `f01a08733cc81998e522fa9d1c1cdd8f3714bf2b`
- started runs/build: **N=500**
- depth: B1-B30

## Scope and validity

The run uses production `generateRunFloor`, production encounter chance, production `generateEncounter`, and production combat resolution. Four builds share each run seed, generated floor, route, trigger stream, and encounter identity. Only the build's survival path determines which later encounters it can experience.

Loot/equipment decisions, manual inventory, retreats, roaming AI, traps, and midboss cells are omitted and explicitly recorded in JSON. No production constants were changed.

## Survivor-bias split

`startedRuns`, `reachedDepth`, `deathDepthDistribution`, and `encountersExperienced` are separate. The reached-run views below are conditional populations; a deep encounter being overrepresented there does not prove that its build is intrinsically stronger against that encounter.

| Build | Started | Reached B30 | Deaths at B30 | Encounters experienced | Actions/round | Pure raw among B21+ reached runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | 500 | 0.00% | 0 | 8543 | 1.53 | n/a (unobserved) |
| single-efficient | 500 | 0.00% | 0 | 10605 | 1.52 | n/a (unobserved) |
| sustain | 500 | 0.00% | 0 | 11527 | 1.52 | n/a (unobserved) |
| hybrid-fallback | 500 | 0.00% | 0 | 11799 | 1.51 | n/a (unobserved) |

## Build reach and death depth

The JSON contains B1-B30 reach/death counts and Wilson intervals. Death depth is the depth where the terminating encounter occurred; a run dying on B30 has reached B30.

| Build | B5 reach | B10 reach | B15 reach | B20 reach | B21+ reach | B30 reach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst | 94.40% | 10.80% | 0.00% | 0.00% | 0.00% | 0.00% |
| single-efficient | 97.60% | 23.40% | 0.60% | 0.00% | 0.00% | 0.00% |
| sustain | 99.80% | 38.80% | 0.20% | 0.00% | 0.00% | 0.00% |
| hybrid-fallback | 100.00% | 44.00% | 5.60% | 0.00% | 0.00% | 0.00% |

## Actual reached-run encounter metrics

Each target-depth population includes only runs with `reachedDepth >= target`; its encounters are limited to floors through that target. This is intentionally not a global full-run frequency.

| Build | Target population | Encounter N | Family/enemy-count slices | Normal hit | Normal hits | Total normal damage | HP before→after | MP before→after | Rounds | Enemy actions |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| aoe-burst | B5 reached | 6551 | see JSON | 1.73 | 1.71 | 3.10 | 0.99→0.94 | 0.61→0.54 | 2.35 | 3.82 |
| aoe-burst | B10 reached | 1189 | see JSON | 2.11 | 1.67 | 3.69 | 0.98→0.93 | 0.52→0.46 | 2.21 | 3.54 |
| aoe-burst | B15 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| aoe-burst | B20 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| aoe-burst | B21 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| aoe-burst | B25 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| aoe-burst | B30 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| single-efficient | B5 reached | 7086 | see JSON | 2.12 | 1.42 | 2.98 | 0.99→0.96 | 0.69→0.64 | 2.04 | 3.31 |
| single-efficient | B10 reached | 2757 | see JSON | 2.48 | 1.53 | 3.82 | 0.98→0.94 | 0.56→0.50 | 2.08 | 3.36 |
| single-efficient | B15 reached | 108 | see JSON | 2.98 | 1.51 | 4.79 | 0.98→0.93 | 0.45→0.40 | 2.05 | 3.07 |
| single-efficient | B20 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| single-efficient | B21 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| single-efficient | B25 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| single-efficient | B30 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| sustain | B5 reached | 7288 | see JSON | 2.47 | 1.45 | 3.86 | 0.99→0.97 | 0.75→0.70 | 2.14 | 3.41 |
| sustain | B10 reached | 4755 | see JSON | 2.84 | 1.72 | 5.22 | 0.99→0.94 | 0.60→0.55 | 2.27 | 3.65 |
| sustain | B15 reached | 39 | see JSON | 3.20 | 1.74 | 6.18 | 0.99→0.95 | 0.55→0.51 | 2.31 | 3.26 |
| sustain | B20 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| sustain | B21 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| sustain | B25 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| sustain | B30 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| hybrid-fallback | B5 reached | 7267 | see JSON | 2.09 | 1.51 | 3.22 | 0.98→0.94 | 0.69→0.64 | 2.17 | 3.44 |
| hybrid-fallback | B10 reached | 6168 | see JSON | 2.53 | 1.33 | 3.21 | 0.97→0.94 | 0.47→0.43 | 2.05 | 3.30 |
| hybrid-fallback | B15 reached | 1153 | see JSON | 2.96 | 1.39 | 4.13 | 0.95→0.91 | 0.39→0.35 | 2.16 | 3.44 |
| hybrid-fallback | B20 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| hybrid-fallback | B21 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| hybrid-fallback | B25 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
| hybrid-fallback | B30 reached | 0 | see JSON | n/a | n/a | n/a | n/a→n/a | n/a→n/a | n/a | n/a |
## Death windows and pure raw exposure
Every death window stores the last one, two, and three experienced encounters and their normal-damage window; pure_raw_damage remains exclusive.
The JSON retains family and enemy-count slices plus per-death windows. `lethalHitOverMaxHp`, normal-hit damage, normal-hit count, and total normal damage separate single-hit pressure from cumulative exposure.
Matched common-support minimum paired N: 30.
Strict significant reversals: 10.
Insufficient comparisons: 301.
## Three-arm comparison
The following metrics use each arm's own weighting. #987 arms are imported unchanged; #990 actual is weighted by encounters that the build actually experienced.

| Arm / build | Weighting | Pure raw | Normal hit | Normal hits | Total normal damage | Rounds | Actions/round | Post HP | Post MP |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| controlled stress / overall | fixture stress | 43.50% | 6.38 | 2.90 | 18.48 | 2.72 | 2.07 | 0.21 | 0.70 |
| #987 generated weighted / overall | production `generateEncounter()` | 38.51% | 6.66 | 2.01 | 13.37 | 2.13 | 1.59 | 0.46 | 0.76 |
| aoe-burst | actual reached-run | 2.10% | 1.80 | 1.85 | 3.51 | 2.39 | 1.53 | 0.92 | 0.48 |
| #987 generated / aoe-burst | 18.07% | 5.59 | 1.57 | 8.80 | 2.16 | 1.63 | 0.56 | 0.70 |
| controlled / aoe-burst | 21.39% | 5.02 | 2.18 | 10.94 | 2.65 | 2.15 | 0.41 | 0.65 |
| single-efficient | actual reached-run | 1.22% | 2.29 | 1.61 | 3.77 | 2.15 | 1.52 | 0.93 | 0.51 |
| #987 generated / single-efficient | 43.77% | 6.67 | 1.69 | 11.26 | 1.81 | 1.53 | 0.46 | 0.79 |
| controlled / single-efficient | 50.67% | 6.33 | 2.60 | 16.46 | 2.32 | 2.01 | 0.10 | 0.74 |
| sustain | actual reached-run | 1.27% | 2.71 | 1.80 | 5.23 | 2.36 | 1.52 | 0.93 | 0.55 |
| #987 generated / sustain | 37.28% | 7.55 | 2.76 | 20.85 | 2.62 | 1.59 | 0.49 | 0.74 |
| controlled / sustain | 34.95% | 7.30 | 4.16 | 30.37 | 3.77 | 1.93 | 0.27 | 0.62 |
| hybrid-fallback | actual reached-run | 2.39% | 2.50 | 1.47 | 3.73 | 2.13 | 1.51 | 0.91 | 0.47 |
| #987 generated / hybrid-fallback | 54.92% | 6.26 | 2.01 | 12.56 | 1.91 | 1.61 | 0.34 | 0.81 |
| controlled / hybrid-fallback | 66.99% | 6.10 | 2.65 | 16.16 | 2.16 | 2.21 | 0.04 | 0.78 |

## Actual death categories

Counts are deaths among started runs; encounter pure-raw rates above use experienced encounters as their denominator.

| Build | Pure raw | Mechanic-mediated raw lethal | Direct mechanic death | Unknown/mixed |
| --- | ---: | ---: | ---: | ---: |
| aoe-burst | 179 | 143 | 116 | 62 |
| single-efficient | 129 | 192 | 123 | 56 |
| sustain | 146 | 193 | 96 | 65 |
| hybrid-fallback | 282 | 88 | 116 | 14 |

## Pure raw death windows

Lookback 1 is the lethal encounter, lookback 2 and 3 are the immediately preceding encounters. These are conditional on pure_raw_damage deaths and are not a full-run frequency.

| Build / lookback | N | Damage/normal hit | Lethal hit/maxHP | Normal hits | Total normal damage | HP before |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst / 1 | 179 | 5.47 | 0.12 | 6.03 | 27.35 | 29.85 |
| aoe-burst / 2 | 179 | 1.16 | 0.00 | 2.57 | 3.85 | 29.82 |
| aoe-burst / 3 | 178 | 1.12 | 0.00 | 1.95 | 2.70 | 29.96 |
| single-efficient / 1 | 129 | 5.86 | 0.13 | 5.45 | 28.02 | 30.78 |
| single-efficient / 2 | 129 | 1.80 | 0.00 | 2.66 | 5.83 | 31.85 |
| single-efficient / 3 | 127 | 1.55 | 0.00 | 2.08 | 4.00 | 32.23 |
| sustain / 1 | 146 | 7.08 | 0.09 | 7.73 | 47.76 | 51.75 |
| sustain / 2 | 146 | 2.34 | 0.00 | 3.18 | 8.27 | 52.55 |
| sustain / 3 | 146 | 1.91 | 0.00 | 2.16 | 5.61 | 52.68 |
| hybrid-fallback / 1 | 282 | 6.18 | 0.12 | 3.97 | 23.61 | 30.28 |
| hybrid-fallback / 2 | 282 | 1.91 | 0.00 | 1.78 | 4.15 | 30.42 |
| hybrid-fallback / 3 | 282 | 1.89 | 0.00 | 1.84 | 4.11 | 31.01 |

## Matched common-support comparison

Only event keys shared by builds are paired. Family entries below N=30 are recorded as insufficient_sample and are excluded from strict reversal counts.

| Pair | Common N | Clear difference | HP difference | MP difference | Strict reversals | Insufficient family comparisons |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| aoe-burst vs single-efficient | 8394 | -0.0379 | -0.0325 | -0.1137 | 0 | 54 |
| aoe-burst vs sustain | 8486 | -0.0481 | -0.0482 | -0.1757 | 0 | 58 |
| aoe-burst vs hybrid-fallback | 8058 | -0.0324 | -0.0233 | -0.1026 | 0 | 54 |
| single-efficient vs sustain | 10219 | -0.0177 | -0.0239 | -0.0642 | 0 | 45 |
| single-efficient vs hybrid-fallback | 9323 | -0.0079 | -0.0026 | 0.0062 | 6 | 45 |
| sustain vs hybrid-fallback | 9768 | -0.0014 | 0.0111 | 0.0663 | 4 | 45 |

## Build Confidence and decision

- #987 generated-frequency best-build share: **sustain 28.98%**; this is not actual reach dominance.
- actual reach dominance (highest reached depth per shared seed): {"aoe-burst":0.053666666666666654,"single-efficient":0.17599999999999993,"sustain":0.3386666666666667,"hybrid-fallback":0.4316666666666668}.
- matched pair results are the build-vs-build evidence; deep reached-run composition alone is not interpreted as encounter strength.
- #975-compatible strict reversal: paired clear outcome + diagnostic utility bootstrap 95% CIs, both sign-reversed; N<30 is insufficient and excluded.
- #973 Build Confidence: **Revise** until omitted loot/retreat decisions and non-combat deaths are either modeled or bounded by a follow-up.
- production tuning: **Do not proceed from this measurement alone**. If a separate tuning issue follows, investigate normal physical damage/action exposure with depth/family-specific paired validation first.

## Reproduction

```sh
node scratch/measurements/issue990_reached_run.js --runs 500 --seed 990-reached-run --output evidence/results/issue-990-reached-run.json --summary evidence/results/issue-990-reached-run.md
```