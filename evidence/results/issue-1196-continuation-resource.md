# #1196 B1F vanguard 継戦 resource 到達性診断

## 結論

現行 production truth では、fresh vanguard の前戦生存 cohort から次の encounter へ進むまでに回復 resource を取得できる run は少ない。fight / production / N=1000 では、E1 生存 651 run のうち 2戦目前の recovery-resource opportunity は 25 run (3.84%)、E2 生存 254 run のうち 3戦目前は 16 run (6.30%) だった。取得 source は今回の B1F path では `chest`、item は `HEAL_POTION` のみだった。

既存 auto-use hook の threshold だけを 70% に変更した matched probe では、B2F arrival は 10.0%→10.1% と変わらなかった。したがって今回確定できるのは「既存 auto-use threshold の変更は主因を説明しない」であり、player の探索中 item-menu 使用判断まで含めて policy 無効と断定しない。resource cadence / access は #1184 の B（継戦 resource / recovery pressure）として [child #1198](https://github.com/y-krn/wiz-mobile-rpg/issues/1198) に分離した。

本 Issue では production balance を変更しない。

## 測定条件と provenance

- 対象: `vanguard`、fresh B1F、2戦目・3戦目への継続
- runner の `targetDepth: 2` は B2F の floor outcome を測る設定であり、encounter ordinal 2/3（2戦目・3戦目）とは別軸。3階到達はこの measurement の対象外
- 主比較: `fight` / `production` と、既存 auto-use threshold のみ `0.70` にした `early-use`
- 追加比較: `visible-multi-enemy-flee`。fight と混ぜず、逃走選択・実行・生存を別集計
- N=1000 / case、seed base `1196`
- runner: `issue1196-continuation-resource-v4`、schema 8
- source HEAD: `6f1f6eec58e3ea36885430db4a96a9229db259d9`
- production gameplay/base: `91838d1df5a8f2eb00799d1f196c15c1a31f4020`
- Node: `v26.8.1`、clean worktree
- 同一 `fight / production` コマンドの再実行は JSON 完全一致 (`cmp`)
- environment hash: `8f088d601f68e38f`

測定は observation-only の診断フックであり、production の戦闘値・報酬率・回復量は変更していない。meaningful reward / Build opportunity は recovery resource と別フィールドで集計した。

## Production truth

- `src/data/items.js`: `HEAL_POTION` +15 HP、`GREATER_HEAL` +40 HP、`HOLY_WATER` +15 HP（毒治療付き）、`MANA_POTION` +3 MP、`ETHER` +8 MP
- `src/systems/item_effects.js`: 上記の実効果を適用
- `src/combat_logic/item_resolution.js`: 戦闘中の所持・対象・消費を解決
- `src/rules/chest_rules.js`: chest pool は floor ごとに異なる。B1 pool では `HEAL_POTION`、上位 floor では上位回復・MP resource も候補になる
- `src/rules/recovery_rules.js`: fresh run の開始傷薬は 0
- 初期 inventory、出発 craft、診断専用 potion 注入はない。今回の B1F population で実際に記録された resource acquisition source は `chest` のみ

## 分母とイベント境界

各 target の分母は、直前 encounter を生存した run（`eligibleRuns`）である。target encounter に到達しなかった run も run-end まで cohort に残し、`endedBeforeArrival` / `deathsBeforeArrival` として別集計した。

- 2戦目前: E1 生存 cohort。`encounterOrdinal < 2` の event を対象
- 3戦目前: E2 生存 cohort。`encounterOrdinal < 3` の event を対象
- 前後 encounter 間の trajectory は `event.encounterOrdinal === fromEncounterOrdinal` かつ `from.endStep <= event.step <= next.startStep` に限定
- したがって、同じ exploration step に発生した target encounter 後の reward / recovery は target 前や前 transition に混入しない

`acquired` は accepted reward event、`usable` は acquisition 時の effective eligibility、実際の recovery use、または target entry 時の eligibility snapshot のいずれかを満たした run、`used` は production auto-use hook が実際に使った runである。player が探索中の item menu を任意操作する judgment はこの runner では測っていない。

## 主結果: fight / production と early-use

