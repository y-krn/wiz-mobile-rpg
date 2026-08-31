# Issue #990 Phase 3 Stage 3 — final deep checkpoint continuation

- runner: issue990-phase3-stage3-v1 / schema 1
- seed: issue990-phase3-stage3; N=500 / checkpoint × persona
- source: 98672f5789c7ec322e56095ea95eb225e9d82f66; latest main baseline: 8b6c2a48e823343bc4417afdcc03ede498d87b16
- no production source, combat, enemy, Mage, item, exploration, or balance changes
- checkpoint continuation is a measurement device, not an actual player reach-rate claim

## Table A — Checkpoint construction / provenance

| checkpoint | horizon | bounded successes | synthetic | source |
| --- | --- | ---: | ---: | --- |
| B10→B15 | next named checkpoint | 0 | 500 | B5 population; production continuation attempted per sample, failures retained as explicitly synthetic advances |
| B15→B20 | next named checkpoint | 0 | 500 | B10 population; production continuation attempted per sample, failures retained as explicitly synthetic advances |
| B20→B25 | next named checkpoint | 0 | 500 | B15 population; production continuation attempted per sample, failures retained as explicitly synthetic advances |
| B21→B25 | next named checkpoint | 0 | 500 | B20 population; production continuation attempted per sample, failures retained as explicitly synthetic advances |
| B25→B30 | next named checkpoint | 0 | 500 | B21 population; production continuation attempted per sample, failures retained as explicitly synthetic advances |
| B30→B35 | B30 band, five floors | 0 | 500 | B25 population; production continuation attempted per sample, failures retained as explicitly synthetic advances |

## Table B — Checkpoint state distribution (p10/p25/p50/p75/p90)

| checkpoint | HP ratio | MP ratio | ATK | DEF | max HP | max MP | inventory | consumables | Core | Support | build score | curse | rarity m/r/e/o |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | ---: | --- |
| B10 | 0.97 / 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.04 / 0.08 / 0.17 / 0.33 | 1.50 | 5.00 | 31.00 | 21.00 | 2.00 | 0.00 | 2.00 | 0.00 | 17.00 | 70.0% | 1.00/1.00/0.00/0.00 |
| B15 | 1.00 / 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.04 / 0.08 / 0.17 / 0.33 | 1.50 | 5.00 | 31.00 | 21.00 | 2.00 | 0.00 | 2.00 | 0.00 | 17.00 | 70.0% | 1.00/1.00/0.00/0.00 |
| B20 | 1.00 / 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.04 / 0.08 / 0.17 / 0.33 | 1.50 | 5.00 | 31.00 | 21.00 | 2.00 | 0.00 | 2.00 | 0.00 | 17.00 | 70.0% | 1.00/1.00/0.00/0.00 |
| B21 | 1.00 / 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.04 / 0.08 / 0.17 / 0.33 | 1.50 | 5.00 | 31.00 | 21.00 | 2.00 | 0.00 | 2.00 | 0.00 | 17.00 | 70.0% | 1.00/1.00/0.00/0.00 |
| B25 | 1.00 / 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.04 / 0.08 / 0.17 / 0.33 | 1.50 | 5.00 | 31.00 | 21.00 | 2.00 | 0.00 | 2.00 | 0.00 | 17.00 | 70.0% | 1.00/1.00/0.00/0.00 |
| B30 | 1.00 / 1.00 / 1.00 / 1.00 / 1.00 | 0.00 / 0.04 / 0.08 / 0.17 / 0.33 | 1.50 | 5.00 | 31.00 | 21.00 | 2.00 | 0.00 | 2.00 | 0.00 | 17.00 | 70.0% | 1.00/1.00/0.00/0.00 |

All B10+ results below are synthetic frozen-state stress-test results, not natural B1-start reach distributions or production B21+ survival estimates.

## Table C — Continuation survival by checkpoint/persona

