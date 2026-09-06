# Issue #1100 Build Snapshot payment measurement

- runner: `issue1100-build-payment-stake-v1` (schema v2)
- source commit: `ff5e0360384f42f68ea44f62439b3a589dec11e9`
- production baseline SHA: `2abf0d0712fafcceebc04f757f6534aa236a6d21`
- origin/main ancestor: `true`; clean tree: `true`
- N=500/fixture, calibration=100, seed=843
- fixtures: light-shield, heavy-two-hand, medium-shallow-rune, medium-multi-rune, exploration-support, main-core-conversion
- scenarios: workshop-empty, workshop-complete; depths: B5, B10, B15, B20
- determinism: pass

The table reports per-run means for payment dimensions; the JSON record retains quantiles and counts.

| scenario | depth | fixture | outcomes | combat rounds/run | MP spent/run | damage HP/run | Guard mitigation HP/run | equipment adopted/run | Push stake/run | terminal stake/run | banked/salvaged/lost | Portal uses |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| workshop-empty | B5 | light-shield | {"retreat":36,"death":464,"abandon":0} | 14.44 | 0.00 | 39.06 | 0.00 | 1.31 | 5.74 | 5.13 | 335/0/2228 | 36
| workshop-empty | B5 | heavy-two-hand | {"retreat":82,"death":418,"abandon":0} | 11.53 | 0.00 | 37.83 | 0.00 | 1.19 | 7.41 | 7.71 | 975/0/2882 | 80
| workshop-empty | B5 | medium-shallow-rune | {"retreat":50,"death":450,"abandon":0} | 12.85 | 1.34 | 38.01 | 0.00 | 1.61 | 6.02 | 6.34 | 536/0/2634 | 50
| workshop-empty | B5 | medium-multi-rune | {"retreat":43,"death":457,"abandon":0} | 11.85 | 2.06 | 39.91 | 0.00 | 1.74 | 5.77 | 6.03 | 387/0/2628 | 43
| workshop-empty | B5 | exploration-support | {"retreat":32,"death":468,"abandon":0} | 15.78 | 0.00 | 42.22 | 0.00 | 1.31 | 6.15 | 5.44 | 342/0/2377 | 32
| workshop-empty | B5 | main-core-conversion | {"retreat":67,"death":433,"abandon":0} | 10.48 | 1.24 | 36.95 | 0.00 | 1.94 | 6.27 | 6.65 | 724/0/2600 | 67
| workshop-empty | B10 | light-shield | {"retreat":37,"death":463,"abandon":0} | 14.19 | 0.00 | 38.49 | 0.00 | 1.20 | 5.98 | 5.03 | 399/0/2117 | 37
| workshop-empty | B10 | heavy-two-hand | {"retreat":102,"death":398,"abandon":0} | 11.53 | 0.00 | 36.35 | 0.00 | 1.28 | 7.28 | 7.89 | 1239/0/2705 | 102
| workshop-empty | B10 | medium-shallow-rune | {"retreat":53,"death":447,"abandon":0} | 13.21 | 1.28 | 37.47 | 0.00 | 1.67 | 6.07 | 6.13 | 526/0/2537 | 53
| workshop-empty | B10 | medium-multi-rune | {"retreat":42,"death":458,"abandon":0} | 11.84 | 1.97 | 38.27 | 0.00 | 1.69 | 6.23 | 5.97 | 515/0/2469 | 42
| workshop-empty | B10 | exploration-support | {"retreat":44,"death":456,"abandon":0} | 15.67 | 0.00 | 42.37 | 0.00 | 1.39 | 6.44 | 5.58 | 511/0/2278 | 44
| workshop-empty | B10 | main-core-conversion | {"retreat":71,"death":429,"abandon":0} | 10.21 | 1.21 | 35.54 | 0.00 | 1.90 | 6.29 | 6.58 | 770/0/2522 | 71
| workshop-empty | B15 | light-shield | {"retreat":31,"death":469,"abandon":0} | 13.49 | 0.00 | 37.14 | 0.00 | 1.24 | 6.11 | 5.01 | 351/0/2155 | 31
| workshop-empty | B15 | heavy-two-hand | {"retreat":106,"death":394,"abandon":0} | 11.16 | 0.00 | 36.36 | 0.00 | 1.29 | 7.29 | 7.92 | 1265/0/2694 | 106
| workshop-empty | B15 | medium-shallow-rune | {"retreat":54,"death":446,"abandon":0} | 13.36 | 1.43 | 38.15 | 0.00 | 1.68 | 5.91 | 6.14 | 533/0/2539 | 54
| workshop-empty | B15 | medium-multi-rune | {"retreat":38,"death":462,"abandon":0} | 12.25 | 1.93 | 39.57 | 0.00 | 1.76 | 6.30 | 6.11 | 395/0/2658 | 38
| workshop-empty | B15 | exploration-support | {"retreat":49,"death":451,"abandon":0} | 15.72 | 0.00 | 41.33 | 0.00 | 1.39 | 6.30 | 5.68 | 549/0/2289 | 49
| workshop-empty | B15 | main-core-conversion | {"retreat":79,"death":421,"abandon":0} | 10.00 | 1.46 | 35.10 | 0.00 | 1.82 | 6.35 | 6.73 | 867/0/2497 | 79
| workshop-empty | B20 | light-shield | {"retreat":27,"death":473,"abandon":0} | 13.88 | 0.00 | 37.57 | 0.00 | 1.24 | 6.13 | 5.10 | 287/0/2262 | 27
| workshop-empty | B20 | heavy-two-hand | {"retreat":93,"death":407,"abandon":0} | 11.25 | 0.00 | 36.17 | 0.00 | 1.23 | 7.39 | 7.53 | 1136/0/2630 | 93
| workshop-empty | B20 | medium-shallow-rune | {"retreat":50,"death":450,"abandon":0} | 13.84 | 1.33 | 38.47 | 0.00 | 1.59 | 6.42 | 6.30 | 547/0/2603 | 50
| workshop-empty | B20 | medium-multi-rune | {"retreat":38,"death":462,"abandon":0} | 11.89 | 2.13 | 39.17 | 0.00 | 1.73 | 6.05 | 5.98 | 410/0/2582 | 38
| workshop-empty | B20 | exploration-support | {"retreat":32,"death":468,"abandon":0} | 15.20 | 0.00 | 41.05 | 0.00 | 1.33 | 5.92 | 5.27 | 328/0/2309 | 32
| workshop-empty | B20 | main-core-conversion | {"retreat":53,"death":447,"abandon":0} | 10.13 | 1.31 | 36.38 | 0.00 | 1.82 | 6.45 | 6.65 | 594/0/2731 | 53
| workshop-complete | B5 | light-shield | {"retreat":54,"death":446,"abandon":0} | 15.30 | 0.00 | 41.41 | 0.00 | 1.11 | 6.71 | 6.52 | 603/0/2657 | 53
| workshop-complete | B5 | heavy-two-hand | {"retreat":49,"death":451,"abandon":0} | 12.25 | 0.00 | 39.31 | 0.00 | 1.26 | 6.71 | 5.62 | 582/0/2229 | 48
| workshop-complete | B5 | medium-shallow-rune | {"retreat":66,"death":434,"abandon":0} | 14.98 | 0.00 | 40.50 | 0.00 | 1.16 | 6.74 | 6.82 | 725/0/2686 | 66
| workshop-complete | B5 | medium-multi-rune | {"retreat":48,"death":452,"abandon":0} | 11.63 | 0.00 | 37.13 | 0.00 | 1.21 | 6.49 | 5.60 | 497/0/2301 | 48
| workshop-complete | B5 | exploration-support | {"retreat":63,"death":437,"abandon":0} | 15.39 | 0.00 | 42.29 | 0.00 | 1.12 | 6.71 | 6.71 | 731/0/2624 | 62
| workshop-complete | B5 | main-core-conversion | {"retreat":37,"death":463,"abandon":0} | 12.50 | 0.00 | 39.45 | 0.00 | 1.16 | 6.25 | 5.38 | 384/0/2307 | 37
| workshop-complete | B10 | light-shield | {"retreat":51,"death":449,"abandon":0} | 14.02 | 0.00 | 38.75 | 0.00 | 1.06 | 6.55 | 6.33 | 592/0/2573 | 51
| workshop-complete | B10 | heavy-two-hand | {"retreat":45,"death":455,"abandon":0} | 11.78 | 0.00 | 38.03 | 0.00 | 1.16 | 6.38 | 5.42 | 496/0/2213 | 45
| workshop-complete | B10 | medium-shallow-rune | {"retreat":54,"death":446,"abandon":0} | 14.42 | 0.00 | 39.44 | 0.00 | 1.09 | 6.77 | 6.57 | 601/0/2683 | 54
| workshop-complete | B10 | medium-multi-rune | {"retreat":45,"death":455,"abandon":0} | 11.72 | 0.00 | 36.76 | 0.00 | 1.23 | 6.58 | 5.35 | 510/0/2163 | 45
| workshop-complete | B10 | exploration-support | {"retreat":75,"death":425,"abandon":0} | 15.29 | 0.00 | 40.85 | 0.00 | 1.21 | 6.93 | 6.88 | 866/0/2572 | 75
| workshop-complete | B10 | main-core-conversion | {"retreat":53,"death":447,"abandon":0} | 11.92 | 0.00 | 37.92 | 0.00 | 1.24 | 6.59 | 5.63 | 577/0/2236 | 53
| workshop-complete | B15 | light-shield | {"retreat":52,"death":448,"abandon":0} | 14.33 | 0.00 | 39.55 | 0.00 | 1.06 | 6.27 | 6.26 | 557/0/2575 | 52
| workshop-complete | B15 | heavy-two-hand | {"retreat":39,"death":461,"abandon":0} | 11.50 | 0.00 | 37.64 | 0.00 | 1.07 | 6.26 | 5.18 | 403/0/2185 | 39
| workshop-complete | B15 | medium-shallow-rune | {"retreat":53,"death":447,"abandon":0} | 14.10 | 0.00 | 38.71 | 0.00 | 1.09 | 6.57 | 6.17 | 563/0/2523 | 53
| workshop-complete | B15 | medium-multi-rune | {"retreat":44,"death":456,"abandon":0} | 12.25 | 0.00 | 38.39 | 0.00 | 1.22 | 6.67 | 5.62 | 499/0/2312 | 44
| workshop-complete | B15 | exploration-support | {"retreat":47,"death":453,"abandon":0} | 15.23 | 0.00 | 41.87 | 0.00 | 1.07 | 6.64 | 6.54 | 498/0/2774 | 47
| workshop-complete | B15 | main-core-conversion | {"retreat":48,"death":452,"abandon":0} | 12.33 | 0.00 | 38.56 | 0.00 | 1.20 | 6.69 | 5.48 | 518/0/2223 | 48
| workshop-complete | B20 | light-shield | {"retreat":52,"death":448,"abandon":0} | 13.97 | 0.00 | 38.94 | 0.00 | 1.02 | 6.40 | 6.17 | 572/0/2514 | 52
| workshop-complete | B20 | heavy-two-hand | {"retreat":36,"death":464,"abandon":0} | 11.90 | 0.00 | 37.63 | 0.00 | 1.26 | 6.41 | 5.63 | 385/0/2429 | 36
| workshop-complete | B20 | medium-shallow-rune | {"retreat":59,"death":441,"abandon":0} | 14.41 | 0.00 | 39.06 | 0.00 | 1.14 | 6.58 | 6.58 | 648/0/2641 | 59
| workshop-complete | B20 | medium-multi-rune | {"retreat":44,"death":456,"abandon":0} | 12.38 | 0.00 | 38.06 | 0.00 | 1.19 | 6.21 | 5.34 | 460/0/2208 | 44
| workshop-complete | B20 | exploration-support | {"retreat":57,"death":443,"abandon":0} | 14.73 | 0.00 | 40.01 | 0.00 | 1.19 | 6.74 | 6.64 | 653/0/2668 | 57
| workshop-complete | B20 | main-core-conversion | {"retreat":52,"death":448,"abandon":0} | 12.55 | 0.00 | 39.22 | 0.00 | 1.24 | 6.47 | 5.79 | 567/0/2328 | 52

## Decision

- Numeric balance change: **none**.
- Additional observation: The measurement adds production-backed unconfirmed object-loot stake and lifecycle evidence to the existing Build Snapshot payment vector..
- Balance Issue candidates: none from this observation pass.

## Modeling boundary

Object-loot stake is production-backed by `currentRun.unbankedObjectLoot` and carries composition, location, Rune supply, Core/Support/Main/Aux, reinforce/convert/pivot, unknown/curse, bag occupancy, and lifecycle counts. Item value proxy plus explicit discarded/left events are outside this run's emitted evidence.
