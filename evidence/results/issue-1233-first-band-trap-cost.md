# Issue #1233 — first band trap Cost causal measurement

## 判定

Phase 1 は C2（B1F〜B5F の chest trap のみ無効）が retry-hypothesis 阻害に効く可能性を示した。C1 は causal upper-bound probe として強いが、production candidate にはしない。C3（floor trap のみ無効）は C0 と差が弱く、floor trap は route Cost として維持する。

採用した production candidate は **B1F の chest trap introduction を1 floor遅延**する1軸だけ。B2F以降の chest trap pool、B1F〜B5Fの floor trap、combat stats、enemy HP、shared action slot、recovery、starting gear、loot power は変更していない。C1/C2/C3 の measurement-only policy は production flag として流用していない。

## Provenance

- 実装開始時に fresh fetch して確認した `origin/main` / current main SHA: `29cfd914320e29e553d5082f3d4045744f6607e7`（2026-09-13、開始時点）。
- Phase 1 base: 同じ `29cfd914320e29e553d5082f3d4045744f6607e7` 上。candidate 前の measurement-only worktree で実行したため、raw provenance は dirty-tree opt-in（`SIM_SKIP_PROVENANCE=1`）。
- Phase 2 measurement source SHA: `b84725875d488f8df4a258b64078aec319c67114`（fresh な `origin/main` `e969fe29ef19338cf8aa04cfaef4d3b58c71e633` に rebase 後）。
- Phase 2 runner: `scratch/measurements/first_band_trap_diagnostic.js` / `first-band-trap-diagnostic-v1` / schema 1。
- measurement source: canonical `simulateRun` (`scratch/simulations/sim_depth_material_ev.js`) + reusable `starting_kit_diagnostic`。独立 gameplay model は作っていない。
- conditions: seed `1233`, `worldSeed=getDiagnosticWorldSeed(seed, runIndex)`, N=1000/condition, targetDepth=6（B1F〜B5F band）、fresh vanguard、Workshop ranks `{}`、持込回復なし、departure craftなし、B1F開始、fight policy。
- Phase 2 environment hash: `79f4f38a3efa2922` / Node `v26.8.2`。
- final measurement tree cleanliness: clean before Phase 2 run; browser artifactsは `/private/tmp/issue1233-playwright-artifacts` に退避。

## Phase 1 — candidate 前（同一 seed/world）

| condition | death / outcomes | E1→E2 | E2→E3 | combat damage avg HP | floor damage / MP avg | chest damage avg HP | meaningful loot / equipment | Build change |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C0 current | 1000 / 1000 death | .616 | .430 | 13.849 | .677 / .013 | 8.838 | .953 / .912 | .461 |
| C1 no floor + chest | 991 death, 9 retreat | .946 | .835 | 33.979 | 0 / 0 | 0 | .957 / .957 | .675 |
| C2 no chest | 994 death, 6 retreat | .934 | .808 | 30.652 | 2.346 / .115 | 0 | .960 / .960 | .641 |
| C3 no floor | 1000 death | .621 | .416 | 14.193 | 0 / 0 | 9.124 | .954 / .912 | .472 |

補助値として C0 の death floor は B1/B2/B3/B4 = `886/109/4/1`、C2 は `480/315/127/40/32`。到達率は target ではなく補助値であり、tuning はしていない。

Cost 内訳も因果の分解に使った。C0 の death前 HP source は combat `13,849`、floor trap `677`、chest trap `8,838`、poison `1,009`（floor MP drain `13`）だった。C2 は combat `30,247`、floor trap `2,314`（MP `105`）、chest `0`。C3 は combat `14,193`、chest `9,124`、poison `1,147`。fight policy のため simulation 上の flee follow-up は全条件 `0`; player-facing manual run では別途 `2 HP` を観測した。

同一 runIndex の paired observation（Phase 1 C0 vs C2）でも、E1→E2 は C2-only `426` 対 C0-only `20`、E2→E3 は `203` 対 `3`、Build change は `225` 対 `45`。C2 は単なる death-rate fitting ではなく、Combat → Loot → Build の前段到達を増やす方向だった。C3 は C0 と同水準で、floor trap 単独除去を候補にする根拠はない。

## Phase 2 — candidate 後

| condition | death / outcomes | death floors | E1→E2 | E2→E3 | combat damage avg HP | floor damage / MP avg | chest damage avg HP | poison / blind / teleport | meaningful loot (step / combat ordinal) | equipment (step / ordinal) | Build (step / ordinal) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| C0 candidate | 1000 death | `486/461/45/6/2` | .913 | .766 | 24.037 | 1.538 / .023 | 4.386 | 193 / 75 / 133 | .960 (4.665 / .313) | .960 (4.665 / .313) | .660 (16.005 / .779) |
| C1 upper bound | 989 death, 11 retreat | `444/326/122/22/75` | .950 | .834 | 33.835 | 0 / 0 | 0 | 0 / 0 / 0 | .957 (4.643 / .313) | .957 (4.643 / .313) | .690 (20.912 / .862) |
| C2 no chest | 998 death, 2 retreat | `486/306/131/31/44` | .933 | .807 | 30.806 | 2.475 / .086 | 0 | 0 / 0 / 0 | .960 (4.665 / .313) | .960 (4.665 / .313) | .686 (23.343 / .882) |
| C3 no floor | 999 death, 1 retreat | `444/494/49/10/2` | .935 | .776 | 25.032 | 0 / 0 | 5.185 | 256 / 83 / 180 | .957 (4.643 / .313) | .957 (4.643 / .313) | .671 (16.873 / .790) |

