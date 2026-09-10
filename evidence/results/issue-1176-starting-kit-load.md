# Issue #1176 starting kit equipment-load evidence

## Question and scope

確認したい問いは、開始画面で production 装備から導出した「行動傾向」を選べるか、また軽装が標準と異なる Cost の払い方を実際に持つか、である。測定 scope は `run`。

- Source: `51e3b2f8f7a11c1a9e7badbd71c3de02a81b7253`
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

| Kit | B1F death | B2 arrival | Mean steps | Mean combats | Mean rounds | Trap damage HP | Poison applications | Selected | Executed | Preempted | Survived | Parting death | Execution survival |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 鋼の前線 (`vanguard`) | 82.7% | 17.3% | 38.030 | 1.970 | 5.059 | 9773 | 452 | 559 | 516 | 43 | 484 | 32 | 93.80% |
| 軽装探索 (`scout`) | 89.7% | 10.3% | 26.375 | 1.526 | 5.444 | 7386 | 349 | 419 | 394 | 25 | 371 | 23 | 94.16% |
| 祈り (`devotion`) | 88.6% | 11.4% | 28.495 | 1.619 | 4.378 | 7986 | 375 | 448 | 405 | 43 | 364 | 41 | 89.88% |
| 術式 (`arcana`) | 90.2% | 9.8% | 25.345 | 1.488 | 3.519 | 7033 | 335 | 411 | 368 | 43 | 322 | 46 | 87.50% |

The B1F flee rows use the same 1000-run population as the fight rows. The
funnel counts are encounter-level observations; B1F death, B2 arrival, steps,
trap, poison, and rounds are run-level outcomes for the same policy.

## Fixed #1151 representative-pair results

At entry HP 100% under the fight policy, averaging the six fixed compositions:

| Kit | Derived load | Mean clear | Player action before any enemy |
| --- | --- | ---: | ---: |
| 鋼の前線 (`vanguard`) | standard / 標準 | 51.62% | 33.10% |
| 軽装探索 (`scout`) | light / 速い | 0.43% | 43.10% |
| 祈り (`devotion`) | standard / 標準 | 9.77% | 33.10% |
| 術式 (`arcana`) | standard / 標準 | 35.83% | unobserved for fight action |

For the fixed #1151 immediate-flee policy at HP 100%, six compositions ×
N=1000 per kit produced the following run-level funnel. The fixed path has no
preemption because the first selectable action is always the immediate flee;
arcana's 55 deaths are parting attacks after execution.

| Kit | Selected | Executed | Preempted | Survived | Parting death | Selection-to-survival |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 鋼の前線 (`vanguard`) | 6000 | 6000 | 0 | 6000 | 0 | 100.00% |
| 軽装探索 (`scout`) | 6000 | 6000 | 0 | 6000 | 0 | 100.00% |
| 祈り (`devotion`) | 6000 | 6000 | 0 | 6000 | 0 | 100.00% |
| 術式 (`arcana`) | 6000 | 6000 | 0 | 5945 | 55 | 99.08% |

The light kit has a materially higher first-action-before-enemy rate than the standard kit, while its production dagger/buckler/cloak stats do not make it a universal combat upgrade. This is diagnostic evidence only; no weapon, shield, armor, or initiative values were tuned.

## Interpretation and decision

**Phase 1 — adopt the implementation, keep #1176 open.** The card and production calculation agree: `scout` resolves to `light`, all other current kits resolve to `standard`, and the UI describes only the load-guaranteed action-order difference as `速い` / `標準`. The measured first-action difference is visible, while the light kit is not simply safer or stronger.

Heavy starting gear remains intentionally uncommitted pending #1173. Prayer and arcana kits remain as horizontal verb entry points; their actual current load is shown as standard.

The fixed result suggests a future balance investigation for the light kit's combat power. Heavy-kit selection and the final A/B/C/D decision remain pending #1173; this phase does not tune production stats or equalize win rates.
