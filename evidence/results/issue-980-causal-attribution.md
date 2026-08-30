# Issue #980 Causal Attribution Measurement

- runner: issue980-causal-attribution-v2
- source commit: `5b37dacbd099819ba9d4c081eae486d58f0291ec`
- origin/main ancestor: true
- N=500 per build / encounter / depth; seed=974-build-confidence
- builds: AoE Burst Mage, Single-target / Efficient Mage, Sustain Mage, Hybrid / Fallback Mage
- encounters: 6; depths: B8, B13, B18, B21, B25, B30

## Causal result

- previous production baseline: #978 runner v6, deep primary raw damage **41,520 / 49,333 = 84.16%** (reproduced under the same seed policy before this observer was added)
- legacy raw_damage_pressure denominator: **41512** (direct raw lethal events observed: 39779)
- exclusive breakdown: pure raw **26683 / 41512 = 64.28%**; mechanic-mediated raw lethal **5692 / 41512 = 13.71%**; direct mechanic **8388 / 41512 = 20.21%**; unknown/mixed **749 / 41512 = 1.80%**; total=41512
- special-mechanic-caused total (exclusive mechanic-mediated + direct mechanic): **14080 / 41512 = 33.92%**
- mechanic firing → death: count=24438, mean=1.65 rounds, p50=1, p95=4

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
- [clear] unknown_failure_attribution: unknown_or_mixed is >40% of eligible high-consumption/death runs; observed={"unknown":0,"eligible":55548,"share":0}
- [clear] depth_scaling_dominates: depth clear-rate range is >2x the observed build clear-rate range; observed={"depthRange":0.3990833333333333,"buildRange":1}

## Build × encounter × depth causal counts

Each row is N=500 for one build/fixture/depth. Counts are exclusive categories within the legacy raw denominator: `pure/mech-raw/direct-mechanic/unknown`.