候補 C0 は C2 と first meaningful loot / equipment が完全一致し、E1→E2 も C2 と同じ world outcome（.913 vs .933 の集計差は B2以降の survivor）。B2以降を無条件に無害化する C2 の upper bound に近い Build opportunity `.660` を得つつ、chest risk/reward を B2F から残した。C0 の paired Phase 2 C0 vs C2 は meaningful loot/equipment の C0-only/C2-only がともに `0/0`、Build change は C0-only `5`、C2-only `31`。したがって candidate は first-band入口の阻害を解消し、後段 chest risk は残す判定とした。

floor trap は candidate C0 で `288 activations`, damage avg `1.538 HP`, MP drain avg `.023`, alarm `55`, pitfall `1`。floor trap を消していないこと、C2で floor Cost が残ることを確認した。chest trap は B1F branch のみ `none` にし、B2Fの `poison needle`、B6F以降が使う default pool は unit assertionで維持を確認した。

## B6F以降 / cliff check

同じ canonical runner の candidate C0 / targetDepth=11 / N=1000 も実行した。primary vanguard の attritionにより B6F到達は `0/1000`（reached floor `1:486, 2:461, 3:45, 4:6, 5:2`）で、B6Fの実プレイ trap activation は観測できなかった。この限界は隠さず記録する。

代わりに変更差分と production-backed rule assertionを確認した。変更は `rollChestTrap` の `floor === 1` returnだけで、B2F〜B5Fと `floor >= 6` の poolは不変。`test_chest_domain.js` は B2F と B6Fで `rng=0` が `poison needle` になることを確認する。従って first band後に全 hazardが突然解禁される実装ではなく、B2Fから既存 chest grammar が連続する。trap build / affix / TRAP_KIT の source/consumerを削除していない。

## Fresh-save manual learning gate

Playwright CLIでブラウザデータを分離した fresh vanguard runを複数実施。準備画面で毎回 `持ち込み 0/20（出発クラフト 0品）`、B1F開始、鋼の前線キットを確認した。

1. Run A: B1F combatで攻撃を選び、visible target selection（`敵対象選択` / `火薬コウモリ、HP 22/22`）を操作。逃走を選んだところ、ログに「追撃を受けながら戦闘から逃れ…」、`2` damage、HP `19→16` が表示された。fight/flee Costは player-visible。
2. Run B: B1Fで combat victory → chest → `宝箱を開ける` → `古びたメイス（未鑑定）` を `持つ` → 装備画面で `試す` → `試す内容を確定する` まで到達。Loot → Build opportunityは実際に選べた。
3. Run C: first combatを倒し、B1Fで chest lootを持って試用した後、HP `7/25` から combat damageを受け、死亡画面へ到達。画面には `死因: コボルトの斥候の攻撃`、`B1F`、失った `古びたメイス`、取得素材、未達依頼が表示された。

死亡直後の player-visible 判定:

- なぜ死んだか: HPが戦闘で削られ、最後にコボルトの斥候の攻撃で `0/25` になった。
- 次に1つ変えること: HPを戦闘継続のCostとして扱い、低HPなら次の fight を選ばず flee / defense / returnを早める、または得た武器を試用する。
- 実際に選べるか: `逃走`、`防御`、target selection、chestの `調べる / 開ける / 叩き壊す / 立ち去る`、装備の `試す` が画面上で選択可能。Run Cでは武器の試用を実行した。
- 未完了の期待: Run Cでは次の深みへの依頼と強敵依頼が未達。Run BではLootとBuildを完了できた。death後にも「単に簡単にしてほしい」ではなく、combat HP Cost、flee follow-up、loot lossのどれを変えるかを説明できる記録が残る。
- pair > single / target / fight-flee: 今回の manual seedでは単体 targetだったが、target-selection UIそのものを確認。#1216の shared ordinary action-slot / pair pressure 実装や target choiceを変更していない。flee follow-upは実ログで保持。production candidateはchest B1F rollだけなので、pair composition ordering・combat stats・action slotへの副作用はない。

## Rollback

候補変更は commit `b84725875d488f8df4a258b64078aec319c67114` の `src/rules/chest_rules.js` に限定された1 branch。rollback はその1ファイルの B1F `return "none"` を従来の B1F poolへ戻すか、PR commitをrevertする。measurement runnerと `trapMpDrain`観測は rollback判断用であり、production behaviorではない。

## Verification

必須の unit / lint / browser / browser-parallel は current HEADで実行し、結果をPR本文へ追記する。既存flakyが出た場合は原因と再実行結果をここへ追記する。PRは作成後にmergeせずレビュー待ちとする。

