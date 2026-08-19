# Issue #737 EV damage estimate measurement

## Question and scope

Measure the error between the recovery and flee EV estimate and one physical combat round. Change only the sim estimate when the error is large. Keep player-facing thresholds, policies, branches, and game source unchanged.

## Validity

- `origin/main`: `bea0f338315ce5bff8558bea0f95b3724416ed3d`
- Before source: `9f4dc082a2ad4ed52f39b9c61db0fe1db52de179`
- After source: `cd3f229217781cc03137eaf72536c7eef3911488`
- `SIM_SEED=231`, `SIM_RUNS=500`, `SIM_CALIBRATION_RUNS=100`
- `SIM_INDEPENDENT_RUN_RANDOM=1`, `SIM_PARALLEL` omitted
- EV environment: #671 conditions, including departure craft IDs and `SIM_SCENARIOS=workshop-complete`
- The runner distributes 500 runs across four classes, 125 runs per class
- The measurement harness provisions explicit departure crafts from a cost-sufficient bank for each independent run
- Before raw SHA-256, both runs: `22b23dcbe662a156323c1a65935f22989975bfc2241fd186648683466d805bd7`
- After raw SHA-256, both runs: `a51882b7fb5cee04285f76456e62dc7ef5a29284bb3debc76ce7a72a65501d94`
- N=1 smoke reached the audit marker and produced no `NaN` or `Infinity`

## Comparison

The error columns equal the measured mean minus the EV estimate mean. `formula` calls the source `calculatePhysicalAttackFormula` path. `observed` includes the later combat mechanisms.

| Class | Depth | Before hits | Before formula error | Before observed error | After hits | After formula error | After observed error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fighter | B5 | 1414 | +20.52 | +19.06 | 1488 | +0.12 | -0.95 |
| Fighter | B10 | 651 | +24.19 | +24.98 | 785 | +0.25 | +1.12 |
| Fighter | B15 | 663 | +24.76 | +17.42 | 673 | +0.32 | -5.84 |
| Fighter | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |
| Thief | B5 | 1894 | +14.62 | +12.66 | 2047 | +0.02 | -2.14 |
| Thief | B10 | 906 | +15.15 | +16.67 | 907 | +0.06 | +0.90 |
| Thief | B15 | 632 | +16.45 | +11.16 | 538 | +0.22 | -5.15 |
| Thief | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |
| Priest | B5 | 275 | +10.37 | +9.45 | 527 | -0.11 | -0.71 |
| Priest | B10 | 74 | +12.03 | +13.46 | 396 | +0.43 | +1.58 |
| Priest | B15 | 28 | +20.90 | +20.25 | 129 | +0.27 | -3.37 |
| Priest | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |
| Mage | B5 | 11 | +12.28 | +11.00 | 201 | -0.04 | +0.56 |
| Mage | B10 | 105 | +11.69 | +14.06 | 672 | +0.12 | +0.89 |
| Mage | B15 | 53 | +15.66 | +12.98 | 397 | +0.19 | -2.30 |
| Mage | B20 | not measurable | not measurable | not measurable | not measurable | not measurable | not measurable |

The full B1 to B20 audit emitted 72 of 80 class-depth cells. Missing cells were Priest B1, Mage B1 to B3, and B20 for all classes. The B15 Priest baseline has 28 hits and remains uncertain under the 30-hit rule.

## Interpretation

The old estimate was `getCharWeaponAtk(character) / 1.5`. It understated the source formula by 10.37 to 24.76 damage at the measured target depths, before accounting for later combat mechanisms. After the change, formula error is between -0.11 and +0.43 for the measured target cells.

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

Apply the smallest sim-only correction. `getEvDamageEstimate` now calls `calculatePhysicalAttackFormula` directly for each living enemy, using source-derived attack buffs, STR, effective defense, melee modifier, and random-roll midpoint 2. The formula itself and all player-facing EV policies remain unchanged.

## Verification

- `node --check scratch/sim_depth_material_ev.js`: pass
- N=1 smoke before and after: pass
- `node scratch/test_sim_reward_paths.js`: pass
- `node scratch/test_sim_recovery_supply.js`: pass
- `node scratch/test_heal_priority_policy.js`: pass
- `npm run test:unit`: 88 pass, 0 fail, 3 skip
- `npm run lint`: pass
- Baseline and after formal runs: two successful runs each, identical raw hashes
