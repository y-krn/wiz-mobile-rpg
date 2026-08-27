# Issue #641: depth sim の camp 床判定を src へ是正

## 修正内容

`scratch/simulations/sim_depth_material_ev.js` の `CAMP_FLOORS = new Set([2, 4])` は床番号の取り違えだった。
src の実際の判定（`src/data/biomes.js` の `theme.eventSkins.camp` が非 null なバイオームは
`forgotten_catacomb`（index1）と `sunken_library`（index3）だけで、深度1–20では床6–10・16–20に対応）
と一致していなかった。

- `src/run_map_generator.js` に `floorHasCampEvent(floor)` を切り出し export し、
  `placeCampEvent` はこの関数を呼ぶようリファクタ（挙動は不変）。
- `scratch/simulations/sim_depth_material_ev.js` は `CAMP_FLOORS` を撤去し `floorHasCampEvent` を import して使用。
  `extraCampFloors` によるポリシーオーバーライドは変更なし。
- run あたりの camp 遭遇回数を `campRestCount` / `averageCampRestCount` として集計し、
  `配線検査（延べ推定）: 野営-休息` として標準出力へ配線した。
- `scratch/tests/unit/test_heal_priority_policy.js` は camp 是正で `targetDepth: 21` の範囲に床6–10の camp が
  入り込みテストの意図（heal priority policy 差の検出）を歪めるため、`targetDepth: 5`
  （最初の camp 床より手前）へ調整した。

## 修正前後で camp 判定が true になる床

深度1–20で `floorHasCampEvent(floor)` が true になるのは `6,7,8,9,10,16,17,18,19,20`。
旧 `CAMP_FLOORS={2,4}` とは重なりがない。

## 配線確認: run あたりの camp 遭遇回数

同一 worktree・同一 env（デフォルト、`SIM_SEED=231`, `RUNS_PER_CASE=500`）で、コミット
`bc25887`（修正前, origin/main上の親コミット）と `80f833b`（修正後, このPRの先頭）を
before/after として実行した。

- 修正後（`node scratch/simulations/sim_depth_material_ev.js`、コミット `80f833b`）:
  `配線検査（延べ推定）: 野営-休息 発火回数=1428`
- 修正前のコードには `campRestCount` の計測自体が存在しないため、修正後のコードへ
  床判定だけを一時的に旧ロジック（`CAMP_FLOORS={2,4}`）へ差し戻した状態（計測配線はそのまま）で
  同一 env・同一 seed で実行し比較した:
  `配線検査（延べ推定）: 野営-休息 発火回数=9169`

旧ロジック（床2・4、ほぼ全runが到達する序盤）のほうが新ロジック（床6-10・16-20、到達できるrunが
少ない深部）より camp 遭遇回数が大幅に多い。これは意図した通りの方向で、**配線は効いている**
（前後で不変ではない）。

さらに、非薬回復HP/run のうち camp 由来分（`非薬回復HP/run (camp / stairsHeal / DIOS)`）を見ると、
B5撤退方針では全7シナリオ・全4職で修正後は一律 **0.00** に落ちる（旧: Fighter 9.09 / Thief 6.79 /
Priest 2.26 / Mage 1.43、workshop-complete の例）。B5撤退方針は床6に到達する前に撤退するため、
床6-10にしか camp が無い新ロジックでは一度も発火しないという直接的な構造説明と整合する。

## before / after 比較（主要指標）

再現コマンド（before: コミット `bc25887`, after: コミット `80f833b`。同一 worktree、
`git checkout <commit>` で切替、それぞれ `node scratch/simulations/sim_depth_material_ev.js`
をデフォルト env で実行）:

```sh
node scratch/simulations/sim_depth_material_ev.js
```

### 到達階平均・生存率（戦略レベル N=500、workshop状態×撤退方針ごと）

**B5撤退方針**

