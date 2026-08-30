# Issue #990 Phase 3 Stage 2 — combat persona sensitivity

- runner: issue990-phase3-stage2-v2 / schema 5
- seed: issue990-phase3-stage1.5; N: 500 / persona
- production-backed, Mage B1 start, same seed per runIndex, forced push, no retreat
- #990 remains open pending Stage 2 review

Combat persona is the only independent variable. Exploration, budget, after-stairs behavior, equipment scoring/update, loot, identification, recovery, camp, route, forced push, starting state, and encounter generation are shared.

## Table A — Combat persona definitions

| persona | rule | explicit thresholds |
| --- | --- | --- |
| balanced-combat | Stage 1.5 legacy Mage selector; no new reserve rule | Stage 1.5 legacy Mage selector; no new reserve rule |
| mp-conservative | physical attack by default; reserve 50% max MP in low-pressure fights | physical attack by default; reserve 50% max MP in low-pressure fights reserve=50.0%, weak-single max HP=22, danger HP=45.0% |
| burst-combat | highest currently payable offensive damage spell, with physical fallback | highest currently payable offensive damage spell, with physical fallback |

## Table B — Reach / reached depth

| persona | mean depth | B5 | B10 | B15 | B20 | B21 | B25 | B30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | 1.61 | 3.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| mp-conservative | 1.47 | 2.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| burst-combat | 1.68 | 6.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |

## Table C — Floor survival B1-B30 (B1-B10 focus)

`reached next floor` means the run completed this floor and entered the next one. `incomplete` means neither death nor next-floor reach.

| policy | floor | entered | reached next floor | died | incomplete | next-floor reach | incomplete reasons |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| balanced-combat | B1 | 500 | 160 | 63 | 277 | 32.0% | stairs_not_discovered:277 |
| balanced-combat | B2 | 160 | 88 | 12 | 60 | 55.0% | stairs_not_discovered:60 |
| balanced-combat | B3 | 88 | 41 | 7 | 40 | 46.6% | stairs_not_discovered:40 |
| balanced-combat | B4 | 41 | 17 | 14 | 10 | 41.5% | stairs_not_discovered:10 |
| balanced-combat | B5 | 17 | 0 | 10 | 7 | 0.0% | stairs_not_discovered:2, boss_milestone_progression_failure:5 |
| balanced-combat | B6 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B7 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B8 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B9 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B10 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B11 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B12 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B13 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B14 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B15 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B16 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B17 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B18 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B19 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B20 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B21 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B22 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B23 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B24 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B25 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B26 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B27 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B28 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B29 | 0 | 0 | 0 | 0 | n/a | none |
| balanced-combat | B30 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B1 | 500 | 124 | 198 | 178 | 24.8% | stairs_not_discovered:178 |
| mp-conservative | B2 | 124 | 66 | 25 | 33 | 53.2% | stairs_not_discovered:33 |
| mp-conservative | B3 | 66 | 30 | 12 | 24 | 45.5% | stairs_not_discovered:24 |
| mp-conservative | B4 | 30 | 12 | 11 | 7 | 40.0% | stairs_not_discovered:7 |
| mp-conservative | B5 | 12 | 1 | 7 | 4 | 8.3% | boss_milestone_progression_failure:4 |
| mp-conservative | B6 | 1 | 0 | 0 | 1 | 0.0% | stairs_not_discovered:1 |
| mp-conservative | B7 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B8 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B9 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B10 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B11 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B12 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B13 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B14 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B15 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B16 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B17 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B18 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B19 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B20 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B21 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B22 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B23 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B24 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B25 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B26 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B27 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B28 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B29 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conservative | B30 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B1 | 500 | 159 | 51 | 290 | 31.8% | stairs_not_discovered:290 |
| burst-combat | B2 | 159 | 97 | 4 | 58 | 61.0% | stairs_not_discovered:58 |
| burst-combat | B3 | 97 | 54 | 1 | 42 | 55.7% | stairs_not_discovered:42 |
| burst-combat | B4 | 54 | 32 | 0 | 22 | 59.3% | stairs_not_discovered:22 |
| burst-combat | B5 | 32 | 0 | 11 | 21 | 0.0% | stairs_not_discovered:7, boss_milestone_progression_failure:14 |
| burst-combat | B6 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B7 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B8 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B9 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B10 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B11 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B12 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B13 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B14 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B15 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B16 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B17 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B18 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B19 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B20 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B21 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B22 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B23 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B24 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B25 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B26 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B27 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B28 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B29 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B30 | 0 | 0 | 0 | 0 | n/a | none |

