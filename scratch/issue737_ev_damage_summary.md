# Issue #737 EV damage estimate measurement

Closes #737

## Question and scope

Measure the error between the recovery and flee EV estimate and one physical combat round. Change only the sim estimate when the error is large. Keep player-facing thresholds, policies, branches, and game source unchanged.

## Validity

- `origin/main`: `bea0f338315ce5bff8558bea0f95b3724416ed3d`
- Before source: `02030c24f94e49071c4ca4eb8f2da5ec650c1919`
- After source: `7e89f2575eb2503c22d6b3fff733b7852bdaf2a7`
- `SIM_SEED=231`, `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`
- `SIM_INDEPENDENT_RUN_RANDOM=1`, `SIM_PARALLEL` omitted
- EV environment: #671 conditions, including departure craft IDs and `SIM_SCENARIOS=workshop-complete`
- The runner distributes 500 runs across four classes, 125 runs per class
- The measurement harness provisions explicit departure crafts from a cost-sufficient bank for each independent run
- Before raw SHA-256, both runs: `aaa62e63302cb1868fb14327efe10fd060ea535c7de6e3ea11dc99eff3b55888`
- After raw SHA-256, both runs: `9821599cfb5855a95fb8a9180d63eac963f93bb01526a11f9298256a7ffefc48`
- N=1 smoke reached the audit marker, reported `unmatchedHits=0`, and produced no `NaN` or `Infinity`

## Comparison

The error columns equal measured damage minus the EV estimate. Each error cell is `mean; p10/median/p90` from the raw audit distribution. `formula` calls the source `calculatePhysicalAttackFormula` path. `observed` includes the later combat mechanisms.

| Class | Depth | Before n | Before formula error (mean; p10/med/p90) | Before observed error (mean; p10/med/p90) | After n | After formula error (mean; p10/med/p90) | After observed error (mean; p10/med/p90) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fighter | B5 | 1414 | +20.52; +15/+20/+27 | +19.06; +7/+19/+28 | 1488 | +0.12; -2/0/+2 | -0.95; -12/0/+3 |
| Fighter | B10 | 651 | +24.19; +17/+24/+32 | +24.98; +17/+25/+34 | 785 | +0.25; -2/0/+2 | +1.12; -2/+0.5/+6 |
| Fighter | B15 | 663 | +24.76; +17/+24/+34 | +17.42; -4/+20/+36 | 673 | +0.32; -2/0/+2 | -5.84; -27/-1/+5 |
| Fighter | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |
| Thief | B5 | 1894 | +14.62; +10/+13/+22 | +12.66; +3/+12/+22 | 2047 | +0.02; -2/0/+2 | -2.14; -9/-1/+2 |
| Thief | B10 | 906 | +15.15; +9/+15/+23 | +16.67; +9/+16/+25 | 907 | +0.06; -2/0/+2 | +0.90; -2/0/+3 |
| Thief | B15 | 632 | +16.45; +10/+16/+23 | +11.16; -6/+12/+25 | 538 | +0.22; -2/0/+2 | -5.15; -22/-1.5/+11 |
| Thief | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |
| Priest | B5 | 275 | +10.37; +7/+10/+16 | +9.45; +3/+9/+15 | 527 | -0.11; -2/0/+2 | -0.71; -6/0/+2.5 |
| Priest | B10 | 74 | +12.03; +2/+11/+22 | +13.46; +2/+14/+24 | 396 | +0.43; -2/0/+2 | +1.58; -2/+1/+6 |
| Priest | B15 | 28 | +20.90; +14/+22/+24 | +20.25; +1/+22/+34 | 129 | +0.27; -2/0/+2 | -3.37; -21/-1/+8.5 |
| Priest | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |
| Mage | B5 | 11 | +12.28; +11/+12/+14 | +11.00; +9/+12/+14 | 201 | -0.04; -2/0/+2 | +0.56; -2/+1/+2.33 |
| Mage | B10 | 105 | +11.69; +3/+11/+23 | +14.06; +5/+12/+25 | 672 | +0.12; -2/0/+2 | +0.89; -2/+1/+4 |
| Mage | B15 | 53 | +15.66; +8/+13/+25 | +12.98; -3/+15/+25 | 397 | +0.19; -2/0/+2 | -2.30; -16.5/-0.5/+8.5 |
| Mage | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |

