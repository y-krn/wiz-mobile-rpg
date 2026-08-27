# Issue #713 trapBonus calibration

- source commit: `cbf128b`
- base/origin-main: `c79418376f9a0f6761f963d2c8a804bfbb6c06ee`
- real-run path: `scratch/simulations/sim_issue_713_trap_calibration.js` → `simulateRun` → `generateRunFloor`
- conditions: N=500/class, SIM_SEED=231, SIM_CALIBRATION_RUNS=100, SIM_PARALLEL=omitted
- raw JSONL SHA-256: `7bba9a972526a2b90b53f6d6f0d0a7afe9f7d1023c233a3636c7cd5358c5da7b`

## Four-class progression and gates

| case | Fighter avg / B5→B6 / B10→B11 | Thief avg / B5→B6 / B10→B11 | Priest avg / B5→B6 / B10→B11 | Mage avg / B5→B6 / B10→B11 |
| --- | --- | --- | --- | --- |
| before-control (fresh before control: apt max 90) | 3.5120 / 40.59% / 82.86% | 5.5560 / 17.34% / 73.08% | 2.8260 / 35.96% / 80.95% | 5.4620 / 59.69% / 84.21% |
| after-source (after source: apt max 100) | 3.5120 / 40.59% / 82.86% | 5.7760 / 19.11% / 75.00% | 2.8260 / 35.96% / 80.95% | 5.4620 / 59.69% / 84.21% |
| equipment-off (paired equipment value control: trapBonus equipment off) | 3.5260 / 38.83% / 85.29% | 5.7040 / 18.91% / 71.19% | 2.8200 / 35.56% / 80.00% | 5.2540 / 57.59% / 83.91% |

## Cap binding and equipment value

`capBindingRate` is measured floor-trap plan observations with the uncapped disarm rate at or above the applicable max. Equipment active rate is the share of observations where measured equipment trapBonus points were positive and capBinding was false.

