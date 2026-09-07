# Issue #1100 Build Snapshot payment measurement

- runner: `issue1100-build-payment-stake-v1` (schema v2)
- source commit: `77efea50d7b97c70ad00275797c03098641511dd`
- production baseline SHA: `2abf0d0712fafcceebc04f757f6534aa236a6d21`
- origin/main ancestor: `true`; clean tree: `true`
- N=500/fixture, calibration=100, seed=843
- fixtures: light-shield, heavy-two-hand, medium-shallow-rune, medium-multi-rune, exploration-support, main-core-conversion
- scenarios: workshop-empty, workshop-complete; depths: B5, B10, B15, B20
- determinism: pass

The table reports per-run means for payment dimensions; the JSON record retains quantiles and counts.

| scenario | depth | fixture | outcomes | combat rounds/run | MP spent/run | damage HP/run | Guard mitigation HP/run | equipment adopted/run | Push stake/run | settlement-before stake/run | banked/salvaged/lost | Portal uses |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| workshop-empty | B5 | light-shield | {"retreat":36,"death":464,"abandon":0} | 14.44 | 0.00 | 39.06 | 0.00 | 1.31 | 5.74 | 9.31 | 0/72/2491 | 36
| workshop-empty | B5 | heavy-two-hand | {"retreat":82,"death":418,"abandon":0} | 11.53 | 0.00 | 37.83 | 0.00 | 1.19 | 7.41 | 11.60 | 47/160/3650 | 80
| workshop-empty | B5 | medium-shallow-rune | {"retreat":50,"death":450,"abandon":0} | 12.85 | 1.34 | 38.01 | 0.00 | 1.61 | 6.02 | 10.72 | 0/100/3070 | 50
| workshop-empty | B5 | medium-multi-rune | {"retreat":43,"death":457,"abandon":0} | 11.85 | 2.06 | 39.91 | 0.00 | 1.74 | 5.77 | 9.00 | 0/86/2929 | 43
| workshop-empty | B5 | exploration-support | {"retreat":32,"death":468,"abandon":0} | 15.78 | 0.00 | 42.22 | 0.00 | 1.31 | 6.15 | 10.69 | 0/64/2655 | 32
| workshop-empty | B5 | main-core-conversion | {"retreat":67,"death":433,"abandon":0} | 10.48 | 1.24 | 36.95 | 0.00 | 1.94 | 6.27 | 10.81 | 0/134/3190 | 67
| workshop-empty | B10 | light-shield | {"retreat":37,"death":463,"abandon":0} | 14.19 | 0.00 | 38.49 | 0.00 | 1.20 | 5.98 | 10.78 | 0/74/2442 | 37
| workshop-empty | B10 | heavy-two-hand | {"retreat":102,"death":398,"abandon":0} | 11.53 | 0.00 | 36.35 | 0.00 | 1.28 | 7.28 | 12.15 | 0/204/3740 | 102
| workshop-empty | B10 | medium-shallow-rune | {"retreat":53,"death":447,"abandon":0} | 13.21 | 1.28 | 37.47 | 0.00 | 1.67 | 6.07 | 9.92 | 0/106/2957 | 53
| workshop-empty | B10 | medium-multi-rune | {"retreat":42,"death":458,"abandon":0} | 11.84 | 1.97 | 38.27 | 0.00 | 1.69 | 6.23 | 12.26 | 0/84/2900 | 42
| workshop-empty | B10 | exploration-support | {"retreat":44,"death":456,"abandon":0} | 15.67 | 0.00 | 42.37 | 0.00 | 1.39 | 6.44 | 11.61 | 0/88/2701 | 44
| workshop-empty | B10 | main-core-conversion | {"retreat":71,"death":429,"abandon":0} | 10.21 | 1.21 | 35.54 | 0.00 | 1.90 | 6.29 | 10.85 | 0/142/3150 | 71
| workshop-empty | B15 | light-shield | {"retreat":31,"death":469,"abandon":0} | 13.49 | 0.00 | 37.14 | 0.00 | 1.24 | 6.11 | 11.32 | 0/62/2444 | 31
| workshop-empty | B15 | heavy-two-hand | {"retreat":106,"death":394,"abandon":0} | 11.16 | 0.00 | 36.36 | 0.00 | 1.29 | 7.29 | 11.93 | 0/212/3747 | 106
| workshop-empty | B15 | medium-shallow-rune | {"retreat":54,"death":446,"abandon":0} | 13.36 | 1.43 | 38.15 | 0.00 | 1.68 | 5.91 | 9.87 | 0/108/2964 | 54
| workshop-empty | B15 | medium-multi-rune | {"retreat":38,"death":462,"abandon":0} | 12.25 | 1.93 | 39.57 | 0.00 | 1.76 | 6.30 | 10.39 | 0/76/2977 | 38
| workshop-empty | B15 | exploration-support | {"retreat":49,"death":451,"abandon":0} | 15.72 | 0.00 | 41.33 | 0.00 | 1.39 | 6.30 | 11.20 | 0/98/2740 | 49
| workshop-empty | B15 | main-core-conversion | {"retreat":79,"death":421,"abandon":0} | 10.00 | 1.46 | 35.10 | 0.00 | 1.82 | 6.35 | 10.97 | 0/158/3206 | 79
| workshop-empty | B20 | light-shield | {"retreat":27,"death":473,"abandon":0} | 13.88 | 0.00 | 37.57 | 0.00 | 1.24 | 6.13 | 10.63 | 0/54/2495 | 27
| workshop-empty | B20 | heavy-two-hand | {"retreat":93,"death":407,"abandon":0} | 11.25 | 0.00 | 36.17 | 0.00 | 1.23 | 7.39 | 12.22 | 0/186/3580 | 93
| workshop-empty | B20 | medium-shallow-rune | {"retreat":50,"death":450,"abandon":0} | 13.84 | 1.33 | 38.47 | 0.00 | 1.59 | 6.42 | 10.94 | 0/100/3050 | 50
| workshop-empty | B20 | medium-multi-rune | {"retreat":38,"death":462,"abandon":0} | 11.89 | 2.13 | 39.17 | 0.00 | 1.73 | 6.05 | 10.79 | 0/76/2916 | 38
| workshop-empty | B20 | exploration-support | {"retreat":32,"death":468,"abandon":0} | 15.20 | 0.00 | 41.05 | 0.00 | 1.33 | 5.92 | 10.25 | 0/64/2573 | 32
| workshop-empty | B20 | main-core-conversion | {"retreat":53,"death":447,"abandon":0} | 10.13 | 1.31 | 36.38 | 0.00 | 1.82 | 6.45 | 11.21 | 0/106/3219 | 53
| workshop-complete | B5 | light-shield | {"retreat":54,"death":446,"abandon":0} | 15.30 | 0.00 | 41.41 | 0.00 | 1.11 | 6.71 | 11.09 | 15/106/3139 | 53
| workshop-complete | B5 | heavy-two-hand | {"retreat":49,"death":451,"abandon":0} | 12.25 | 0.00 | 39.31 | 0.00 | 1.26 | 6.71 | 11.56 | 27/96/2688 | 48
| workshop-complete | B5 | medium-shallow-rune | {"retreat":66,"death":434,"abandon":0} | 14.98 | 0.00 | 40.50 | 0.00 | 1.16 | 6.74 | 10.98 | 0/132/3279 | 66
| workshop-complete | B5 | medium-multi-rune | {"retreat":48,"death":452,"abandon":0} | 11.63 | 0.00 | 37.13 | 0.00 | 1.21 | 6.49 | 10.35 | 0/96/2702 | 48
| workshop-complete | B5 | exploration-support | {"retreat":63,"death":437,"abandon":0} | 15.39 | 0.00 | 42.29 | 0.00 | 1.12 | 6.71 | 11.50 | 18/124/3213 | 62
| workshop-complete | B5 | main-core-conversion | {"retreat":37,"death":463,"abandon":0} | 12.50 | 0.00 | 39.45 | 0.00 | 1.16 | 6.25 | 10.38 | 0/74/2617 | 37
| workshop-complete | B10 | light-shield | {"retreat":51,"death":449,"abandon":0} | 14.02 | 0.00 | 38.75 | 0.00 | 1.06 | 6.55 | 11.61 | 0/102/3063 | 51
| workshop-complete | B10 | heavy-two-hand | {"retreat":45,"death":455,"abandon":0} | 11.78 | 0.00 | 38.03 | 0.00 | 1.16 | 6.38 | 11.02 | 0/90/2619 | 45
| workshop-complete | B10 | medium-shallow-rune | {"retreat":54,"death":446,"abandon":0} | 14.42 | 0.00 | 39.44 | 0.00 | 1.09 | 6.77 | 11.13 | 0/108/3176 | 54
| workshop-complete | B10 | medium-multi-rune | {"retreat":45,"death":455,"abandon":0} | 11.72 | 0.00 | 36.76 | 0.00 | 1.23 | 6.58 | 11.33 | 0/90/2583 | 45
| workshop-complete | B10 | exploration-support | {"retreat":75,"death":425,"abandon":0} | 15.29 | 0.00 | 40.85 | 0.00 | 1.21 | 6.93 | 11.55 | 0/150/3288 | 75
| workshop-complete | B10 | main-core-conversion | {"retreat":53,"death":447,"abandon":0} | 11.92 | 0.00 | 37.92 | 0.00 | 1.24 | 6.59 | 10.89 | 0/106/2707 | 53
| workshop-complete | B15 | light-shield | {"retreat":52,"death":448,"abandon":0} | 14.33 | 0.00 | 39.55 | 0.00 | 1.06 | 6.27 | 10.71 | 0/104/3028 | 52
| workshop-complete | B15 | heavy-two-hand | {"retreat":39,"death":461,"abandon":0} | 11.50 | 0.00 | 37.64 | 0.00 | 1.07 | 6.26 | 10.33 | 0/78/2510 | 39
| workshop-complete | B15 | medium-shallow-rune | {"retreat":53,"death":447,"abandon":0} | 14.10 | 0.00 | 38.71 | 0.00 | 1.09 | 6.57 | 10.62 | 0/106/2980 | 53
| workshop-complete | B15 | medium-multi-rune | {"retreat":44,"death":456,"abandon":0} | 12.25 | 0.00 | 38.39 | 0.00 | 1.22 | 6.67 | 11.34 | 0/88/2723 | 44
| workshop-complete | B15 | exploration-support | {"retreat":47,"death":453,"abandon":0} | 15.23 | 0.00 | 41.87 | 0.00 | 1.07 | 6.64 | 10.60 | 0/94/3178 | 47
| workshop-complete | B15 | main-core-conversion | {"retreat":48,"death":452,"abandon":0} | 12.33 | 0.00 | 38.56 | 0.00 | 1.20 | 6.69 | 10.79 | 0/96/2645 | 48
| workshop-complete | B20 | light-shield | {"retreat":52,"death":448,"abandon":0} | 13.97 | 0.00 | 38.94 | 0.00 | 1.02 | 6.40 | 11.00 | 0/104/2982 | 52
| workshop-complete | B20 | heavy-two-hand | {"retreat":36,"death":464,"abandon":0} | 11.90 | 0.00 | 37.63 | 0.00 | 1.26 | 6.41 | 10.69 | 0/72/2742 | 36
| workshop-complete | B20 | medium-shallow-rune | {"retreat":59,"death":441,"abandon":0} | 14.41 | 0.00 | 39.06 | 0.00 | 1.14 | 6.58 | 10.98 | 0/118/3171 | 59
| workshop-complete | B20 | medium-multi-rune | {"retreat":44,"death":456,"abandon":0} | 12.38 | 0.00 | 38.06 | 0.00 | 1.19 | 6.21 | 10.45 | 0/88/2580 | 44
| workshop-complete | B20 | exploration-support | {"retreat":57,"death":443,"abandon":0} | 14.73 | 0.00 | 40.01 | 0.00 | 1.19 | 6.74 | 11.46 | 0/114/3207 | 57
| workshop-complete | B20 | main-core-conversion | {"retreat":52,"death":448,"abandon":0} | 12.55 | 0.00 | 39.22 | 0.00 | 1.24 | 6.47 | 10.90 | 0/104/2791 | 52

## Decision

- Numeric balance change: **none**.
- Additional observation: Combat strength and unconfirmed object-loot stake are separate axes: stronger combat payment does not imply lower carried or lost-loot exposure. In workshop-empty B20, heavy-two-hand averaged 11.25 combat rounds and 36.17 damage HP with 7.53 terminal stake, versus light-shield at 13.88 rounds, 37.57 damage HP, and 5.10 terminal stake..
- Balance Issue candidates: none from this observation pass.

## Modeling boundary

Object-loot stake is production-backed by `currentRun.unbankedObjectLoot` plus production pending loot IDs for explicit discarded/left outcomes; it carries composition, location, Rune supply, Core/Support/Main/Aux, reinforce/convert/pivot, unknown/curse, bag occupancy, and lifecycle counts. Item value proxy remains outside this run's emitted evidence.