| Depth | Encounter | Build | Clear / death | Pure raw | Mechanic raw lethal | Direct mechanic | Unknown/mixed | Fallback | Mech→death mean |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B8 | swarm-action-pressure | aoe-burst | 435 / 65 | 4 | 3 | 0 | 0 | 0 | 1.44 |
| B8 | swarm-action-pressure | single-efficient | 5 / 495 | 37 | 0 | 0 | 0 | 0 | 1.39 |
| B8 | swarm-action-pressure | sustain | 490 / 10 | 0 | 0 | 0 | 0 | 0 | 2.50 |
| B8 | swarm-action-pressure | hybrid-fallback | 108 / 392 | 16 | 6 | 0 | 0 | 0 | 1.28 |
| B8 | magic-denial | aoe-burst | 100 / 400 | 4 | 85 | 200 | 77 | 0 | 0.65 |
| B8 | magic-denial | single-efficient | 57 / 443 | 79 | 204 | 157 | 1 | 0 | 0.64 |
| B8 | magic-denial | sustain | 34 / 466 | 15 | 212 | 48 | 39 | 0 | 1.21 |
| B8 | magic-denial | hybrid-fallback | 0 / 500 | 132 | 178 | 187 | 2 | 0 | 0.50 |
| B8 | mp-pressure | aoe-burst | 242 / 258 | 8 | 23 | 222 | 2 | 2 | 2.63 |
| B8 | mp-pressure | single-efficient | 33 / 467 | 124 | 0 | 343 | 0 | 0 | n/a |
| B8 | mp-pressure | sustain | 193 / 307 | 84 | 15 | 199 | 0 | 2 | 5.27 |
| B8 | mp-pressure | hybrid-fallback | 0 / 500 | 173 | 20 | 284 | 0 | 0 | 4.18 |
| B8 | durable-single-target | aoe-burst | 365 / 135 | 135 | 0 | 0 | 0 | 0 | n/a |
| B8 | durable-single-target | single-efficient | 291 / 209 | 209 | 0 | 0 | 0 | 0 | n/a |
| B8 | durable-single-target | sustain | 457 / 43 | 43 | 0 | 0 | 0 | 0 | n/a |
| B8 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | aoe-burst | 447 / 53 | 29 | 24 | 0 | 0 | 0 | 0.00 |
| B8 | protected-formation | single-efficient | 405 / 95 | 95 | 0 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | sustain | 463 / 37 | 37 | 0 | 0 | 0 | 0 | n/a |
| B8 | protected-formation | hybrid-fallback | 69 / 431 | 431 | 0 | 0 | 0 | 0 | n/a |
| B8 | attrition-recovery-denial | aoe-burst | 470 / 30 | 3 | 21 | 0 | 0 | 0 | 0.56 |
| B8 | attrition-recovery-denial | single-efficient | 326 / 174 | 117 | 22 | 0 | 0 | 0 | 2.06 |
| B8 | attrition-recovery-denial | sustain | 500 / 0 | 0 | 0 | 0 | 0 | 0 | n/a |
| B8 | attrition-recovery-denial | hybrid-fallback | 349 / 151 | 106 | 19 | 0 | 3 | 0 | 1.76 |
| B13 | swarm-action-pressure | aoe-burst | 414 / 86 | 3 | 5 | 0 | 0 | 0 | 1.28 |
| B13 | swarm-action-pressure | single-efficient | 4 / 496 | 46 | 0 | 0 | 0 | 0 | 1.37 |
| B13 | swarm-action-pressure | sustain | 400 / 100 | 0 | 0 | 0 | 0 | 0 | 2.50 |
| B13 | swarm-action-pressure | hybrid-fallback | 20 / 480 | 32 | 9 | 0 | 0 | 0 | 1.23 |
| B13 | magic-denial | aoe-burst | 84 / 416 | 10 | 78 | 204 | 87 | 0 | 0.63 |
| B13 | magic-denial | single-efficient | 11 / 489 | 158 | 180 | 151 | 0 | 0 | 0.55 |
| B13 | magic-denial | sustain | 17 / 483 | 47 | 252 | 51 | 27 | 0 | 1.05 |
| B13 | magic-denial | hybrid-fallback | 0 / 500 | 180 | 162 | 158 | 0 | 0 | 0.56 |
| B13 | mp-pressure | aoe-burst | 132 / 368 | 11 | 40 | 292 | 13 | 21 | 3.06 |
| B13 | mp-pressure | single-efficient | 11 / 489 | 139 | 0 | 350 | 0 | 0 | 4.33 |
| B13 | mp-pressure | sustain | 28 / 472 | 120 | 45 | 274 | 0 | 37 | 5.45 |
| B13 | mp-pressure | hybrid-fallback | 0 / 500 | 164 | 21 | 274 | 0 | 0 | 4.09 |
| B13 | durable-single-target | aoe-burst | 7 / 493 | 493 | 0 | 0 | 0 | 0 | n/a |
| B13 | durable-single-target | single-efficient | 125 / 375 | 375 | 0 | 0 | 0 | 0 | n/a |
| B13 | durable-single-target | sustain | 306 / 194 | 194 | 0 | 0 | 0 | 0 | n/a |
| B13 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | aoe-burst | 425 / 75 | 38 | 37 | 0 | 0 | 0 | 0.07 |
| B13 | protected-formation | single-efficient | 135 / 365 | 365 | 0 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | sustain | 350 / 150 | 150 | 0 | 0 | 0 | 0 | n/a |
| B13 | protected-formation | hybrid-fallback | 12 / 488 | 488 | 0 | 0 | 0 | 0 | n/a |
| B13 | attrition-recovery-denial | aoe-burst | 446 / 54 | 6 | 37 | 0 | 0 | 0 | 0.68 |
| B13 | attrition-recovery-denial | single-efficient | 194 / 306 | 200 | 62 | 0 | 4 | 0 | 1.98 |
| B13 | attrition-recovery-denial | sustain | 493 / 7 | 1 | 2 | 0 | 0 | 0 | 1.50 |
| B13 | attrition-recovery-denial | hybrid-fallback | 122 / 378 | 254 | 64 | 0 | 2 | 0 | 1.71 |
| B18 | swarm-action-pressure | aoe-burst | 368 / 132 | 3 | 6 | 0 | 0 | 0 | 1.14 |
| B18 | swarm-action-pressure | single-efficient | 3 / 497 | 55 | 0 | 0 | 0 | 0 | 1.35 |
| B18 | swarm-action-pressure | sustain | 321 / 179 | 0 | 0 | 0 | 0 | 0 | 2.58 |
| B18 | swarm-action-pressure | hybrid-fallback | 8 / 492 | 58 | 8 | 0 | 0 | 0 | 1.30 |
| B18 | magic-denial | aoe-burst | 61 / 439 | 3 | 77 | 208 | 120 | 0 | 0.58 |
| B18 | magic-denial | single-efficient | 0 / 500 | 196 | 179 | 125 | 0 | 0 | 0.58 |
| B18 | magic-denial | sustain | 0 / 500 | 55 | 255 | 50 | 32 | 0 | 1.04 |
| B18 | magic-denial | hybrid-fallback | 0 / 500 | 191 | 177 | 131 | 1 | 0 | 0.56 |
| B18 | mp-pressure | aoe-burst | 13 / 487 | 19 | 89 | 350 | 19 | 17 | 3.16 |
| B18 | mp-pressure | single-efficient | 0 / 500 | 155 | 0 | 345 | 0 | 0 | 4.00 |
| B18 | mp-pressure | sustain | 0 / 500 | 111 | 55 | 294 | 0 | 29 | 5.42 |
| B18 | mp-pressure | hybrid-fallback | 0 / 500 | 204 | 14 | 229 | 0 | 0 | 3.85 |
| B18 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B18 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B18 | durable-single-target | sustain | 114 / 386 | 386 | 0 | 0 | 0 | 0 | n/a |
| B18 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | aoe-burst | 406 / 94 | 35 | 59 | 0 | 0 | 0 | 0.45 |
| B18 | protected-formation | single-efficient | 25 / 475 | 475 | 0 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | sustain | 92 / 408 | 408 | 0 | 0 | 0 | 0 | n/a |
| B18 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B18 | attrition-recovery-denial | aoe-burst | 401 / 99 | 15 | 63 | 0 | 5 | 0 | 0.85 |
| B18 | attrition-recovery-denial | single-efficient | 157 / 343 | 203 | 71 | 0 | 2 | 0 | 2.00 |
| B18 | attrition-recovery-denial | sustain | 477 / 23 | 8 | 8 | 0 | 0 | 0 | 1.56 |
| B18 | attrition-recovery-denial | hybrid-fallback | 55 / 445 | 300 | 63 | 0 | 4 | 0 | 1.93 |
| B21 | swarm-action-pressure | aoe-burst | 340 / 160 | 4 | 11 | 0 | 0 | 0 | 1.01 |
| B21 | swarm-action-pressure | single-efficient | 0 / 500 | 86 | 0 | 0 | 0 | 0 | 1.27 |
| B21 | swarm-action-pressure | sustain | 205 / 295 | 0 | 0 | 0 | 0 | 0 | 2.53 |
| B21 | swarm-action-pressure | hybrid-fallback | 1 / 499 | 128 | 19 | 0 | 0 | 0 | 1.23 |
| B21 | magic-denial | aoe-burst | 50 / 450 | 33 | 76 | 228 | 86 | 0 | 0.51 |
| B21 | magic-denial | single-efficient | 0 / 500 | 221 | 152 | 127 | 0 | 0 | 0.58 |
| B21 | magic-denial | sustain | 0 / 500 | 69 | 276 | 53 | 25 | 0 | 1.00 |
| B21 | magic-denial | hybrid-fallback | 0 / 500 | 226 | 140 | 134 | 0 | 0 | 0.62 |
| B21 | mp-pressure | aoe-burst | 0 / 500 | 21 | 108 | 347 | 14 | 9 | 3.00 |
| B21 | mp-pressure | single-efficient | 0 / 500 | 153 | 0 | 347 | 0 | 0 | 4.00 |
| B21 | mp-pressure | sustain | 0 / 500 | 102 | 66 | 294 | 0 | 18 | 5.26 |
| B21 | mp-pressure | hybrid-fallback | 0 / 500 | 219 | 6 | 212 | 0 | 0 | 3.78 |
| B21 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B21 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B21 | durable-single-target | sustain | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B21 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | aoe-burst | 340 / 160 | 104 | 56 | 0 | 0 | 0 | 0.79 |
| B21 | protected-formation | single-efficient | 23 / 477 | 477 | 0 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | sustain | 3 / 497 | 497 | 0 | 0 | 0 | 0 | n/a |
| B21 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B21 | attrition-recovery-denial | aoe-burst | 362 / 138 | 34 | 83 | 0 | 7 | 0 | 1.15 |
| B21 | attrition-recovery-denial | single-efficient | 101 / 399 | 247 | 83 | 0 | 2 | 0 | 1.92 |
| B21 | attrition-recovery-denial | sustain | 437 / 63 | 18 | 18 | 0 | 0 | 0 | 1.69 |
| B21 | attrition-recovery-denial | hybrid-fallback | 25 / 475 | 313 | 67 | 0 | 1 | 0 | 1.89 |
| B25 | swarm-action-pressure | aoe-burst | 333 / 167 | 6 | 3 | 0 | 0 | 0 | 1.08 |
| B25 | swarm-action-pressure | single-efficient | 0 / 500 | 84 | 0 | 0 | 0 | 0 | 1.16 |
| B25 | swarm-action-pressure | sustain | 125 / 375 | 0 | 0 | 0 | 0 | 0 | 2.31 |
| B25 | swarm-action-pressure | hybrid-fallback | 1 / 499 | 237 | 21 | 0 | 0 | 0 | 1.11 |
| B25 | magic-denial | aoe-burst | 37 / 463 | 61 | 83 | 209 | 88 | 0 | 0.52 |
| B25 | magic-denial | single-efficient | 0 / 500 | 219 | 143 | 138 | 0 | 0 | 0.61 |
| B25 | magic-denial | sustain | 0 / 500 | 76 | 294 | 50 | 20 | 0 | 1.04 |
| B25 | magic-denial | hybrid-fallback | 0 / 500 | 219 | 141 | 140 | 0 | 0 | 0.62 |
| B25 | mp-pressure | aoe-burst | 0 / 500 | 25 | 97 | 349 | 21 | 7 | 3.08 |
| B25 | mp-pressure | single-efficient | 0 / 500 | 174 | 0 | 326 | 0 | 0 | 4.00 |
| B25 | mp-pressure | sustain | 0 / 500 | 126 | 52 | 280 | 0 | 6 | 4.99 |
| B25 | mp-pressure | hybrid-fallback | 0 / 500 | 236 | 3 | 193 | 0 | 0 | 3.50 |
| B25 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B25 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B25 | durable-single-target | sustain | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B25 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | aoe-burst | 239 / 261 | 193 | 68 | 0 | 0 | 0 | 1.03 |
| B25 | protected-formation | single-efficient | 14 / 486 | 486 | 0 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | sustain | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B25 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B25 | attrition-recovery-denial | aoe-burst | 324 / 176 | 52 | 104 | 0 | 5 | 0 | 1.24 |
| B25 | attrition-recovery-denial | single-efficient | 68 / 432 | 299 | 57 | 0 | 1 | 0 | 2.02 |
| B25 | attrition-recovery-denial | sustain | 356 / 144 | 79 | 21 | 0 | 0 | 0 | 1.95 |
| B25 | attrition-recovery-denial | hybrid-fallback | 10 / 490 | 379 | 41 | 0 | 1 | 0 | 1.95 |
| B30 | swarm-action-pressure | aoe-burst | 276 / 224 | 50 | 4 | 0 | 0 | 0 | 1.19 |
| B30 | swarm-action-pressure | single-efficient | 0 / 500 | 147 | 0 | 0 | 0 | 0 | 0.99 |
| B30 | swarm-action-pressure | sustain | 30 / 470 | 15 | 0 | 0 | 0 | 0 | 2.07 |
| B30 | swarm-action-pressure | hybrid-fallback | 0 / 500 | 317 | 10 | 0 | 0 | 0 | 0.77 |
| B30 | magic-denial | aoe-burst | 13 / 487 | 86 | 104 | 176 | 105 | 0 | 0.54 |
| B30 | magic-denial | single-efficient | 0 / 500 | 223 | 161 | 116 | 0 | 0 | 0.63 |
| B30 | magic-denial | sustain | 0 / 500 | 98 | 290 | 48 | 18 | 0 | 0.55 |
| B30 | magic-denial | hybrid-fallback | 0 / 500 | 223 | 160 | 117 | 0 | 0 | 0.62 |
| B30 | mp-pressure | aoe-burst | 0 / 500 | 25 | 104 | 340 | 23 | 9 | 2.95 |
| B30 | mp-pressure | single-efficient | 0 / 500 | 205 | 0 | 292 | 0 | 0 | 4.00 |
| B30 | mp-pressure | sustain | 0 / 500 | 137 | 60 | 217 | 0 | 4 | 4.72 |
| B30 | mp-pressure | hybrid-fallback | 0 / 500 | 249 | 2 | 169 | 0 | 0 | 3.82 |
| B30 | durable-single-target | aoe-burst | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | durable-single-target | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | durable-single-target | sustain | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | durable-single-target | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | aoe-burst | 200 / 300 | 187 | 113 | 0 | 0 | 0 | 0.83 |
| B30 | protected-formation | single-efficient | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | sustain | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | protected-formation | hybrid-fallback | 0 / 500 | 500 | 0 | 0 | 0 | 0 | n/a |
| B30 | attrition-recovery-denial | aoe-burst | 289 / 211 | 61 | 121 | 0 | 14 | 0 | 1.40 |
| B30 | attrition-recovery-denial | single-efficient | 29 / 471 | 314 | 77 | 0 | 0 | 0 | 2.18 |
| B30 | attrition-recovery-denial | sustain | 206 / 294 | 168 | 50 | 0 | 1 | 0 | 2.38 |
| B30 | attrition-recovery-denial | hybrid-fallback | 7 / 493 | 421 | 29 | 0 | 1 | 0 | 1.93 |

