# Issue #980 Causal Attribution Measurement

- runner: issue980-causal-attribution-v1
- source commit: `2e1e670dfd8e278ff5b163d7142c9eb477bca83f`
- origin/main ancestor: true
- N=500 per build / encounter / depth; seed=974-build-confidence
- builds: AoE Burst Mage, Single-target / Efficient Mage, Sustain Mage, Hybrid / Fallback Mage
- encounters: 6; depths: B8, B13, B18, B21, B25, B30

## Causal result

- previous production baseline: #978 runner v6, deep primary raw damage **41,520 / 49,333 = 84.16%** (reproduced under the same seed policy before this observer was added)
- deaths classified as legacy raw_damage_pressure: 41512 (direct raw damage observed independently: 25409)
- pure raw damage: **25409 / 41512 = 61.21%** of raw damage deaths
- mechanic-mediated raw damage: **7715 / 41512 = 18.58%** of raw damage deaths
- unknown / mixed: **4704 / 49319 = 9.54%** of deaths
- mechanic firing → death: count=29027, mean=1.53 rounds, p50=1, p95=4

## Falsification result

- v0 criteria: **falsified_or_red_flagged** (classification was not tuned toward a target)
- significant paired rank reversals: 45
- raw rank-order reversals (supplemental): 64
- triggered red flags: deep_raw_damage_wall

## Red flags

- [clear] dominant_build: one build is best in >=80% of representative cells; observed={"bestCounts":{"sustain":16,"aoe-burst":26,"single-efficient":6,"hybrid-fallback":6},"bestCellCount":54}
- [TRIGGERED] deep_raw_damage_wall: deep-band death attribution is >=60% raw_damage_pressure; observed={"deepRawDamage":39779,"deepDeaths":49319,"share":0.8065654210344898}
- [clear] no_significant_rank_reversal: no paired outcome-and-utility rank reversal with bootstrap 95% CIs excluding zero is observed; observed={"significantReversalCount":45,"rawRankReversalCount":64}
- [clear] same_resource_signature: encounter resource signatures differ by less than 0.05; observed={"maxMeanAbsoluteDistance":0.9056661272355362}
- [clear] unknown_failure_attribution: unknown_or_mixed is >40% of eligible high-consumption/death runs; observed={"unknown":5758,"eligible":55548,"share":0.10365809750126018}
- [clear] depth_scaling_dominates: depth clear-rate range is >2x the observed build clear-rate range; observed={"depthRange":0.3990833333333333,"buildRange":1}

## Build × encounter × depth causal counts

Each row is N=500 for one build/fixture/depth. `pure/mech/unknown` are death counts.