| case | class | cap binding | observations | floor distribution (binding/total) | level distribution (binding/total) | avg equipment points | equipment active |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: |
| before-control | Fighter | 0.00% | 2909 | B1:0/549, B2:0/384, B3:0/263, B4:0/280, B5:0/203, B6:0/88, B7:0/126, B8:0/124, B9:0/117, B10:0/116, B11:0/140, B12:0/142, B13:0/131, B14:0/102, B15:0/53, B16:0/22, B17:0/24, B18:0/19, B19:0/17, B20:0/9 | L1:0/231, L2:0/470, L3:0/475, L4:0/441, L5:0/370, L6:0/630, L7:0/278, L8:0/14 | 0.62 | 5.12% |
| before-control | Thief | 70.43% | 5158 | B1:595/595, B2:577/577, B3:576/576, B4:875/875, B5:671/671, B6:110/143, B7:52/191, B8:51/186, B9:44/173, B10:36/136, B11:38/174, B12:8/202, B13:0/183, B14:0/156, B15:0/90, B16:0/97, B17:0/69, B18:0/35, B19:0/21, B20:0/8 | L1:257/257, L2:607/607, L3:1008/1008, L4:1269/1413, L5:380/958, L6:85/680, L7:27/165, L8:0/50, L9:0/20 | 1.69 | 4.38% |
| before-control | Priest | 0.00% | 2016 | B1:0/496, B2:0/278, B3:0/200, B4:0/223, B5:0/152, B6:0/70, B7:0/92, B8:0/83, B9:0/63, B10:0/61, B11:0/69, B12:0/70, B13:0/44, B14:0/36, B15:0/30, B16:0/28, B17:0/13, B18:0/3, B19:0/5 | L1:0/257, L2:0/347, L3:0/364, L4:0/353, L5:0/333, L6:0/177, L7:0/119, L8:0/66 | 0.55 | 5.11% |
| before-control | Mage | 0.00% | 6120 | B1:0/536, B2:0/414, B3:0/325, B4:0/457, B5:0/416, B6:0/235, B7:0/324, B8:0/314, B9:0/300, B10:0/288, B11:0/353, B12:0/392, B13:0/373, B14:0/337, B15:0/198, B16:0/230, B17:0/198, B18:0/162, B19:0/161, B20:0/107 | L1:0/704, L2:0/598, L3:0/713, L4:0/1242, L5:0/1880, L6:0/704, L7:0/212, L8:0/50, L9:0/17 | 0.50 | 5.36% |
| after-source | Fighter | 0.00% | 2909 | B1:0/549, B2:0/384, B3:0/263, B4:0/280, B5:0/203, B6:0/88, B7:0/126, B8:0/124, B9:0/117, B10:0/116, B11:0/140, B12:0/142, B13:0/131, B14:0/102, B15:0/53, B16:0/22, B17:0/24, B18:0/19, B19:0/17, B20:0/9 | L1:0/231, L2:0/470, L3:0/475, L4:0/441, L5:0/370, L6:0/630, L7:0/278, L8:0/14 | 0.62 | 5.12% |
| after-source | Thief | 8.08% | 5582 | B1:20/597, B2:45/586, B3:74/586, B4:122/893, B5:108/702, B6:34/164, B7:8/218, B8:6/209, B9:6/196, B10:5/171, B11:5/208, B12:6/255, B13:6/221, B14:6/187, B15:0/97, B16:0/115, B17:0/76, B18:0/42, B19:0/37, B20:0/22 | L1:8/253, L2:34/611, L3:104/1006, L4:214/1502, L5:52/1167, L6:39/687, L7:0/229, L8:0/114, L9:0/13 | 1.84 | 9.73% |
| after-source | Priest | 0.00% | 2016 | B1:0/496, B2:0/278, B3:0/200, B4:0/223, B5:0/152, B6:0/70, B7:0/92, B8:0/83, B9:0/63, B10:0/61, B11:0/69, B12:0/70, B13:0/44, B14:0/36, B15:0/30, B16:0/28, B17:0/13, B18:0/3, B19:0/5 | L1:0/257, L2:0/347, L3:0/364, L4:0/353, L5:0/333, L6:0/177, L7:0/119, L8:0/66 | 0.55 | 5.11% |
| after-source | Mage | 0.00% | 6120 | B1:0/536, B2:0/414, B3:0/325, B4:0/457, B5:0/416, B6:0/235, B7:0/324, B8:0/314, B9:0/300, B10:0/288, B11:0/353, B12:0/392, B13:0/373, B14:0/337, B15:0/198, B16:0/230, B17:0/198, B18:0/162, B19:0/161, B20:0/107 | L1:0/704, L2:0/598, L3:0/713, L4:0/1242, L5:0/1880, L6:0/704, L7:0/212, L8:0/50, L9:0/17 | 0.50 | 5.36% |
| equipment-off | Fighter | 0.00% | 2910 | B1:0/549, B2:0/386, B3:0/261, B4:0/281, B5:0/203, B6:0/87, B7:0/123, B8:0/121, B9:0/115, B10:0/110, B11:0/140, B12:0/141, B13:0/132, B14:0/101, B15:0/52, B16:0/33, B17:0/29, B18:0/20, B19:0/17, B20:0/9 | L1:0/231, L2:0/470, L3:0/481, L4:0/437, L5:0/392, L6:0/601, L7:0/284, L8:0/14 | 0.00 | 0.00% |
| equipment-off | Thief | 0.00% | 5412 | B1:0/597, B2:0/586, B3:0/586, B4:0/893, B5:0/687, B6:0/160, B7:0/215, B8:0/205, B9:0/190, B10:0/166, B11:0/197, B12:0/231, B13:0/196, B14:0/157, B15:0/87, B16:0/99, B17:0/62, B18:0/38, B19:0/35, B20:0/25 | L1:0/253, L2:0/611, L3:0/1007, L4:0/1463, L5:0/1105, L6:0/686, L7:0/191, L8:0/96 | 0.00 | 0.00% |
| equipment-off | Priest | 0.00% | 1994 | B1:0/496, B2:0/282, B3:0/202, B4:0/222, B5:0/154, B6:0/70, B7:0/90, B8:0/79, B9:0/59, B10:0/57, B11:0/63, B12:0/64, B13:0/43, B14:0/27, B15:0/22, B16:0/28, B17:0/18, B18:0/9, B19:0/9 | L1:0/257, L2:0/349, L3:0/368, L4:0/354, L5:0/344, L6:0/168, L7:0/112, L8:0/42 | 0.00 | 0.00% |
| equipment-off | Mage | 0.00% | 5637 | B1:0/536, B2:0/412, B3:0/328, B4:0/462, B5:0/411, B6:0/224, B7:0/307, B8:0/287, B9:0/275, B10:0/273, B11:0/318, B12:0/354, B13:0/325, B14:0/289, B15:0/151, B16:0/188, B17:0/158, B18:0/133, B19:0/130, B20:0/76 | L1:0/701, L2:0/601, L3:0/647, L4:0/1213, L5:0/1703, L6:0/493, L7:0/212, L8:0/50, L9:0/17 | 0.00 | 0.00% |

## Reproduction

```sh
SIM_RUNS=500 SIM_SEED=231 SIM_CALIBRATION_RUNS=100 env -u SIM_PARALLEL node scratch/simulations/sim_issue_713_trap_calibration.js
```

Modeled: current real map generation, trap policy, TOWN_PORTAL retreat, status-cure EV path, complete equipment scoring, and real round/reward/level-up flow. Omitted: no player UI interaction and no optional merchant purchase outside the existing sim policy. Calibration overrides are simulation-only and change one requested axis per case.