| 指標 | production | early-use |
|---|---:|---:|
| B1F death | 90.0% | 89.9% |
| encounter-2 arrival (all runs) | 49.2% (492/1000) | 49.1% (491/1000) |
| encounter-2 arrival (E1 survivor cohort) | 75.58% (492/651) | 75.54% (491/650) |
| B2F arrival (floor outcome) | 10.0% | 10.1% |
| E1 survivor cohort | 651 | 650 |
| 2戦目前 resource opportunity | 25 / 651 (3.84%) | 24 / 650 (3.69%) |
| E2 survivor cohort | 254 | 252 |
| 3戦目前 resource opportunity | 16 / 254 (6.30%) | 14 / 252 (5.56%) |
| meaningful reward opportunity | 93.2% | 93.2% |
| Build opportunity | 87.9% | 87.9% |

early-use は resource を生成しない。今回の差は既存 auto-use hook の threshold probe の範囲であり、探索中 player usage policy の結論ではない。

## Recovery resource funnel

### fight / production

| target | cohort / arrived | resource | acquired | usable | beneficial | used | carried-unused | units acquired / used | actual HP recovered | first acquisition step p50 / p95 |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2戦目前 | 651 / 492 | HEAL_POTION | 25 | 24 | 24 | 13 | 8 | 25 / 13 | 161 | 10 / 31.8 |
| 3戦目前 | 254 / 173 | HEAL_POTION | 16 | 16 | 16 | 15 | 2 | 18 / 15 | 183 | 11.5 / 33.5 |
| 2/3戦目前 | GREATER_HEAL, HOLY_WATER, MANA_POTION, ETHER | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 0 | — |

`usable` は production UI の player-usable eligibility、`beneficial` はその時点で HP/MP 回復または状態異常治療の効果がある eligibility、`used` は実際の auto-use である。`HOLY_WATER` は full HP / non-poison でも production UI 上は使用可能だが、beneficial ではない。今回の actual use は production auto-use hook の観測であり、player menu use の上限ではない。

`carried-unused` は target encounter entry 時点の inventory snapshot（`inventoryCount`）そのものを記録する。row/aggregateとも usable / beneficial では条件付けず、aggregateは target entry inventory が1個以上のrow数を数える。取得後に一部を使用した場合でも、target entryに残った所持数を二重に差し引かない。

### Cohort dropout

| transition | eligible survivor cohort | arrived | ended before arrival | deaths before arrival | arrival rate |
|---|---:|---:|---:|---:|---:|
| E1 → E2 | 651 | 492 | 159 | 114 | 75.58% |
| E2 → E3 | 254 | 173 | 81 | 54 | 68.11% |

到達者だけを分母にした旧集計では、この dropout を落としていた。今回の resource opportunity の主 rate は survivor cohort 分母で、到達者条件付き rate は補助値としてのみ扱う。

### 自然な entry HP band

target entry HP を 100/75/50/25 の固定 panel に対応する最近傍 band（境界 87.5/62.5/37.5%）へ分類した。開始条件を後から選び直したものではない。

| entry band | entries | recovery opportunity | rate | actual HP recovered | avg HP recovered / entry |
|---|---:|---:|---:|---:|---:|
| 100 | 28 | 5 | 17.86% | 54 | 1.929 |
| 75 | 137 | 5 | 3.65% | 38 | 0.277 |
| 50 | 198 | 7 | 3.54% | 77 | 0.389 |
| 25 | 302 | 9 | 2.98% | 53 | 0.175 |

低 HP entry で recovery resource が厚くなる傾向は確認できない。100% band は分母が小さいため、cadence の根拠として過読しない。

## 2戦目・3戦目の HP/MP trajectory

trajectory の分布値は target encounter 到達者に限るが、cohort dropout は上表で別に保持する。

| transition | rows | post-combat HP p50 | next-entry HP p50 | mean exploration cost HP | mean recovery HP | mean recovery uses | MP p50 |
|---|---:|---:|---:|---:|---:|---:|---:|
| E1 → E2 | 492 | 14 | 10 | 3.189 | 0.232 | 0.0183 | 1 → 1 |
| E2 → E3 | 173 | 10 | 9 | 2.121 | 0.312 | 0.0231 | 1 → 1 |

combat 後から次 entry まで HP はさらに下がり、平均 recovery は小さい。MP はこの vanguard path では実質変化しない。継続率は recovery resource 単独ではなく、combat damage・探索 cost・encounter composition と合わせて読む。

## flee 比較

