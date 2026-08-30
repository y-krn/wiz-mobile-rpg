# Issue #990 Phase 3 Stage 2 — combat policy sensitivity

- runner: `issue990-phase3-stage2-v1` / schema `4`
- seed: `issue990-phase3-stage1`; N: **500 / policy**
- production-backed, B1-start, same-seed, forced-push; retreat behavior is not modeled

These are measurement policies, not claims about human player behavior. Combat policy is the independent variable; exploration, equipment, recovery, and identification are fixed to the balanced Stage 1.5-equivalent baseline.
Production combat behavior was not changed. The balanced policy delegates to the existing Stage 1.5 Mage selector; mp-conserving and burst are simulation-only selectors receiving only current combat state.

## Table A — Floor survival

`reached next floor` is the old `survived` count; it means the run completed this floor and entered the next one. `incomplete` means neither death nor next-floor reach.

| policy | floor | entered | reached next floor | died | incomplete | next-floor reach | incomplete reasons |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| balanced-combat | B1 | 500 | 167 | 69 | 264 | 33.4% | stairs_not_discovered:264 |
| balanced-combat | B2 | 167 | 97 | 8 | 62 | 58.1% | stairs_not_discovered:62 |
| balanced-combat | B3 | 97 | 49 | 14 | 34 | 50.5% | stairs_not_discovered:34 |
| balanced-combat | B4 | 49 | 25 | 11 | 13 | 51.0% | stairs_not_discovered:13 |
| balanced-combat | B5 | 25 | 0 | 19 | 6 | 0.0% | stairs_not_discovered:3, boss_milestone_progression_failure:3 |
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
| mp-conserving | B1 | 500 | 6 | 491 | 3 | 1.2% | stairs_not_discovered:3 |
| mp-conserving | B2 | 6 | 0 | 5 | 1 | 0.0% | stairs_not_discovered:1 |
| mp-conserving | B3 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B4 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B5 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B6 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B7 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B8 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B9 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B10 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B11 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B12 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B13 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B14 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B15 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B16 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B17 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B18 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B19 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B20 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B21 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B22 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B23 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B24 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B25 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B26 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B27 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B28 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B29 | 0 | 0 | 0 | 0 | n/a | none |
| mp-conserving | B30 | 0 | 0 | 0 | 0 | n/a | none |
| burst-combat | B1 | 500 | 72 | 312 | 116 | 14.4% | stairs_not_discovered:116 |
| burst-combat | B2 | 72 | 36 | 10 | 26 | 50.0% | stairs_not_discovered:26 |
| burst-combat | B3 | 36 | 21 | 1 | 14 | 58.3% | stairs_not_discovered:14 |
| burst-combat | B4 | 21 | 10 | 3 | 8 | 47.6% | stairs_not_discovered:8 |
| burst-combat | B5 | 10 | 0 | 2 | 8 | 0.0% | stairs_not_discovered:2, boss_milestone_progression_failure:6 |
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

## Table B — HP/MP progression

| policy | floor | entry HP% | exit HP% | entry MP% | exit MP% | MP spent | MP recovered | damage taken | healing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | B1 | 100.0% | 75.1% | 100.0% | 89.5% | 1436.00 | 2949.00 | 7865.00 | 50.00 |
| balanced-combat | B2 | 91.0% | 85.3% | 93.2% | 61.0% | 1231.00 | 652.00 | 2277.00 | 9.00 |
| balanced-combat | B3 | 95.6% | 78.1% | 64.9% | 30.7% | 882.00 | 362.00 | 1983.00 | 27.00 |
| balanced-combat | B4 | 94.5% | 62.9% | 40.5% | 12.2% | 439.00 | 196.00 | 1326.00 | 24.00 |
| balanced-combat | B5 | 91.7% | 13.2% | 17.7% | 1.8% | 147.00 | 70.00 | 916.00 | 0.00 |
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
| mp-conserving | B1 | 100.0% | 1.1% | 100.0% | 99.3% | 52.00 | 93.00 | 7750.00 | 0.00 |
| mp-conserving | B2 | 66.5% | 16.7% | 100.0% | 100.0% | 1.00 | 8.00 | 97.00 | 0.00 |
| mp-conserving | B3 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B4 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B5 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B6 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B7 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B8 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B9 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B10 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B11 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B12 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B13 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B14 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B15 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B16 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B17 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B18 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B19 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B20 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B21 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B22 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B23 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B24 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B25 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B26 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B27 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B28 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B29 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| mp-conserving | B30 | n/a | n/a | n/a | n/a | 0.00 | 0.00 | 0.00 | 0.00 |
| burst-combat | B1 | 100.0% | 32.8% | 100.0% | 93.9% | 616.00 | 1030.00 | 6505.00 | 23.00 |
| burst-combat | B2 | 90.6% | 78.2% | 91.3% | 65.6% | 325.00 | 185.00 | 676.00 | 0.00 |
| burst-combat | B3 | 95.9% | 89.7% | 65.3% | 40.7% | 197.00 | 76.00 | 401.00 | 0.00 |
| burst-combat | B4 | 92.6% | 76.8% | 46.5% | 28.0% | 104.00 | 46.00 | 357.00 | 0.00 |
| burst-combat | B5 | 97.3% | 57.7% | 37.1% | 21.1% | 47.00 | 19.00 | 246.00 | 15.00 |
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

