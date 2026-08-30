# Issue #976: deep Build Test diagnosis and tuning

## Scope, validity, and provenance

The measurement/diagnosis path is retained. This is the #974 production-backed runner
with the same shared-seed and strict-pairing rules, extended from B8/B13/B18 to
B8/B13/B18/B21/B25/B30.

- Runner: `scratch/measurements/issue973_build_sensitivity.js`, `issue973-build-sensitivity-v6`, schema 5.
- Gameplay base: `fb5ebe98aa20a48ccf5dbe539472c06f69e03fba` (`origin/main`).
- Final source: `ecaccaa59e7381da51bf320737c01cf590ca01ba`.
- Runner diff SHA-256: `a88743a9053615d2e16a3735c1e7508326172e2a4c9cbf84981eb608e45bd24d`.
- Environment: Node `v26.7.0`, signature `5c9c62de42f8e64b`.
- Seed: `issue974-v0`; N=500 per build × encounter × depth; 4 Mage builds × 6 encounters.
- Shared seeds: `rootSeed:run:<index>:B<depth>:<encounterId>`; build ID is excluded from the seed.
- Strict reversal: paired outcome and utility differences, both significant by bootstrap 95% CI, reverse sign in both compared encounters; 2,000 bootstrap iterations.

The runner models production monster data, depth scaling, combat resolution, auto action,
spell/affix/core/status rules, and telemetry attribution. It omits map traversal, manual
input, consumables/retreat, shops, loot/economy, and between-encounter progression.

## Diagnosis

The original #975 B13/B18 result was `14,784/17,686 = 83.59%` primary
`raw_damage_pressure`. Extending the unchanged baseline to B21/B25/B30 produced
`41,520/49,333 = 84.16%`, so the conclusion did not depend on stopping at B18.

Composition is the larger discriminator than a single universal mechanic:

| Deep encounter | Raw primary attribution | What happened before/with the mechanic |
| --- | ---: | --- |
| swarm-action-pressure | 522/5,900 = 8.8% | action-economy attribution remained visible |
| magic-denial | 8,815/9,565 = 92.2% | spell denial and reflection fired, but ordinary damage usually ended the run first |
| mp-pressure | 9,119/9,540 = 95.6% | MP drain/action pressure existed, but raw death dominated |
| durable-single-target | 8,088/8,088 = 100.0% | regen did not create enough time for the weaker builds |
| protected-formation | 5,777/5,777 = 100.0% | the Mage-only spell fixture did not exercise guard as a player response |
| attrition-recovery-denial | 3,033/3,649 = 83.1% | action economy and status-lock differences remained measurable |

Thus mechanics were not universally absent, but in the most punishing cells they fired too
late to become the primary failure. The recurrent Hybrid Fallback 0/500 clear in denial and
durable cells is an existing hard-counter-shaped weakness; this tuning did not introduce a
new mechanic or conceal it.

## B8/B13/B18/B21/B25/B30 scaling and final candidate

The final candidate leaves B1-B10 unchanged, uses a B10-anchored 50% HP slope for B11+,
and uses a B10-anchored 0.125 ATK slope for B11+. B21+ therefore resumes growth instead of
remaining at a permanent B10 HP ceiling.

| Depth | HP multiplier | ATK multiplier | Mean clear | Mean death | Raw primary / deaths | Post HP / MP | Resource signature (HP used / MP used / spells / physical) | Strict reversals |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| B8 | 1.3135 | 1.1818 | 0.481 | 6,224 | 5,050/6,224 = 81.1% | 0.433 / 0.706 | 0.567 / 0.294 / 2.950 / 0.000 | 12 |
| B13 | 1.4818 | 1.2483 | 0.390 | 7,315 | 6,041/7,315 = 82.6% | 0.347 / 0.686 | 0.653 / 0.314 / 3.005 / 0.004 | 18 |
| B18 | 1.6228 | 1.2835 | 0.331 | 8,022 | 6,690/8,022 = 83.4% | 0.293 / 0.677 | 0.707 / 0.323 / 2.994 / 0.005 | 10 |
| B21 | 1.7307 | 1.3106 | 0.277 | 8,680 | 7,240/8,680 = 83.4% | 0.245 / 0.674 | 0.755 / 0.326 / 2.957 / 0.006 | 9 |
| B25 | 1.8161 | 1.3319 | 0.248 | 9,028 | 7,528/9,028 = 83.4% | 0.220 / 0.671 | 0.780 / 0.329 / 2.950 / 0.007 | 12 |
| B30 | 1.9782 | 1.3726 | 0.211 | 9,474 | 7,855/9,474 = 82.9% | 0.188 / 0.667 | 0.812 / 0.333 / 2.923 / 0.006 | 3 |

