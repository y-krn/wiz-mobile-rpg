# Issue #1161 装備負荷 initiative 測定結果

## 結論

「耐える / 先に動く」のトレードオフを検証できる診断を追加した。現行 production baseline では、プレイヤーの速度帯が敵より常に低いため、FirstStrike なしの2体編成でプレイヤーが敵より先に行動した試行は **0/9,000** だった。

負荷を initiative の同一ロールへ入れる counterfactual では、代表高リスク2体編成（コボルトの斥候 + 錆びた盾兵、fight、FirstStrikeなし）の先手率が軽装 **50.0% (250/500)**、標準 **38.4% (192/500)**、重装 **21.4% (107/500)** となり、負荷による順序差は可視化できた。

ただし今回の production 装備セットは防御力が軽装5、標準6、重装24と大きく異なる。同じ代表編成の clear 率は counterfactual で軽装 **0.0%**、標準 **22.8%**、重装 **99.0%** だった。従って、今回の測定はトレードオフの構造を確認するには有効だが、負荷係数や防御値をこのまま production へ採用する根拠にはならない。

## A/B/C/D 判定

| 判定 | 結果 | 根拠 |
| --- | --- | --- |
| A: 軽装ほど先に動く | 支持 | 代表2体編成で軽装50.0% > 標準38.4% > 重装21.4%。敵数別の平均先手率も1体51.7%、2体36.8%、3体28.7%。 |
| B: 重装ほど耐える | 追加測定が必要 | 今回のセットでは重装の防御力24が突出しており、clear 99.0%となった。負荷と防御の交換比率を分離できていない。 |
| C: 先手差が flee / 被ダメージへ波及 | 一部支持 | 同じ代表編成の guard clear は軽装0.0%、標準12.4%、重装96.8%。flee は全3装備で選択・実行500/500、survival 100%だったが、flee 成功率そのもののモデル化ではない。 |
| D: 既存 combat loop を壊さず観測できる | 支持 | production baseline と shared-roll-load counterfactual を同じ `runCombatRoundCalculation` で実行し、既存 unit/regression test を通過した。 |

## 測定条件

- scope: `run`
- runner: `scratch/measurements/equipment_load_initiative_diagnostic.js`
- runner version: `issue1161-equipment-load-v1`
- seed: `1161`、各比較セルに独立した決定的 RNG stream
- 1セル500試行、540セル、合計270,000試行
- 編成: single 2種、#1151 の6つの固定2体編成、triple 2種
- 行動方針: `fight` / `guard`（初手 defend） / `flee`（初手 run）
- FirstStrike: なし、production の `SWIFT_BAND` (+5)、測定専用感度条件 (+10)
- 敵: production `MONSTERS` を B1F (`depth=1`) の `scaleEnemyForDepth` で生成
- Bag 重量、クラス差、starting kit 差、マップ経路・遭遇頻度、敵 speed identity 分布、UI入力は測定対象外

production baseline は既存の `player floor(random*10)+firstStrike`、`enemy 10+floor(random*10)` をそのまま使用した。counterfactual は各 actor が `floor(random*20)` をロールし、プレイヤーへ `loadModifier + firstStrike`、敵へ0を加算した。counterfactual は `state.simPolicy.measurementInitiative` 経由の診断専用で、通常ゲームの既定値は変更しない。

## 装備プロファイル

| profile | weapon / shield / armor | load modifier | attack | defense | Guard |
| --- | --- | ---: | ---: | ---: | --- |
| light | DAGGER / BUCKLER / EXPLORER_CLOAK | +3 | 3 | 5 | light |
| standard | SHORT_SWORD / SMALL_SHIELD / LEATHER_ARMOR | 0 | 9 | 6 | light |
| heavy | MACE / KNIGHT_SHIELD / PLATE_MAIL | -3 | 7 | 24 | physical |

全プロファイルで gear 由来 FirstStrike は0。軽装・標準・重装の差は、測定上は負荷 modifier と既存装備ステータスの組み合わせである。

## 代表編成の詳細

`shared-roll-load-counterfactual`、`high-kobold-scout-rusted-shield`、`fight`。

| FirstStrike | light: 先手 / clear | standard: 先手 / clear | heavy: 先手 / clear |
| --- | --- | --- | --- |
| none | 250/500 = 50.0% / 0.0% | 192/500 = 38.4% / 22.8% | 107/500 = 21.4% / 99.0% |
| SWIFT_BAND +5 | 358/500 = 71.6% / 0.0% | 281/500 = 56.2% / 29.6% | 239/500 = 47.8% / 99.4% |
| 感度条件 +10 | 462/500 = 92.4% / 0.0% | 402/500 = 80.4% / 32.2% | 345/500 = 69.0% / 99.6% |

先手を取っても軽装の clear はこの高リスク編成では0.0%だった。これは「先に動ける」ことと「勝てる」ことを同一視できないこと、及び装備ステータス差が大きすぎることを示す。

## 再現性と provenance

- source commit: `9300137a9314d8f37680554ade7b530ed949ce25`
- gameplay source commit: `009311e4f926c53d12f5a446688ab3dd923e2f68`
- `origin/main` ancestor: `true`
- 測定開始時 working tree: clean
- environment hash: `ec439638d9533722`
- measurement runner diff SHA-256: `3e108701dc935ebb9da9bd7573c1aa38edbd33bbf6fdadfa0d0a7f462140d893`

再実行:

```sh
node scratch/measurements/equipment_load_initiative_diagnostic.js \
  --runs 500 --seed 1161 \
  --output /private/tmp/issue-1161-equipment-load.json \
  --summary /private/tmp/issue-1161-equipment-load.md
```

## 次の判断

Issue の診断目的（負荷で行動順が変わるか、既存 combat loop で比較できるか）は満たした。次の production tuning では、装備防御を固定して負荷だけを変える測定、または防御予算を揃えた light / standard / heavy セットの再測定を先に行う。そこで B を再判定し、負荷係数・FirstStrike・防御/Guard の交換比率を別Issueで決める。