`visible-multi-enemy-flee / production` は fight 母集団とは別である。

| 指標 | visible-multi-enemy-flee |
|---|---:|
| B1F death | 84.6% |
| B2F arrival (floor outcome) | 15.4% |
| E1 survivor cohort | 798 |
| 2戦目前 resource opportunity | 27 / 798 (3.38%) |
| E2 survivor cohort | 425 |
| 3戦目前 resource opportunity | 24 / 425 (5.65%) |
| selected flee / executed flee | 548 / 503 |
| executed flee survival | 93.24% |
| E1→E2 next-entry HP p50 | 11 |
| E2→E3 next-entry HP p50 | 9 |

逃走は継続率を押し上げるが、resource access は fight と同様に数%台である。逃走の効果を resource の効果と混同しない。

## 固定 panel との接続

既存の [#1192 fixed composition evidence](issue-1192-early-b1f-composition.md) は、43 legal B1F regular two-monster compositions × HP 100/75/50/25 × fight/immediate-flee の固定 panel である。fight の **death p50** は HP100=40.70%、HP75=77.90%、HP50=98.70%、HP25=100.00%。従って survival p50 は概ね 59.30% / 22.10% / 1.30% / 0% であり、前版 evidence の survival 表記は誤りだった。

自然な E2 entry HP p50 は約 45%で、fixed HP50/fight の death p50 98.70%、41/43 pair が death rate 50%以上という broad risk surface に近い。これは「HP50なら安全」という意味ではなく、entry HP carryover が composition risk surface と重なるという意味である。

## #1184 taxonomy への戻し

- **A: 初期 encounter Cost / cadence** — E1→E2、E2→E3 とも exploration cost が残り、flee 比較では継続率が改善する。encounter cadence は A-side の別候補であり、#1198 の対象ではない。この Issue では A単独の因果量を確定しない。
- **B: 継戦 resource / recovery pressure** — 支持。E1/E2 survivor cohort を分母にしても resource opportunity は 3.84% / 6.30%で、取得 item は `HEAL_POTION` に偏る。resource cadence/access の後続は [#1198](https://github.com/y-krn/wiz-mobile-rpg/issues/1198) に分離した。今回の中心結論。
- **C: meaningful Loot / Build opportunity** — 回復 resource と別測定。fight の meaningful reward 93.2%、Build opportunity 87.9%で、今回の結果を reward 欠落へ還元しない。
- **D: Loot / Build を開始 Build の変更判断へつなぐ価値** — この測定は判断を自動仮定していないため未測定。#1196 の範囲では結論を追加しない。
- **E: fight/flee と Cost judgment** — flee policy は別母集団で測定し、executed flee survival 93.24%を記録した。resource 結論へ混ぜず、既存の fight/flee judgment を維持する。
- **F: 数値上の機会を「次に何を変えるか」へつなぐ体験** — simulation では判定しない。production candidate 後の fresh-save manual playtest gate に戻す。

本 Issue は measurement と原因分離で完了とし、production balance は変更しない。resource cadence candidate は child #1198、親 #1184 は candidate 実装・再計測・manual gate まで open のままとする。

## Limitations / reproduction

- Monte Carlo N=1000/case。数%台の rate は方向性の証拠であり、精密な tuning 値ではない。
- `GREATER_HEAL`、`HOLY_WATER`、`MANA_POTION`、`ETHER` は今回の B1F 2/3戦目前 path では acquisition 0。runnerの `targetDepth: 2` により、3階到達や上位 floor の供給可否は未測定。
- auto-use threshold probe は player の探索中 item-menu usage judgment を表さない。その結論は「既存 auto-use hook の threshold では説明できない」までに限定する。
- natural HP band は fixed panel 比較用の分類であり、新しい開始条件ではない。
- raw JSON / manifest は commit せず、一時領域へ保存した。

再現コマンド:

```sh
node scratch/measurements/starting_kit_diagnostic.js \
  --starting-kit vanguard \
  --policy fight \
  --recovery-policy production \
  --runs 1000 \
  --seed 1196 \
  --output /tmp/issue-1196-fight-production.json \
  --summary /tmp/issue-1196-fight-production.md \
  --manifest /tmp/issue-1196-fight-production.manifest.json \
  --purpose issue-1196-continuation-resource-v6 \
  --ref issue-1196
```