| checkpoint | persona | N | clear | death incidence | pure raw/all | pure raw/deaths | floors survived p50 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---:
| B10→B15 | balanced-combat | 500 | 8.6% | 91.4% | 38.0% | 41.6% | 0.00 |
| B10→B15 | mp-conservative | 500 | 2.4% | 97.6% | 39.6% | 40.6% | 0.00 |
| B10→B15 | burst-combat | 500 | 11.6% | 88.4% | 39.8% | 45.0% | 0.00 |
| B15→B20 | balanced-combat | 500 | 1.6% | 98.4% | 33.6% | 34.1% | 0.00 |
| B15→B20 | mp-conservative | 500 | 1.8% | 98.2% | 37.2% | 37.9% | 0.00 |
| B15→B20 | burst-combat | 500 | 2.2% | 97.8% | 38.4% | 39.3% | 0.00 |
| B20→B25 | balanced-combat | 500 | 0.8% | 99.2% | 28.0% | 28.2% | 0.00 |
| B20→B25 | mp-conservative | 500 | 0.6% | 99.4% | 30.0% | 30.2% | 0.00 |
| B20→B25 | burst-combat | 500 | 0.8% | 99.2% | 31.0% | 31.3% | 0.00 |
| B21→B25 | balanced-combat | 500 | 0.2% | 99.8% | 24.4% | 24.4% | 0.00 |
| B21→B25 | mp-conservative | 500 | 0.2% | 99.8% | 29.8% | 29.9% | 0.00 |
| B21→B25 | burst-combat | 500 | 0.2% | 99.8% | 27.4% | 27.5% | 0.00 |
| B25→B30 | balanced-combat | 500 | 0.0% | 100.0% | 32.0% | 32.0% | 0.00 |
| B25→B30 | mp-conservative | 500 | 0.0% | 100.0% | 32.2% | 32.2% | 0.00 |
| B25→B30 | burst-combat | 500 | 0.0% | 100.0% | 39.8% | 39.8% | 0.00 |
| B30→B35 | balanced-combat | 500 | 0.2% | 99.8% | 28.4% | 28.5% | 0.00 |
| B30→B35 | mp-conservative | 500 | 0.4% | 99.6% | 30.0% | 30.1% | 0.00 |
| B30→B35 | burst-combat | 500 | 0.2% | 99.8% | 33.4% | 33.5% | 0.00 |

## Table D — Death incidence and #983 categories

| checkpoint | persona | deaths/all | pure raw/all | pure raw/deaths | mechanic-mediated | direct mechanic | unknown/mixed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---:
| B10 | balanced-combat | 91.4% | 38.0% | 41.6% | 14 | 111 | 142 |
| B10 | mp-conservative | 97.6% | 39.6% | 40.6% | 11 | 119 | 160 |
| B10 | burst-combat | 88.4% | 39.8% | 45.0% | 24 | 106 | 113 |
| B15 | balanced-combat | 98.4% | 33.6% | 34.1% | 56 | 66 | 202 |
| B15 | mp-conservative | 98.2% | 37.2% | 37.9% | 0 | 67 | 238 |
| B15 | burst-combat | 97.8% | 38.4% | 39.3% | 66 | 62 | 169 |
| B20 | balanced-combat | 99.2% | 28.0% | 28.2% | 58 | 30 | 268 |
| B20 | mp-conservative | 99.4% | 30.0% | 30.2% | 22 | 30 | 295 |
| B20 | burst-combat | 99.2% | 31.0% | 31.3% | 78 | 25 | 238 |
| B21 | balanced-combat | 99.8% | 24.4% | 24.4% | 84 | 48 | 245 |
| B21 | mp-conservative | 99.8% | 29.8% | 29.9% | 36 | 54 | 260 |
| B21 | burst-combat | 99.8% | 27.4% | 27.5% | 77 | 48 | 237 |
| B25 | balanced-combat | 100.0% | 32.0% | 32.0% | 84 | 49 | 207 |
| B25 | mp-conservative | 100.0% | 32.2% | 32.2% | 30 | 50 | 259 |
| B25 | burst-combat | 100.0% | 39.8% | 39.8% | 73 | 52 | 176 |
| B30 | balanced-combat | 99.8% | 28.4% | 28.5% | 90 | 20 | 247 |
| B30 | mp-conservative | 99.6% | 30.0% | 30.1% | 12 | 23 | 313 |
| B30 | burst-combat | 99.8% | 33.4% | 33.5% | 87 | 20 | 225 |

