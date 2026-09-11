# #1196 B1F vanguard 継続資源診断

## 結論

現行 production truth では、B1F vanguard の初回戦闘後に次戦へ持ち越せる回復資源の到達率が低い。vanguard・fight・N=1000 では、B2 入場前の回復資源機会は観測 492 run 中 17 run (3.46%)、B3 入場前は 173 run 中 9 run (5.20%) に留まり、観測された回復資源は全て `HEAL_POTION` だった。

一方、既存の recovery policy を「HP 70% 未満なら早期使用」に変えても結果はほぼ変わらない。したがって、この範囲での主因は使用タイミングではなく、B1F 内の回復資源の到達頻度・取得タイミングである。これは本 Issue では調整せず、必要なら資源 cadence を検討する小さい後続 Issue に切り出す。

## 測定条件と provenance

- 対象: `vanguard`、fresh B1F、encounter 1→3、`fight` を主母集団とする
- 比較: `production` recovery policy と、既存 policy の threshold だけを `0.70` にした `early-use`
- 追加比較: `visible-multi-enemy-flee`。fight と混ぜず、逃走選択・実行・生存を別集計
- N=1000 / case、seed base `1196`
- runner: `issue1196-continuation-resource-v1`、schema 5
- source HEAD: `0ca1e25b2b1d62ff4bd773c8c080edb064be9758`
- production gameplay/base: `91838d1df5a8f2eb00799d1f196c15c1a31f4020`
- Node: `v26.8.1`、clean worktree
- 同一コマンドの再実行は JSON 完全一致 (`cmp`)

測定は observation-only の診断フックであり、production の戦闘値・報酬率・回復量は変更していない。meaningful reward/build-change opportunity も回復資源とは別フィールドで集計した。

## Production truth の確認

現行コード上の回復資源は次の通り。

- `src/data/items.js`: `HEAL_POTION` +15 HP、`GREATER_HEAL` +40 HP、`HOLY_WATER` +15 HP（毒治療付き）、`MANA_POTION` +3 MP、`ETHER` +8 MP
- `src/systems/item_effects.js`: 上記の実効果を適用
- `src/combat_logic/item_resolution.js`: 戦闘中の所持・対象・消費を解決
- `src/rules/chest_rules.js`: chest pool は階層ごとに異なり、B1 pool では `HEAL_POTION`、B2/B3 pool では上位回復・MP資源も候補になる
- `src/rules/recovery_rules.js`: fresh run の開始傷薬は 0
- 初期 inventory に回復資源は追加していない。今回の B1F 母集団で実際に記録された取得 source は `chest` のみ

## 主結果: fight / production と early-use

| 指標 | production | early-use |
|---|---:|---:|
| B1F death | 90.0% | 89.9% |
| B2 arrival | 10.0% | 10.1% |
| E2 observed | 492 | 491 |
| E2 recovery opportunity | 17 (3.46%) | 16 (3.26%) |
| E2 actual HP recovered | 173 | 149 |
| E3 observed | 173 | 173 |
| E3 recovery opportunity | 9 (5.20%) | 9 (5.20%) |
| E3 actual HP recovered | 129 | 118 |
| meaningful reward opportunity | 93.2% | 93.2% |
| build-change opportunity | 87.9% | 87.9% |

early-use は resource を生成しないため、閾値だけ変えても B2 arrival は 10.0%→10.1% にしか変わらない。今回の population では policy 差を主因とはみなせない。

## 回復資源 funnel

`acquired → usable → used` は同一 resource が対象 ordinal までに到達した run 数、`carried-unused` は対象戦闘入場時点で未使用のまま残った run 数。units は個数、actual HP recovered は実回復量。

### fight / production

| target | resource | observed | acquired / usable | used | carried-unused | units acquired / used | actual HP recovered | first acquisition step p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| E2 | HEAL_POTION | 492 | 17 | 15 | 8 | 17 / 15 | 173 | 9 / 32.4 |
| E3 | HEAL_POTION | 173 | 9 | 8 | 2 | 11 / 10 | 129 | 16 / 35.6 |
| E2/E3 | GREATER_HEAL, HOLY_WATER, MANA_POTION, ETHER | — | 0 | 0 | 0 | 0 / 0 | 0 | — |

### 自然な入場 HP band

これは target entry HP を 100/75/50/25 の固定パネルに対応する最近傍 band（境界 87.5/62.5/37.5%）へ分類したもの。開始条件を後から選び直したものではない。