Direct cause is the lethal damage event. Contributing cause is assigned only when the trace contains state-degradation evidence before that event; `unknown_or_mixed` is retained for multiple or insufficient explanations. Each raw JSON trace retains round, HP/MP, player action, enemy action, status transitions, silence, MP drain, reflect, anti-heal, regen, summon, guard, multi-action, spell opportunity loss, physical fallback, damage source, and lethal event data.

Largest contributing cause counts among former raw deaths: reflection_chain=5630, status_lock_chain=4126, mp_starvation_chain=1233.
Auto action review: existing chooseAutoCombatAction only; no expert-player AI added; representative death traces are included in JSON.
Fixture review: Some 0/500 or 500/500 cells are expected to be composition-specific controlled tests; they are not estimates of dungeon frequency.

Modeled: production monster definitions, depth scaling, combat round resolution, existing auto action, spell effects, affix/core rules, and status rules. Omitted: map traversal, manual input, consumables/retreat, loot/economy, and between-encounter progression. Fixtures are controlled tests, not dungeon encounter-frequency estimates.
## Exclusive classification

Every death run receives exactly one `finalExclusiveCategory`:

- `pure_raw_damage`: raw lethal damage with no validated preceding state degradation.
- `mechanic_mediated_raw_lethal`: validated mechanic → state degradation → raw lethal damage.
- `direct_mechanic_death`: the mechanic itself is the direct lethal cause, such as reflection.
- `unknown_or_mixed`: multiple validated causes or insufficient evidence.

