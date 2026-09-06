# Issue #1096 Build Snapshot payment measurement

- runner: `issue1096-build-payment-v1` (schema v1)
- source commit: `afd2f86e217d9000a0721851815b46e4a818339f`
- production baseline SHA: `3c4ec15e44e766e07eb77e86f41e665151ad7922`
- origin/main ancestor: `true`; clean tree: `true`
- N=500/fixture, calibration=1, seed=1096
- fixtures: light-shield, heavy-two-hand, medium-shallow-rune, medium-multi-rune, exploration-support, main-core-conversion
- scenarios: workshop-empty, workshop-complete; depths: B5, B10, B15, B20
- determinism: pass

The table reports per-run means for payment dimensions; the JSON record retains quantiles and counts.

| scenario | depth | fixture | outcomes | combat rounds/run | MP spent/run | damage HP/run | Guard mitigation HP/run | equipment adopted/run | Portal uses |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| workshop-empty | B5 | light-shield | {"retreat":71,"death":429,"abandon":0} | 18.61 | 0.00 | 39.35 | 0.00 | 1.64 | 68
| workshop-empty | B5 | heavy-two-hand | {"retreat":217,"death":283,"abandon":0} | 16.73 | 0.00 | 32.25 | 0.00 | 1.87 | 202
| workshop-empty | B5 | medium-shallow-rune | {"retreat":100,"death":400,"abandon":0} | 17.58 | 1.41 | 36.75 | 0.00 | 2.14 | 97
| workshop-empty | B5 | medium-multi-rune | {"retreat":85,"death":415,"abandon":0} | 17.35 | 2.17 | 38.44 | 0.00 | 2.15 | 84
| workshop-empty | B5 | exploration-support | {"retreat":109,"death":391,"abandon":0} | 21.21 | 0.00 | 44.14 | 0.00 | 1.86 | 109
| workshop-empty | B5 | main-core-conversion | {"retreat":136,"death":364,"abandon":0} | 14.34 | 1.52 | 31.68 | 0.00 | 2.40 | 134
| workshop-empty | B10 | light-shield | {"retreat":71,"death":429,"abandon":0} | 18.98 | 0.00 | 40.11 | 0.00 | 1.67 | 71
| workshop-empty | B10 | heavy-two-hand | {"retreat":208,"death":292,"abandon":0} | 17.38 | 0.00 | 32.96 | 0.00 | 1.95 | 208
| workshop-empty | B10 | medium-shallow-rune | {"retreat":121,"death":379,"abandon":0} | 17.07 | 1.39 | 36.90 | 0.00 | 2.13 | 121
| workshop-empty | B10 | medium-multi-rune | {"retreat":111,"death":389,"abandon":0} | 17.26 | 2.19 | 38.55 | 0.00 | 2.23 | 111
| workshop-empty | B10 | exploration-support | {"retreat":87,"death":413,"abandon":0} | 20.15 | 0.00 | 42.29 | 0.00 | 1.92 | 87
| workshop-empty | B10 | main-core-conversion | {"retreat":141,"death":359,"abandon":0} | 14.43 | 1.61 | 32.47 | 0.00 | 2.30 | 141
| workshop-empty | B15 | light-shield | {"retreat":73,"death":427,"abandon":0} | 19.16 | 0.00 | 40.81 | 0.00 | 1.69 | 73
| workshop-empty | B15 | heavy-two-hand | {"retreat":219,"death":281,"abandon":0} | 16.92 | 0.00 | 32.99 | 0.00 | 1.95 | 219
| workshop-empty | B15 | medium-shallow-rune | {"retreat":104,"death":396,"abandon":0} | 18.61 | 1.44 | 38.71 | 0.00 | 2.11 | 104
| workshop-empty | B15 | medium-multi-rune | {"retreat":105,"death":395,"abandon":0} | 16.31 | 2.01 | 36.77 | 0.00 | 2.16 | 105
| workshop-empty | B15 | exploration-support | {"retreat":108,"death":392,"abandon":0} | 21.19 | 0.00 | 43.81 | 0.00 | 1.93 | 108
| workshop-empty | B15 | main-core-conversion | {"retreat":152,"death":348,"abandon":0} | 13.98 | 1.58 | 31.53 | 0.00 | 2.38 | 152
| workshop-empty | B20 | light-shield | {"retreat":89,"death":411,"abandon":0} | 19.73 | 0.00 | 40.37 | 0.00 | 1.77 | 89
| workshop-empty | B20 | heavy-two-hand | {"retreat":211,"death":289,"abandon":0} | 17.29 | 0.00 | 33.03 | 0.00 | 1.98 | 211
| workshop-empty | B20 | medium-shallow-rune | {"retreat":103,"death":397,"abandon":0} | 18.23 | 1.33 | 37.90 | 0.00 | 2.06 | 103
| workshop-empty | B20 | medium-multi-rune | {"retreat":110,"death":390,"abandon":0} | 16.81 | 2.20 | 36.85 | 0.00 | 2.15 | 110
| workshop-empty | B20 | exploration-support | {"retreat":102,"death":398,"abandon":0} | 20.58 | 0.00 | 42.92 | 0.00 | 1.83 | 102
| workshop-empty | B20 | main-core-conversion | {"retreat":147,"death":353,"abandon":0} | 14.30 | 1.64 | 32.31 | 0.00 | 2.39 | 147
| workshop-complete | B5 | light-shield | {"retreat":128,"death":372,"abandon":0} | 19.89 | 0.00 | 40.95 | 0.00 | 1.62 | 126
| workshop-complete | B5 | heavy-two-hand | {"retreat":123,"death":377,"abandon":0} | 18.38 | 0.00 | 40.45 | 0.00 | 1.72 | 123
| workshop-complete | B5 | medium-shallow-rune | {"retreat":120,"death":380,"abandon":0} | 19.22 | 0.00 | 40.14 | 0.00 | 1.58 | 119
| workshop-complete | B5 | medium-multi-rune | {"retreat":109,"death":391,"abandon":0} | 19.19 | 0.00 | 42.07 | 0.00 | 1.84 | 108
| workshop-complete | B5 | exploration-support | {"retreat":148,"death":352,"abandon":0} | 20.57 | 0.00 | 41.67 | 0.00 | 1.82 | 145
| workshop-complete | B5 | main-core-conversion | {"retreat":119,"death":381,"abandon":0} | 18.83 | 0.00 | 41.49 | 0.00 | 1.92 | 119
| workshop-complete | B10 | light-shield | {"retreat":141,"death":359,"abandon":0} | 19.86 | 0.00 | 40.64 | 0.00 | 1.66 | 141
| workshop-complete | B10 | heavy-two-hand | {"retreat":110,"death":390,"abandon":0} | 18.22 | 0.00 | 40.54 | 0.00 | 1.74 | 110
| workshop-complete | B10 | medium-shallow-rune | {"retreat":121,"death":379,"abandon":0} | 19.29 | 0.00 | 39.05 | 0.00 | 1.66 | 121
| workshop-complete | B10 | medium-multi-rune | {"retreat":117,"death":383,"abandon":0} | 18.79 | 0.00 | 41.99 | 0.00 | 1.81 | 117
| workshop-complete | B10 | exploration-support | {"retreat":148,"death":352,"abandon":0} | 20.49 | 0.00 | 41.57 | 0.00 | 1.73 | 148
| workshop-complete | B10 | main-core-conversion | {"retreat":115,"death":385,"abandon":0} | 19.02 | 0.00 | 40.89 | 0.00 | 1.89 | 115
| workshop-complete | B15 | light-shield | {"retreat":128,"death":372,"abandon":0} | 19.48 | 0.00 | 39.77 | 0.00 | 1.66 | 128
| workshop-complete | B15 | heavy-two-hand | {"retreat":105,"death":395,"abandon":0} | 18.96 | 0.00 | 41.22 | 0.00 | 1.88 | 105
| workshop-complete | B15 | medium-shallow-rune | {"retreat":128,"death":372,"abandon":0} | 19.93 | 0.00 | 40.80 | 0.00 | 1.52 | 128
| workshop-complete | B15 | medium-multi-rune | {"retreat":118,"death":382,"abandon":0} | 18.45 | 0.00 | 40.79 | 0.00 | 1.82 | 118
| workshop-complete | B15 | exploration-support | {"retreat":137,"death":363,"abandon":0} | 20.64 | 0.00 | 42.14 | 0.00 | 1.74 | 137
| workshop-complete | B15 | main-core-conversion | {"retreat":105,"death":395,"abandon":0} | 18.80 | 0.00 | 41.24 | 0.00 | 1.76 | 105
| workshop-complete | B20 | light-shield | {"retreat":110,"death":390,"abandon":0} | 20.34 | 0.00 | 40.85 | 0.00 | 1.66 | 110
| workshop-complete | B20 | heavy-two-hand | {"retreat":117,"death":383,"abandon":0} | 19.59 | 0.00 | 41.94 | 0.00 | 1.82 | 117
| workshop-complete | B20 | medium-shallow-rune | {"retreat":125,"death":375,"abandon":0} | 20.20 | 0.00 | 41.16 | 0.00 | 1.68 | 125
| workshop-complete | B20 | medium-multi-rune | {"retreat":132,"death":368,"abandon":0} | 19.00 | 0.00 | 40.77 | 0.00 | 1.90 | 132
| workshop-complete | B20 | exploration-support | {"retreat":134,"death":366,"abandon":0} | 21.09 | 0.00 | 42.79 | 0.00 | 1.70 | 134
| workshop-complete | B20 | main-core-conversion | {"retreat":120,"death":380,"abandon":0} | 18.48 | 0.00 | 40.69 | 0.00 | 1.84 | 120

## Decision

- Numeric balance change: **none**.
- Additional observation: object-loot lifecycle telemetry is required before treating Rune/Core/Support loot adoption as production-backed; Portal unconfirmed-loot salvage value is not modeled by the canonical simulator.
- Balance Issue candidates: none from this observation pass.

## Modeling boundary

Rune/Core/Support object-loot ownership and unconfirmed Portal loot are explicitly `not_modeled`; equipment-affix exposure/adoption/firing fields are retained as observed proxies and must not be read as production object-loot telemetry.