## Table D — HP/MP progression

| persona | floor | entry HP% | exit HP% | entry MP% | exit MP% | MP spent | MP recovered | damage taken | healing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | B1 | 100.0% | 75.3% | 100.0% | 89.8% | 1342.00 | 2832.00 | 7319.00 | 55.00 |
| balanced-combat | B2 | 88.8% | 82.0% | 92.4% | 61.4% | 1164.00 | 669.00 | 2461.00 | 0.00 |
| balanced-combat | B3 | 92.7% | 77.7% | 68.7% | 29.7% | 873.00 | 326.00 | 1784.00 | 0.00 |
| balanced-combat | B4 | 85.4% | 57.2% | 36.3% | 11.6% | 330.00 | 155.00 | 1078.00 | 0.00 |
| balanced-combat | B5 | 96.9% | 28.2% | 21.3% | 6.1% | 133.00 | 93.00 | 741.00 | 0.00 |
| balanced-combat | B6 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B7 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B8 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B9 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B10 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B11 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B12 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B13 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B14 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B15 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B16 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B17 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B18 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B19 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B20 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B21 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B22 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B23 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B24 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B25 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B26 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B27 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B28 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B29 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| balanced-combat | B30 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B1 | 100.0% | 45.4% | 100.0% | 91.3% | 1016.00 | 2164.00 | 16662.00 | 19.00 |
| mp-conservative | B2 | 80.5% | 63.2% | 89.5% | 69.0% | 674.00 | 511.00 | 3235.00 | 0.00 |
| mp-conservative | B3 | 84.4% | 69.3% | 70.6% | 36.3% | 596.00 | 230.00 | 1974.00 | 0.00 |
| mp-conservative | B4 | 87.4% | 46.7% | 42.9% | 14.5% | 257.00 | 106.00 | 1134.00 | 0.00 |
| mp-conservative | B5 | 83.0% | 33.1% | 18.3% | 11.7% | 74.00 | 64.00 | 364.00 | 0.00 |
| mp-conservative | B6 | 100.0% | 100.0% | 18.5% | 26.7% | 3.00 | 7.00 | 6.00 | 0.00 |
| mp-conservative | B7 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B8 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B9 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B10 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B11 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B12 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B13 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B14 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B15 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B16 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B17 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B18 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B19 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B20 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B21 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B22 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B23 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B24 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B25 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B26 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B27 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B28 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B29 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conservative | B30 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B1 | 100.0% | 78.4% | 100.0% | 82.7% | 1683.00 | 2565.00 | 6074.00 | 36.00 |
| burst-combat | B2 | 90.3% | 86.7% | 88.3% | 62.0% | 797.00 | 402.00 | 1131.00 | 0.00 |
| burst-combat | B3 | 92.8% | 89.8% | 67.8% | 45.8% | 466.00 | 219.00 | 829.00 | 0.00 |
| burst-combat | B4 | 91.5% | 93.1% | 47.6% | 26.7% | 316.00 | 169.00 | 692.00 | 0.00 |
| burst-combat | B5 | 96.3% | 47.3% | 24.2% | 9.4% | 176.00 | 95.00 | 875.00 | 24.00 |
| burst-combat | B6 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B7 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B8 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B9 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B10 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B11 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B12 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B13 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B14 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B15 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B16 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B17 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B18 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B19 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B20 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B21 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B22 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B23 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B24 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B25 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B26 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B27 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B28 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B29 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B30 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |

