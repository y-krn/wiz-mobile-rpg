# Issue #654: trap affix merge

## Reproduction

- Base: `origin/main` at `624818ca4f92c1da718bc97f1f20f3845e807805`
- Paired measurement: `SIM_SEED=231 node scratch/measure_issue_654_trap_affix_merge.js`
- Paired measurement parameters: N=500, calibration=100, `workshop-complete`, target depth B20; `SIM_PARALLEL` omitted.
- Before JSON SHA-256: `d4487dfd21fac575cabdcc4e599eed7d93d4b47d25c1f37b17e4cfb1da32f271`
- After JSON SHA-256: `f6fd5cdd943d51bcc75d329c73f7c9cfa3ef08decbf172687fbf9e843b1da7e4`
- Official depth sim command: `SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-complete node scratch/simulations/sim_depth_material_ev.js`
- Official before output SHA-256: `b6bf161e3561b72dad217505054dbb93f46be37c6e85c8af8ef0c5d8dc3eba65`
- Official after output SHA-256: `9f50a464eaeb632020f031985fdaa192872f7e5321d0568ec9418f6452478902`

## Decisions

刻印は (a) の1本化を採用し、`罠印`（`trap` → `trapBonus`、value 10、matCost 2）を残して、`解印`（`trap_sense` → `trapSense`、value 15、matCost 3）を廃止した。両者の value/matCost 比は同じ5だが、スロット上限下では解印の15が罠印の10を厳密に支配する。実プレイの刻印所持率・使用率は測定できなかった。`executeTagInscription` に実行時の呼び出し元がなく、実運用データも存在しないためである。既存の毒腺→罠印ルートを残し、供給を増やさない決定にした。

生成は旧経路を同じ `trapBonus` IDへ合流した。通常装備は weight 2 の 10/15/20（B1-2/B3-4/B5+）と weight 1 の 5/10/15（B1-2/B3-4/B5+）、アクセサリは weight 2 の 10/15（B1-3/B4+）と weight 1 の 5/10/15（B1-2/B3-4/B5+）を維持した。追加の抽選は行わず、同じ ID の重複は既存の `rollAffixes` の選択済みID制約で1アイテム1個にした。

## Paired distribution

供給は装備発見数 5,224 件で一致した。統合前は `trapBonus` 91件（10:80、15:10、20:1）+ `trapSense` 35件（5:31、15:4）、統合後は `trapBonus` 126件（5:31、10:80、15:14、20:1）となった。旧2型の合算値から変化はない。

罠解除率の分布は、同じ seed の同じ run を対にして B5到達時 118件、終了時 500件で比較した。統合前後の counts は完全一致した。

| 観測点 | 解除率 counts（%: run数） | 統合前後の変化 |
| --- | --- | --- |
| B5到達時（N=118） | 33:12, 34:55, 35:2, 39:3, 44:1, 89:3, 90:42 | なし |
| 終了時（N=500） | 33:263, 34:76, 35:9, 36:5, 37:2, 38:3, 40:1, 41:1, 42:1, 43:11, 44:3, 88:33, 89:25, 90:67 | なし |

B5到達時の実装由来 trap affix 所持率は 6/118 = 5.08%、終了時は 23/500 = 4.60%で、これも統合前後で不変だった。公式深度 sim の統合後 run も完走した。

## Save and canon impact

セーブ移行は実装していない。旧セーブの `trapSense` 装備affix・刻印は新しい `getCharTrapBonus` の集計対象外となるため、旧セーブをロードした場合は罠解除効果が無音で失われる。この方針はプレイヤー1人・`SAVE_VERSION` 更新不要という Issue の決定に従う。

罠・affix・刻印の正本として `.agents/game-design.md`、`.agents/game-design-core-loop.md`、`.agents/game-design-equipment-builds.md` を更新した。罠解除率の式、`trapGuard`、#353 の cap 飽和は変更していない。
