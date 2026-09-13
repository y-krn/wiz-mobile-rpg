# Issue #1233 — first band trap Cost causal measurement

## 判定

Phase 1 は C2（B1F〜B5F の chest trap のみ無効）が retry-hypothesis 阻害に効く可能性を示した。C1 は causal upper-bound probe として強いが、production candidate にはしない。C3（floor trap のみ無効）は C0 と差が弱く、floor trap は route Cost として維持する。

採用した production candidate は **B1F の chest trap introduction を1 floor遅延**する1軸だけ。B2F以降の chest trap pool、B1F〜B5Fの floor trap、combat stats、enemy HP、shared action slot、recovery、starting gear、loot power は変更していない。C1/C2/C3 の measurement-only policy は production flag として流用していない。

## Provenance

- 実装開始時に fresh fetch して確認した `origin/main` / current main SHA: `29cfd914320e29e553d5082f3d4045744f6607e7`（2026-09-13、開始時点）。
- Phase 1 base: 同じ `29cfd914320e29e553d5082f3d4045744f6607e7` 上。candidate 前の measurement-only worktree で実行したため、raw provenance は dirty-tree opt-in（`SIM_SKIP_PROVENANCE=1`）。
- Phase 2 measurement source SHA: `dd731ebabdbf36d8a68fb7fd36e24bcaa04bc496`（fresh な `origin/main` `e969fe29ef19338cf8aa04cfaef4d3b58c71e633` に rebase 後、B1F RNG draw regression修正込み）。
- Phase 2 runner: `scratch/measurements/first_band_trap_diagnostic.js` / `first-band-trap-diagnostic-v1` / schema 1。
- measurement source: canonical `simulateRun` (`scratch/simulations/sim_depth_material_ev.js`) + reusable `starting_kit_diagnostic`。独立 gameplay model は作っていない。
- conditions: seed `1233`, `worldSeed=getDiagnosticWorldSeed(seed, runIndex)`, N=1000/condition, targetDepth=6（B1F〜B5F band）、fresh vanguard、Workshop ranks `{}`、持込回復なし、departure craftなし、B1F開始、fight policy。
- Phase 2 environment hash: `79f4f38a3efa2922` / Node `v26.8.2`。
- final measurement tree cleanliness: clean before Phase 2 run; browser artifactsは `/private/tmp/issue1233-playwright-artifacts` に退避。
- P1 review対応: production `rollChestTrap(1, rng)` は効果を `none` に遅延しても旧実装どおり `rng()` を1回消費する。これにより B1F chest reward / special reward / accessory / loot hint の後続streamを変更しない。C1/C2/C3のmeasurement-only disabled policyは元々trap rollを呼び出してこの1 drawを維持していたため、Phase 1は再実行していない。対象unitは「B1F rollはちょうど1 draw」を回帰固定した。

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
| C0 candidate | 1000 death | `481/474/40/4/1` | .922 | .778 | 24.058 | 1.350 / .029 | 4.067 | 200 / 90 / 138 | .960 (4.665 / .313) | .960 (4.665 / .313) | .645 (17.916 / .859) |
| C1 upper bound | 993 death, 7 retreat | `462/318/121/32/60` | .946 | .850 | 33.453 | 0 / 0 | 0 | 0 / 0 / 0 | .957 (4.643 / .313) | .957 (4.643 / .313) | .654 (22.925 / .914) |
| C2 no chest | 998 death, 2 retreat | `481/334/109/37/37` | .928 | .833 | 30.354 | 2.231 / .098 | 0 | 0 / 0 / 0 | .960 (4.665 / .313) | .960 (4.665 / .313) | .660 (21.180 / .920) |
| C3 no floor | 1000 death | `462/473/56/8/1` | .931 | .786 | 25.190 | 0 / 0 | 4.517 | 205 / 92 / 147 | .957 (4.643 / .313) | .957 (4.643 / .313) | .627 (15.595 / .804) |

候補 C0 は C2 と first meaningful loot / equipment が完全一致し、Build opportunity は C0 `.645` / C2 `.660`。B2以降を無条件に無害化する C2のupper boundに近い一方、chest risk/rewardをB2Fから残した。C0のpaired Phase 2 C0 vs C2は meaningful loot/equipment の C0-only/C2-only がともに `0/0`、Build changeは C0-only `8`、C2-only `23`。B1Fの後続loot streamをずらさず、first-band入口の阻害だけを1軸で解消し、後段chest riskを残す判定とした。

floor trap は candidate C0 で `283 activations`, damage avg `1.350 HP`, MP drain avg `.029`, alarm `60`, pitfall `0`。floor trap を消していないこと、C2で floor Cost が残ることを確認した。chest trap は B1F branch のみ `none` にし、B1Fでも旧streamの1 drawを維持する。B2Fの `poison needle`、B6F以降が使う default poolはunit assertionで維持を確認した。

## B6F以降 / cliff check

