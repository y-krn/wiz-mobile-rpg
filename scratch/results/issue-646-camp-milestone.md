# Issue #646: キャンプを「階層守護者を倒した後の節目」として再定義する

## 変更内容

- `src/run_map_generator.js` の `floorHasCampEvent(floor)` を、バイオーム帯依存
  （`getBiomeForFloor(floor).theme.eventSkins.camp` の非null判定）から、既存の
  `isMilestoneFloor(floor)`（`floor % 5 === 0`、守護者出現階の判定）を再利用した
  `isMilestoneFloor(floor - 1)` へ書き換えた。守護者を倒した直後の階
  （床6/11/16/21）にのみキャンプが確定配置される。表示名（skin）は従来どおり
  `getBiomeForFloor(floor).theme.eventSkins.camp` から取得し、配置可否とスキン名の
  取得を分離した。
- `src/data/biomes.js` の4バイオーム（`eventSkins.camp` が null だった
  `collapsed_mine`/`rift_nest`/`dragon_forge`/`abyssal_throne`）へキャンプ呼称を
  追加した（採用呼称と理由は後述）。
- `scratch/sim_depth_material_ev.js` に `SIM_ISSUE646_CAMP_LEVEL=1|2|3` を追加し、
  既存の `extraCampFloors` シナリオオーバーライド機構（PR #641/#645で導入済み）を
  使って掃引3水準を測定専用のwhat-ifとして切り替え可能にした。`floorHasCampEvent`
  自体（実src仕様、水準1相当）は変更しない。
- `.agents/game-design.md` の `## Milestone Merchants (Inside A Run)` 直後へ、
  キャンプ配置の新設計を追記した（Design Canon Gate、後述）。

## 変更禁止領域（不変を確認）

- キャンプ回復率 `0.4` と `CORE_CAMP_MASTER` 倍率（`src/systems/camp_rest.js`）: 無変更
- 守護者出現階の周期（5階ごと、`isMilestoneFloor`）: 無変更
- 戦闘計算式・バランス定数: 無変更
- `src/data/items.js`、`src/systems/item_effects.js`（#647セッションの並行編集対象）: 無変更

## バイオーム呼称の追加

各バイオームの既存 `eventSkins` 語彙（4-6文字+「跡」、施設・建造物の廃墟を思わせる
表現）に合わせ、2-3案から選定した。

| biome id | biome名 | 候補 | 採用 | 理由 |
|---|---|---|---|---|
| `collapsed_mine` | 崩れた坑道（B1） | 坑夫宿舎跡 / 採掘所跡 / 鉱石庫跡 | **坑夫宿舎跡** | 坑夫の休息施設という用途がキャンプの機能（休息）と直接一致し、既存の「坑道の湧き水」「坑夫の刻印」と語彙水準が揃う |
| `rift_nest` | 大裂溝の巣窟（B3） | 糸紡ぎ場跡 / 監視台跡 / 裂溝砦跡 | **糸紡ぎ場跡** | 既存の「糸封じの碑」「巣渡りの商人」の「糸」「巣」語彙と施設感を両立する |
| `dragon_forge` | 竜火の鍛造殿（B5） | 鍛冶場跡 / 鋳造所跡 / 炉守り小屋跡 | **鍛冶場跡** | 鍛造テーマに最も直接的で短く、既存の「竜火の鍛造印」「炉守りの商人」と自然に並ぶ |
| `abyssal_throne` | 深淵の玉座（B6） | 王座の間跡 / 侍従室跡 / 供物殿跡 | **王座の間跡** | 既存の「王座の碑文」「玉座渡りの商人」の王座語彙と建造物感が一致する |

既存の「礼拝堂跡」（B2 `forgotten_catacomb`）「読書室跡」（B4 `sunken_library`）と
合わせ、全6バイオームに `eventSkins.camp` が設定された（Acceptance criteria 2）。

content-design判断: この4件は「短い施設廃墟名＋各バイオームの既存語彙との整合」という
明確な基準で選べる範囲であり、既存の2件（礼拝堂跡/読書室跡）と同型の命名パターンに
収まる。指揮セッションの判断が必要な曖昧な分岐（複数の妥当な世界観方向が競合する等）は
生じなかったため、案の提示のみで停止せず、この場で採用を確定した。

## 掃引3水準の測定

同一worktree（`feat/646-camp-as-milestone`、`origin/main` d0efc83 = PR #649マージ後）
・同一env（デフォルト設定、`SIM_SEED=231`、`SIM_RUNS=500`、`SIM_CALIBRATION_RUNS=100`）
・同一seedで、`SIM_ISSUE646_CAMP_LEVEL` のみを変えて3回実行した。ENV_SIGNATURE JSON
（各ログ39行目）で `issue646CampLevel` 以外の全フィールドが3水準間で完全一致することを
確認済み。

再現コマンド:

```sh
SIM_ISSUE646_CAMP_LEVEL=1 SIM_SEED=231 node scratch/sim_depth_material_ev.js  # 水準1（採用仕様、実src）
SIM_ISSUE646_CAMP_LEVEL=2 SIM_SEED=231 node scratch/sim_depth_material_ev.js  # 水準2（測定専用）
SIM_ISSUE646_CAMP_LEVEL=3 SIM_SEED=231 node scratch/sim_depth_material_ev.js  # 水準3（測定専用）
```

- 水準1: 床6/11/16/21（`extraCampFloors`なし、実srcの`floorHasCampEvent`そのまま）
- 水準2: 水準1 + `extraCampFloors=[7,12,17,22]`（守護者+2階分。床6,7,11,12,16,17,21,22）
- 水準3: 水準1 + `extraCampFloors=[5,10,15,20]`（守護者階そのもの。床5,6,10,11,15,16,20,21）

3回とも exit 0 で完走（wall clock 各19秒前後）。

| 水準 | wall clock | raw stdout SHA-256 |
|---|---|---|
| 1 | 19s | `e4fc774c43d92d3218f74201610173813fd0ba9af08be33dea4d1adec27a2d53` |
| 2 | 20s | `ebba74355710832e006b2dd67c6ffbe1ca1a03728039a7997474cfeb0e759787` |
| 3 | 18s | `a245bb7600214e6d722177d211cbad9251f2c1ff07ad06112262a1c62773c36b` |

raw stdoutは再現用の untracked output のためコミットしない。

### 主要指標（7 workshop状態 × 4撤退方針=28セルの単純平均、N=500/セル）

| 指標 | 水準1 | 水準2 | 水準3 |
|---|---:|---:|---:|
| 平均到達階 | 2.769 | 2.770 | 2.783 |
| 平均生存率(生還率) | 11.69% | 12.08% | 12.17% |

個々のセルは95% CI幅がおよそ±3〜5ptあり（N=500での二項比率のWilson区間）、水準間の
差はいずれもこのノイズ帯に収まる。到達階・生存率は3水準でほぼ不変。

### B5/B10到達率（7 workshop状態の単純平均、B20撤退条件下・N=500）

| 指標 | 水準1 | 水準2 | 水準3 |
|---|---:|---:|---:|
| B5到達率 平均 | 18.97% | 19.37% | 18.66% |
| B10到達率 平均 | 2.20% | 2.31% | 2.46% |

7 workshop状態別の内訳（B5到達率 / B10到達率、B20撤退条件）:

| workshop状態 | 水準1 | 水準2 | 水準3 |
|---|---:|---:|---:|
| empty | 9.2% / 0.8% | 12.6% / 1.6% | 8.0% / 0.6% |
| stats | 14.2% / 1.8% | 16.4% / 2.4% | 15.4% / 1.4% |
| gear | 18.0% / 1.0% | 20.2% / 1.8% | 18.4% / 1.0% |
| blood-wand | 21.0% / 2.4% | 21.6% / 1.4% | 20.8% / 3.8% |
| blood-wand-spells | 22.2% / 2.4% | 21.0% / 3.4% | 23.0% / 3.8% |
| core-pools | 24.8% / 3.0% | 20.4% / 2.4% | 20.8% / 3.2% |
| complete | 23.4% / 4.0% | 23.4% / 3.2% | 24.2% / 3.4% |

水準間で一貫した方向の変化はなく、各セルとも±5pt程度の範囲でばらつく。B10到達率は
多くのセルでentrant Nが一桁〜二桁台と小さく、ログ内で「未確定」と付記されるセルを含む。
**#641が示した「B5到達率-4.9ptはそのまま残る」というオーナー判断の留保どおり、本Issueの
キャンプ変更（水準1〜3いずれも）はB5/B10到達率を明確には動かさない。**

### camp発火回数・camp由来回復HP/run

「配線検査（延べ推定）: 野営-休息 発火回数」は全7 workshop状態×4撤退方針×N=500
（=14,000 run）の累計値。

| 指標 | 水準1 | 水準2 | 水準3 |
|---|---:|---:|---:|
| 野営-休息 発火回数（累計、14,000 run） | 493 | 899 | 1,118 |
| camp発火回数/run（累計÷14,000） | 0.0352 | 0.0642 | 0.0799 |
| camp由来回復HP/run（28セル×4職=112セルの平均、「非薬回復HP/run」内訳のcamp列） | 0.2076 | 0.3721 | 0.5038 |
| camp>0 だったセル数（112セル中） | 75 (67.0%) | 77 (68.8%) | 81 (72.3%) |

B5撤退方針では全workshop状態・全4職で水準1〜3いずれもcamp回復HP=0.00（floor6未満で
撤退するため、水準1〜3すべてのcamp床(6以降)に到達しない。水準3が追加する床5=守護者
撃破そのものの階でも、B5撤退方針は撃破前に離脱するため対象外）。camp回復が発生するのは
B10/B15/B20撤退方針から。

## 折れ点の判断と推奨水準

**推奨: 水準1（床6/11/16/21、守護者直後の1階のみ）を採用する。**（＝オーナー判断コメント
の「変更後」に明記された仕様と同一）

根拠:

