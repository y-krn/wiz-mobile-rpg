# Issue #984 Pure Raw Death Decomposition

- runner: issue984-pure-raw-decomposition-v2
- source commit: `a93d226357f2eb1a8530a8d19280b46c864fbefc`
- production baseline SHA: `61258b13ed5819ffd5e6fb373cbe9077b29102b0`
- N=500 per build × encounter × depth × condition; seed=974-build-confidence
- depths: B8, B13, B18, B21, B25, B30; builds: aoe-burst, single-efficient, sustain, hybrid-fallback; fixtures: 6

## Scope and validity

PR #983's exclusive `pure_raw_damage` category is the baseline. The baseline condition reuses the same causal runner and production round path; C1–C4 are measurement-only hooks with one changed factor each. Every condition uses the exact same derived case seed for paired comparison.

Counterfactual meanings: **C1_multi_enemy_to_single** keeps only the first production monster from a multi-enemy fixture, so enemy count, composition, role/trait, target priority, and multi-enemy interactions change together; it is not an enemy-count-only estimate. **C2_disable_multi_action_extra** suppresses only `multiAction`'s extra action; ordinary multiple enemies still each retain their normal one action per round, so total enemy-action-count contribution remains unresolved. C3 halves enemy HP only; C4 halves ordinary normal-physical incoming damage only.

Modeled: production monster definitions/depth scaling, auto-action, spell/status/mitigation rules, and the #983 causal classifier. Omitted: map traversal, encounter frequency in a complete run, manual input, consumables/retreat, and between-encounter progression. Controlled fixtures must not be interpreted as the game's global death rate.

## Headline baseline

- PR #983 reference: **26,683 / 41,512 = 64.28%** pure raw within the legacy raw denominator.
- current-main re-run, all depths: **31472 / 72000 = 43.71%** pure raw incidence.
- current-main deep band (B13+): **28777 / 60000 = 47.96%**; legacy raw share **69.32%**.

## Counterfactual paired comparison

Reduction is the paired change in pure-raw incidence, not a tuning target. A candidate may shift a death to another category; those shifts remain visible in JSON. Total-death change is shown separately to expose label shifts.

| Condition | Baseline pure raw | Counterfactual pure raw | Pure-raw reduction | Total death reduction | Baseline pure raw runs avoided |
| --- | ---: | ---: | ---: | ---: | ---: |
| C4_single_hit_damage | 31472 | 14944 | 22.96pp | 23.11pp | 53.70% |
| C3_fight_duration | 31472 | 19856 | 16.13pp | 24.68pp | 42.88% |
| C1_multi_enemy_to_single | 31472 | 27480 | 5.54pp | 25.39pp | 38.42% |
| C2_disable_multi_action_extra | 31472 | 32995 | -2.12pp | -1.30pp | 2.40% |

Measured fixed-condition effects: C4_single_hit_damage 22.96pp; C3_fight_duration 16.13pp; C1_multi_enemy_to_single 5.54pp; C2_disable_multi_action_extra -2.12pp. C4 is the largest isolated effect and C3 is also large; C1 is a mixed composition simplification; C2 tests only multiAction extra actions. This is not an additive contribution ranking and does not recommend production tuning.

## Required answers

1. **Single-hit normal physical damage:** C4 shows the largest isolated pure-raw reduction (22.96pp).
2. **Fight duration / processing time:** C3's enemy-HP reduction/shortening is also large (16.13pp).
3. **Multi-enemy → single:** C1 is material (5.54pp), but it combines enemy count, composition, role/trait, targeting, and interactions; enemy-count-only contribution is unresolved.
4. **MultiAction extra action:** C2 did not improve pure raw; multiAction extra actions were not supported as the main cause in this controlled measurement.
5. **Total enemy action count:** unresolved. C2 leaves one ordinary action per living enemy, so it does not independently test total enemy actions per round.
6. **Controlled fixtures vs production generation:** controlled fixtures average 2.33 enemies; production generation sampled at the same depths averages 1.64. The latter is generated-distribution sampling, not observed full-run encounter frequency; controlled death rates are not global game death rates.
7. **Next production lever:** **まだ触らない**。Production-frequency-weighted measurement comes first; this evidence does not authorize changing enemy HP/ATK, Mage, defense, pools, encounter generation, or action rules.
8. **#973 Build Confidence:** **Revise** — build interaction is measurable, but counterfactual scope and encounter weighting must be clarified before a production decision.