B21+ remains harder: mean clear falls B21 `0.277` → B25 `0.248` → B30 `0.211`,
post-combat HP falls `0.245` → `0.220` → `0.188`, and HP/ATK multipliers continue to
rise. This is a depth curve, not a B10-valued stat cell repeated forever.

## Small tuning sweep

All rows used the same `issue974-v0`, N=500, v6 runner and strict-pairing policy. `Deep
raw` is B13+ primary raw damage attribution. `Depth range` is the runner's depth clear-rate
range; dominance lists the observed best-cell counts.

| Candidate | Deep raw | Strict reversal | Raw reversals | Depth range | Dominance | Decision |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Full baseline HP/ATK growth | 84.16% | 54 | 67 | 0.398 | AoE 25, Sustain 17, Single 6, Hybrid 6 | reference |
| B11+ permanent B10 HP cap, ATK unchanged | 84.28% | 101 | 79 | 0.238 | AoE 18, Sustain 15, Single 3 | reject: B21/B25/B30 HP flat and depth contrast compressed |
| B11-B20 cap, B21+ HP growth restart | 84.65% | 84 | 75 | 0.362 | AoE 21, Sustain 14, Single 3, Hybrid 1 | reject: growth restored but raw wall worsened |
| Nonlinear HP + B10-anchored deep ATK slope 0.25 | 83.42% | 73 | 76 | 0.305 | AoE 21, Sustain 16 | reject: viable, but less raw improvement than 0.125 |
| Nonlinear HP + flat B10-anchored deep ATK | 82.82% | 58 | 72 | 0.211 | AoE 20, Sustain 16 | reject: best raw share, but ATK/depth contrast too compressed |
| **Nonlinear HP + B10-anchored deep ATK slope 0.125** | **83.15%** | **64** | **74** | **0.271** | **AoE 20, Sustain 16** | **selected revised tuning** |

The selected row is the Pareto compromise: it improves the raw wall over the extended
baseline, keeps strict reversals above baseline, has no 80% dominant build, and retains
monotonic B21+ HP/ATK progression. It does not make the 60% red flag pass.

## Final clear/death by encounter × build × depth

Each entry is `clear/death` over N=500 for the selected tuning.

| Depth | Encounter | AoE Burst | Single Efficient | Sustain | Hybrid Fallback |
| --- | --- | ---: | ---: | ---: | ---: |
| B8 | swarm-action-pressure | 448/52 | 7/493 | 488/12 | 105/395 |
| B8 | magic-denial | 97/403 | 49/451 | 37/463 | 0/500 |
| B8 | mp-pressure | 228/272 | 32/468 | 186/314 | 0/500 |
| B8 | durable-single-target | 362/138 | 301/199 | 457/43 | 0/500 |
| B8 | protected-formation | 432/68 | 412/88 | 464/36 | 63/437 |
| B8 | attrition-recovery-denial | 475/25 | 323/177 | 499/1 | 311/189 |
| B13 | swarm-action-pressure | 426/74 | 3/497 | 463/37 | 47/453 |
| B13 | magic-denial | 94/406 | 37/463 | 11/489 | 0/500 |
| B13 | mp-pressure | 155/345 | 29/471 | 61/439 | 0/500 |
| B13 | durable-single-target | 274/226 | 175/325 | 360/140 | 0/500 |
| B13 | protected-formation | 425/75 | 259/241 | 390/110 | 28/472 |
| B13 | attrition-recovery-denial | 456/44 | 285/215 | 494/6 | 213/287 |
| B18 | swarm-action-pressure | 430/70 | 6/494 | 444/56 | 32/468 |
| B18 | magic-denial | 69/431 | 5/495 | 7/493 | 0/500 |
| B18 | mp-pressure | 97/403 | 4/496 | 16/484 | 0/500 |
| B18 | durable-single-target | 119/381 | 97/403 | 293/207 | 0/500 |
| B18 | protected-formation | 439/61 | 187/313 | 349/151 | 6/494 |
| B18 | attrition-recovery-denial | 476/24 | 227/273 | 494/6 | 181/319 |
| B21 | swarm-action-pressure | 402/98 | 0/500 | 400/100 | 10/490 |
| B21 | magic-denial | 75/425 | 1/499 | 4/496 | 0/500 |
| B21 | mp-pressure | 59/441 | 0/500 | 5/495 | 0/500 |
| B21 | durable-single-target | 99/401 | 50/450 | 217/283 | 0/500 |
| B21 | protected-formation | 433/67 | 74/426 | 267/233 | 2/498 |
| B21 | attrition-recovery-denial | 447/53 | 186/314 | 497/3 | 92/408 |
| B25 | swarm-action-pressure | 387/113 | 5/495 | 344/156 | 11/489 |
| B25 | magic-denial | 72/428 | 1/499 | 0/500 | 0/500 |
| B25 | mp-pressure | 30/470 | 1/499 | 0/500 | 0/500 |
| B25 | durable-single-target | 0/500 | 14/486 | 171/329 | 0/500 |
| B25 | protected-formation | 429/71 | 52/448 | 244/256 | 0/500 |
| B25 | attrition-recovery-denial | 454/46 | 176/324 | 487/13 | 94/406 |
| B30 | swarm-action-pressure | 393/107 | 0/500 | 296/204 | 1/499 |
| B30 | magic-denial | 59/441 | 0/500 | 0/500 | 0/500 |
| B30 | mp-pressure | 3/497 | 0/500 | 0/500 | 0/500 |
| B30 | durable-single-target | 0/500 | 0/500 | 43/457 | 0/500 |
| B30 | protected-formation | 426/74 | 39/461 | 174/326 | 0/500 |
| B30 | attrition-recovery-denial | 437/63 | 132/368 | 479/21 | 44/456 |