## Table E — Combat/resource profile

| checkpoint | persona | entry HP% p50 | exit HP% p50 | entry MP% p50 | exit MP% p50 | MP spent/enc | rounds/enc | enemy actions/enc | normal hits/enc | normal damage/enc | spell casts/enc | normal attacks/enc | MP-zero encounters | insufficient MP decisions |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
| B10 | balanced-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.07 | 5.05 | 8.34 | 6.95 | 14.97 | 1.61 | 2.86 | 45.6% | 5730 |
| B10 | mp-conservative | 100.0% | 0.0% | 8.3% | 0.0% | 0.91 | 5.57 | 9.30 | 7.97 | 16.37 | 0.66 | 4.19 | 43.2% | 4498 |
| B10 | burst-combat | 100.0% | 0.0% | 8.3% | 0.0% | 0.89 | 4.52 | 7.23 | 6.18 | 13.63 | 1.63 | 2.37 | 43.0% | 5705 |
| B15 | balanced-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.28 | 4.59 | 7.63 | 6.08 | 18.92 | 1.42 | 2.44 | 46.1% | 2797 |
| B15 | mp-conservative | 100.0% | 0.0% | 8.3% | 0.0% | 0.87 | 4.81 | 8.02 | 6.48 | 19.43 | 0.72 | 3.30 | 41.8% | 2466 |
| B15 | burst-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.14 | 4.36 | 6.97 | 5.88 | 18.59 | 1.55 | 2.11 | 45.1% | 2767 |
| B20 | balanced-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.08 | 3.88 | 6.71 | 5.62 | 24.18 | 0.93 | 2.27 | 58.9% | 1868 |
| B20 | mp-conservative | 100.0% | 0.0% | 8.3% | 0.0% | 0.73 | 4.09 | 7.02 | 5.93 | 24.31 | 0.47 | 2.91 | 57.7% | 1834 |
| B20 | burst-combat | 100.0% | 0.0% | 8.3% | 0.0% | 0.97 | 3.79 | 6.47 | 5.67 | 24.44 | 0.97 | 2.13 | 59.0% | 1806 |
| B21 | balanced-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.49 | 4.04 | 5.04 | 4.47 | 26.32 | 1.23 | 2.13 | 44.4% | 1618 |
| B21 | mp-conservative | 100.0% | 0.0% | 8.3% | 0.0% | 0.48 | 4.06 | 5.09 | 4.61 | 26.67 | 0.60 | 2.75 | 43.5% | 1382 |
| B21 | burst-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.42 | 3.97 | 4.92 | 4.47 | 26.32 | 1.23 | 2.06 | 44.2% | 1590 |
| B25 | balanced-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.42 | 3.26 | 5.88 | 4.45 | 27.93 | 1.14 | 1.57 | 42.8% | 1134 |
| B25 | mp-conservative | 100.0% | 0.0% | 8.3% | 0.0% | 0.94 | 3.26 | 5.86 | 4.53 | 27.60 | 0.58 | 2.13 | 43.1% | 1090 |
| B25 | burst-combat | 100.0% | 0.0% | 8.3% | 0.0% | 1.18 | 3.01 | 5.36 | 4.40 | 27.73 | 1.13 | 1.36 | 43.0% | 1051 |
| B30 | balanced-combat | 100.0% | 0.0% | 8.3% | 0.0% | 0.97 | 2.96 | 5.04 | 3.63 | 31.02 | 0.84 | 1.63 | 58.2% | 1115 |
| B30 | mp-conservative | 100.0% | 0.0% | 8.3% | 0.0% | 0.61 | 2.98 | 5.07 | 3.69 | 30.73 | 0.40 | 2.09 | 57.2% | 1084 |
| B30 | burst-combat | 100.0% | 0.0% | 8.3% | 0.0% | 0.80 | 2.79 | 4.69 | 3.57 | 30.65 | 0.83 | 1.49 | 58.5% | 1065 |

