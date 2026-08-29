# Issue #961 状態異常治療アイテムの役割整理

## 判定

役割ベースの3群を正本化し、新規治療薬は追加しない。現行の状態異常に
対しては `ANTIDOTE` / `HOLY_WATER` を継続ハザード、`PANACEA` を汎用
クリーン、既存の3個別薬を暫定フォールバックとして扱う。個別薬の削除や
供給変更は、今回の観測だけでは副作用を分離できないため次Issueへ送る。

バッグ上限は20のまま変更しない。

## 現行 status × cure source マトリクス

| status | player側の付与経路 | combat / exploration persistence | natural cure | spell cure | consumable cure | broad / role |
| --- | --- | --- | --- | --- | --- | --- |
| poisoned | 敵、宝箱、`poisonAtk` | combat + finite exploration window | exploration window expiry | `LATUMOFIS` | `ANTIDOTE`, `HOLY_WATER` | `PANACEA` / persistent hazard |
| blind | 敵、宝箱、罠の失敗 | combat; combat終了時に生存なら解除 | combat end | `DIURCO` | `EYE_DROPS` | `PANACEA` / targeted fallback |
| paralyzed | 敵 | combat only | 行動消費・被弾 wake | `DIALKO` | `PARALYZE_CURE` | `PANACEA` / targeted fallback |
| sleep | 敵 | combat only | 行動消費・被弾 wake | `DIALKO` | `WAKE_POWDER` | `PANACEA` / targeted fallback |
| silence | 敵の silence trait | combat only | duration expiry | なし | なし | 今回は追加しない |
| bleeding | 現行はプレイヤー武器の `bleedingAtk` が敵へ付与 | combat only | duration expiry / combat cleanup | なし | なし | 敵側状態。治療薬を追加しない |
| vulnerable | 敵へ `VULNERA` で付与 | combat only | 3ターン / combat cleanup | なし | なし | 敵側状態。#825の範囲外 |

出典は `src/data/items.js`、`src/craft.js`、
`src/data/milestone_merchant.js`、`src/rules/chest_rules.js`、
`src/rules/spell_targeting.js`、`src/systems/item_effects.js`、
`src/systems/spell_effects.js`。`HOLY_WATER` は #950 により出発クラフト
から除外済みで、効果（HP15回復 + 毒解除）は維持している。

## 役割候補の比較

| 案 | バッグ上の役割 | 供給変更 | 判断 | リスク |
| --- | --- | --- | --- | --- |
| 既存再編（採用） | 3役割へ分類。専門薬は暫定フォールバックとして監視 | なし | 既存の選択を壊さず、次の測定単位を作れる | 個別薬の冗長性は残る |
| 既存薬の統合 | `ANTIDOTE` + `HOLY_WATER` + `PANACEA` を戦略枠にする | 個別3薬の撤去・供給再編が必要 | 麻痺/睡眠は自然回復が優勢だが、標本が小さい | 非Priestの保険を失う可能性 |
| 新規汎用薬の追加 | soft debuff用の4個目の選択肢 | 新 item、供給、UI、宝箱表が必要 | 採用しない | バッグとPANACEAの役割を圧迫 |

現在の装備側には `poisonWard`（magic/rare/epic = 20/35/50%）と
`statusResistance`（12/16/20%）があり、Rangerにも poisonWard 20 がある。
これはバッグを消費しない代わりに、攻撃・防御・utility系の装備機会を
失うトレードオフである。治療薬を増やす比較では、耐性装備を無視して
「薬が足りない」と判定しない。

## canonical real-run before / after

### 条件と provenance

- runner: `scratch/simulations/sim_depth_material_ev.js`（`sim-scope: run`、`generateRunFloor` 経由）
- seed `961`、4職、`workshop-empty` / `workshop-complete`
- 各条件 N=500、calibration N=100、`SIM_PARALLEL` unset
- 出発キット: `TOWN_PORTAL + 4×HEAL_POTION + ANTIDOTE + GUARD_POTION`
- `STATUS_CURE_POLICY=ev`、`STATUS_CURE_MERCHANT_POLICY=missing`、保守的罠方針、powder鑑定
- before source: `79825faff5c1951b22cb220162dffb2d2f17178f`
- after source: `3df354514f26f7607e02633c78c3cad20f5085ec`
- before raw SHA-256: `c336bf71346d8443f0ef59fd792460e376dee1b9755054c0498d5d6a52a80105`
- after raw SHA-256: `a26ac31547e52daacbcb853ed14ddbaf00527a86270253c977de9fa51f624bed`
- 両方 clean、`origin/main` の祖先。after source は計測カウンタ追加のみ。