## Table E — Combat action profile

| persona | floor | encounters | spell casts | normal attacks | item actions | rounds | enemy actions | normal hits | normal damage | insufficient MP decisions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | B1 | 2684 | 4634 | 0 | 6 | 4676 | 6223 | 3163 | 7319 | 0 |
| balanced-combat | B2 | 858 | 1673 | 17 | 2 | 1701 | 2654 | 1231 | 2461 | 20 |
| balanced-combat | B3 | 459 | 1111 | 127 | 3 | 1256 | 2218 | 1073 | 1784 | 196 |
| balanced-combat | B4 | 203 | 434 | 177 | 3 | 638 | 1136 | 668 | 1078 | 256 |
| balanced-combat | B5 | 98 | 225 | 132 | 4 | 380 | 620 | 393 | 741 | 234 |
| balanced-combat | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B19 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B24 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B27 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B28 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| balanced-combat | B30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B1 | 2214 | 3004 | 4968 | 11 | 8098 | 9443 | 7064 | 16662 | 0 |
| mp-conservative | B2 | 606 | 896 | 1170 | 4 | 2091 | 2755 | 1787 | 3235 | 25 |
| mp-conservative | B3 | 347 | 588 | 653 | 3 | 1264 | 1901 | 1100 | 1974 | 39 |
| mp-conservative | B4 | 144 | 218 | 459 | 2 | 708 | 1136 | 802 | 1134 | 151 |
| mp-conservative | B5 | 53 | 60 | 159 | 1 | 233 | 375 | 236 | 364 | 87 |
| mp-conservative | B6 | 4 | 2 | 5 | 0 | 7 | 9 | 2 | 6 | 1 |
| mp-conservative | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B19 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B24 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B27 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B28 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conservative | B30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B1 | 2717 | 4030 | 0 | 4 | 4058 | 5435 | 2559 | 6074 | 1 |
| burst-combat | B2 | 816 | 1051 | 0 | 0 | 1052 | 1572 | 589 | 1131 | 1 |
| burst-combat | B3 | 502 | 678 | 1 | 1 | 681 | 1197 | 456 | 829 | 16 |
| burst-combat | B4 | 329 | 514 | 19 | 4 | 537 | 910 | 404 | 692 | 75 |
| burst-combat | B5 | 192 | 324 | 117 | 7 | 463 | 743 | 454 | 875 | 191 |
| burst-combat | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B19 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B24 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B27 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B28 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Table F — Spell usage by ID

| persona | spell ID | casts | successful | total MP cost | cast share | target type |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| balanced-combat | HALITO | 5515 | 5457 | 993 | 68.3% | {"single_enemy":5515} |
| balanced-combat | KATINO | 1038 | 1029 | 2058 | 12.9% | {"all_enemies":1038} |
| balanced-combat | LAHALITO | 1099 | 1095 | 205 | 13.6% | {"all_enemies":1099} |
| balanced-combat | MAHALITO | 425 | 424 | 586 | 5.3% | {"single_enemy":425} |
| mp-conservative | HALITO | 2551 | 2503 | 338 | 53.5% | {"single_enemy":2551} |
| mp-conservative | KATINO | 779 | 773 | 1546 | 16.3% | {"all_enemies":779} |
| mp-conservative | LAHALITO | 1438 | 1427 | 736 | 30.2% | {"all_enemies":1438} |
| burst-combat | HALITO | 3115 | 3076 | 457 | 47.2% | {"single_enemy":3115} |
| burst-combat | LAHALITO | 2188 | 2178 | 1133 | 33.2% | {"all_enemies":2188} |
| burst-combat | MAHALITO | 1291 | 1287 | 1843 | 19.6% | {"single_enemy":1291} |
| burst-combat | MADALTO | 3 | 3 | 5 | 0.0% | {"all_enemies":3} |

## Table G — MP bucket × outcome

