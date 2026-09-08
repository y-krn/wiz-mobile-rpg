# Issue #1161 装備負荷 initiative 測定結果

## 結論

matched seed と防御固定対照を追加し、Issue本文の判定を確定した。現行 production gear の baseline では、FirstStrike なしの2体編成でプレイヤーが敵より先に行動した試行は **0/9,000** だった。

同一の production 装備（SHORT_SWORD / SMALL_SHIELD / LEATHER_ARMOR）を使い、負荷 modifier だけを +3 / 0 / -3 に変えた防御固定対照では、代表高リスク2体編成の先手率が軽負荷 **48.2% (241/500)**、標準 **33.8% (169/500)**、重負荷 **20.4% (102/500)** となった。負荷による行動順の差は、防御値差とは独立に観測できる。

具体的な負荷係数・FirstStrike値・production全装備への展開は、このIssueでは確定しない。

## Issue本文の A/B/C/D 判定

| 判定 | 結果 | 根拠 |
| --- | --- | --- |
| A: 軽装 / 重装でCostの払い方が明確に分かれる | 採用候補 | 防御固定対照で先手率が48.2% > 33.8% > 20.4%。同じ代表編成のfight clearも24.6% / 18.8% / 16.2%で、軽負荷が常勝にはならない。 |
| B: 速度差より防御差が圧倒的で、重装が常に有利 | 支持せず | production装備そのものでは重装DEF24が突出してclear99.0%となるが、防御固定対照では重負荷clear16.2%であり、重装常勝は装備ステータス差の交絡と判断する。 |
| C: 先手による1体撃破・逃走が強すぎ、軽装が常に有利 | 支持せず | 防御固定対照の軽負荷clearは24.6%に留まり、重負荷16.2%との差はあるが常勝ではない。fleeは3条件とも選択・実行500/500、生存100%で、逃走成功率をモデル化した結果ではない。 |
| D: 装備負荷を入れても判断がほぼ変わらない | 支持せず | 防御固定対照で先手率に28.0ポイント差（48.2% → 20.4%）が生じ、行動順の判断は変わる。 |

したがって、装備負荷の production 実装へ進む方向は得られたが、値の最終 tuning は別Issueで行う。

## 測定条件

- scope: `run`
- runner: `scratch/measurements/equipment_load_initiative_diagnostic.js`
- runner version: `issue1161-equipment-load-v2`
- seed: `1161`、`composition + runIndex` を共通キーとする matched deterministic RNG stream
- 1セル500試行、1,080セル、合計540,000試行
- 編成: single 2種、#1151 の6つの固定2体編成、triple 2種
- 行動方針: `fight` / `guard`（初手 defend） / `flee`（初手 run）
- FirstStrike: なし、productionの `SWIFT_BAND` (+5)、測定専用感度条件 (+10)
- 敵: production `MONSTERS` を B1F (`depth=1`) の `scaleEnemyForDepth` で生成
- Bag重量、クラス差、starting kit差、マップ経路・遭遇頻度、敵 speed identity分布、UI入力は測定対象外

production baseline は既存の `player floor(random*10)+firstStrike`、`enemy 10+floor(random*10)` を使用した。counterfactual は各 actor が `floor(random*20)` をロールし、プレイヤーへ `loadModifier + firstStrike`、敵へ0を加算した。counterfactual は `state.simPolicy.measurementInitiative` 経由の診断専用で、通常ゲームの既定値は変更しない。

## 装備プロファイル

### production gear 比較

| profile | weapon / shield / armor | load modifier | attack | defense | Guard |
| --- | --- | ---: | ---: | ---: | --- |
| light | DAGGER / BUCKLER / EXPLORER_CLOAK | +3 | 3 | 5 | light |
| standard | SHORT_SWORD / SMALL_SHIELD / LEATHER_ARMOR | 0 | 9 | 6 | light |
| heavy | MACE / KNIGHT_SHIELD / PLATE_MAIL | -3 | 7 | 24 | physical |

### 防御固定対照

| profile | weapon / shield / armor | load modifier | defense / Guard |
| --- | --- | ---: | --- |
| light-fixed-defense | SHORT_SWORD / SMALL_SHIELD / LEATHER_ARMOR | +3 | 6 / light |
| standard-fixed-defense | SHORT_SWORD / SMALL_SHIELD / LEATHER_ARMOR | 0 | 6 / light |
| heavy-fixed-defense | SHORT_SWORD / SMALL_SHIELD / LEATHER_ARMOR | -3 | 6 / light |

防御固定対照も専用stat cloneではなく production `ITEMS` を使い、同じ装備を負荷 modifier だけ変えている。全プロファイルで gear由来 FirstStrike は0。

## 代表編成の詳細

`shared-roll-load-counterfactual`、`high-kobold-scout-rusted-shield`、`fight`、FirstStrikeなし。全行は同一 composition / runIndex seed を共有する。

| profile | 先手 | clear | death | damage p50 | enemy actions p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| light（production gear） | 0.0% | 0.0% | 100.0% | 20 | 8 |
| standard（production gear） | 0.0% | 7.8% | 92.2% | 20 | 9 |
| heavy（production gear） | 0.0% | 99.0% | 1.0% | 12 | 13 |
| light-fixed-defense | 48.2% | 24.6% | 75.4% | 20 | 8 |
| standard-fixed-defense | 33.8% | 18.8% | 81.2% | 20 | 8 |
| heavy-fixed-defense | 20.4% | 16.2% | 83.8% | 20 | 8 |

防御固定対照の fight clear は、先手率の差があっても軽負荷が常勝にならないことを示す。production gear比較で重装が極端に有利になるのは、防御24・physical Guard・装備攻撃値を含む装備差の影響であり、負荷だけの結論ではない。

FirstStrikeとの相互作用も、防御固定対照で単調な常時先手にはならなかった。代表編成の先手率は、`SWIFT_BAND +5` で軽負荷70.6% / 標準56.2% / 重負荷43.0%、感度条件+10で88.2% / 78.0% / 67.4%だった。

## 実装意味論と再現性

- initiativeの比較seedは `issue-1161:<seed>:<compositionId>:<runIndex>` で、model / loadout / FirstStrike / policyをseedから除外した
- `actionObservations.executed` は実際に成立した fight / defend / run のbranchだけでtrueになる。無効なfightのfallback失敗はfalseのまま
- `hpBeforeExecution` は既存の `executed=true` と同じ地点で記録し、既存の列挙可能な観測shapeは変更しない
- raw JSONは `/private/tmp` に保存し、リポジトリには要約のみを記録した

## provenance

- source commit: `533360d2d69839527ed9fdad95f90095fde6dc56`
- gameplay source commit: `39da547bd38e0053b2f0c7988b3541384e9fa7cc`
- `origin/main` ancestor: `true`
- 測定開始時 working tree: clean
- environment hash: `4e4c19c265c0f7b5`
- measurement runner diff SHA-256: `8f167b04a1bf5a3f54afd6f68516aef30810b0199d2519dff886e2accd4c0f61`

再実行:

```sh
node scratch/measurements/equipment_load_initiative_diagnostic.js \
  --runs 500 --seed 1161 \
  --output /private/tmp/issue-1161-equipment-load.json \
  --summary /private/tmp/issue-1161-equipment-load.md
```

## 次の判断

Issueの診断目的と判定は完了した。Aを採用候補として、次のproduction実装Issueでは防御予算を保ったまま全装備へ負荷を割り当て、FirstStrikeと敵固有速度の境界を別途測定する。B/C/Dの判定を覆すような最終balance値はこのPRでは決めない。