| workshop状態 | 到達階 before | after | Δ | 生存率 before | after | Δpt |
|---|---:|---:|---:|---:|---:|---:|
| empty | 2.39 | 2.34 | -0.05 | 17.6% | 16.0% | -1.6 |
| stats | 2.59 | 2.43 | -0.16 | 25.0% | 18.8% | -6.2 |
| gear | 2.75 | 2.65 | -0.10 | 27.4% | 22.2% | -5.2 |
| blood-wand | 2.76 | 2.67 | -0.09 | 27.2% | 21.4% | -5.8 |
| blood-wand-spells | 2.93 | 2.83 | -0.10 | 30.0% | 27.4% | -2.6 |
| core-pools | 2.66 | 2.75 | +0.09 | 27.4% | 25.4% | -2.0 |
| complete | 2.98 | 2.84 | -0.14 | 33.6% | 27.2% | -6.4 |

**B10撤退方針**

| workshop状態 | 到達階 before | after | Δ | 生存率 before | after | Δpt |
|---|---:|---:|---:|---:|---:|---:|
| empty | 2.53 | 2.30 | -0.23 | 8.2% | 4.8% | -3.4 |
| stats | 2.61 | 2.58 | -0.03 | 7.2% | 5.8% | -1.4 |
| gear | 2.79 | 2.74 | -0.05 | 11.6% | 10.2% | -1.4 |
| blood-wand | 3.14 | 2.78 | -0.36 | 10.8% | 8.4% | -2.4 |
| blood-wand-spells | 3.15 | 2.88 | -0.27 | 13.4% | 10.0% | -3.4 |
| core-pools | 3.02 | 2.79 | -0.23 | 12.8% | 9.8% | -3.0 |
| complete | 3.35 | 3.13 | -0.22 | 12.8% | 12.4% | -0.4 |

ほぼ全シナリオ・全撤退方針で修正後は到達階・生存率が下振れする（B5撤退で生存率 -0.4〜-6.4pt、
B10撤退で -0.4〜-3.4pt）。方向は一貫しており、修正前は床2・4固定の無償 camp 回復により
序盤の生存率・到達階が過大評価されていたことと整合する。

### B5 / B10 到達率（entrant rate、全7シナリオ）

| workshop状態 | B5到達 before | after | Δpt | B10到達 before | after | Δpt |
|---|---:|---:|---:|---:|---:|---:|
| empty | 14.6% | 13.4% | -1.2 | 0.6% | 1.4% | +0.8 |
| stats | 17.6% | 13.2% | -4.4 | 1.6% | 0.8% | -0.8 |
| gear | 23.8% | 17.0% | -6.8 | 2.2% | 1.6% | -0.6 |
| blood-wand | 26.4% | 17.8% | -8.6 | 3.4% | 1.8% | -1.6 |
| blood-wand-spells | 26.6% | 20.4% | -6.2 | 4.2% | 2.0% | -2.2 |
| core-pools | 23.8% | 21.2% | -2.6 | 4.6% | 2.8% | -1.8 |
| complete | 29.0% | 24.4% | -4.6 | 5.2% | 4.2% | -1.0 |

B5到達率は7シナリオ全てで低下（-1.2〜-8.6pt、平均約-4.9pt）。B10到達率は6/7シナリオで低下。

### 職業別（workshop-complete、N=125/職、参考値）

N=125はノイズが大きく（95%CI半幅は目安5〜8pt）、workshop-empty等の一部セルは符号が逆転する。
方向性の確認は上記の戦略レベル N=500 集計を正とする。

| Class | 到達階 before | after | 生存率 before | after |
|---|---:|---:|---:|---:|
| Fighter | 3.84 | 4.00 | 20.0% | 20.8% |
| Thief | 3.52 | 3.54 | 15.2% | 14.4% |
| Priest | 3.26 | 2.82 | 4.8% | 1.6% |
| Mage | 3.80 | 2.62 | 15.2% | 7.2% |

## 乱数消費順の変化と実質的な変化の分離

camp の判定床が変わったことで、camp 到達可否に応じて以降のRNG消費順（戦闘・罠判定の分岐）が
変わり得る。ただし今回観測された変化は次の理由から **camp 是正そのものによる実質的な変化が主要因**
と判断できる。