### ゲーム結果と供給（B20 target）

before / after の各セルは完全一致した。値は4職合計の1 runあたり。

| scenario | 到達階平均 | 生還率 | cure acquired（persistent / broad / targeted） | cure consumed（persistent / broad / targeted） | dedicated depletion |
| --- | ---: | ---: | --- | --- | ---: |
| workshop-empty | 4.126 | 55.4% | 2.044 / 0.472 / 1.064 | 1.272 / 0.276 / 0.240 | 288/500 (57.6%) |
| workshop-complete | 4.796 | 60.8% | 2.290 / 0.658 / 1.090 | 1.506 / 0.410 / 0.286 | 299/500 (59.8%) |

個別薬の取得・消費は、`PARALYZE_CURE` と `WAKE_POWDER` の消費が0、
`EYE_DROPS` の消費が empty 0.240 / complete 0.286。毒と盲目は
それぞれ 1,499/1,947 applications、876/1,040 applicationsであり、
主要な継続・行動損失のある状態だった。麻痺は11/14 applications、睡眠は
170/78 applicationsで、観測された incapacitated actions は5/12、84/61。
標本の少ない麻痺を理由に個別薬の撤去を断定しない。

### 治療 timing / held-unused / inventory occupancy

追加計装は乱数を消費せず、状態付与から判定までの combat round / exploration
step と、判定時 `inventory.length` を集計した。以下は after のB20、状態別の
判定イベント（全4職合計）の要約。

| scenario | status | decisions | selected | held-unused decisions | avg inventory at decision | full (20/20) rate | avg combat rounds / exploration steps before decision |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| empty | poisoned | 3,934 | 692 | 4 | 5.72 | 0.20% | 1.64 / 3.25 |
| empty | blind | 3,519 | 202 | 0 | 7.10 | 1.02% | 2.86 / 4.60 |
| empty | paralyzed | 5 | 0 | 5 | 18.20 | 60.00% | 1.20 / 0.00 |
| empty | sleep | 84 | 0 | 42 | 8.29 | 0.00% | 1.14 / 0.00 |
| complete | poisoned | 5,661 | 860 | 3 | 6.55 | 1.01% | 1.68 / 3.52 |
| complete | blind | 3,944 | 241 | 0 | 7.65 | 0.66% | 1.95 / 4.42 |
| complete | paralyzed | 12 | 0 | 12 | 18.17 | 41.67% | 1.00 / 0.00 |
| complete | sleep | 61 | 0 | 24 | 9.54 | 1.64% | 1.13 / 0.00 |

`held-unused decisions` は policy-deferred / incapacitated で itemを保持した
判定数、終了保持は run終了時の平均 cure inventory である。empty / complete
の終了保持はそれぞれ、

- `ANTIDOTE 0.440 / 0.442`, `HOLY_WATER 0.332 / 0.342`, `PANACEA 0.196 / 0.248`
- `EYE_DROPS 0.188 / 0.110`, `PARALYZE_CURE 0.198 / 0.242`, `WAKE_POWDER 0.438 / 0.452`

だった。新薬を追加するとこの保険在庫をさらに増やすため、現時点の
プレイヤー判断を改善する根拠にならない。

## decision

- **採用:** 3役割の静的カタログと計測項目を追加し、既存の効果・供給・20枠を維持。
- **見送り:** 状態ごとの新規治療薬、バッグ容量変更、状態異常値変更。
- **次の候補:** `EYE_DROPS` を blind の専門 fallback として評価し、
  `PARALYZE_CURE` / `WAKE_POWDER` は N>=500 の専用シナリオまたは耐性装備
  との比較後に統合可否を判断する。

## verification

- `node --check scratch/simulations/sim_depth_material_ev.js`: PASS
- before / after N=1 smoke: PASS（after は計装値を出力）
- before / after N=500 paired run: PASS、ゲーム結果・供給・消費・枯渇・unavailable一致
- after status timing / occupancy / end-held metrics: PASS
- same source path の status-cure tracking regression: PASS
- `scratch/tests/unit/test_status_treatment_roles.js`: PASS

raw output は `/private/tmp/issue-961-before.out` と
`/private/tmp/issue-961-after-ci-fix.out` に保存し、リポジトリへ追跡していない。
