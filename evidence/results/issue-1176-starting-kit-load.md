# Issue #1176 starting kit equipment-load evidence

## Question and scope

確認したい問いは、開始画面で production 装備から導出した「行動傾向」を選べるか、また軽装が標準と異なる Cost の払い方を実際に持つか、である。測定 scope は `run`。

- Source: `8d1c17fa64b519c3cf87218f7170b6cfa74c602b`
- Base: local `origin/main` `3146a2767c67cf6a4b17facf05533bab002e13cb` (remote freshness could not be verified because `git ls-remote` was blocked by DNS)
- B1F runner: `issue1176-starting-kit-load-v2`, seed `1176`, N=1000 per kit and policy
- Fixed runner: `issue1151-fixed-combat-composition-v3`, seed `1151`, N=1000 per case
- Fixed cases: the existing six #1151 compositions × four entry-HP bands × fight/immediate-flee; matched world seeds across kits
- Departure: no consumables, no departure craft, production enemy pool and production combat resolver

## Validity

- `node --check` passed for the changed application and measurement modules.
- The scout smoke run was repeated with the same seed and produced byte-identical JSON.
- The production-backed B1F runner completed for all four kits with `workingTreeClean: true`, `originMainAncestor: true`, and the source SHA above.
- The fixed-combat runner completed for all four kits with the same provenance conditions.
- Unit suite: 185 passed, 3 skipped.
- The added card checks passed at 320/360/390/430px with no horizontal overflow and tap targets at least 44px high.

## B1F production encounter results

| Kit | Derived load | B1F death | B2 arrival | Mean steps | Mean combats | Mean rounds | Trap damage HP | Poison applications |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 鋼の前線 (`vanguard`) | standard / 標準 | 88.7% | 11.3% | 28.629 | 1.657 | 5.854 | 8259 | 392 |
| 軽装探索 (`scout`) | light / 速い | 94.4% | 5.6% | 18.587 | 1.262 | 5.699 | 6022 | 295 |
| 祈り (`devotion`) | standard / 標準 | 92.7% | 7.3% | 21.475 | 1.360 | 4.695 | 6580 | 318 |
| 術式 (`arcana`) | standard / 標準 | 94.0% | 6.0% | 18.914 | 1.247 | 3.818 | 5767 | 292 |

These are diagnostic distributions, not a target win-rate recommendation. The B1F runs use the same `issue-1176:{seed}:{runIndex}` world seed for every kit; only the starting kit and its production combat consequences vary. No recovery supplies were available.

The matched flee runs use the same seed policy with `visible-multi-enemy-flee` and record flee selected, executed, preempted, survived, parting-death, trap damage, poison applications, and combat rounds in the runner output.

| Kit | Selected | Executed | Preempted | Survived | Parting death | Execution survival |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 鋼の前線 (`vanguard`) | 559 | 516 | 43 | 484 | 32 | 93.80% |
| 軽装探索 (`scout`) | 419 | 394 | 25 | 371 | 23 | 94.16% |
| 祈り (`devotion`) | 448 | 405 | 43 | 364 | 41 | 89.88% |
| 術式 (`arcana`) | 411 | 368 | 43 | 322 | 46 | 87.50% |

## Fixed #1151 representative-pair results

At entry HP 100% under the fight policy, averaging the six fixed compositions:

| Kit | Derived load | Mean clear | Player action before any enemy |
| --- | --- | ---: | ---: |
| 鋼の前線 (`vanguard`) | standard / 標準 | 51.62% | 33.10% |
| 軽装探索 (`scout`) | light / 速い | 0.43% | 43.10% |
| 祈り (`devotion`) | standard / 標準 | 9.77% | 33.10% |
| 術式 (`arcana`) | standard / 標準 | 35.83% | unobserved for fight action |

The light kit has a materially higher first-action-before-enemy rate than the standard kit, while its production dagger/buckler/cloak stats do not make it a universal combat upgrade. This is diagnostic evidence only; no weapon, shield, armor, or initiative values were tuned.

## Interpretation and decision

**Phase 1 — adopt the implementation, keep #1176 open.** The card and production calculation agree: `scout` resolves to `light`, all other current kits resolve to `standard`, and the UI describes only the load-guaranteed action-order difference as `速い` / `標準`. The measured first-action difference is visible, while the light kit is not simply safer or stronger.

Heavy starting gear remains intentionally uncommitted pending #1173. Prayer and arcana kits remain as horizontal verb entry points; their actual current load is shown as standard.

The fixed result suggests a future balance investigation for the light kit's combat power. Heavy-kit selection and the final A/B/C/D decision remain pending #1173; this phase does not tune production stats or equalize win rates.