For the 41,512 legacy `raw_damage_pressure` deaths, the exhaustive breakdown is:

| Exclusive category | Deaths | Share |
| --- | ---: | ---: |
| pure_raw_damage | 26,683 | 64.28% |
| mechanic_mediated_raw_lethal | 5,692 | 13.71% |
| direct_mechanic_death | 8,388 | 20.21% |
| unknown_or_mixed | 749 | 1.80% |
| **Total** | **41,512** | **100.00%** |

Special-mechanic involvement is the exclusive sum of mechanic-mediated raw lethal plus direct mechanic death: **14,080 / 41,512 = 33.92%**. Multi-label contributing evidence is reported separately: reflection_chain=5,630, status_lock_chain=4,126, MP starvation=1,233, spell denial=1,005, sustain failure=537, and action economy=67. These candidate observations may overlap and are not death counts.

## Causal evidence and representative traces

A mechanic is not causal from firing alone. The adjudicator requires state degradation:

- silence requires actual spell opportunity loss;
- MP drain requires MP starvation/fallback or terminal low MP;
- reflection requires actual reflected/counter damage;
- summon/split/multi-action requires increased living enemy count or extra attacks followed by HP loss;
- anti-heal requires an observed suppressed heal;
- regen/guard requires the observed survival extension to be part of a long fight.

