# Issue #934: terrain structure baseline

Date: 2026-08-28

The baseline uses `origin/main` at `f85b969` and the after case uses the Issue
#934 head. Both cases generate the same representative run seed
`ISSUE-934-BASELINE` at the first floor of each Biome. `structureMetrics` are
generated from the connected map graph; they are diagnostics and are not
player-facing trap properties.

| Biome / floor | Case | walkable | cycles | junctions | dead ends | corridor ratio | alternative path rate | open-area cells |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 崩れた坑道 / B1 | before | 252 | 11 | 32 | 15 | n/a | n/a | 19 |
| 崩れた坑道 / B1 | after | 254 | 9 | 26 | 15 | 0.516 | 0.481 | 15 |
| 忘れられた地下墓地 / B6 | before | 250 | 10 | 32 | 16 | n/a | n/a | 19 |
| 忘れられた地下墓地 / B6 | after | 253 | 14 | 36 | 16 | 0.368 | 0.635 | 21 |
| 大裂溝の巣窟 / B11 | before | 319 | 7 | 31 | 20 | n/a | n/a | 14 |
| 大裂溝の巣窟 / B11 | after | 322 | 14 | 37 | 16 | 0.444 | 0.564 | 21 |
| 水没した魔導書庫 / B16 | before | 323 | 13 | 36 | 17 | n/a | n/a | 21 |
| 水没した魔導書庫 / B16 | after | 325 | 19 | 46 | 16 | 0.409 | 0.589 | 21 |
| 竜火の鍛造殿 / B21 | before | 405 | 14 | 46 | 24 | n/a | n/a | 23 |
| 竜火の鍛造殿 / B21 | after | 405 | 17 | 45 | 22 | 0.580 | 0.413 | 27 |
| 深淵の玉座 / B26 | before | 408 | 15 | 48 | 25 | n/a | n/a | 31 |
| 深淵の玉座 / B26 | after | 409 | 22 | 56 | 22 | 0.413 | 0.584 | 33 |

`before` values are the existing main generator's topology measured with the
same graph formulas; the old main did not expose corridor or alternative-path
metrics, so those columns are `n/a`. The after case demonstrates that the
profiles produce different graph tendencies while retaining a single connected
component and the existing stairs / one-way / secret-door validation. The
representative rows are not a final balance target; broader tuning remains out
of scope for this Issue.