1. 非薬回復HP/run の camp 内訳が、B5撤退方針で全7シナリオ・全4職において一律
   9.09→0.00（Fighter, workshop-complete例）のように**構造的にゼロへ落ちる**。これは
   「床6未満で撤退するB5方針では新ロジックのcamp床(6-10)に一度も到達しない」という
   決定的な機構で説明でき、RNG由来のノイズでは起こらない一貫した消失パターン。
2. 到達階・生存率・B5/B10到達率の変化方向は、7シナリオ×2撤退方針＝14セルのほぼ全てで
   「修正後に低下」という同一方向を示す。RNGの並べ替えだけが原因なら方向はランダムに
   分散するはずであり、この一貫性は「序盤の無償camp回復が失われたことによる実質的な悪化」
   という機構的説明と整合する。
3. N=125の職業別セル（workshop-empty等）では符号が逆転する行があり、これは
   RNG消費順の変化によるノイズと考えられる。しかしN=500の戦略レベル集計では
   ノイズが平均化され、上記1・2の一貫した方向が残る。

以上により、「camp配置の是正による差」と「乱数消費順のズレによる差」を分離できないケースには
該当しない。ズレは職業別N=125の細部にとどまり、主要な効果（到達階・生存率の低下、
camp回復の消失）は機構的に説明できる。

## 再監査が必要な過去 Issue の結論

以下は B5/B10到達率・生存率・早期回復供給に依存する結論であり、修正前のsimは床2・4で
無償camp回復が発生する条件下で測定されていたため、**数値の再測定が必要**（結論そのものは
書き換えていない）。

| Issue | 内容 | 再監査要否 |
|---|---|---|
| #275 | 深層動機・逃走率・EV非単調（CLOSED） | 要（EV/逃走率が早期生存率に依存） |
| #419 | IDENTIFICATION_POLICY既定値（CLOSED） | 要（同時期の到達階・生存率が変わりうる） |
| #534 | 魔術師B10到達率・B5死亡率（CLOSED） | 要（B5/B10到達率が直接変化） |
| #624 | 撤退方針を外した到達限界の未測定（OPEN） | 要（本Issueの前提測定が変わる） |
| #499 | 浅い階の回復経路・B10 entrant目標（CLOSED） | 要（B10 entrant率が直接変化） |
| #502 | 罠対策投資と回復予算（CLOSED） | 要（早期HP収支の前提が変わる） |
| #516 | 戦士・魔術師のsustain非対称（CLOSED） | 要（早期camp回復消失は戦士・魔術師寄りに影響しうる） |

`.agents/balance-simulation.md:668-684`（#502/#516の固定結論の数値表）も、上記と同じ理由で
再測定が必要。

## Design Canon Gate

このIssueはゲームルール・バランス値そのものを変更していない（camp回復率0.4、
CORE_CAMP_MASTER倍率、biome定義は変更禁止領域のまま不変）。変更は測定側（sim）の
床判定バグ修正のみであり、`.agents/game-design*.md` の canon 自体は不変。ただし、
`.agents/balance-simulation.md` に記載された#502/#516の固定結論の数値表は、
測定条件（camp発生床）が変わったことで再測定が必要（上表参照）。この判定の要否は
指揮セッションの確認を仰ぐ。

## 検証

- `node --check src/run_map_generator.js`: PASS
- `node --check scratch/simulations/sim_depth_material_ev.js`: PASS
- `npm run lint`: PASS
- `npm run test:unit`: PASS（83実行 / 0 fail / 3 skip）
- `SIM_RUNS=1 SIM_CALIBRATION_RUNS=1 node scratch/simulations/sim_depth_material_ev.js`: PASS（exit 0）
- 深度sim before/after: 両方 exit 0 で完走（before: コミット`bc25887`、after: コミット`80f833b`、
  同一worktree・同一env・SIM_PARALLEL未指定）

再現コマンド:

```sh
# before（修正前の親コミットをdetached HEADでcheckoutして実行）
git checkout bc25887
node scratch/simulations/sim_depth_material_ev.js

# after（このPRの先頭コミット）
git checkout fix/641-camp-placement
node scratch/simulations/sim_depth_material_ev.js
```

生ログ（`before3.log` / `after3.log`）は本ドキュメントに要約済みのためコミットしない。