| persona | entry MP bucket | encounters | clear | died | pure raw death | rounds | enemy actions | normal hits | normal damage | spell casts | normal attacks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | 0% | 38 | 21.1% | 44.7% | 42.1% | 2.05 | 3.47 | 2.71 | 5.47 | 0.39 | 0.87 |
| balanced-combat | 1-25% | 275 | 87.6% | 3.6% | 0.7% | 4.21 | 7.25 | 4.75 | 8.01 | 2.54 | 1.53 |
| balanced-combat | 26-50% | 301 | 100.0% | 0.0% | 0.0% | 2.15 | 3.69 | 1.42 | 2.54 | 2.14 | 0.00 |
| balanced-combat | 51-75% | 512 | 98.8% | 0.8% | 0.6% | 2.08 | 3.41 | 1.45 | 2.62 | 2.07 | 0.00 |
| balanced-combat | 76-100% | 3176 | 98.0% | 1.7% | 1.7% | 1.80 | 2.48 | 1.24 | 2.79 | 1.78 | 0.00 |
| mp-conservative | 0% | 11 | 0.0% | 36.4% | 36.4% | 1.18 | 2.27 | 1.73 | 2.45 | 0.00 | 0.18 |
| mp-conservative | 1-25% | 157 | 70.1% | 12.1% | 7.0% | 5.83 | 9.25 | 6.99 | 10.54 | 1.12 | 4.41 |
| mp-conservative | 26-50% | 219 | 96.3% | 1.4% | 0.9% | 4.14 | 5.80 | 3.52 | 6.11 | 1.68 | 2.42 |
| mp-conservative | 51-75% | 347 | 96.8% | 1.7% | 1.7% | 3.62 | 4.99 | 3.06 | 5.80 | 1.63 | 1.95 |
| mp-conservative | 76-100% | 2634 | 91.2% | 7.4% | 7.3% | 3.53 | 4.23 | 3.05 | 6.96 | 1.39 | 2.09 |
| burst-combat | 0% | 19 | 36.8% | 26.3% | 21.1% | 5.47 | 9.11 | 8.05 | 14.53 | 0.47 | 4.37 |
| burst-combat | 1-25% | 342 | 98.8% | 1.2% | 0.6% | 2.03 | 3.21 | 1.71 | 3.14 | 1.83 | 0.16 |
| burst-combat | 26-50% | 443 | 100.0% | 0.0% | 0.0% | 1.30 | 2.23 | 0.74 | 1.35 | 1.29 | 0.00 |
| burst-combat | 51-75% | 654 | 100.0% | 0.0% | 0.0% | 1.25 | 1.95 | 0.72 | 1.33 | 1.25 | 0.00 |
| burst-combat | 76-100% | 3098 | 98.5% | 1.4% | 1.4% | 1.49 | 2.04 | 0.94 | 2.19 | 1.48 | 0.00 |

## Table H — #983 death categories

| persona | runs | total deaths | death rate / all runs | pure raw deaths | pure raw / all runs | pure raw / deaths | mechanic-mediated raw lethal | direct mechanic | unknown/mixed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | 500 | 106 | 21.2% | 74 | 14.8% | 69.8% | 1 | 24 | 7 |
| mp-conservative | 500 | 253 | 50.6% | 215 | 43.0% | 85.0% | 0 | 30 | 8 |
| burst-combat | 500 | 67 | 13.4% | 49 | 9.8% | 73.1% | 0 | 15 | 3 |

## Table I — same-seed paired reach comparison

| left | right | left deeper | same depth | right deeper | paired N | mean depth delta (right-left) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | mp-conservative | 65 | 407 | 28 | 500 | -0.15 |
| balanced-combat | burst-combat | 8 | 460 | 32 | 500 | 0.07 |
| mp-conservative | burst-combat | 12 | 420 | 68 | 500 | 0.22 |

## Table J — common-support paired combat differences

