## Summary

Closes #990.

This PR adds a production-backed full-run measurement for the four existing Mage builds. It measures actual progression through B1-B30, production floor generation, production encounter selection, production combat resolution, HP/MP carry-over, floor-transition recovery, camp recovery, and mandatory milestone bosses. Shared run seeds keep map, route, trigger stream, and common encounter identity aligned across builds.

No production balance value was changed. #987 W3's one-enemy-action-per-round cap was not rerun as a full-run condition. R1/R2 sensitivity runs were not added because baseline already showed that B21+ was unobserved under the explicitly omitted player decisions.

## Evidence

- JSON: `evidence/results/issue-990-reached-run.json`
- Markdown: `evidence/results/issue-990-reached-run.md`
- Runner: `scratch/measurements/issue990_reached_run.js`
- Regression: `scratch/tests/regression/test_reached_run_measurement.js`
- Measurement: N=500 per build, seed `990-reached-run`, runner `issue990-reached-run-v1`
- Production baseline: `f01a08733cc81998e522fa9d1c1cdd8f3714bf2b`
- Environment signature: `4af59f9a8111170b`

The JSON records `startedRuns`, B1-B30 `reachedDepth`, `deathDepthDistribution`, experienced encounters, family/enemy-count slices, HP/MP before and after, rounds, normal hits, normal damage, enemy actions, exclusive death categories, and death windows. Lookback 1 is the lethal encounter; lookbacks 2 and 3 are the immediately preceding encounters.

Loot/equipment upgrades, inventory decisions, retreat decisions, roaming-elite AI, traps/non-combat damage, and midboss cells are omitted and explicitly listed in the evidence. Reached-run distributions are survivor-conditioned and are never presented as global full-run frequency.

## Results

### Actual reach

| Build | B5 | B10 | B15 | B20 | B21+ | B30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AoE Burst Mage | 472/500 (94.40%) | 54/500 (10.80%) | 0 | 0 | 0 | 0 |
| Single-target Efficient Mage | 488/500 (97.60%) | 117/500 (23.40%) | 3/500 (0.60%, insufficient) | 0 | 0 | 0 |
| Sustain Mage | 499/500 (99.80%) | 194/500 (38.80%) | 1/500 (0.20%, insufficient) | 0 | 0 | 0 |
| Hybrid / Fallback Mage | 500/500 (100.00%) | 220/500 (44.00%) | 28/500 (5.60%, insufficient) | 0 | 0 | 0 |

All 2,000 runs died before B20. B21/B25/B30 reached-run populations are `unobserved`, not zero-frequency estimates. Deaths were concentrated at B5, then B8-B10 depending on build.

### Three-arm comparison

The #987 arms are generated/fixture weighted. The #990 arm is weighted by encounters actually experienced by each build; it is not a single global full-run frequency.

| Arm | Pure raw | Normal hit | Normal hits | Total normal damage | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| #987 controlled stress / overall | 43.50% | 6.38 | 2.90 | 18.48 | 2.72 | 2.07 | 0.21 | 0.70 |
| #987 generated weighted / overall | 38.51% | 6.66 | 2.01 | 13.37 | 2.13 | 1.59 | 0.46 | 0.76 |
| #990 actual / AoE | 2.10% | 1.80 | 1.85 | 3.51 | 2.39 | 1.53 | 0.92 | 0.48 |
| #990 actual / Single | 1.22% | 2.29 | 1.61 | 3.77 | 2.15 | 1.52 | 0.93 | 0.51 |
| #990 actual / Sustain | 1.27% | 2.71 | 1.80 | 5.23 | 2.36 | 1.52 | 0.93 | 0.55 |
| #990 actual / Hybrid | 2.39% | 2.50 | 1.47 | 3.73 | 2.13 | 1.51 | 0.91 | 0.47 |

Per-build #987 generated pure-raw rates were AoE 18.07%, Single 43.77%, Sustain 37.28%, Hybrid 54.92%. Actual reached-run rates were AoE 2.10%, Single 1.22%, Sustain 1.27%, Hybrid 2.39%; the difference is a population/depth-selection difference, not evidence that actual runs are safer against the same deep encounters.

### Death causes and pure-raw exposure

| Build | Pure raw deaths | Mechanic-mediated raw lethal | Direct mechanic death | Unknown/mixed |
| --- | ---: | ---: | ---: | ---: |
| AoE | 179 | 143 | 116 | 62 |
| Single | 129 | 192 | 123 | 56 |
| Sustain | 146 | 193 | 96 | 65 |
| Hybrid | 282 | 88 | 116 | 14 |

Among pure-raw deaths, the lethal encounter itself had mean total normal damage of AoE 27.35, Single 28.02, Sustain 47.76, Hybrid 23.61, with mean normal hits of 6.03, 5.45, 7.73, and 3.97 respectively. The preceding encounter contributed only 3.85, 5.83, 8.27, and 4.15 mean normal damage, and the encounter before that 2.70, 4.00, 5.61, and 4.11. The final lethal physical hit/maxHP mean was 0.122, 0.125, 0.089, and 0.124 respectively.