| Depth | Encounter | Build | Clear / death | Pure raw | Mechanic raw | Unknown | Fallback | Mech→death mean |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B8 | swarm-action-pressure | aoe-burst | 435 / 65 | 0 | 7 | 0 | 0 | 1.29 |
| B8 | swarm-action-pressure | single-efficient | 5 / 495 | 0 | 37 | 0 | 0 | 1.37 |
| B8 | swarm-action-pressure | sustain | 490 / 10 | 0 | 0 | 0 | 0 | 2.38 |
| B8 | swarm-action-pressure | hybrid-fallback | 108 / 392 | 0 | 22 | 0 | 0 | 1.32 |
| B8 | magic-denial | aoe-burst | 100 / 400 | 16 | 150 | 4 | 0 | 0.82 |
| B8 | magic-denial | single-efficient | 57 / 443 | 92 | 192 | 0 | 0 | 0.60 |
| B8 | magic-denial | sustain | 34 / 466 | 18 | 248 | 14 | 0 | 1.27 |
| B8 | magic-denial | hybrid-fallback | 0 / 500 | 141 | 171 | 0 | 0 | 0.45 |
| B8 | mp-pressure | aoe-burst | 242 / 258 | 29 | 4 | 197 | 2 | 2.42 |
| B8 | mp-pressure | single-efficient | 33 / 467 | 117 | 7 | 314 | 0 | 2.08 |
| B8 | mp-pressure | sustain | 193 / 307 | 85 | 14 | 157 | 2 | 4.37 |
| B8 | mp-pressure | hybrid-fallback | 0 / 500 | 146 | 47 | 224 | 0 | 2.84 |
| B8 | durable-single-target | aoe-burst | 365 / 135 | 135 | 0 | 0 | 0 | n/a |
| B8 | durable-single-target | single-efficient | 291 / 209 | 209 | 0 | 0 | 0 | n/a |
| B8 | durable-single-target | sustain | 457 / 43 | 43 | 0 | 0 | 0 | n/a |
| B8 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | aoe-burst | 447 / 53 | 53 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | single-efficient | 405 / 95 | 95 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | sustain | 463 / 37 | 37 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | hybrid-fallback | 69 / 431 | 431 | 0 | 0 | 0 | n/a |
| B8 | attrition-recovery-denial | aoe-burst | 470 / 30 | 17 | 7 | 0 | 0 | 0.55 |
| B8 | attrition-recovery-denial | single-efficient | 326 / 174 | 70 | 69 | 0 | 0 | 1.77 |
| B8 | attrition-recovery-denial | sustain | 500 / 0 | 0 | 0 | 0 | 0 | n/a |
| B8 | attrition-recovery-denial | hybrid-fallback | 349 / 151 | 80 | 48 | 0 | 0 | 1.41 |
| B13 | swarm-action-pressure | aoe-burst | 414 / 86 | 0 | 8 | 0 | 0 | 1.15 |
| B13 | swarm-action-pressure | single-efficient | 4 / 496 | 0 | 46 | 0 | 0 | 1.35 |
| B13 | swarm-action-pressure | sustain | 400 / 100 | 0 | 0 | 0 | 0 | 2.43 |
| B13 | swarm-action-pressure | hybrid-fallback | 20 / 480 | 0 | 41 | 0 | 0 | 1.30 |
| B13 | magic-denial | aoe-burst | 84 / 416 | 37 | 138 | 3 | 0 | 0.69 |
| B13 | magic-denial | single-efficient | 11 / 489 | 174 | 164 | 0 | 0 | 0.50 |
| B13 | magic-denial | sustain | 17 / 483 | 49 | 277 | 11 | 0 | 1.10 |
| B13 | magic-denial | hybrid-fallback | 0 / 500 | 193 | 149 | 0 | 0 | 0.46 |
| B13 | mp-pressure | aoe-burst | 132 / 368 | 49 | 15 | 240 | 21 | 2.77 |
| B13 | mp-pressure | single-efficient | 11 / 489 | 125 | 14 | 322 | 0 | 2.38 |
| B13 | mp-pressure | sustain | 28 / 472 | 119 | 46 | 202 | 37 | 4.09 |
| B13 | mp-pressure | hybrid-fallback | 0 / 500 | 140 | 45 | 195 | 0 | 2.61 |
| B13 | durable-single-target | aoe-burst | 7 / 493 | 493 | 0 | 0 | 0 | n/a |
| B13 | durable-single-target | single-efficient | 125 / 375 | 375 | 0 | 0 | 0 | n/a |
| B13 | durable-single-target | sustain | 306 / 194 | 194 | 0 | 0 | 0 | n/a |
| B13 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | aoe-burst | 425 / 75 | 75 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | single-efficient | 135 / 365 | 365 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | sustain | 350 / 150 | 150 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | hybrid-fallback | 12 / 488 | 488 | 0 | 0 | 0 | n/a |
| B13 | attrition-recovery-denial | aoe-burst | 446 / 54 | 27 | 16 | 0 | 0 | 0.80 |
| B13 | attrition-recovery-denial | single-efficient | 194 / 306 | 95 | 171 | 0 | 0 | 1.86 |
| B13 | attrition-recovery-denial | sustain | 493 / 7 | 1 | 2 | 0 | 0 | 1.17 |
| B13 | attrition-recovery-denial | hybrid-fallback | 122 / 378 | 162 | 158 | 0 | 0 | 1.52 |
| B18 | swarm-action-pressure | aoe-burst | 368 / 132 | 0 | 9 | 0 | 0 | 1.03 |
| B18 | swarm-action-pressure | single-efficient | 3 / 497 | 0 | 55 | 0 | 0 | 1.31 |
| B18 | swarm-action-pressure | sustain | 321 / 179 | 0 | 0 | 0 | 0 | 2.51 |
| B18 | swarm-action-pressure | hybrid-fallback | 8 / 492 | 0 | 66 | 0 | 0 | 1.28 |
| B18 | magic-denial | aoe-burst | 61 / 439 | 41 | 159 | 1 | 0 | 0.69 |
| B18 | magic-denial | single-efficient | 0 / 500 | 210 | 165 | 0 | 0 | 0.45 |
| B18 | magic-denial | sustain | 0 / 500 | 61 | 281 | 12 | 0 | 1.09 |
| B18 | magic-denial | hybrid-fallback | 0 / 500 | 205 | 164 | 0 | 0 | 0.44 |
| B18 | mp-pressure | aoe-burst | 13 / 487 | 104 | 23 | 301 | 17 | 2.67 |
| B18 | mp-pressure | single-efficient | 0 / 500 | 140 | 15 | 319 | 0 | 2.27 |
| B18 | mp-pressure | sustain | 0 / 500 | 119 | 47 | 208 | 29 | 4.15 |
| B18 | mp-pressure | hybrid-fallback | 0 / 500 | 154 | 64 | 167 | 0 | 1.90 |
| B18 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B18 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B18 | durable-single-target | sustain | 114 / 386 | 386 | 0 | 0 | 0 | n/a |
| B18 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | aoe-burst | 406 / 94 | 94 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | single-efficient | 25 / 475 | 475 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | sustain | 92 / 408 | 408 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B18 | attrition-recovery-denial | aoe-burst | 401 / 99 | 45 | 38 | 0 | 0 | 0.91 |
| B18 | attrition-recovery-denial | single-efficient | 157 / 343 | 102 | 174 | 0 | 0 | 1.64 |
| B18 | attrition-recovery-denial | sustain | 477 / 23 | 9 | 7 | 0 | 0 | 1.85 |
| B18 | attrition-recovery-denial | hybrid-fallback | 55 / 445 | 192 | 175 | 0 | 0 | 1.47 |
| B21 | swarm-action-pressure | aoe-burst | 340 / 160 | 0 | 15 | 0 | 0 | 0.98 |
| B21 | swarm-action-pressure | single-efficient | 0 / 500 | 0 | 86 | 0 | 0 | 1.22 |
| B21 | swarm-action-pressure | sustain | 205 / 295 | 0 | 0 | 0 | 0 | 2.51 |
| B21 | swarm-action-pressure | hybrid-fallback | 1 / 499 | 0 | 147 | 0 | 0 | 1.14 |
| B21 | magic-denial | aoe-burst | 50 / 450 | 71 | 124 | 0 | 0 | 0.54 |
| B21 | magic-denial | single-efficient | 0 / 500 | 238 | 135 | 0 | 0 | 0.43 |
| B21 | magic-denial | sustain | 0 / 500 | 73 | 297 | 3 | 0 | 1.08 |
| B21 | magic-denial | hybrid-fallback | 0 / 500 | 239 | 127 | 0 | 0 | 0.46 |
| B21 | mp-pressure | aoe-burst | 0 / 500 | 128 | 15 | 279 | 9 | 3.02 |
| B21 | mp-pressure | single-efficient | 0 / 500 | 141 | 12 | 318 | 0 | 1.98 |
| B21 | mp-pressure | sustain | 0 / 500 | 124 | 44 | 201 | 18 | 4.22 |
| B21 | mp-pressure | hybrid-fallback | 0 / 500 | 173 | 52 | 158 | 0 | 1.88 |
| B21 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B21 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B21 | durable-single-target | sustain | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B21 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | aoe-burst | 340 / 160 | 160 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | single-efficient | 23 / 477 | 477 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | sustain | 3 / 497 | 497 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B21 | attrition-recovery-denial | aoe-burst | 362 / 138 | 70 | 54 | 0 | 0 | 1.07 |
| B21 | attrition-recovery-denial | single-efficient | 101 / 399 | 147 | 185 | 0 | 0 | 1.60 |
| B21 | attrition-recovery-denial | sustain | 437 / 63 | 23 | 13 | 0 | 0 | 1.43 |
| B21 | attrition-recovery-denial | hybrid-fallback | 25 / 475 | 222 | 159 | 0 | 0 | 1.37 |
| B25 | swarm-action-pressure | aoe-burst | 333 / 167 | 0 | 9 | 0 | 0 | 1.01 |
| B25 | swarm-action-pressure | single-efficient | 0 / 500 | 9 | 75 | 0 | 0 | 1.11 |
| B25 | swarm-action-pressure | sustain | 125 / 375 | 0 | 0 | 0 | 0 | 2.33 |
| B25 | swarm-action-pressure | hybrid-fallback | 1 / 499 | 9 | 249 | 0 | 0 | 0.89 |
| B25 | magic-denial | aoe-burst | 37 / 463 | 100 | 132 | 0 | 0 | 0.54 |
| B25 | magic-denial | single-efficient | 0 / 500 | 234 | 128 | 0 | 0 | 0.46 |
| B25 | magic-denial | sustain | 0 / 500 | 79 | 311 | 7 | 0 | 1.07 |
| B25 | magic-denial | hybrid-fallback | 0 / 500 | 234 | 126 | 0 | 0 | 0.45 |
| B25 | mp-pressure | aoe-burst | 0 / 500 | 130 | 13 | 290 | 7 | 2.84 |
| B25 | mp-pressure | single-efficient | 0 / 500 | 156 | 18 | 298 | 0 | 2.07 |
| B25 | mp-pressure | sustain | 0 / 500 | 122 | 56 | 204 | 6 | 4.32 |
| B25 | mp-pressure | hybrid-fallback | 0 / 500 | 182 | 57 | 132 | 0 | 1.52 |
| B25 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B25 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B25 | durable-single-target | sustain | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B25 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | aoe-burst | 239 / 261 | 261 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | single-efficient | 14 / 486 | 486 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | sustain | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B25 | attrition-recovery-denial | aoe-burst | 324 / 176 | 87 | 74 | 0 | 0 | 1.35 |
| B25 | attrition-recovery-denial | single-efficient | 68 / 432 | 166 | 191 | 0 | 0 | 1.59 |
| B25 | attrition-recovery-denial | sustain | 356 / 144 | 63 | 37 | 0 | 0 | 1.79 |
| B25 | attrition-recovery-denial | hybrid-fallback | 10 / 490 | 241 | 180 | 0 | 0 | 1.27 |
| B30 | swarm-action-pressure | aoe-burst | 276 / 224 | 0 | 54 | 0 | 0 | 1.00 |
| B30 | swarm-action-pressure | single-efficient | 0 / 500 | 45 | 102 | 0 | 0 | 0.88 |
| B30 | swarm-action-pressure | sustain | 30 / 470 | 0 | 15 | 0 | 0 | 2.11 |
| B30 | swarm-action-pressure | hybrid-fallback | 0 / 500 | 45 | 282 | 0 | 0 | 0.59 |
| B30 | magic-denial | aoe-burst | 13 / 487 | 158 | 137 | 1 | 0 | 0.53 |
| B30 | magic-denial | single-efficient | 0 / 500 | 245 | 139 | 0 | 0 | 0.44 |
| B30 | magic-denial | sustain | 0 / 500 | 113 | 293 | 0 | 0 | 0.57 |
| B30 | magic-denial | hybrid-fallback | 0 / 500 | 243 | 140 | 0 | 0 | 0.41 |
| B30 | mp-pressure | aoe-burst | 0 / 500 | 134 | 18 | 287 | 9 | 2.83 |
| B30 | mp-pressure | single-efficient | 0 / 500 | 183 | 22 | 263 | 0 | 1.63 |
| B30 | mp-pressure | sustain | 0 / 500 | 147 | 50 | 159 | 4 | 3.75 |
| B30 | mp-pressure | hybrid-fallback | 0 / 500 | 199 | 52 | 123 | 0 | 1.13 |
| B30 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | durable-single-target | sustain | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | aoe-burst | 200 / 300 | 300 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | sustain | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | n/a |
| B30 | attrition-recovery-denial | aoe-burst | 289 / 211 | 122 | 74 | 0 | 0 | 1.47 |
| B30 | attrition-recovery-denial | single-efficient | 29 / 471 | 189 | 202 | 0 | 0 | 1.54 |
| B30 | attrition-recovery-denial | sustain | 206 / 294 | 105 | 114 | 0 | 0 | 2.36 |
| B30 | attrition-recovery-denial | hybrid-fallback | 7 / 493 | 283 | 168 | 0 | 0 | 1.08 |