## Table F — Same-seed reach/survival pairs

| checkpoint | left | right | left survives farther | same | right survives farther | paired N |
| --- | --- | --- | ---: | ---: | ---: | ---:
| B10 | balanced-combat | mp-conservative | 34 | 463 | 3 | 500 |
| B10 | balanced-combat | burst-combat | 16 | 453 | 31 | 500 |
| B10 | mp-conservative | burst-combat | 4 | 446 | 50 | 500 |
| B15 | balanced-combat | mp-conservative | 4 | 491 | 5 | 500 |
| B15 | balanced-combat | burst-combat | 0 | 497 | 3 | 500 |
| B15 | mp-conservative | burst-combat | 5 | 488 | 7 | 500 |
| B20 | balanced-combat | mp-conservative | 1 | 499 | 0 | 500 |
| B20 | balanced-combat | burst-combat | 0 | 500 | 0 | 500 |
| B20 | mp-conservative | burst-combat | 0 | 499 | 1 | 500 |
| B21 | balanced-combat | mp-conservative | 0 | 500 | 0 | 500 |
| B21 | balanced-combat | burst-combat | 0 | 500 | 0 | 500 |
| B21 | mp-conservative | burst-combat | 0 | 500 | 0 | 500 |
| B25 | balanced-combat | mp-conservative | 0 | 500 | 0 | 500 |
| B25 | balanced-combat | burst-combat | 0 | 500 | 0 | 500 |
| B25 | mp-conservative | burst-combat | 0 | 500 | 0 | 500 |
| B30 | balanced-combat | mp-conservative | 0 | 499 | 1 | 500 |
| B30 | balanced-combat | burst-combat | 0 | 500 | 0 | 500 |
| B30 | mp-conservative | burst-combat | 1 | 499 | 0 | 500 |

## Table G — Common-support combat deltas (right − left)