| left | right | runs with common support | common encounters | mean prefix | Δ MP before | Δ rounds | Δ enemy actions | Δ normal damage | Δ spell casts | Δ normal attacks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | mp-conservative | 499 | 642 | 1.29 | 0.00 | 2.22 | 2.21 | 6.01 | -0.29 | 2.48 |
| balanced-combat | burst-combat | 499 | 2243 | 4.49 | -0.01 | -0.21 | -0.28 | -0.45 | -0.21 | 0.00 |
| mp-conservative | burst-combat | 499 | 653 | 1.31 | -0.00 | -2.26 | -2.26 | -6.11 | 0.26 | -2.49 |

## Measurement contracts

entered = reached next floor + died + incomplete is asserted per persona × floor.
Incomplete means exploration ended without death or transition; it is never relabeled as death.
Table H uses all runs for death rate and pure-raw incidence; pure-raw/deaths is the separate share among deaths. With zero deaths, pureRawShareAmongDeaths is null and renders as n/a.
Common support stops at the first encounter identity/composition mismatch. Post-divergence values are not paired.
Hidden map/future encounter/future loot information is not passed to combat policy. #983 categories are exclusive and exhaustive.
No production balance, production combat selector, or Stage 3 checkpoint continuation was changed.

## Key answers

1. All three policies have a deterministic fixture-level action difference; balanced preserves the Stage 1.5 selector, mp-conservative defaults to physical attacks in low-pressure fights, and burst selects the highest currently payable offensive spell.
2. mp-conservative reserve rule: 50.0% of max MP in low-pressure fights.
3. Mean depth: balanced-combat=1.61, mp-conservative=1.47, burst-combat=1.68. B21/B25/B30 are unobserved when no run reaches them.
4. Normal attacks/encounter: balanced-combat=0.11, mp-conservative=2.20, burst-combat=0.03; MP-zero encounter share: balanced-combat=0.9%, mp-conservative=0.3%, burst-combat=0.4%.
5. Rounds/enemy actions/encounter: balanced-combat=2.01/2.99, mp-conservative=3.68/4.64, burst-combat=1.49/2.16.
6. Pure raw death incidence (all runs; primary): balanced-combat=14.8%, mp-conservative=43.0%, burst-combat=9.8%; pure raw share among deaths (secondary): balanced-combat=69.8%, mp-conservative=85.0%, burst-combat=73.1%. Total death rate: balanced-combat=21.2%, mp-conservative=50.6%, burst-combat=13.4%.
7. Same-seed dominance is shown in Table I; no aggregate conclusion is made from unmatched post-divergence encounters.
8. Exploration incomplete remains a separate censor in Table C; zero reached depth is not reported as all-dead.
9. Stage 1.5 MP hypothesis verdict: strengthened for the managed segment: an MP-conserving action policy reduced spell casts/MP spend but increased normal attacks, rounds, enemy actions, and normal damage; burst reduced combat duration/exposure on common support. This supports MP management → action choice → exposure, not MP shortage alone as a complete death cause; the full end-to-end depth/death claim remains confounded after path divergence.
10. “AI was merely too weak” verdict: strengthened as a sensitivity factor, not sufficient as a sole explanation; burst improved shallow reach while mp-conservative worsened it, yet all policies remained shallow and B21+ unobserved.
11. Game-structure bottleneck evidence: strengthened for the shallow natural progression ceiling, with exploration incomplete still contributing.
12. Stage 3 checkpoint continuation: recommended once, under Case C, because persona results are mixed and shallow incomplete/death prevents a clean deep-depth comparison; it is not implemented in this PR.
13. #973 Build Confidence: Revise.
14. #990 remains open pending Stage 2 review.
15. Production tuning: do not proceed from this measurement alone.

## Reproduction

node scratch/measurements/issue990_phase3_stage2_combat_personas.js --runs 500 --seed issue990-phase3-stage1.5 --policies balanced-combat,mp-conservative,burst-combat --output evidence/results/issue-990-phase3-stage2.json --summary evidence/results/issue-990-phase3-stage2.md