Interpretation: pure raw is not explained by a single isolated hit. The lethal encounter generally contains multiple normal hits and cumulative damage, but the immediate lethal encounter contributes more than the prior two encounters combined in this shallow, omitted-decision run. Single-hit pressure and cumulative exposure are therefore both recorded; the evidence points to cumulative exposure within the lethal encounter plus the final hit, not to “last hit alone.”

### Enemy action exposure and composition

Actual enemy actions/round were 1.531 AoE, 1.516 Single, 1.521 Sustain, and 1.510 Hybrid; enemy actions/encounter were 3.907, 3.500, 3.786, and 3.377. By enemy count, actions/round were approximately 1.02 for one enemy, 1.87-1.90 for two enemies, and 2.69-2.77 for three enemies. Multi-enemy ordinary and single-aggressor encounters were the most experienced families; exact family and enemy-count frequencies are in the JSON.

This is observed exposure, not a causal balance estimate: actual runs terminate early, and no artificial W3 action cap was applied.

### Matched common support

Only common event keys are paired. #975-compatible strict reversal requires both paired clear-outcome and diagnostic-utility bootstrap 95% CIs to exclude zero with sign reversal; minimum paired N is 30. N<30 is insufficient and excluded.

| Pair | Common N | Clear delta (left-right) | HP delta | MP delta | Strict reversals | Insufficient family comparisons |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AoE vs Single | 8,394 | -0.0379 | -0.0325 | -0.1137 | 0 | 54 |
| AoE vs Sustain | 8,486 | -0.0481 | -0.0482 | -0.1757 | 0 | 58 |
| AoE vs Hybrid | 8,058 | -0.0324 | -0.0233 | -0.1026 | 0 | 54 |
| Single vs Sustain | 10,219 | -0.0177 | -0.0239 | -0.0642 | 0 | 45 |
| Single vs Hybrid | 9,323 | -0.0079 | -0.0026 | +0.0062 | 6 | 45 |
| Sustain vs Hybrid | 9,768 | -0.0014 | +0.0111 | +0.0663 | 4 | 45 |

Matched comparison retains 10 strict reversals overall. Reversal survives for specific Single/Hybrid and Sustain/Hybrid family comparisons, but not for the AoE comparisons or Single/Sustain aggregate pairs. Deep reached-run composition alone is not used to infer encounter strength.

## Build Confidence decision

- #987 generated-frequency best-build share: Sustain 28.98% (AoE 27.66%, Hybrid 25.04%, Single 18.33%).
- #990 actual highest-reached-depth dominance on shared seeds: Hybrid 43.17%, Sustain 33.87%, Single 17.60%, AoE 5.37%. Hybrid is the largest reach winner, but this is a survival/reach result and does not prove deep-encounter superiority.
- #975-compatible #990 strict reversals: 10; insufficient comparisons: 301; minimum paired N: 30.
- #973 Build Confidence: **Revise**. The run explains shallow encounter exposure and death/depletion patterns, but omitted loot/equipment/retreat/non-combat paths and the absence of B21+ survivors prevent a production-confidence claim for deep raw pressure.

## Decisions requested by the issue

1. `generateEncounter` weighted vs actual reached-run weighted: materially different. Actual conditional encounter pure-raw rates are 1.22%-2.39% by build versus 18.07%-54.92% in #987 generated weighting, with entirely different depth support; they must not be treated as interchangeable.
2. B21+ pure-raw increase in real runs: **not estimable**. No build reached B20, so B21+ is explicitly `unobserved`.
3. Pure raw: both factors matter. The lethal encounter's cumulative normal damage dominates the preceding 1-2 encounter window, while its multiple normal hits show that a single final hit alone is insufficient as the explanation.
4. Enemy action exposure: observed at 1.51-1.53 actions/round and 3.38-3.91 actions/encounter, increasing with enemy count; it is a plausible contributor but not isolated causally here.
5. Build depth: Hybrid reaches deepest most often (B15 5.60%, still N=28 insufficient); Sustain is next at B10, while AoE collapses earliest. No build reaches B20+ in this baseline.
6. Matched comparison: selected family-level preference reversals remain (10 strict reversals), while aggregate AoE and Single/Sustain directions do not reverse.
7. One-build dominance: Hybrid leads actual reach dominance at 43.17% but does not hold a majority; this is survivor bias in the reach metric, not proof of deep encounter strength.
8. #973 Build Confidence: **Revise**.
9. Production tuning: **Do not proceed** from this measurement.
10. If a later tuning investigation is opened, first use depth/family-specific paired validation of normal physical damage and enemy-action exposure. No production lever is selected or changed by this PR.

## Verification

- `npm run lint` ✅
- `npm run test:unit` ✅ (149 pass, 3 heavy skips)
- `node scratch/tests/regression/test_reached_run_measurement.js` ✅
- `npm run build` ✅
- Full measurement ✅ (N=500/build, shared seed, provenance clean)