Direct cause is the lethal damage event. Contributing cause is assigned only when the trace contains state-degradation evidence before that event; `unknown_or_mixed` is retained for multiple or insufficient explanations. Each raw JSON trace retains round, HP/MP, player action, enemy action, status transitions, silence, MP drain, reflect, anti-heal, regen, summon, guard, multi-action, spell opportunity loss, physical fallback, damage source, and lethal event data.

Largest contributing cause counts among former raw deaths: reflection_chain=5630, action_economy_chain=4366, sustain_failure_chain=1262.
Auto action review: existing chooseAutoCombatAction only; no expert-player AI added; representative death traces are included in JSON.
Fixture review: Some 0/500 or 500/500 cells are expected to be composition-specific controlled tests; they are not estimates of dungeon frequency.

Modeled: production monster definitions, depth scaling, combat round resolution, existing auto action, spell effects, affix/core rules, and status rules. Omitted: map traversal, manual input, consumables/retreat, loot/economy, and between-encounter progression. Fixtures are controlled tests, not dungeon encounter-frequency estimates.
## Interpretation and decisions

The legacy PR #978 baseline is reproduced separately at the production source commit `67592f5d741988748119083577e389935f4555ed`: 41,520 / 49,333 deep deaths were labeled `raw_damage_pressure` (84.16%). The causal run is on the latest `origin/main` descendant; its death total is 49,319 because the current main source is `0718e0780b474b867dbfa5dd789490b1fda22ec7`.