The full B1 to B20 audit emitted 72 of 80 class-depth cells. Not-measurable cells were Priest B1, Mage B1 to B3, and B20 for all classes; the audit output does not distinguish an unreached floor from a reached floor with no physical-hit sample, so these are reported as not measurable rather than inferred. `unmatchedHits` was 0 before and after; no pendingless hit entered the distribution.

## Interpretation

The old estimate was `getCharWeaponAtk(character) / 1.5`. It understated the source formula by 10.37 to 24.76 damage at the measured target depths, before accounting for later combat mechanisms. After the change, formula mean error is between -0.11 and +0.43 for the measured target cells, with p10/median/p90 centered at -2/0/+2 in every measured class-depth cell.

Observed error remains because the EV estimate does not model magic bolt, first-turn attack, blindness, physical resistance, targeted bonuses, guard, critical hits, or other post-formula effects. It does model buff attack, STR, effective defense, melee modifier, and the midpoint physical random roll.

At B20, average reached floor changed as follows:

| Class | Before | After | Delta | Direction |
| --- | ---: | ---: | ---: | --- |
| Fighter | 8.088 | 7.664 | -0.424 | 基準線低下 |
| Thief | 8.728 | 8.000 | -0.728 | 基準線低下 |
| Priest | 4.584 | 5.176 | +0.592 | 抑制が外れた |
| Mage | 7.272 | 12.768 | +5.496 | 抑制が外れた |

At B20, flee run rate changed Fighter 68.0% to 30.4%, Thief 80.8% to 51.2%, Priest 92.0% to 52.0%, and Mage 99.2% to 99.2%. Recovery run rate changed Fighter 23.2% to 19.2%, Thief 49.6% to 22.4%, Priest 43.2% to 55.2%, and Mage 13.6% to 48.8%.

## Decision

Apply the smallest sim-only correction. `getEvDamageEstimate` now calls `calculatePhysicalAttackFormula` directly for each living enemy, using source-derived attack buffs, STR, effective defense, melee modifier, and random-roll midpoint 2. Pendingless physical hits are excluded and counted as `unmatchedHits`; the old audit fallback is absent. The formula itself and all player-facing EV policies remain unchanged.

## Constraints

- No `src/` files changed.
- No `scratch/issue624_*.js` or `scratch/issue612_exp_pace_env.js` changes.
- No raw measurement output committed.
- Not-measurable cells are reported without inferred values.

## Verification

- `node --check scratch/sim_depth_material_ev.js`: pass
- N=1 smoke before and after: pass; audit marker reached, finite output, `unmatchedHits=0`
- `node scratch/test_issue737_damage_audit.js`: pass; pendingless hit excluded/counts, matched hit has no fallback marker, normal audited run has zero unmatched hits
- `node scratch/test_sim_reward_paths.js`: pass
- `node scratch/test_sim_recovery_supply.js`: pass
- `node scratch/test_heal_priority_policy.js`: pass
- `npm run test:unit`: 89 pass, 0 fail, 3 skip
- `npm run lint`: pass
- Corrected baseline source `02030c24f94e49071c4ca4eb8f2da5ec650c1919`: two successful runs, identical raw SHA-256 `aaa62e63302cb1868fb14327efe10fd060ea535c7de6e3ea11dc99eff3b55888`
- Corrected after source `7e89f2575eb2503c22d6b3fff733b7852bdaf2a7`: two successful runs, identical raw SHA-256 `9821599cfb5855a95fb8a9180d63eac963f93bb01526a11f9298256a7ffefc48`
