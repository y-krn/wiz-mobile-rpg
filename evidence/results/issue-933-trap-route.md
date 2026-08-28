# Issue #933 trap-route balance measurement

- runner: `standard-v1`
- baseline source: `d4a6a455847541c3f1079d1eddc449f3bc2af5fd`
- candidate source: `20cb8586db8a0877895902fbb321981faf201ee6`
- production baseline: `941129720dadaff274893b0606f04e509eb06ea1`
- configuration: seed `843`, `N=500` per class, calibration `100`, classes `Fighter/Thief/Priest/Mage`, scenarios `workshop-empty/workshop-complete`, targets `B5/B10/B15/B20`
- commands: `node scratch/measurements/measure_balance.js --output ...` for both SHAs, then `node scratch/measurements/compare_balance.js ...`

The baseline report was generated before removal of the deprecated
`TRAP_AVOIDANCE_POLICY=ev` environment key. For comparison, only that obsolete
key was removed from the baseline configuration signature; the baseline
simulator's effective default remained `ev`. The standard comparator reported
no `fail` metrics; the overall result was `uncertain` because deep targets had
fewer than 30 observed reached runs for some class death-rate denominators.

Each cell is `trap_hazard deaths / reachedRate / averageReachedFloor`, shown as
`before → after`.

| Scenario | Class | B5 | B10 | B15 | B20 |
| --- | --- | --- | --- | --- | --- |
| workshop-empty | Fighter | 29/0.350/3.75 → 33/0.330/3.69 | 61/0.012/3.63 → 56/0.008/3.66 | 49/0.000/3.62 → 65/0.000/3.64 | 39/0.000/3.84 → 49/0.000/3.78 |
| workshop-empty | Thief | 1/0.894/4.56 → 1/0.894/4.55 | 157/0.006/4.77 → 148/0.002/4.80 | 135/0.002/4.72 → 130/0.002/4.74 | 133/0.000/4.76 → 147/0.000/4.75 |
| workshop-empty | Priest | 246/0.190/2.71 → 259/0.168/2.65 | 276/0.002/2.66 → 275/0.000/2.70 | 265/0.000/2.76 → 280/0.000/2.66 | 288/0.000/2.74 → 277/0.000/2.67 |
| workshop-empty | Mage | 91/0.294/3.46 → 102/0.294/3.40 | 114/0.002/3.68 → 120/0.000/3.63 | 131/0.002/3.45 → 121/0.000/3.41 | 117/0.000/3.57 → 113/0.000/3.56 |
| workshop-complete | Fighter | 17/0.744/4.53 → 17/0.718/4.51 | 36/0.060/5.16 → 32/0.048/5.04 | 34/0.004/5.16 → 34/0.006/5.11 | 48/0.000/5.17 → 51/0.000/5.02 |
| workshop-complete | Thief | 0/0.958/4.87 → 1/0.956/4.84 | 163/0.016/5.04 → 167/0.026/5.01 | 169/0.002/5.00 → 156/0.008/5.00 | 168/0.000/5.02 → 168/0.000/5.08 |
| workshop-complete | Priest | 229/0.306/2.98 → 242/0.304/2.89 | 314/0.014/3.02 → 305/0.010/3.05 | 289/0.004/3.23 → 292/0.000/3.11 | 321/0.000/3.22 → 330/0.000/3.18 |
| workshop-complete | Mage | 44/0.708/4.34 → 58/0.698/4.34 | 79/0.002/4.35 → 73/0.000/4.30 | 62/0.000/4.35 → 67/0.000/4.32 | 67/0.000/4.42 → 70/0.000/4.41 |

The targeted deterministic route case (`SIM_SEED=231`, Fighter, B1→B6,
`runIndex=180`, certain detection, fixed encounter rate `0.1`) produced
machine-readable diagnostics: `discoveredTrapEncounters=7`,
`detourSelections=1`, `detourExtraSteps=2`,
`detourActualMovementSteps=12`, `detourNormalEncounters=2`,
`detourOtherTrapEncounters=1`, `actionSelections={disarm:0,force:7}`, and
`cycleDetections=0`. Repeating the same run produced an identical result.