Within the legacy raw-death denominator in the causal run:

- Pure raw damage: 25,409 / 41,512 = **61.21%**.
- Mechanic-mediated raw damage: 7,715 / 41,512 = **18.58%**.
- Unknown / mixed: 4,704 / 41,512 = **11.33%** of the former raw label, and 9.54% of all deaths.
- Other former-raw cases now separated into non-raw or explicit chain categories: 8,388 / 41,512 = **20.21%**.

These buckets are intentionally not tuned to a target. “Other” is shown because the legacy label is not a partition of current direct causes; it includes reflection/action-economy/MP/long-fight categories in addition to the explicit unknown bucket.

The largest contributing-cause evidence among former raw deaths is `reflection_chain` (5,630 candidate observations), followed by `action_economy_chain` (4,366) and `sustain_failure_chain` (1,262). Candidate counts are multi-label evidence, not exclusive death counts. Mechanism firing to death is mean 1.53 rounds, p50 1, p95 4.

## Representative trace checks

The JSON runner output retains death traces with the causal event schema. Representative checks include:

- Action economy: B8 swarm AoE death has split/additional actions in rounds 1–4, HP 14→8→8→6→0, and the lethal event is ordinary physical damage on round 4.
- MP starvation: B13 MP-pressure AoE death records MP drain, MP 15→12→8→5→3→0, then a physical fallback on round 6; the lethal event remains ordinary physical damage.
- Spell denial: B8 magic-denial AoE death records silence and spell-opportunity loss in rounds 1–2, then ordinary physical damage kills on round 3.
- Reflection: B8 magic-denial AoE death records a reflected spell and lethal `attackType=reflect` on round 2.
- Pure raw: a representative trace has no preceding causal mechanism and only ordinary physical damage before lethal.

