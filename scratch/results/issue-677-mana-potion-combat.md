# Issue #677 戦闘中の魔力草使用モデル

## 結論

戦闘中の魔力草を sim の行動選択へ組み込んだ。通常の `policy=powder` / `scenario=workshop-empty` / `targetDepth=B20` では、N=500 run 全体で戦闘中の使用は 1 個、戦闘後の使用は 26 個だった。僧侶の戦闘中使用は 1/125 run、魔術師は 0/125 runで、現行の回復量 3 では戦闘1ターンを消費する選択はほぼ発生しない。

これは「使える経路が無い」欠陥を直した結果であり、魔力草の回復量・呪文コスト・最大MP・craftコストは変更していない。回復量の調整は別Issueの判断事項として残す。

## 測定条件と provenance

- base: `origin/main` = `256fc174d79363bcb21acda02643cd1cdeb1431d`
- 測定時の実装コミット: `05d53a3086f5bf9b683969e68c8de4ca53565244`
- seed: `231`
- 通常sim: N=500、`SIM_CALIBRATION_RUNS=100`、`SIM_PARALLEL` 未指定
- 決定性確認用 raw stdout: `/private/tmp/issue-677-direct1.raw.txt` と `direct2.raw.txt`
- raw stdout SHA-256（2回とも）: `b807c7dfa67a5f66164d1ffc88d74ff9dce53a5044ab5e8581563fc7cf9b2ec2`

受入基準線は通常simのデフォルト集約値ではなく、#666が記録した #624互換の固定環境で定義されている。そのため、`scratch/sim_commit_depth_624.js` が現行 `scratch/sim_depth_material_ev.js` の `simulateRun` を呼ぶ互換測定も実行した。互換測定は B21、#612の6工房分布、出発クラフト、run単位乱数分離を使用した。

- 互換測定 rows SHA-256（2回とも）: `5f24e0b281d986e1363c87a18942f9d0ac663864b82f1bac9025336f2883af5c`
- 互換 harness の raw 全体は wall/cpu 秒を含むため、raw SHA-256は実行ごとに異なる。rows SHAを決定性の判定に使った。

## 到達階平均（#666基準線互換、B21）

| 職 | 変更前基準線 | 変更後 | 差分 |
| --- | ---: | ---: | ---: |
| Fighter | 5.8720 | 5.8720 | 0.0000 |
| Thief | 4.8980 | 4.8980 | 0.0000 |
| Priest | 4.5760 | 4.5980 | +0.0220 |
| Mage | 6.4800 | 6.4800 | 0.0000 |

戦士・盗賊は完全一致した。呪文を持つ僧侶だけが動き、魔術師はこのseed・条件では同値だった。旧値へ寄せる補正は行っていない。

通常simのMP比較は、誤読防止のため `policy=powder scenario=workshop-empty targetDepth=B20` の行を明示的に選んだ。

## 魔力草の入手・消費

上記の通常sim B20 `workshop-empty` での職業別平均（N=125、runあたり）。括弧内は戦闘中 / 戦闘後の使用数で、source内訳の合計を3桁で示す。

| 職 | 入手 | 消費 | 使用（戦闘中 / 戦闘後） | N=125の個数 |
| --- | ---: | ---: | ---: | ---: |
| Fighter | 0.168 | 0.000 | 0.000 / 0.000 | 21 / 0 |
| Thief | 0.216 | 0.000 | 0.000 / 0.000 | 27 / 0 |
| Priest | 0.344 | 0.200 | 0.008 / 0.192 | 43 / 25 |
| Mage | 0.368 | 0.016 | 0.000 / 0.016 | 46 / 2 |
| 全体 | 0.274 | 0.054 | 0.002 / 0.052 | 137 / 27 |

全体の27個の消費は、戦闘中1個、戦闘後26個。既存の出力行でも `魔力草入手/消費=0.27/0.05 (戦闘中/戦闘後=0.00/0.05)` と出力される（表示は2桁丸め）。

## mpBlocked の変化

比較元は #663 の同じ通常sim B20 `workshop-empty` 表。`blocked combats / blocked events` の後ろに、行動種類別とコスト別のイベント数を示す。

| 職 | 変更前 | 変更後 | 変更後のコスト内訳 |
| --- | --- | --- | --- |
| Fighter | 0 / 0 | 0 / 0 | なし |
| Thief | 0 / 0 | 0 / 0 | なし |
| Priest | 60 / 204（回復106、攻撃98） | 60 / 202（回復106、攻撃96） | cost1=96、cost3=106 |
| Mage | 51 / 178（攻撃121、補助57） | 51 / 178（攻撃121、補助57） | cost1=29、2=14、3=111、4=22、6=2 |

Priestの戦闘間回復は、変更前の `camp=17 / 魔力草=75 MP` から、変更後は `camp=17 / 戦闘後魔力草=72 MP / 戦闘中魔力草=3 MP` になった。Mageは `camp=73 / 戦闘後魔力草=6 MP / 戦闘中=0 MP` で変化しない。`combatManaPotion=3` は回復MP量であり、回復量3の魔力草1個に相当する。

## 深度別の戦闘開始時MP

中央値。`開始 / 最低` を変更前 → 変更後で示す。サンプル数も新測定値を併記した。

| 職 | B1 | B5 | B10 | B15 |
| --- | --- | --- | --- | --- |
| Priest | 13 / 12 → 13 / 12（n=317） | 1 / 0 → 1 / 0（n=25） | 0 / 0 → 0 / 0（n=2） | 観測なし |
| Mage | 12 / 12 → 12 / 12（n=383） | 10 / 7 → 10 / 7（n=36） | 1 / 0 → 1 / 0（n=23） | 0 / 0 → 0 / 0（n=9） |

開始MPの深度低下は残る。今回の変更は戦闘中の1ターン消費を追加したが、既存の開始MP分布を階段状の固定閾値で書き換えていない。

## 使用ポリシーと判断

戦闘中は固定MP閾値を追加しなかった。次の条件をすべて満たすときだけ、魔力草を1ターンの行動として選ぶ。

1. sourceの `getUsableInventoryItems` で、`MANA_POTION` が `usable` かつ `!campOnly` として選択可能。
2. 現在のsource選択ではMP不足のため呪文を選べない。
3. sourceの `MANA_POTION` 効果を仮適用したキャラクターなら、同じsource選択が呪文を選ぶ。
4. 選ばれる呪文について、適用前のsource `getSpellPayment` がMP不足を返す。

この条件は、回復量3の式をsim側へ再実装せず、sourceの選択とitem effectを使った「魔力草を使わなければ次の呪文が選べない」という局所的なEV判定にしている。実際の使用時は `runCombatRoundCalculation` → sourceのitem resolutionを通り、source側で効果適用・インベントリ消費を行う。戦闘後の既存閾値 `MP<=最大MP×0.55` は変更していない。

結果として戦闘中使用は1/500 run（Priest）に留まった。現行回復量3で戦闘1ターンを払う価値は、広い状況では確認できず、魔力草の回復量自体が次の論点になり得る。ただし本Issueでは値を変更しない。

## 検証

- `node --check scratch/sim_depth_material_ev.js`: PASS
- N=1試走（最終base上）: PASS
- `npm run lint`: PASS
- `npm run test:unit`: PASS（85 pass / 3 skip）
- 通常sim N=500を同一条件で2回: PASS（raw stdout SHA一致）
- #666基準線互換 rowsを同一条件で2回: PASS（rows SHA一致）
- `git diff --check`: PASS