1. **進行系指標（到達階平均・生存率・B5/B10到達率）は3水準でほぼ不変。** 差はいずれも
   N=500の統計ノイズ帯（±3〜5pt）に収まり、系統的な方向性を持たない。これは
   オーナー判断コメントの「この変更はB5到達率を上げない」という留保と、3水準いずれに
   ついても整合する。つまり水準を2や3に広げても、到達性・生存率の観点での追加的な
   便益は測定上確認できない。
2. **camp露出（発火回数/run、camp回復HP/run）は水準を上げるほど単調に増加する**
   （発火回数/run: 0.0352→0.0642→0.0799、camp回復HP/run: 0.2076→0.3721→0.5038）。
   ただし増分は逓減する（発火回数の絶対増分: +0.0290→+0.0157、camp回復HP/runの
   絶対増分: +0.1645→+0.1317）。水準1から水準2への追加が最も伸びが大きく、
   水準2から水準3ではその追加分の効きが弱まる。
3. **水準1は既に「燃料でなく報酬」として機能する量のcamp回復を提供している**
   （112セル中67.0%でcamp回復>0、平均0.21 HP/run）。進行系指標に測定可能な便益を
   与えない水準2・3まで露出を広げることは、キャンプを「守護者撃破の節目報酬」から
   「気軽に頼れる回復源」へ寄せる方向のリスクを増やすだけで、Issue本文が明記する
   設計意図（帯配置の廃止・報酬化）に反する。
4. 水準2と水準3は追加床数が同じ（各4床、計8床）だが、水準3（守護者階そのものを含む）
   の方がcamp露出が大きい（発火回数899→1,118、camp回復0.3721→0.5038）。これは
   守護者階（床5等）の到達率がその2階先（床7等、水準2が追加する側）より高いためで、
   「どの階に置くか」が「何階分置くか」と独立に効くことを示す一貫した説明ができる。
   したがって「露出を絞りたいなら守護者撃破直後の1階のみに留める」という水準1の設計は、
   露出量を最小化する選択として整合する。

以上より、3水準の間には**明確な折れ点**があり（進行系指標フラット・露出は水準ごとに
説明可能な形で単調増加）、「差が無くどれも同じ」という状況（停止条件1）には該当しない。
測定結果は水準1（オーナー判断で既に確定している仕様）を裏づける。

## B10/B20帯の到達率の想定外変動チェック（停止条件3）

B10到達率は水準1〜3で2.20%→2.31%→2.46%とわずかに増加する方向だが、全てのセルで
95% CIが大きく重なり、「想定外」と呼べる規模の変動はない。B20到達率はこのシミュレータが
出力する「entrant」指標としては存在しない（B5/B10のみを守護者ゲートとして追跡しており、
B20はTARGET_DEPTHSの最深撤退方針そのものであってentrant判定の対象ではない）。停止条件3
（B10/B20帯の到達率が想定外に動く）には該当しない。

## Design Canon Gate

`.agents/game-design.md` の `## Milestone Merchants (Inside A Run)` 直後に
`### Camp placement after milestone bosses` を追加した。キャンプが守護者撃破直後の階
（床6/11/16/21）に確定配置されること、旧・バイオーム帯へのランダム配置を廃止したこと、
回復率40%・`CORE_CAMP_MASTER`倍率・守護者5階周期は不変であることを明記した。

## 検証

- `npm run lint`: PASS
- `npm run test:unit`: PASS（94/94。1回目の実行で `test_chest_relief.js` が単発で
  FAILしたが、直接再実行 (`node scratch/test_chest_relief.js`) では全件PASS、
  `npm run test:unit` の再実行でも94/94 PASSで再現せず。並列テストランナーの
  リソース競合によるフレークと判断）
- `npm run build`: PASS
- `npm run test:browser`: PASS（172/172）
- `node --check src/run_map_generator.js` / `src/data/biomes.js` /
  `scratch/sim_depth_material_ev.js`: PASS
- `floorHasCampEvent(floor)` を深度1-25で確認: true になるのは 6,11,16,21 のみ
- 深度sim掃引3水準: 3回とも exit 0 で完走（上記SHA256参照）
- `scratch/test_camp_waypoints.js`: 新ロジック（`isMilestoneFloor(floor-1)`）に
  合わせて期待値を更新しPASS
- `scratch/test_issue_453_map_generation.js`: 床11・21のマップハッシュがcamp配置変更
  により変化するため期待値を更新しPASS（床1は守護者関連イベントの影響を受けないため
  不変を確認）
- `scratch/test_heal_priority_policy.js`: `targetDepth: 5` のまま無変更で継続PASS
  （新ロジックでも床5はcamp床でないため、#641での調整の前提は崩れない）

## 実装の委譲

`src/run_map_generator.js`、`src/data/biomes.js`、`scratch/sim_depth_material_ev.js`、
`.agents/game-design.md`、および関連する2件の `scratch/test_*.js` の期待値更新は
`scripts/codex-run.sh implement-646` 経由でCodexへ実装委譲した。commit/pushはCodexへ
別途 `scripts/codex-run.sh commit-646` で委譲し、`gh pr create` は実務セッション側で
実行した。