The existing `chooseAutoCombatAction` policy was used unchanged. It selected expected spells for all four builds. Across the 144 cells, fallback counts were AoE 65, Single 0, Sustain 96, Hybrid 0; spell-opportunity losses were AoE 448, Single 411, Sustain 738, Hybrid 309. The traces do not show an unexpected fallback pattern: fallback occurs when no castable offensive spell remains, while silence is recorded as an opportunity loss. This is not an expert-player AI and does not model manual input.

## Fixture validity

The six fixtures resolve from production `MONSTERS` definitions and retain production trait chances/status attack patterns and round-resolver conditions. They are controlled tests, not a sample of dungeon encounter frequency. The run contains 60 extreme 0/500 or 500/500 build×fixture×depth cells; those extremes are composition-specific and must not be generalized as production rates.

## Required decision

This result is **B with a measurement follow-up**: pure raw damage is the majority of the former raw label, so the next gameplay investigation should examine non-depth raw sources, enemy count, and action count. Measurement attribution should remain in place because 18.58% is mechanic-mediated and 11.33% of the former raw label remains unknown/mixed. No enemy HP/ATK, Mage stats, encounter balance, or labels were changed.

#973 Build Confidence: **Revise**. Build/encounter interactions remain real, but the old raw label concealed both mechanic-mediated chains and a large pure-raw component.