## Table C — Combat actions

| policy | floor | encounters | spell casts | normal attacks | item actions | rounds | enemy actions | normal hits | normal damage | insufficient MP decisions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | B1 | 2755 | 4884 | 0 | 2 | 4925 | 6598 | 3455 | 7865 | 0 |
| balanced-combat | B2 | 939 | 1751 | 29 | 2 | 1791 | 2735 | 1192 | 2277 | 40 |
| balanced-combat | B3 | 522 | 1141 | 154 | 3 | 1325 | 2295 | 1164 | 1983 | 246 |
| balanced-combat | B4 | 251 | 573 | 263 | 4 | 866 | 1458 | 865 | 1326 | 361 |
| balanced-combat | B5 | 104 | 219 | 173 | 4 | 431 | 736 | 538 | 916 | 264 |
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
| mp-conserving | B1 | 623 | 101 | 2109 | 0 | 2498 | 3038 | 2888 | 7750 | 0 |
| mp-conserving | B2 | 14 | 5 | 28 | 0 | 38 | 53 | 38 | 97 | 0 |
| mp-conserving | B3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B19 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B24 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B27 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B28 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B29 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mp-conserving | B30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| burst-combat | B1 | 1527 | 1649 | 850 | 1 | 2658 | 3997 | 2709 | 6505 | 0 |
| burst-combat | B2 | 368 | 450 | 14 | 2 | 475 | 702 | 303 | 676 | 1 |
| burst-combat | B3 | 201 | 265 | 11 | 0 | 277 | 495 | 229 | 401 | 9 |
| burst-combat | B4 | 116 | 141 | 57 | 2 | 208 | 379 | 231 | 357 | 31 |
| burst-combat | B5 | 54 | 69 | 36 | 3 | 109 | 192 | 137 | 246 | 23 |
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

## Table D — Spell usage

| policy | spell ID | casts | successful | total MP spent | cast share |
| --- | --- | ---: | ---: | ---: | ---: |
| balanced-combat | HALITO | 5867 | 5814 | 1070 | 68.5% |
| balanced-combat | LAHALITO | 1116 | 1106 | 204 | 13.0% |
| balanced-combat | KATINO | 1075 | 1069 | 2138 | 12.5% |
| balanced-combat | MAHALITO | 510 | 508 | 723 | 6.0% |
| mp-conserving | HALITO | 106 | 106 | 53 | 100.0% |
| burst-combat | HALITO | 1233 | 1219 | 162 | 47.9% |
| burst-combat | LAHALITO | 849 | 845 | 434 | 33.0% |
| burst-combat | MAHALITO | 492 | 486 | 693 | 19.1% |

## Table E — Combat-entry MP bucket

| policy | bucket | encounters | clear | death | pure raw death | rounds | enemy actions | normal hits | normal damage | spell casts | normal attacks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | 0% | 64 | 9.4% | 43.8% | 34.4% | 3.03 | 5.11 | 4.59 | 7.52 | 0.08 | 2.06 |
| balanced-combat | 1-25% | 348 | 89.9% | 1.7% | 0.3% | 4.00 | 6.64 | 4.40 | 7.23 | 2.48 | 1.40 |
| balanced-combat | 26-50% | 319 | 99.4% | 0.3% | 0.3% | 2.23 | 3.85 | 1.65 | 2.59 | 2.23 | 0.00 |
| balanced-combat | 51-75% | 539 | 99.3% | 0.7% | 0.7% | 1.98 | 3.19 | 1.25 | 2.29 | 1.97 | 0.00 |
| balanced-combat | 76-100% | 3301 | 97.7% | 2.0% | 2.0% | 1.81 | 2.50 | 1.27 | 2.82 | 1.80 | 0.00 |
| mp-conserving | 0% | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| mp-conserving | 1-25% | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| mp-conserving | 26-50% | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| mp-conserving | 51-75% | 0 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| mp-conserving | 76-100% | 637 | 20.9% | 77.2% | 76.3% | 3.98 | 4.85 | 4.59 | 12.32 | 0.17 | 3.35 |
| burst-combat | 0% | 1 | 100.0% | 0.0% | 0.0% | 2.00 | 3.00 | 2.00 | 4.00 | 1.00 | 1.00 |
| burst-combat | 1-25% | 109 | 88.1% | 5.5% | 4.6% | 2.24 | 4.20 | 3.10 | 5.09 | 1.12 | 0.97 |
| burst-combat | 26-50% | 179 | 100.0% | 0.0% | 0.0% | 1.28 | 2.12 | 0.89 | 1.55 | 1.28 | 0.00 |
| burst-combat | 51-75% | 255 | 98.8% | 1.2% | 1.2% | 1.24 | 1.91 | 0.78 | 1.73 | 1.22 | 0.00 |
| burst-combat | 76-100% | 1722 | 80.8% | 18.3% | 18.0% | 1.70 | 2.58 | 1.69 | 4.01 | 1.11 | 0.50 |