| entry band | entries | recovery opportunity | rate | actual HP recovered | avg HP recovered / entry |
|---|---:|---:|---:|---:|---:|
| 100 | 28 | 5 | 17.86% | 84 | 3.00 |
| 75 | 137 | 5 | 3.65% | 38 | 0.28 |
| 50 | 198 | 7 | 3.54% | 87 | 0.44 |
| 25 | 302 | 9 | 2.98% | 93 | 0.31 |

低 HP 入場時に回復資源が厚くなる傾向は確認できない。100% band の rate は分母が小さく、資源到達 cadence の根拠として過読しない。

## encounter 1→3 の HP/MP trajectory

fight / production の linked trajectory は、次の encounter が実際に観測できた run のみを対象とする。

| transition | runs | post-combat HP p50 | next-entry HP p50 | mean exploration cost HP | mean recovery HP | mean recovery uses | post-combat MP p50 → next-entry MP p50 |
|---|---:|---:|---:|---:|---:|---:|---:|
| E1 → E2 | 492 | 14 | 10 | 3.067 | 0.352 | 0.0305 | 1 → 1 |
| E2 → E3 | 173 | 10 | 9 | 2.052 | 0.434 | 0.0462 | 1 → 1 |

HP は combat 後から次 entry までさらに低下するが、平均回復量と回復 use は小さい。MP はこの vanguard path の E1→E3 では実質変化しない。したがって、継続率の解釈は recovery resource 単独ではなく、combat damage・探索 cost・encounter composition と合わせる必要がある。

## flee 比較

`visible-multi-enemy-flee / production` は fight 母集団とは別の比較である。

| 指標 | visible-multi-enemy-flee |
|---|---:|
| B1F death | 84.6% |
| B2 arrival | 15.4% |
| E2 recovery opportunity | 20 / 610 (3.28%) |
| E3 recovery opportunity | 14 / 283 (4.95%) |
| selected flee / executed flee | 548 / 503 |
| executed flee survival | 93.24% |
| E1→E2 next-entry HP p50 | 11 |
| E2→E3 next-entry HP p50 | 9 |

逃走可能性は継続率を押し上げるが、回復資源の到達率自体は fight と同じく数%台である。逃走の効果を回復資源の効果と混同しない。

## 固定パネルとの接続

既存の [#1192 fixed composition evidence](issue-1192-early-b1f-composition.md) は、43 legal B1F regular two-monster compositions × HP 100/75/50/25 × fight/immediate-flee を固定パネルとしている。fight の固定パネルでは HP100 の p50 survival が 98.70%、HP75/50/25 は p50 100% だが、composition ごとの下側 tail は HP100/75 に残る。

今回の自然な E2 entry HP p50 は約 45% で、固定パネルの HP50/fight 帯に近い。したがって、E1→E2 の観測 trajectory を HP100 開始の結果へ読み替えず、固定パネルを「自然な entry band に対する composition 誤差・tail の診断」として併用する。今回の resource funnel はその上に重ねた production-backed な観測である。

## #1184 への結論

- **A: resource access / cadence** — 支持。B2/B3 手前の回復資源 opportunity が 3.46% / 5.20% と低く、実測された資源も `HEAL_POTION` に偏る。
- **B: policy** — 主因ではない。existing resource の使用閾値を 70% にしても B2 arrival はほぼ不変。
- **C: recovery use** — 支持は限定的。取得できた資源は実際に一部使用されるが、供給自体が稀で、平均回復量は小さい。
- **D: meaningful reward** — 回復資源とは別に測定済み。meaningful reward opportunity は fight で 93.2% あり、今回の結論を reward 欠落へ還元しない。
- **E: encounter / exploration cost** — 支持。E1→E2、E2→E3 とも combat 後から次 entry まで HP が下がり、探索 cost も観測されるため、資源 cadence だけでなく damage/cost と一体で後続検討する。

本 Issue の範囲では production balance を変更しない。次の production change が必要になった場合は、資源 cadence の候補・対象 floor・後続の受入基準を分離した child Issue として扱う。

## Limitations / reproduction

- Monte Carlo N=1000/case のため、数%台の rate は信頼区間を伴う方向性の証拠であり、精密な tuning 値ではない。
- `GREATER_HEAL`、`HOLY_WATER`、`MANA_POTION`、`ETHER` は今回の B1F E2/E3 path では 0。上位 floor の供給可否をこの結果から断定しない。
- recovery opportunity は対象 ordinal までに本診断が観測した accepted recovery item。starting inventory、意味のある reward、resource source を混ぜていない。
- natural HP band は固定パネルとの比較用の分類であり、新しい開始条件ではない。

再現コマンド（raw JSON/manifest は一時領域へ出力）:

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
  --purpose issue-1196-continuation-resource-v2 \
  --ref issue-1196
```