| checkpoint | left | right | common runs | encounters | Δ MP before | Δ MP after | Δ MP spent | Δ rounds | Δ enemy actions | Δ normal damage | Δ normal hits | Δ spell casts | Δ normal attacks |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:
| B10 | balanced-combat | mp-conservative | 500 | 759 | 0.00 | 0.01 | -0.27 | 1.05 | 1.66 | 2.97 | 1.85 | -0.73 | 1.68 |
| B10 | balanced-combat | burst-combat | 500 | 947 | -0.00 | 0.01 | -0.25 | -0.72 | -1.43 | -2.07 | -1.05 | -0.02 | -0.64 |
| B10 | mp-conservative | burst-combat | 500 | 678 | -0.00 | 0.01 | -0.01 | -1.92 | -3.39 | -5.46 | -3.15 | 0.77 | -2.54 |
| B15 | balanced-combat | mp-conservative | 495 | 646 | 0.00 | 0.02 | -0.39 | 0.34 | 0.57 | 1.15 | 0.57 | -0.63 | 0.93 |
| B15 | balanced-combat | burst-combat | 495 | 733 | -0.00 | 0.01 | -0.19 | -0.32 | -0.76 | -0.64 | -0.31 | 0.10 | -0.38 |
| B15 | mp-conservative | burst-combat | 495 | 616 | -0.00 | -0.01 | 0.23 | -0.61 | -1.26 | -1.57 | -0.83 | 0.80 | -1.34 |
| B20 | balanced-combat | mp-conservative | 495 | 615 | 0.00 | 0.01 | -0.33 | 0.23 | 0.35 | 0.35 | 0.33 | -0.44 | 0.66 |
| B20 | balanced-combat | burst-combat | 495 | 658 | -0.00 | 0.00 | -0.12 | -0.13 | -0.32 | 0.12 | -0.04 | 0.05 | -0.18 |
| B20 | mp-conservative | burst-combat | 495 | 612 | -0.00 | -0.01 | 0.21 | -0.38 | -0.69 | -0.27 | -0.38 | 0.48 | -0.85 |
| B21 | balanced-combat | mp-conservative | 476 | 522 | 0.00 | 0.04 | -0.93 | 0.02 | 0.04 | 0.28 | 0.13 | -0.58 | 0.57 |
| B21 | balanced-combat | burst-combat | 476 | 565 | -0.00 | 0.00 | -0.08 | -0.07 | -0.13 | -0.04 | -0.01 | 0.00 | -0.07 |
| B21 | mp-conservative | burst-combat | 476 | 520 | -0.00 | -0.04 | 0.85 | -0.09 | -0.18 | -0.32 | -0.14 | 0.59 | -0.66 |
| B25 | balanced-combat | mp-conservative | 469 | 507 | 0.00 | 0.02 | -0.46 | 0.02 | 0.02 | -0.04 | 0.13 | -0.56 | 0.59 |
| B25 | balanced-combat | burst-combat | 469 | 527 | 0.00 | 0.01 | -0.24 | -0.24 | -0.51 | -0.09 | -0.03 | -0.01 | -0.20 |
| B25 | mp-conservative | burst-combat | 469 | 507 | -0.00 | -0.01 | 0.23 | -0.26 | -0.52 | -0.06 | -0.16 | 0.56 | -0.79 |
| B30 | balanced-combat | mp-conservative | 490 | 518 | 0.00 | 0.02 | -0.36 | 0.04 | 0.06 | -0.12 | 0.08 | -0.43 | 0.47 |
| B30 | balanced-combat | burst-combat | 490 | 532 | 0.00 | 0.01 | -0.17 | -0.16 | -0.33 | -0.17 | -0.04 | 0.00 | -0.13 |
| B30 | mp-conservative | burst-combat | 490 | 518 | -0.00 | -0.01 | 0.20 | -0.20 | -0.38 | -0.05 | -0.13 | 0.44 | -0.61 |

## Table H — Stage 2 → Stage 3 direction comparison

Stage 2: burst < balanced < mp-conservative (pure raw incidence). Stage 3 ordering is shown below using all-run pure-raw incidence; lower is better.

| checkpoint | pure-raw ordering (low → high) |
| --- | --- |
| B10 | balanced-combat 38.0% < mp-conservative 39.6% < burst-combat 39.8% |
| B15 | balanced-combat 33.6% < mp-conservative 37.2% < burst-combat 38.4% |
| B20 | balanced-combat 28.0% < mp-conservative 30.0% < burst-combat 31.0% |
| B21 | balanced-combat 24.4% < burst-combat 27.4% < mp-conservative 29.8% |
| B25 | balanced-combat 32.0% < mp-conservative 32.2% < burst-combat 39.8% |
| B30 | balanced-combat 28.4% < mp-conservative 30.0% < burst-combat 33.4% |

## Table I — Depth trend B10→B30

| continuation | balanced | mp-conservative | burst |
| --- | ---: | ---: | ---: |
| B10→B15 | 38.0% | 39.6% | 39.8% |
| B15→B20 | 33.6% | 37.2% | 38.4% |
| B20→B25 | 28.0% | 30.0% | 31.0% |
| B21→B25 | 24.4% | 29.8% | 27.4% |
| B25→B30 | 32.0% | 32.2% | 39.8% |
| B30→B35 | 28.4% | 30.0% | 33.4% |

## Resource cohorts — checkpoint state sensitivity

Cohorts are defined from entry MP ratio within each checkpoint arm: lower ≤ p25, median p25–p75, upper > p75. Cells are N/pure-raw incidence (all-run denominator).