同じ canonical runner の candidate C0 / targetDepth=11 / N=1000 も実行した。primary vanguard の attritionにより B6F到達は `0/1000`（reached floor `1:486, 2:461, 3:45, 4:6, 5:2`）で、B6Fの実プレイ trap activation は観測できなかった。この限界は隠さず記録する。

代わりに変更差分と production-backed rule assertionを確認した。変更は `rollChestTrap` の `floor === 1` returnだけで、B2F〜B5Fと `floor >= 6` の poolは不変。`test_chest_domain.js` は B2F と B6Fで `rng=0` が `poison needle` になることを確認する。従って first band後に全 hazardが突然解禁される実装ではなく、B2Fから既存 chest grammar が連続する。trap build / affix / TRAP_KIT の source/consumerを削除していない。

## Fresh-save manual learning gate（P1修正後の再実施）

Playwright CLIでブラウザデータを分離した fresh vanguard runを2本実施。準備画面で毎回 `持ち込み 0/20（出発クラフト 0品）`、B1F開始、鋼の前線キットを確認した。

1. Run A: B1Fで `攻撃` → `敵対象選択`（群れネズミ HP `12/12`）を表示し、戦闘メニューへ戻って `逃走`。ログに追撃 `2` damage と「追撃を受けながら戦闘から逃れ、1マス後退した！」、HP `20→18` が表示された。
2. Run B: B1F combat victory → chest → `宝箱を開ける` → `古びたバックラー（未鑑定・小盾）` を `持つ` → `試す（探索時間が進む）` → `この内容で確定する` まで到達。Loot → Build opportunityを実際に選べた。続く pair encounterでは `泥の呪い子, マッドスライム` が表示され、「敵は連携して通常行動を1回にまとめた。」という shared action slotのログ、2体のtarget choiceを確認した。その後 `逃走` を選び、追撃 `1` damageのplayer-visible表示も確認した。
3. Run Bを継続し、死亡画面へ到達。画面には `今回の深度 B1F`、`死因: 泥の呪い子の攻撃`、失った戦果3点（試用した古びたバックラーを含む）、取得素材、未達依頼、Codexの新規記録が表示された。

死亡直後の player-visible 判定:

- なぜ死んだか: Lootを試用してBuildを進めた後もB1Fで戦闘を継続し、戦闘Costが蓄積して最後に泥の呪い子の攻撃で `0/30` になった。
- 次に1つ変えること: HPを戦闘継続のCostとして扱い、Build後でも低HPなら次の fight を選ばず flee / defense / returnを選ぶ。
- 実際に選べるか: `逃走`、`防御`、target selection、chestの `調べる / 開ける / 叩き壊す / 立ち去る`、装備の `試す` が画面上で選択可能。Run A/Bで逃走、target choice、chest choice、装備試用を実行した。
- 未完了の期待: Run BではB1F/B5F踏破依頼と強敵依頼が未達。LootとBuildは一度完了したが、次の深みへの期待は未完了のままdeathした。単に簡単にしてほしいではなく、combat HP Costとflee follow-upをどう扱うかを説明できる。
- pair > single / target / fight-flee: pair encounter、shared ordinary action slotログ、2体のtarget choice、flee follow-upを再確認した。candidateはchest B1F rollだけなので、pair composition ordering・combat stats・action slotには副作用がない。

## Rollback

候補変更は commit `b84725875d488f8df4a258b64078aec319c67114` から始まる `issue/1233-first-band-trap-cost` branchの `src/rules/chest_rules.js` に限定された1 production軸。rollback はその1ファイルの B1F `return "none"` と保持用 `rng()` を従来の B1F poolへ戻すか、PR commit群をrevertする。measurement runnerと `trapMpDrain`観測は rollback判断用であり、production behaviorではない。

## Verification

- `npm run test:unit`: pass `201/201`。
- `npm run lint`: pass（CSS/docs/skills/tests/markdown/workflow/ESLint）。
- `npm run build`: pass（Vite build; chunk-size warning only）。
- `npm run test:browser`: pass `88/88`。
- `npm run test:browser:parallel`: first attemptは fixed port `15781` collision/EPERMで preflight停止。`PLAYWRIGHT_PORT=15782` へ切り替えて再実行し `88/88` pass。これは今回変更と無関係な環境要因。
- unit initial runで simulation regression 3本が失敗したが、B1 chest candidateで古くなったfixture 2本（B2 fixtureへ更新）と aggregate attack orderingを不変とした1本（selector invariantへ更新）だった。3本を単独rerun後、current HEADで unit全体を再実行し `201/201` pass。黙って無視していない。
- P1修正後のcurrent-head unitでは `test_sim_follow_gate.js` が固定 `runIndex=7` で `progression.experience` 未到達となった。単独rerunでも再現し、今回のB1F legacy RNG draw復元によるstream変化が原因で、chest ruleのfailureではないことを確認した。同じcanonical smoke契約を満たす安定 `runIndex=1` へfixtureを更新して再実行する。元のfailureを黙って無視していない。
- PRは作成後にmergeせずレビュー待ちとする。
