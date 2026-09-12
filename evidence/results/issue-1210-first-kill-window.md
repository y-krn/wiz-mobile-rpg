# Issue #1210 fresh B1F first-kill / kill-window evidence

## Question and scope

fresh save + `vanguard`（鋼の前線）の B1F ordinal 1/2 について、#1205 で
action-count dominant と確定した enemy action Cost を、次の境界へ分解した。

- actor exposure（pair の2 actorが存在することによる通常行動）
- first-kill 前の enemy actions / player actions / rounds
- first-kill 後の enemy action tail
- living enemy count transition
- extra action source（`multiAction` 等）と owner identity
- initiative / first-player-action insertion

既存の production-backed `runDiagnostic` と `runFixedCombatDiagnostic` を再利用し、
独立 combat model、架空 enemy、production numeric tuning は行っていない。

## Provenance and validity

- base / fresh `origin/main`: `b9fa39e72fa67cf22aafe84b00abc883bfccb836`
  （開始時に `git fetch origin main` で確認）
- measurement source / HEAD: `3aec4abfcb81dddc0c28b53632fa070b3ea27c55`
- runner: `issue1210-first-kill-window-v1`, schema 1
- natural: N=1000、seed=1205、world seed `issue-1176:{seed}:{runIndex}`
- fixed connection: HP 100% / 50%、N=1000、seed=1151、world seed
  `issue-1151:{seed}:{hpBandId}:{compositionId}:{runIndex}`
- scope: `run`; `originMainAncestor=true`; `staleTreeAllowed=false`;
  `workingTreeClean=true`
- environment hash: `df803b95e4a1b943`
- measurement runner diff SHA-256:
  `db879b2101c6d12326413a5035eca0546499482d63bb9fdb9a61a825260f2af8`
- raw JSON / manifest: `/private/tmp/issue-1210-final2/`（commit しない）

同一 seed/config の smoke は deep-equal で再現した。最終 measurement は clean tree
で実行した。#1205 の action-count vs damage/action 判定は再診断せず、
`evidence/results/issue-1205-enemy-action-cost.md` の production event aggregate を
total enemy-action 比較の source として再利用した。

Player policy は production-auto fight、fresh save、Workshop ranksなし、departure
consumable / craftなし。manual comprehension、qualitative next-trial hypothesis、
fixed combat の map traversal / encounter frequency は omitted である。

## Natural first-kill decomposition

first-kill 前後の値は first kill が観測できた rows に条件付ける。`noFirstKill` は
death / resolution 前の survivor/death truncation を含むため、zero ではなく別に報告する。
first-kill action ordinal は round 内の production turn order（0-based）である。

| ordinal | group | encounters / deaths | first kill observed | kill round p50 | action ordinal p50 | actor | enemy actions before / after p50 | player actions before / after p50 | noFirstKill |
| ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 1 | single | 625 / 94 | 83.68% | 3 | 0 | 冒険者 | 2 / 0 | 3 / 0 | 102 |
| 1 | pair | 300 / 174 | 78.33% | 2 | 1 | 冒険者 | 4 / 3 | 2 / 3 | 65 |
| 2 | single | 380 / 148 | 61.84% | 2 | 0 | 冒険者 | 2 / 0 | 2 / 0 | 145 |
| 2 | pair | 134 / 117 | 46.27% | 2 | 1 | 冒険者 | 3.5 / 2 | 2 / 2 | 72 |

Ordinal 1 total enemy actions は #1205 event aggregate と同じく single p50=`2`,
pair p50=`7`、比率 `3.50x`。first kill までの player actions は pair p50=`2`
対 single p50=`3`（`0.67x`）で、pair の superlinear Cost は player kill-window の
延長では説明できない。pair の post-first-kill enemy tail は p50=`3` actions である。

### Living count and source observations

- ordinal 1 pair の production transition: `2→1` が 235 rows、`1→0` が 146 rows。
- ordinal 2 pair の production transition: `2→1` が 62 rows、`1→0` が 25 rows。
- ordinal 1 pair の first-kill actor は全観測 rows で `冒険者`。
- extra `multiAction` source / owner は primary natural ordinal 1/2 で観測されなかった。
  これは「観測なし」であり、mechanism が存在しない証明ではない。
- ordinal 1 pair の enemy actions before first player action は p50=`1`。
  player の action opportunity 自体が欠落する ordering が primary ではない。
- pair composition identity は各 row の production `initialCompositionKey` として保持し、
  single/pair の母集団を混同していない。

## Fixed HP connection

固定 combat は production enemy definitions / scaling / resolver を通した補助接続であり、
pair internal decomposition の主証拠ではない。HP 100% / 50% で composition identity、
clear、first-kill 観測率、death truncation を保持した。

| HP | composition | clear | first kill observed | deaths without first kill |
| ---: | --- | ---: | ---: | ---: |
| 100% | high-kobold-scout-rusted-shield | 23.50% | 84.40% | 156 |
| 100% | high-kobold-scout-mad-slime | 0.90% | 90.80% | 92 |
| 100% | high-mad-slime-mud-curse-child | 1.10% | 100.00% | 0 |
| 100% | low-swarm-rat-rusted-shield | 98.30% | 99.10% | 9 |
| 100% | low-biting-insect-split-slime | 96.70% | 100.00% | 0 |
| 100% | low-mud-curse-child-gunpowder-bat | 89.20% | 92.10% | 79 |
| 50% | high-kobold-scout-rusted-shield | 0.10% | 10.90% | 891 |
| 50% | high-kobold-scout-mad-slime | 0.00% | 19.00% | 810 |
| 50% | high-mad-slime-mud-curse-child | 0.00% | 73.60% | 264 |
| 50% | low-swarm-rat-rusted-shield | 26.90% | 62.30% | 377 |
| 50% | low-biting-insect-split-slime | 6.10% | 98.20% | 18 |
| 50% | low-mud-curse-child-gunpowder-bat | 8.80% | 48.20% | 518 |

Fixed HP rows make death truncation visible: low-entry HP can remove the first-kill
observation before any kill, so a small observed action count is not interpreted as a
shorter intended kill-window.

## Decision and return to #1184

- classification: **A — actor-exposure dominant**
- next production axis (one): **shared target-removal / action-economy scheduling rule**
- no global damage multiplier, enemy-wide nerf, enemy HP change, B1F pair removal,
  recovery change, composition pool/order change, initiative value change, or gear change
  is justified by this diagnostic.
- #1184 receives the decomposition and the one-axis candidate above; #1184 is not closed
  by this Issue.

This Issue is diagnostic only. Any production change requires a separate child Issue with
one reversible axis and before/after remeasurement.

## Verification

- `node --check` on changed JavaScript: pass
- `node tests/node/regression/test_fixed_combat_composition_diagnostic.js`: pass
- `node tests/node/regression/test_first_kill_window_diagnostic.js`: pass
- clean-tree N=1000 natural + fixed HP100/50 measurement: pass
- provenance, source ancestry, runner diff, and environment signature: recorded above