| checkpoint | persona | lower-resource | median-resource | upper-resource |
| --- | --- | ---: | ---: | ---: |
| B10 | balanced-combat | 125/48.0% | 250/39.2% | 125/25.6% |
| B10 | mp-conservative | 125/47.2% | 250/41.6% | 125/28.0% |
| B10 | burst-combat | 125/48.8% | 250/37.6% | 125/35.2% |
| B15 | balanced-combat | 125/32.8% | 250/31.6% | 125/38.4% |
| B15 | mp-conservative | 125/32.8% | 250/30.8% | 125/54.4% |
| B15 | burst-combat | 125/32.8% | 250/38.0% | 125/44.8% |
| B20 | balanced-combat | 125/22.4% | 250/26.8% | 125/36.0% |
| B20 | mp-conservative | 125/22.4% | 250/28.8% | 125/40.0% |
| B20 | burst-combat | 125/22.4% | 250/31.6% | 125/38.4% |
| B21 | balanced-combat | 125/16.8% | 250/17.6% | 125/45.6% |
| B21 | mp-conservative | 125/16.8% | 250/24.0% | 125/54.4% |
| B21 | burst-combat | 125/16.8% | 250/20.8% | 125/51.2% |
| B25 | balanced-combat | 125/17.6% | 250/22.8% | 125/64.8% |
| B25 | mp-conservative | 125/17.6% | 250/24.0% | 125/63.2% |
| B25 | burst-combat | 125/17.6% | 250/33.6% | 125/74.4% |
| B30 | balanced-combat | 125/21.6% | 250/21.6% | 125/48.8% |
| B30 | mp-conservative | 125/21.6% | 250/22.8% | 125/52.8% |
| B30 | burst-combat | 125/21.6% | 250/28.8% | 125/54.4% |

## Table J — Final decision matrix

| question | decision |
| --- | --- |
| deep stress result | Shallow-origin frozen states are almost completely eliminated at B21+ in the stress-test arms. |
| production B21+ survival wall | Not established; the checkpoint population does not model natural deep progression. |
| natural deep checkpoint distribution | Not observed. B10–B30 are under-progressed synthetic/frozen-state arms. |
| combat policy | Stage 2's mechanism remains visible at B10; B21+ comparison is censored by near-immediate failure, so convergence is not conclusive. |
| pure raw | Material but non-monotonic; insufficient to call a production raw wall. |
| #973 Build Confidence | Revise; deep validation remains unresolved rather than rejected. |
| production tuning | Not justified from Stage 3 alone; no specific production nerf is supported. |
| first production lever | Undecided; requires separate design review of ordinary damage × duration × action exposure. |
| #990 can close | Yes; the measurement program reached its useful limit, not because production B21+ balance was validated. |

## Contracts and limitations

- All personas reuse unchanged Stage 2 selectors. Each checkpoint/runIndex shares one serialized state and one continuation seed.
- Combat receives current observable state only; hidden map/future encounter/future loot are excluded.
- B5 states are production-backed. Deeper populations attempt production continuation; failed attempts are explicitly synthetic and only recover 15% HP per production floor transition.
- State distributions include HP/MP, stats, equipment rarity, Core/Support, curse, consumables, accumulated changes, and build score.
- #983 categories are exhaustive/exclusive. Pure raw incidence is divided by all runs; among-deaths share is separate and n/a at zero deaths.
- Raw full combat histories are not persisted; only three representative samples per cell are emitted.

## Reproduction

node scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js --runs 500 --seed issue990-phase3-stage3 --output evidence/results/issue-990-phase3-stage3.json --summary evidence/results/issue-990-phase3-stage3.md

## Final report

Stage 3 is the final measurement and is interpreted as a shallow-origin frozen-state deep stress test. It does not establish production B21+ balance, natural deep checkpoint distributions, or a specific production nerf. No Stage 3.5/4 or additional AI diagnosis is planned. #990 can close because the measurement program reached its useful limit and further synthetic continuation would add little trustworthy information.