## Failure attribution and resources

The selected deep aggregate (`B13+`) distribution is:

| Primary attribution | Count |
| --- | ---: |
| raw_damage_pressure | 35,354 |
| action_economy | 6,356 |
| reflection_or_counter | 693 |
| spell_denial | 57 |
| mp_starvation | 56 |
| status_lock | 3 |
| unknown_or_mixed | 3 |

Mechanism telemetry confirms the distinction between “did fire” and “was primary”: for
example, magic-denial has recurring spell-denial/reflection firings, while the weakest
Hybrid cells still die to raw damage; durable-single-target has regen activity but raw damage
remains primary. This is why the result is not described as a solved Build Test.

Across the selected run, max mean resource-signature distance is `0.848` (baseline `0.890`),
and the per-depth signatures are shown in the scaling table. Build-conditioned clear rates
remain widely separated at every depth; for example the aggregate B21 rates are AoE `0.804`,
Single `0.000`, Sustain `0.800`, Hybrid `0.020`, while B30 is AoE `0.786`, Single `0.000`,
Sustain `0.592`, Hybrid `0.002`. These differences are not a uniform clear-rate lift.

## Interpretation and decisions

1. **83.59% → 83.30% correction:** the earlier permanent HP-cap result increased survival
   room and raised strict build sensitivity (`44→50` in the original B13/B18 comparison),
   but reduced raw share by only `0.29pt`; primary failure remained a raw damage wall. It
   must not be described as solved.
2. **Final wall change:** on the same extended v6 runner, raw share is `84.16%→83.15%`
   (`-1.01pt`); against the original #975 B13/B18 reference it is `83.59%→83.15%`
   (`-0.44pt`). The deep share is still far above the 60% red flag.
3. **Changed lever:** reject the B11+ permanent HP cap. Use a B10-anchored nonlinear HP
   slope and a limited B10-anchored B11+ ATK slope. This preserves B8, avoids player/Mage
   buffs, keeps the measurement condition unchanged, resumes B21+ growth, and targets the
   diagnosed “raw attack ends the test before composition mechanics pay off” interaction.
4. **Strict significant reversals:** `54→64` on the extended same-runner comparison;
   maintained and increased, not erased.
5. **Dominance / hard counter:** no single build is dominant (best cells AoE 20 / Sustain
   16, 55.6% / 44.4% of 36 ranking cells). Existing hard-counter-shaped Hybrid denial and
   durable cells remain, so the tuning is not claimed to remove hard counters.
6. **B11+ conclusion:** B21/B25/B30 are no longer identical B10 HP cells and their clear
   rates/HP/ATK continue to worsen with depth, so the band is closer to a build test. Because
   primary raw attribution remains 83.15%, it is not yet a successful replacement of the
   raw stat wall.
7. **Design status:** measurement/diagnosis **Keep**; production tuning **Revise** (the
   permanent cap is rejected and replaced by the selected limited tuning); #973 Build
   Confidence **Revise** (encounter-conditioned build differences and strict reversals are
   real, but the hypothesis must include a remaining raw-wall qualifier).

The roaming elite regression remains split into same-template progression and biome-transition
continuity checks; the boundary check is not weakened by comparing only same-name elites.

Closes #976
