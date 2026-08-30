## Summary

This PR updates the #990 measurement and keeps Issue #990 open. It does not claim to reproduce an actual player run.

The measurement uses production floor generation, encounter chance and selection, combat resolution, HP/MP carry-over, 15% floor-transition HP recovery, mandatory milestone bosses, and the production camp entry/rest helpers. The route policy is explicitly `omniscient_shortest_route`: the complete generated floor is known before movement, including stairs, milestone-boss coordinates, and secret-door edges. This is a production-map omniscient shortest-route measurement, not an actual reached-run distribution.

Production exploration does not know those coordinates at run start. Stairs and bosses are learned by reaching the relevant cell or local sensory range; a secret door is not traversable until an adjacent search reveals it. Extra walking, failed searches, and search-turn encounters are omitted. The current route is therefore a shortest-path lower bound on exploration exposure.

Recovery matches the production helpers: camp entry requires a camp floor after the preceding milestone is defeated, rest is once per camp, and it restores 40% of missing HP/MP with ceiling plus any `CORE_CAMP_MASTER` multiplier. Floor transition recovery is 15% of max HP only, capped at max; no camp is granted after an uncleared milestone.

No production balance value was changed. #987 W3's one-enemy-action-per-round cap was not rerun as a full-run condition. R1/R2 sensitivity runs were not added because baseline has no B21+ population to compare.

## Evidence

- JSON: `evidence/results/issue-990-reached-run.json`
- Markdown: `evidence/results/issue-990-reached-run.md`
- Runner: `scratch/measurements/issue990_reached_run.js`
- Regression: `scratch/tests/regression/test_reached_run_measurement.js`
- Measurement: N=500 per build, seed `990-reached-run`, runner `issue990-reached-run-v2`
- Evidence source commit: `167c15986d5861aae5146507596fc0cf8330b74f`
- Environment signature: `e2d6a636d3ac4380`
- Production baseline: `f01a08733cc81998e522fa9d1c1cdd8f3714bf2b`

The JSON separates started runs, reached depth, death depth, encounters experienced, and target-depth conditional populations. It records family/enemy-count slices, HP/MP before and after, rounds, normal hits, damage per normal hit, total normal damage, enemy actions, exclusive death categories, and the death-adjacent 1/2/3 encounter windows.

The following are omitted: loot/equipment upgrades, inventory decisions, retreat decisions, roaming elites, traps/non-combat damage, and midbosses. In particular, fixed builds do not reproduce the game's core in-run equipment acquisition and improvisation. The result is production-map/encounter/combat-backed, but not a complete player-run simulation.

## Results

### Route and survivor-bias boundary

All four builds share run seeds, floor maps, route, trigger stream, and encounter identity. Later encounters are still conditional on each build surviving to them, but the route itself is not player-like. The report never labels this arm `actual run` or `actual reached-run`; it uses `oracleShortestRoute` and `oracle-route reached-depth populations`.

| Build | B5 | B10 | B15 | B20 | B21+ | B30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AoE Burst Mage | 472/500 (94.40%) | 54/500 (10.80%) | 0 | 0 | 0 | 0 |
| Single-target Efficient Mage | 488/500 (97.60%) | 117/500 (23.40%) | 3/500 (0.60%, insufficient) | 0 | 0 | 0 |
| Sustain Mage | 499/500 (99.80%) | 194/500 (38.80%) | 1/500 (0.20%, insufficient) | 0 | 0 | 0 |
| Hybrid / Fallback Mage | 500/500 (100.00%) | 220/500 (44.00%) | 28/500 (5.60%, insufficient) | 0 | 0 | 0 |

All 2,000 build-runs died before B20. B21/B25/B30 are `unobserved`, not 0% estimates. The B15 populations are also below the minimum paired-N rule for depth claims.

### Three-arm comparison

The #987 arm is `generateEncounter()` weighted; the #990 arm is weighted by encounters experienced under the oracle route. They are not interchangeable full-run frequencies.

| Arm | Pure raw | Normal hit | Normal hits | Total normal damage | Rounds | Enemy actions/round | Post HP | Post MP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| #987 controlled stress / overall | 43.50% | 6.38 | 2.90 | 18.48 | 2.72 | 2.07 | 0.21 | 0.70 |
| #987 generated weighted / overall | 38.51% | 6.66 | 2.01 | 13.37 | 2.13 | 1.59 | 0.46 | 0.76 |
| #990 oracle / AoE | 2.10% | 1.80 | 1.85 | 3.51 | 2.39 | 1.53 | 0.92 | 0.48 |
| #990 oracle / Single | 1.22% | 2.29 | 1.61 | 3.77 | 2.15 | 1.52 | 0.93 | 0.51 |
| #990 oracle / Sustain | 1.27% | 2.71 | 1.80 | 5.23 | 2.36 | 1.52 | 0.93 | 0.55 |
| #990 oracle / Hybrid | 2.39% | 2.50 | 1.47 | 3.73 | 2.13 | 1.51 | 0.91 | 0.47 |