Each retained death trace includes `directCause`, `contributingCause`, `finalExclusiveCategory`, `precedingMechanisms`, `stateDegradationEvidence`, and the round/HP/MP/action/status/damage/lethal event sequence. Mechanic→death latency is supplemental evidence only: mean 1.65 rounds, p50 1, p95 4.

## Auto-action and fixture review

The existing `chooseAutoCombatAction` policy was used unchanged. Expected spell sets were observed for all four builds. Fallback totals were AoE 65, Single 0, Sustain 96, Hybrid 0; opportunity-loss totals were AoE 448, Single 411, Sustain 738, Hybrid 309. Representative traces show silence as opportunity loss and physical fallback only when offensive spells are unavailable; no systematic auto-action distortion was found. No expert-player AI was added.

All six fixtures resolve from production `MONSTERS`; trait chances, status patterns, and round-resolver conditions remain active. They are controlled tests, not dungeon encounter-frequency samples. There are 60 extreme 0/500 or 500/500 cells, so those cells are not production-rate estimates.

## Decision

- causal measurement: **Keep**
- #973 Build Confidence: **Revise**
- next investigation: **B** — pure raw remains the majority, so inspect non-depth raw sources, enemy count, and action count. Keep measurement attribution because 33.92% of legacy raw deaths have exclusive special-mechanic involvement.
- no balance tuning, enemy HP/ATK changes, Mage changes, encounter changes, or auto-action changes were made.
