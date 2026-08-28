# Issue #933 trap-route balance measurement

- runner: `standard-v1`
- baseline source: `d4a6a455847541c3f1079d1eddc449f3bc2af5fd`
- candidate source: `9cb9578dfd4be76e6c2c8d6cde903825e015656d`
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
| workshop-empty | Fighter | 29/0.350/3.75 → 31/0.350/3.68 | 61/0.012/3.63 → 60/0.006/3.64 | 49/0.000/3.62 → 58/0.000/3.65 | 39/0.000/3.84 → 50/0.000/3.81 |
| workshop-empty | Thief | 1/0.894/4.56 → 1/0.894/4.55 | 157/0.006/4.77 → 152/0.002/4.79 | 135/0.002/4.72 → 118/0.002/4.73 | 133/0.000/4.76 → 139/0.000/4.74 |
| workshop-empty | Priest | 246/0.190/2.71 → 259/0.172/2.69 | 276/0.002/2.66 → 277/0.000/2.69 | 265/0.000/2.76 → 261/0.000/2.70 | 288/0.000/2.74 → 275/0.000/2.68 |
| workshop-empty | Mage | 91/0.294/3.46 → 102/0.300/3.43 | 114/0.002/3.68 → 111/0.000/3.64 | 131/0.002/3.45 → 129/0.000/3.45 | 117/0.000/3.57 → 112/0.000/3.57 |
| workshop-complete | Fighter | 17/0.744/4.53 → 20/0.700/4.51 | 36/0.060/5.16 → 36/0.058/5.04 | 34/0.004/5.16 → 40/0.002/5.21 | 48/0.000/5.17 → 51/0.000/5.06 |
| workshop-complete | Thief | 0/0.958/4.87 → 1/0.960/4.86 | 163/0.016/5.04 → 157/0.026/5.00 | 169/0.002/5.00 → 162/0.004/4.98 | 168/0.000/5.02 → 176/0.000/5.06 |
| workshop-complete | Priest | 229/0.306/2.98 → 242/0.298/2.87 | 314/0.014/3.02 → 309/0.008/3.01 | 289/0.004/3.23 → 292/0.002/3.13 | 321/0.000/3.22 → 328/0.000/3.13 |
| workshop-complete | Mage | 44/0.708/4.34 → 58/0.696/4.31 | 79/0.002/4.35 → 83/0.002/4.32 | 62/0.000/4.35 → 69/0.000/4.34 | 67/0.000/4.42 → 74/0.000/4.40 |

The targeted deterministic route case (`SIM_SEED=231`, Fighter, B1→B6,
certain detection, fixed encounter rate `0.1`) produced machine-readable
diagnostics: `discoveredTrapEncounters=10`, `detourSelections=1`,
`detourExtraSteps=3`, `detourNormalEncounters=3`,
`detourOtherTrapEncounters=1`, `actionSelections={disarm:1,force:9}`, and
`cycleDetections=0`. Repeating the same run produced an identical result.