#987 generated pure-raw rates were AoE 18.07%, Single 43.77%, Sustain 37.28%, Hybrid 54.92%. The oracle-route conditional rates were AoE 2.10%, Single 1.22%, Sustain 1.27%, Hybrid 2.39%. This difference is a weighting/depth-support difference; it does not show that an actual run is safer against the same deep encounter.

### Death causes and pure-raw exposure

| Build | Pure raw deaths | Mechanic-mediated raw lethal | Direct mechanic death | Unknown/mixed |
| --- | ---: | ---: | ---: | ---: |
| AoE | 179 | 143 | 116 | 62 |
| Single | 129 | 192 | 123 | 56 |
| Sustain | 146 | 193 | 96 | 65 |
| Hybrid | 282 | 88 | 116 | 14 |

In pure-raw deaths, lethal-encounter total normal damage was AoE 27.35, Single 28.02, Sustain 47.76, Hybrid 23.61, with 6.03, 5.45, 7.73, and 3.97 normal hits. The preceding encounter contributed 3.85, 5.83, 8.27, and 4.15; the encounter before that 2.70, 4.00, 5.61, and 4.11. Mean lethal hit/maxHP was 0.122, 0.125, 0.089, and 0.124.

Observed result: pure raw death is not explained by the last hit alone. Multiple normal hits occur in the lethal encounter, and its cumulative normal damage exceeds the prior 1–2 encounter windows. This supports cumulative exposure within the lethal encounter plus single-hit pressure as a description of the observed deaths; it is not a causal balance proof.

### Enemy action exposure

Oracle-route enemy actions/round were 1.531 AoE, 1.516 Single, 1.521 Sustain, and 1.510 Hybrid; actions/encounter were 3.907, 3.500, 3.786, and 3.377. By enemy count, actions/round were approximately 1.02 for one enemy, 1.87–1.90 for two, and 2.69–2.77 for three. This is observed exposure, not an isolated causal effect; no W3 one-action cap was applied.

### Matched common support

Only identical event keys on shared seeds are paired. #975-compatible strict reversal requires paired clear-outcome and diagnostic-utility bootstrap 95% CIs to exclude zero with sign reversal; N<30 is `insufficient_sample` and excluded.

| Pair | Common N | Clear delta | HP delta | MP delta | Strict reversals | Insufficient |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AoE vs Single | 8,394 | -0.0379 | -0.0325 | -0.1137 | 0 | 54 |
| AoE vs Sustain | 8,486 | -0.0481 | -0.0482 | -0.1757 | 0 | 58 |
| AoE vs Hybrid | 8,058 | -0.0324 | -0.0233 | -0.1026 | 0 | 54 |
| Single vs Sustain | 10,219 | -0.0177 | -0.0239 | -0.0642 | 0 | 45 |
| Single vs Hybrid | 9,323 | -0.0079 | -0.0026 | +0.0062 | 6 | 45 |
| Sustain vs Hybrid | 9,768 | -0.0014 | +0.0111 | +0.0663 | 4 | 45 |

The 10 strict reversals and build differences remain useful matched observations, but deep survivor composition is not treated as encounter strength.

## Build Confidence and decisions

- Generated-frequency best-build share: Sustain 28.98% (AoE 27.66%, Hybrid 25.04%, Single 18.33%).
- Oracle-route highest-depth dominance on shared seeds: Hybrid 43.17%, Sustain 33.87%, Single 17.60%, AoE 5.37%. Hybrid leads but has no majority; this is a reach/survival result and does not prove deep-encounter superiority.
- #973 Build Confidence: **Revise**. The measurement explains shallow modeled exposure, but omitted in-run equipment decisions, non-combat paths, and absent B21+ survivors prevent deep production confidence.
- Issue #990: **keep open**. This PR is a measurement foundation and shallow-result report; it does not complete deep reached-run validation.
- Production tuning: **do not proceed** from this evidence alone. No production lever is selected or changed.

## Answers to the review questions

1. The route knows the complete generated map, stairs, milestone bosses, and secret-door edges from the start.
2. Secret doors are oracle-only edges here; production requires adjacent discovery first. Search failures and their extra exposure are omitted.
3. No. This is not an actual player-run measurement.
4. No. B21/B25/B30 pure raw is unobserved, not zero.
5. The observed deaths show multiple-hit cumulative exposure in the lethal encounter; the final hit alone is insufficient.
6. Enemy count increases observed actions/round and actions/encounter, but causality is not isolated.
7. Yes. Reach differences remain: Hybrid is deepest among the observed shallow survivors, while all builds fail before B20; matched build preferences also retain 10 strict reversals.
8. #973 Build Confidence: **Revise**.
9. No. Keep #990 open.
10. No. Do not proceed to production tuning from this measurement.

## Verification

- `npm run lint` ✅
- `npm run test:unit` ✅
- `node scratch/tests/regression/test_reached_run_measurement.js` ✅
- `npm run build` ✅
- Full baseline measurement ✅ (N=500/build, shared seed, provenance clean)
