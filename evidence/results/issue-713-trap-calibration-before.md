# Issue #713 fresh before baseline

- source/base SHA: `c79418376f9a0f6761f963d2c8a804bfbb6c06ee`
- origin/main: `c79418376f9a0f6761f963d2c8a804bfbb6c06ee` (ancestor verified)
- command: `SIM_RUNS=500 SIM_SEED=231 SIM_CALIBRATION_RUNS=100 env -u SIM_PARALLEL node scratch/simulations/sim_issue_713_trap_calibration.js`
- raw JSONL SHA-256, repeated identical runs: `11917ea63e1d5bb98b080bf769d8d7a042b1fbc7e4dcd85f842467eef4df2bdd`
- raw output equality: baseline run 1 and run 2 matched byte-for-byte

## Four-class progression

| class | average reached floor | B5 entrant→B6 | B10 entrant→B11 |
| --- | ---: | ---: | ---: |
| Fighter | 3.5120 | 40.59% | 82.86% |
| Thief | 5.5560 | 17.34% | 73.08% |
| Priest | 2.8260 | 35.96% | 80.95% |
| Mage | 5.4620 | 59.69% | 84.21% |

Four-class arithmetic mean depth: 4.3390.

## Thief cap binding

- overall: 70.43% (3633/5158 observations)
- by floor: B1 595/595, B2 577/577, B3 576/576, B4 875/875, B5 671/671, B6 110/143, B7 52/191, B8 51/186, B9 44/173, B10 36/136, B11 38/174, B12 8/202, B13+ 0
- by level: L1 257/257, L2 607/607, L3 1008/1008, L4 1269/1413, L5 380/958, L6 85/680, L7 27/165, L8+ 0
- equipment trapBonus: 1.69 average points; effective on 4.38% of Thief observations

The full separate max/base/passive/equipment sweep is in `issue-713-trap-calibration.md` generated from the same run path and conditions.
