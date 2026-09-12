# Issue #1205 fresh B1F encounter Cost evidence

## Question and scope

fresh save + `vanguard` (`鋼の前線`) の B1F ordinal 1/2 について、致命的な
Cost を enemy action count、damage/action、specific action/trait/status、
low-entry HP interaction に分解した。既存 #1187/#1192/#1198 evidence と
#1151 fixed-combat runner を再利用し、production encounter/combat/initiative/
flee/loot/trap/poison semantics を通した。敵値、encounter pool、ordering、
recovery cadence、initiative、gear、combat modifier は変更していない。

## Provenance and validity

- base / `origin/main`: `4be73e55b1356318c0e0330fa4f7e4c014515651`（`git ls-remote` と local ref が一致）
- measurement HEAD: `0590759f593b45c30a50e7ff814a35bc42df7714`
- runner: `issue1205-early-encounter-cause-v1`, schema 5
- primary: N=1000、seed=1205、world seed `issue-1176:{seed}:{runIndex}`
- fixed reuse: HP 100/75/50/25% × 6 composition × fight/flee、各 N=1000、seed=1151、world seed `issue-1151:{seed}:{hpBandId}:{compositionId}:{runIndex}`
- scope: `run`; `originMainAncestor=true`; `staleTreeAllowed=false`; `workingTreeClean=true`
- environment hash: `80a3d62f3a8bbd96`
- measurement runner diff SHA-256: `cba5f45d64dff9e1cdf681c524cf47baec7973e8c9e43bd5eee4f7c16442d26b`
- 同一条件の report と summary を2回実行し、`cmp` で両方 byte-identical

Smoke と回帰テストは production-backed path の実行、source provenance、
determinism、observation-only instrumentation を確認する。測定の player
policy は production-auto fight、持ち込み consumable/craft なし。manual の
死因理解・次試行仮説は未測定で、固定 combat は map traversal/frequency と
loot settlement を意図的に省略した。

## Natural run: action count and damage decomposition

Baseline fight の observed ordinal rows。`enemy actions` は実行された
production monster turn、`combat damage` は enemy action に紐付く直接 HP
damage、`status damage` は round-end poison damage で、後者は combat
damage/action の分母から除外した。zero-damage trait turn は action 数に残す。

| ordinal / group | encounters / deaths | enemy actions p50 / p95 | combat damage p50 / p95 | status damage p50 / p95 | damage/action p50 / p95 | damage/damaging-action p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 / all | 925 / 268 | 4 / 11 | 8 / 21 | 0 / 4 | 1.88 / 4 | 2 / 4.18 |
| 1 / single | 625 / 94 | 2 / 9 | 5 / 16 | 0 / 4 | 2 / 4.55 | 2 / 5 |
| 1 / pair | 300 / 174 | 7 / 12.05 | 14 / 21 | 0 / 4 | 1.80 / 3.33 | 1.90 / 3.60 |
| 2 / all | 514 / 265 | 2 / 9 | 5 / 16 | 0 / 3 | 2 / 4 | 2 / 4.47 |
| 2 / single | 380 / 148 | 2 / 7 | 5 / 13 | 0 / 3 | 2 / 5 | 2 / 5 |
| 2 / pair | 134 / 117 | 4 / 11 | 9 / 19 | 0 / 2.35 | 1.80 / 3 | 2 / 4 |

Ordinal-1 pair/single action-count p50 ratio is `3.50`; damage per damaging
action ratio is `0.95`. This supports action count as the dominant pair Cost
axis, not a global per-hit damage multiplier.

## Identity, action, trait, and status sources

The measurement preserves each action event's production monster identity,
traits, tags, action names, condition observations, damage events, and lethal
flag. Baseline ordinal 1/2 reconciliation reports `11770 HP` direct
enemy-action damage and `569 HP` round-end poison damage. Representative source
totals are:

- action: 通常攻撃 `10315 HP`, `HALITO` `1160 HP`, 自爆 `295 HP`
- firing trait: `selfDestruct` `295 HP`
- status source: poison `569 HP`
- highest per-action identity average: ゴブリンの呪術師 `4.07 HP`; コボルトの斥候 `2.86 HP`; かみつき蟲 `2.42 HP`
- lethal sources are recorded by monster/action, including ゴブリンの呪術師:`HALITO` 49, マッドスライム:`通常攻撃` 114, コボルトの斥候:`通常攻撃` 87, and 火薬コウモリ:`自爆` 22

Status and trap Cost are not silently folded into combat damage: natural
baseline separately records trap damage `8083 HP` and poison applications
`378`; the flee population is a separate report (`839` deaths / `161` B2
arrivals, with 606 selected, 559 executed, 47 preempted, 35 parting-attack
deaths, 524 survived).

## Natural E2 HP connected to fixed HP bands

Natural ordinal-2 entry HP was p25/p50/p75 `24% / 43.74% / 65%`; linked
ordinal-1 survivor pair rows entered E2 at HP p50/p95 `32% / 68%`, versus
single `47.83% / 90%`. MP remained p50/p95 `100% / 100%` in the observed
entry rows. Fixed vanguard fights use the same production resolver:

| fixed HP | high-risk clear | low-risk clear | high-risk actions avg | high-risk damage/action avg | low-risk actions avg | low-risk damage/action avg |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100% | 8.50% | 94.73% | 9.87 | 2.12 | 8.05 | 1.71 |
| 75% | 0.93% | 64.40% | 7.58 | 2.16 | 7.73 | 1.73 |
| 50% | 0.03% | 13.93% | 5.35 | 2.18 | 6.28 | 1.77 |
| 25% | 0.00% | 0.23% | 3.16 | 2.18 | 3.74 | 1.81 |

The lower fixed-HP action averages are survivor-conditioned truncation, not
evidence that low HP reduces an enemy's intended action budget. Fixed rows
confirm composition/entry-resource interaction while the per-action values stay
near the same scale.

## Decision and production boundary

- 判定: **A — action count dominant**. Pair encounters pay about 3.5× the
  ordinal-1 single encounter action count at the median, while per-damaging-
  action damage is not higher (`0.95×`). Specific action/trait damage share is
  `12.36%`, so C is not dominant; the low-entry HP interaction is observed but
  not the primary classifier under the recorded threshold.
- 次に触る production axis は1つだけ: **action-economy / kill-window shared
  rule**。次 child Issue では enemy 全体 nerf、B1F 2体一律削除、free recovery、
  global damage multiplierへ進まず、どの共有 kill-window/action-economy
  rule が action 数を作るかを候補比較する。
- #1184 へは、action count が primary Cost axisであること、identity/action/
  trait/status/lethal source の証拠、natural E2 HPとの接続、fight/flee別結果を
  返却する。#1184 は close しない。

## Verification

- `node --check`（変更 JS 全件）: pass
- `node tests/node/regression/test_fixed_combat_composition_diagnostic.js`: pass
- `node tests/node/regression/test_early_encounter_cause_diagnostic.js`: pass
- clean-tree N=1000 primary + fixed N=1000/case measurement: pass
- 同一 seed/config の report/summary repeat: pass、byte-identical
- raw JSON/manifest は `/private/tmp/issue-1205-final3/` に保存し、commit しない