## Table F — Policy comparison

| policy | mean reached depth | B5 | B6 | B10 | B15 | pure raw death share | B3 MP% | B4 MP% | B5 MP% | rounds/encounter | enemy actions/encounter | normal damage/encounter |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | 1.68 | 5.0% | 0.0% | 0.0% | 0.0% | 76.9% | 64.9% | 40.5% | 17.7% | 2.04 | 3.02 | 3.14 |
| mp-conserving | 1.01 | 0.0% | 0.0% | 0.0% | 0.0% | 98.0% | n/a | n/a | n/a | 3.98 | 4.85 | 12.32 |
| burst-combat | 1.28 | 2.0% | 0.0% | 0.0% | 0.0% | 97.0% | 65.3% | 46.5% | 37.1% | 1.64 | 2.54 | 3.61 |

## Table G — Same-seed pair comparison

| left | right | left deeper | same depth | right deeper | paired N | mean reached-depth delta (right-left) | mean final MP delta (right-left) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| balanced-combat | mp-conserving | 162 | 338 | 0 | 500 | -0.66 | 0.31 |
| balanced-combat | burst-combat | 102 | 390 | 8 | 500 | -0.40 | 0.19 |
| mp-conserving | burst-combat | 0 | 433 | 67 | 500 | 0.27 | -0.12 |

## Death categories

| policy | pure raw | mechanic-mediated | direct mechanic | unknown/mixed |
| --- | ---: | ---: | ---: | ---: |
| balanced-combat | 93 (76.9%) | 2 (1.7%) | 18 (14.9%) | 8 (6.6%) |
| mp-conserving | 486 (98.0%) | 0 (0.0%) | 10 (2.0%) | 0 (0.0%) |
| burst-combat | 318 (97.0%) | 0 (0.0%) | 9 (2.7%) | 1 (0.3%) |

## Interpretation

- `entered = reached next floor + died + incomplete` is asserted for every observed policy × floor; incomplete reason totals are asserted to equal incomplete.
- B1 onward uses partial-information exploration with the same balanced route baseline for every policy. Incomplete runs are not deaths and are reported separately.
- Any association between low MP, longer combat, exposure, and pure-raw death is diagnostic rather than causal proof.
- Stage 2 is measurement-only: no production balance, production combat selector, retreat behavior, or checkpoint resampling was changed.

## Answers

1. Mean reached depth ranged from 1.01 to 1.68; balanced-combat was deepest. Combat policy alone materially changed shallow natural reach in this measurement, but no policy reached B6.
2. MP first declined below its floor-entry mean at balanced-combat=B1, mp-conserving=B1, burst-combat=B1; the largest observed survivor-conditioned decline was around B3-B5 for balanced/burst.
3. mp-conserving shifted strongly to normal attacks (3.35/encounter versus balanced 0.14); it did not improve reach because the added exposure was costly.
4. mp-conserving increased rounds (3.98 vs balanced 2.04); burst reduced rounds (1.64).
5. Per encounter enemy actions/normal damage were balanced 3.02/3.14, mp-conserving 4.85/12.32, burst 2.54/3.61.
6. Pure-raw death share was balanced 76.9%, mp-conserving 98.0%, burst 97.0%; this is an association, not causal proof.
7. Burst did shorten combat relative to balanced (1.64 vs 2.04 rounds/encounter), but its B5 reach was lower (10/500 vs 25/500).
8. Burst spent less total MP per encounter than balanced in this production-backed run (0.57 vs 0.90), because many runs ended earlier; this is not evidence that burst conserves MP.
9. B5→B6 reach was 0/25 for balanced, 0/0 for mp-conserving, and 0/10 for burst; B5 entrants are not treated as all dead because incomplete is separate.
10. B10 population was 0 for all three policies.
11. B15-or-deeper population was 0 for all three policies.
12. “AI is merely too weak” is supported as a real sensitivity factor: mean depth was balanced-combat 1.68, mp-conserving 1.01, burst-combat 1.28. It is not sufficient to explain the whole result because no policy overcame the shallow ceiling and incomplete exploration remains substantial.
13. Exploration incomplete is a major censor: the lowest observed next-floor reach bottlenecks were balanced-combat=B5 (0.0%), mp-conserving=B2 (0.0%), burst-combat=B5 (0.0%); combat and exploration effects are therefore both present.
14. Checkpoint continuation is not used here and is the recommended next measurement if natural B6+ population remains absent.
15. #973 Build Confidence: **Revise**.
16. #990 remains **open**.
17. Production tuning: **do not proceed from this measurement alone**; no production balance or combat behavior was changed.

## Reproduction

```sh
node scratch/measurements/issue990_phase3_stage2_combat_personas.js --runs 500 --seed issue990-phase3-stage1 --policies balanced-combat,mp-conserving,burst-combat --output evidence/results/issue-990-phase3-stage2.json --summary evidence/results/issue-990-phase3-stage2.md
```