## Baseline by build

| Build | Pure raw | Mean normal hit | Mean attacks received |
| --- | ---: | ---: | ---: |
| aoe-burst | 3839 / 18000 (21.33%) | 5.29 | 3.44 |
| single-efficient | 9129 / 18000 (50.72%) | 6.76 | 2.86 |
| sustain | 6340 / 18000 (35.22%) | 7.57 | 5.03 |
| hybrid-fallback | 12164 / 18000 (67.58%) | 6.38 | 2.93 |

## Baseline by depth

| Depth | Pure raw |
| --- | ---: |
| B8 | 2695 / 12000 (22.46%) |
| B13 | 4358 / 12000 (36.32%) |
| B18 | 5271 / 12000 (43.92%) |
| B21 | 5840 / 12000 (48.67%) |
| B25 | 6353 / 12000 (52.94%) |
| B30 | 6955 / 12000 (57.96%) |

## Baseline build × encounter × depth matrix

| Depth | Encounter | Build | Pure raw | Normal hit mean | Normal attacks mean | Normal damage total mean | Rounds mean | Initial enemies mean | Enemy HP removal/round |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B8 | swarm-action-pressure | aoe-burst | 9 / 500 | 3.33 | 6.00 | 20.00 | 2.89 | 3.00 | 24.27 |
| B8 | swarm-action-pressure | single-efficient | 53 / 500 | 4.38 | 3.57 | 15.60 | 2.00 | 3.00 | 13.00 |
| B8 | swarm-action-pressure | sustain | 8 / 500 | 5.71 | 6.38 | 36.38 | 4.13 | 3.00 | 51.53 |
| B8 | swarm-action-pressure | hybrid-fallback | 260 / 500 | 4.75 | 3.93 | 18.70 | 2.92 | 3.00 | 51.92 |
| B8 | magic-denial | aoe-burst | 4 / 500 | 3.26 | 4.75 | 15.50 | 2.00 | 3.00 | 0.00 |
| B8 | magic-denial | single-efficient | 79 / 500 | 4.20 | 4.39 | 18.46 | 2.24 | 3.00 | 58.08 |
| B8 | magic-denial | sustain | 15 / 500 | 4.50 | 7.80 | 35.13 | 3.00 | 3.00 | 85.00 |
| B8 | magic-denial | hybrid-fallback | 132 / 500 | 4.06 | 3.95 | 16.06 | 1.95 | 3.00 | 65.01 |
| B8 | mp-pressure | aoe-burst | 8 / 500 | 3.28 | 3.13 | 10.25 | 4.00 | 2.00 | 41.68 |
| B8 | mp-pressure | single-efficient | 124 / 500 | 4.42 | 3.27 | 14.47 | 3.58 | 2.00 | 40.05 |
| B8 | mp-pressure | sustain | 86 / 500 | 4.77 | 3.55 | 16.80 | 5.48 | 2.00 | 30.88 |
| B8 | mp-pressure | hybrid-fallback | 181 / 500 | 4.08 | 3.27 | 13.15 | 4.00 | 2.00 | 28.79 |
| B8 | durable-single-target | aoe-burst | 135 / 500 | 6.33 | 2.78 | 17.58 | 2.78 | 1.00 | 68.11 |
| B8 | durable-single-target | single-efficient | 209 / 500 | 7.52 | 2.00 | 15.03 | 2.00 | 1.00 | 70.00 |
| B8 | durable-single-target | sustain | 43 / 500 | 8.38 | 4.00 | 33.51 | 4.00 | 1.00 | 50.56 |
| B8 | durable-single-target | hybrid-fallback | 500 / 500 | 7.52 | 2.00 | 15.04 | 2.00 | 1.00 | 51.28 |
| B8 | protected-formation | aoe-burst | 29 / 500 | 4.90 | 3.03 | 14.86 | 2.00 | 2.00 | 0.00 |
| B8 | protected-formation | single-efficient | 95 / 500 | 6.58 | 2.69 | 17.74 | 2.46 | 2.00 | 68.24 |
| B8 | protected-formation | sustain | 37 / 500 | 6.77 | 5.22 | 35.30 | 3.03 | 2.00 | 60.39 |
| B8 | protected-formation | hybrid-fallback | 431 / 500 | 5.94 | 3.11 | 18.48 | 2.11 | 2.00 | 58.13 |
| B8 | attrition-recovery-denial | aoe-burst | 3 / 500 | 3.36 | 4.67 | 15.67 | 2.00 | 3.00 | 0.00 |
| B8 | attrition-recovery-denial | single-efficient | 136 / 500 | 5.52 | 4.01 | 21.35 | 2.95 | 3.00 | 36.56 |
| B8 | attrition-recovery-denial | sustain | 0 / 500 | n/a | n/a | n/a | n/a | n/a | n/a |
| B8 | attrition-recovery-denial | hybrid-fallback | 118 / 500 | 5.06 | 4.00 | 19.73 | 2.71 | 3.00 | 54.19 |
| B13 | swarm-action-pressure | aoe-burst | 7 / 500 | 3.89 | 5.29 | 20.57 | 2.71 | 3.00 | 46.14 |
| B13 | swarm-action-pressure | single-efficient | 56 / 500 | 4.95 | 3.59 | 17.77 | 2.00 | 3.00 | 16.00 |
| B13 | swarm-action-pressure | sustain | 57 / 500 | 6.70 | 5.47 | 36.65 | 4.21 | 3.00 | 58.33 |
| B13 | swarm-action-pressure | hybrid-fallback | 262 / 500 | 5.07 | 4.02 | 20.35 | 2.95 | 3.00 | 54.96 |
| B13 | magic-denial | aoe-burst | 10 / 500 | 3.77 | 4.00 | 15.10 | 2.00 | 3.00 | 0.00 |
| B13 | magic-denial | single-efficient | 158 / 500 | 4.59 | 3.54 | 16.26 | 1.58 | 3.00 | 65.73 |
| B13 | magic-denial | sustain | 47 / 500 | 4.97 | 7.11 | 35.34 | 2.98 | 3.00 | 90.82 |
| B13 | magic-denial | hybrid-fallback | 180 / 500 | 4.52 | 3.42 | 15.46 | 1.45 | 3.00 | 76.11 |
| B13 | mp-pressure | aoe-burst | 12 / 500 | 3.69 | 3.83 | 13.83 | 4.25 | 2.00 | 47.38 |
| B13 | mp-pressure | single-efficient | 139 / 500 | 4.70 | 2.94 | 13.82 | 3.35 | 2.00 | 42.18 |
| B13 | mp-pressure | sustain | 134 / 500 | 5.13 | 4.14 | 20.74 | 5.82 | 2.00 | 32.31 |
| B13 | mp-pressure | hybrid-fallback | 185 / 500 | 4.25 | 3.46 | 14.25 | 4.02 | 2.00 | 30.55 |
| B13 | durable-single-target | aoe-burst | 493 / 500 | 7.27 | 2.00 | 14.53 | 2.00 | 1.00 | 84.68 |
| B13 | durable-single-target | single-efficient | 375 / 500 | 8.52 | 2.00 | 17.04 | 2.00 | 1.00 | 88.26 |
| B13 | durable-single-target | sustain | 194 / 500 | 9.55 | 4.00 | 38.18 | 4.00 | 1.00 | 56.50 |
| B13 | durable-single-target | hybrid-fallback | 500 / 500 | 8.51 | 2.00 | 17.03 | 2.00 | 1.00 | 50.45 |
| B13 | protected-formation | aoe-burst | 38 / 500 | 5.59 | 3.05 | 17.08 | 2.05 | 2.00 | 4.52 |
| B13 | protected-formation | single-efficient | 365 / 500 | 7.23 | 2.41 | 17.45 | 2.02 | 2.00 | 71.72 |
| B13 | protected-formation | sustain | 150 / 500 | 7.43 | 5.09 | 37.83 | 3.09 | 2.00 | 64.99 |
| B13 | protected-formation | hybrid-fallback | 488 / 500 | 6.66 | 2.62 | 17.44 | 1.62 | 2.00 | 67.27 |
| B13 | attrition-recovery-denial | aoe-burst | 7 / 500 | 3.81 | 3.86 | 14.14 | 2.00 | 3.00 | 0.00 |
| B13 | attrition-recovery-denial | single-efficient | 219 / 500 | 6.31 | 3.72 | 22.93 | 2.86 | 3.00 | 42.38 |
| B13 | attrition-recovery-denial | sustain | 1 / 500 | 6.00 | 6.00 | 36.00 | 3.00 | 3.00 | 58.00 |
| B13 | attrition-recovery-denial | hybrid-fallback | 281 / 500 | 5.63 | 3.62 | 19.80 | 2.42 | 3.00 | 62.48 |
| B18 | swarm-action-pressure | aoe-burst | 16 / 500 | 4.12 | 5.31 | 21.88 | 2.81 | 3.00 | 59.23 |
| B18 | swarm-action-pressure | single-efficient | 78 / 500 | 5.29 | 3.58 | 18.94 | 1.96 | 3.00 | 17.79 |
| B18 | swarm-action-pressure | sustain | 97 / 500 | 7.22 | 5.62 | 40.56 | 4.41 | 3.00 | 64.22 |
| B18 | swarm-action-pressure | hybrid-fallback | 236 / 500 | 5.05 | 4.08 | 20.60 | 2.74 | 3.00 | 54.82 |
| B18 | magic-denial | aoe-burst | 3 / 500 | 3.93 | 4.67 | 18.33 | 2.33 | 3.00 | 49.00 |
| B18 | magic-denial | single-efficient | 196 / 500 | 4.89 | 3.08 | 15.05 | 1.09 | 3.00 | 77.02 |
| B18 | magic-denial | sustain | 55 / 500 | 5.61 | 6.13 | 34.38 | 2.16 | 3.00 | 115.05 |
| B18 | magic-denial | hybrid-fallback | 191 / 500 | 4.89 | 3.05 | 14.92 | 1.14 | 3.00 | 73.18 |
| B18 | mp-pressure | aoe-burst | 19 / 500 | 4.21 | 3.47 | 14.63 | 3.84 | 2.00 | 46.91 |
| B18 | mp-pressure | single-efficient | 155 / 500 | 5.35 | 2.86 | 15.28 | 3.28 | 2.00 | 45.42 |
| B18 | mp-pressure | sustain | 125 / 500 | 5.71 | 4.47 | 24.88 | 5.79 | 2.00 | 33.84 |
| B18 | mp-pressure | hybrid-fallback | 235 / 500 | 4.84 | 3.26 | 15.11 | 3.40 | 2.00 | 32.80 |
| B18 | durable-single-target | aoe-burst | 500 / 500 | 7.75 | 2.00 | 15.50 | 2.00 | 1.00 | 85.18 |
| B18 | durable-single-target | single-efficient | 500 / 500 | 9.26 | 2.00 | 18.52 | 2.00 | 1.00 | 100.89 |
| B18 | durable-single-target | sustain | 386 / 500 | 10.27 | 3.97 | 40.83 | 3.97 | 1.00 | 64.44 |
| B18 | durable-single-target | hybrid-fallback | 500 / 500 | 9.26 | 2.00 | 18.52 | 2.00 | 1.00 | 50.33 |
| B18 | protected-formation | aoe-burst | 35 / 500 | 6.15 | 3.17 | 19.51 | 2.17 | 2.00 | 16.88 |
| B18 | protected-formation | single-efficient | 475 / 500 | 7.71 | 2.11 | 16.29 | 1.49 | 2.00 | 75.28 |
| B18 | protected-formation | sustain | 408 / 500 | 8.30 | 4.27 | 35.41 | 2.27 | 2.00 | 86.84 |
| B18 | protected-formation | hybrid-fallback | 500 / 500 | 7.35 | 2.00 | 14.70 | 1.00 | 2.00 | 68.23 |
| B18 | attrition-recovery-denial | aoe-burst | 15 / 500 | 4.58 | 3.80 | 17.40 | 1.93 | 3.00 | 16.87 |
| B18 | attrition-recovery-denial | single-efficient | 219 / 500 | 6.86 | 3.54 | 23.82 | 2.70 | 3.00 | 44.23 |
| B18 | attrition-recovery-denial | sustain | 10 / 500 | 7.20 | 6.20 | 43.20 | 3.90 | 3.00 | 63.54 |
| B18 | attrition-recovery-denial | hybrid-fallback | 317 / 500 | 5.60 | 3.39 | 18.69 | 2.02 | 3.00 | 73.96 |
| B21 | swarm-action-pressure | aoe-burst | 23 / 500 | 4.38 | 4.87 | 21.30 | 2.70 | 3.00 | 51.34 |
| B21 | swarm-action-pressure | single-efficient | 105 / 500 | 5.69 | 3.49 | 19.85 | 1.88 | 3.00 | 17.96 |
| B21 | swarm-action-pressure | sustain | 113 / 500 | 7.26 | 6.24 | 45.27 | 4.54 | 3.00 | 66.34 |
| B21 | swarm-action-pressure | hybrid-fallback | 252 / 500 | 5.23 | 3.81 | 19.88 | 2.20 | 3.00 | 63.40 |
| B21 | magic-denial | aoe-burst | 33 / 500 | 4.63 | 3.06 | 14.18 | 1.06 | 3.00 | 0.00 |
| B21 | magic-denial | single-efficient | 221 / 500 | 5.33 | 3.00 | 16.00 | 1.07 | 3.00 | 76.81 |
| B21 | magic-denial | sustain | 69 / 500 | 6.07 | 5.97 | 36.26 | 2.04 | 3.00 | 113.84 |
| B21 | magic-denial | hybrid-fallback | 226 / 500 | 5.33 | 3.00 | 16.00 | 1.06 | 3.00 | 77.68 |
| B21 | mp-pressure | aoe-burst | 23 / 500 | 4.25 | 3.78 | 15.70 | 3.83 | 2.00 | 53.27 |
| B21 | mp-pressure | single-efficient | 153 / 500 | 5.54 | 2.93 | 16.25 | 3.26 | 2.00 | 48.11 |
| B21 | mp-pressure | sustain | 121 / 500 | 5.85 | 4.36 | 24.55 | 5.64 | 2.00 | 35.19 |
| B21 | mp-pressure | hybrid-fallback | 261 / 500 | 4.92 | 3.03 | 14.09 | 3.16 | 2.00 | 35.44 |
| B21 | durable-single-target | aoe-burst | 500 / 500 | 8.50 | 2.00 | 16.99 | 2.00 | 1.00 | 85.82 |
| B21 | durable-single-target | single-efficient | 500 / 500 | 10.27 | 2.00 | 20.53 | 2.00 | 1.00 | 101.61 |
| B21 | durable-single-target | sustain | 500 / 500 | 11.50 | 3.00 | 34.50 | 3.00 | 1.00 | 65.40 |
| B21 | durable-single-target | hybrid-fallback | 500 / 500 | 10.27 | 2.00 | 20.53 | 2.00 | 1.00 | 50.77 |
| B21 | protected-formation | aoe-burst | 104 / 500 | 6.85 | 2.35 | 16.07 | 1.35 | 2.00 | 6.06 |
| B21 | protected-formation | single-efficient | 477 / 500 | 8.11 | 2.11 | 17.12 | 1.34 | 2.00 | 78.45 |
| B21 | protected-formation | sustain | 497 / 500 | 8.76 | 4.01 | 35.13 | 2.01 | 2.00 | 94.13 |
| B21 | protected-formation | hybrid-fallback | 500 / 500 | 7.88 | 2.00 | 15.77 | 1.00 | 2.00 | 69.47 |
| B21 | attrition-recovery-denial | aoe-burst | 35 / 500 | 4.83 | 3.17 | 15.17 | 1.26 | 3.00 | 5.90 |
| B21 | attrition-recovery-denial | single-efficient | 259 / 500 | 7.03 | 3.34 | 23.16 | 2.41 | 3.00 | 45.20 |
| B21 | attrition-recovery-denial | sustain | 28 / 500 | 7.43 | 5.96 | 41.64 | 3.43 | 3.00 | 63.36 |
| B21 | attrition-recovery-denial | hybrid-fallback | 340 / 500 | 5.74 | 3.25 | 18.21 | 1.73 | 3.00 | 77.25 |
| B25 | swarm-action-pressure | aoe-burst | 20 / 500 | 4.39 | 5.15 | 22.60 | 2.60 | 3.00 | 48.37 |
| B25 | swarm-action-pressure | single-efficient | 111 / 500 | 5.88 | 3.18 | 18.70 | 1.70 | 3.00 | 15.81 |
| B25 | swarm-action-pressure | sustain | 145 / 500 | 7.49 | 6.39 | 47.91 | 4.52 | 3.00 | 70.50 |
| B25 | swarm-action-pressure | hybrid-fallback | 317 / 500 | 5.18 | 3.34 | 17.31 | 1.65 | 3.00 | 74.77 |
| B25 | magic-denial | aoe-burst | 61 / 500 | 4.76 | 3.05 | 14.52 | 1.07 | 3.00 | 0.00 |
| B25 | magic-denial | single-efficient | 219 / 500 | 5.63 | 3.00 | 16.89 | 1.08 | 3.00 | 76.69 |
| B25 | magic-denial | sustain | 76 / 500 | 6.39 | 5.70 | 36.38 | 2.09 | 3.00 | 101.18 |
| B25 | magic-denial | hybrid-fallback | 219 / 500 | 5.64 | 3.00 | 16.91 | 1.11 | 3.00 | 75.25 |
| B25 | mp-pressure | aoe-burst | 25 / 500 | 4.77 | 3.76 | 17.92 | 3.76 | 2.00 | 52.30 |
| B25 | mp-pressure | single-efficient | 174 / 500 | 6.10 | 2.80 | 17.10 | 3.13 | 2.00 | 51.48 |
| B25 | mp-pressure | sustain | 145 / 500 | 6.32 | 4.24 | 25.99 | 5.54 | 2.00 | 37.06 |
| B25 | mp-pressure | hybrid-fallback | 285 / 500 | 5.28 | 2.86 | 14.20 | 2.84 | 2.00 | 37.85 |
| B25 | durable-single-target | aoe-burst | 500 / 500 | 8.76 | 2.00 | 17.53 | 2.00 | 1.00 | 86.48 |
| B25 | durable-single-target | single-efficient | 500 / 500 | 10.53 | 2.00 | 21.06 | 2.00 | 1.00 | 102.34 |
| B25 | durable-single-target | sustain | 500 / 500 | 11.76 | 3.00 | 35.27 | 3.00 | 1.00 | 68.05 |
| B25 | durable-single-target | hybrid-fallback | 500 / 500 | 10.53 | 2.00 | 21.06 | 2.00 | 1.00 | 51.24 |
| B25 | protected-formation | aoe-burst | 193 / 500 | 7.25 | 2.00 | 14.49 | 1.00 | 2.00 | 0.00 |
| B25 | protected-formation | single-efficient | 486 / 500 | 8.74 | 2.06 | 17.96 | 1.18 | 2.00 | 83.03 |
| B25 | protected-formation | sustain | 500 / 500 | 9.50 | 4.00 | 38.00 | 2.00 | 2.00 | 94.30 |
| B25 | protected-formation | hybrid-fallback | 500 / 500 | 8.63 | 2.00 | 17.26 | 1.00 | 2.00 | 70.31 |
| B25 | attrition-recovery-denial | aoe-burst | 53 / 500 | 5.22 | 3.17 | 16.43 | 1.42 | 3.00 | 15.78 |
| B25 | attrition-recovery-denial | single-efficient | 315 / 500 | 7.57 | 3.03 | 22.52 | 2.25 | 3.00 | 48.70 |
| B25 | attrition-recovery-denial | sustain | 106 / 500 | 8.12 | 5.84 | 45.37 | 3.54 | 3.00 | 71.49 |
| B25 | attrition-recovery-denial | hybrid-fallback | 403 / 500 | 6.22 | 2.95 | 18.01 | 1.57 | 3.00 | 79.02 |
| B30 | swarm-action-pressure | aoe-burst | 65 / 500 | 4.95 | 3.40 | 16.82 | 1.43 | 3.00 | 20.66 |
| B30 | swarm-action-pressure | single-efficient | 210 / 500 | 6.26 | 2.84 | 17.76 | 1.56 | 3.00 | 18.94 |
| B30 | swarm-action-pressure | sustain | 192 / 500 | 7.81 | 6.35 | 49.61 | 4.15 | 3.00 | 70.02 |
| B30 | swarm-action-pressure | hybrid-fallback | 403 / 500 | 5.72 | 3.05 | 17.47 | 1.42 | 3.00 | 74.65 |
| B30 | magic-denial | aoe-burst | 86 / 500 | 5.12 | 3.00 | 15.35 | 1.01 | 3.00 | 0.00 |
| B30 | magic-denial | single-efficient | 223 / 500 | 6.23 | 2.85 | 17.74 | 1.07 | 3.00 | 72.04 |
| B30 | magic-denial | sustain | 98 / 500 | 7.01 | 5.03 | 35.29 | 2.00 | 3.00 | 94.00 |
| B30 | magic-denial | hybrid-fallback | 223 / 500 | 6.25 | 2.84 | 17.73 | 1.08 | 3.00 | 71.22 |
| B30 | mp-pressure | aoe-burst | 26 / 500 | 5.18 | 3.08 | 15.73 | 3.42 | 2.00 | 47.96 |
| B30 | mp-pressure | single-efficient | 207 / 500 | 6.71 | 2.43 | 16.23 | 2.66 | 2.00 | 53.60 |
| B30 | mp-pressure | sustain | 173 / 500 | 6.90 | 4.25 | 27.86 | 5.22 | 2.00 | 38.19 |
| B30 | mp-pressure | hybrid-fallback | 300 / 500 | 5.86 | 2.52 | 13.78 | 2.50 | 2.00 | 38.86 |
| B30 | durable-single-target | aoe-burst | 500 / 500 | 9.75 | 2.00 | 19.51 | 2.00 | 1.00 | 87.28 |
| B30 | durable-single-target | single-efficient | 500 / 500 | 11.75 | 2.00 | 23.51 | 2.00 | 1.00 | 103.33 |
| B30 | durable-single-target | sustain | 500 / 500 | 13.00 | 3.00 | 39.00 | 3.00 | 1.00 | 66.63 |
| B30 | durable-single-target | hybrid-fallback | 500 / 500 | 11.75 | 2.00 | 23.51 | 2.00 | 1.00 | 51.64 |
| B30 | protected-formation | aoe-burst | 187 / 500 | 8.01 | 2.00 | 16.02 | 1.00 | 2.00 | 0.00 |
| B30 | protected-formation | single-efficient | 500 / 500 | 9.51 | 2.00 | 19.02 | 1.00 | 2.00 | 88.44 |
| B30 | protected-formation | sustain | 500 / 500 | 10.77 | 3.57 | 38.42 | 2.00 | 2.00 | 87.81 |
| B30 | protected-formation | hybrid-fallback | 500 / 500 | 9.53 | 2.00 | 19.05 | 1.00 | 2.00 | 70.48 |
| B30 | attrition-recovery-denial | aoe-burst | 62 / 500 | 5.65 | 3.13 | 17.58 | 1.27 | 3.00 | 13.19 |
| B30 | attrition-recovery-denial | single-efficient | 338 / 500 | 8.27 | 2.61 | 21.00 | 1.92 | 3.00 | 46.87 |
| B30 | attrition-recovery-denial | sustain | 224 / 500 | 8.82 | 5.80 | 48.92 | 3.66 | 3.00 | 75.44 |
| B30 | attrition-recovery-denial | hybrid-fallback | 438 / 500 | 6.77 | 2.48 | 16.53 | 1.32 | 3.00 | 79.27 |

## Production encounter generation vs controlled fixtures

Controlled fixture enemy-count distribution: `{"1":1,"2":2,"3":3}`; production generated distribution is recorded per depth in JSON. This is generation output, not observed full-run encounter frequency.

| Depth | Production average enemies | Size distribution |
| --- | ---: | --- |
| B8 | 1.73 | {"1":155,"2":325,"3":20} |
| B13 | 1.70 | {"1":171,"2":309,"3":20} |
| B18 | 1.67 | {"1":186,"2":292,"3":22} |
| B21 | 1.26 | {"1":371,"2":129} |
| B25 | 1.74 | {"1":144,"2":341,"3":15} |
| B30 | 1.76 | {"1":141,"2":337,"3":22} |

## Reproduction and evidence

```sh
node scratch/measurements/issue984_pure_raw_decomposition.js --runs 500 --seed 974-build-confidence --output evidence/results/issue-984-pure-raw-decomposition.json --summary evidence/results/issue-984-pure-raw-decomposition.md
```

The JSON contains every requested pure-raw death metric, paired cause shifts, production encounter compositions, provenance, and modeled/omitted mechanisms.
