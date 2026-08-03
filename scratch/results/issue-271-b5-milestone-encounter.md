# #271 の B5 分: マイルストーン遭遇

## 結論

`FLEE_POLICY=never` の B5 死亡ハザードは `53.8% -> 27.4%`（95%CI `23.9-31.2%`）となり、受入基準 `30.9%以下`を満たした。素材・報酬・banking は変更していないため、B5 の BE は before/after とも `31.9%` で、ハザード側だけを改善している。

実プレイ寄りの `flee .35` でも `57.4% -> 44.6%` と改善し、B10 entrant は `0 -> 18` に増えた。ただしこの policy の B5 は罠と逃走追撃が支配するため、30.9%以下は未達である。罠は #352/#369 の管轄なので、このPRで数字合わせはしていない。

## 設計・実装

- 対象は B5F の boss `デーモンガード`だけ。B6-B9、B10、通常敵、elite、罠、報酬、素材、banking、深度補正は変更していない。
- 既存の `LAHALITO` 予兆が出ている間に、プレイヤーの実ダメージで boss HP が最大HPの80%以下になった場合だけ、詠唱を中断する。
- 中断時に `b5GuardBroken` と encounter-local な `b5ExposureTurns` を設定する。boss は次の4回の行動を攻撃せず、既存の `getDamageAffixResult` 経路を通るプレイヤー攻撃だけが1.5倍になる。
- boss HP/ATKの直接nerf、無料の初手、到達・報酬・深度連動の補正は採用していない。source of truth は `src/rules/boss_rules.js`。
- 新フィールドは既存 `combatState` に含まれる。save→loadで保持し、旧セーブのフィールド欠落も読めることをテストした。

## B5 d before/after

| policy | before | after | entrants/deaths after | BE after |
|---|---:|---:|---:|---:|
| `FLEE_POLICY=never` | 53.8% (309/574) | **27.4% (157/573)** | 573 / 157 | 31.9% |
| `flee .35` (`threshold`, HP<=.35) | 57.4% (291/507) | 44.6% (225/504) | 504 / 225 | 30.5% |

## 階別ハザード（FLEE_POLICY=never）

Wilson 95%CI。B6-B9にはルール変更がなく、afterの区間はbeforeと重なる。B9は点推定だけ `9.6% -> 13.0%` となったため、後述の未決事項として監視する。

| floor | before entrants/deaths | before d | after entrants/deaths | after d |
|---|---:|---:|---:|---:|
| B1 | 2000 / 248 | 12.4% [11.0,13.9] | 2000 / 248 | 12.4% [11.0,13.9] |
| B2 | 1750 / 321 | 18.3% [16.6,20.2] | 1750 / 321 | 18.3% [16.6,20.2] |
| B3 | 1425 / 206 | 14.5% [12.7,16.4] | 1425 / 206 | 14.5% [12.7,16.4] |
| B4 | 950 / 199 | 20.9% [18.5,23.6] | 951 / 201 | 21.1% [18.7,23.8] |
| B5 | 574 / 309 | 53.8% [49.7,57.9] | 573 / 157 | **27.4% [23.9,31.2]** |
| B6 | 135 / 2 | 1.5% [0.4,5.2] | 272 / 5 | 1.8% [0.8,4.2] |
| B7 | 130 / 11 | 8.5% [4.8,14.5] | 254 / 16 | 6.3% [3.9,10.0] |
| B8 | 112 / 11 | 9.8% [5.6,16.7] | 218 / 16 | 7.3% [4.6,11.6] |
| B9 | 94 / 9 | 9.6% [5.1,17.2] | 184 / 24 | 13.0% [8.9,18.7] |
| B10 | 80 / 42 | 52.5% [41.7,63.1] | 155 / 66 | 42.6% [35.1,50.5] |

## 致命元の内訳（FLEE_POLICY=never）

全死亡では深く到達する run が増えたため trap/normal の絶対数は増えるが、B5階内で見ると boss だけが減り、trap/normalへの置換は起きていない。

| source | 全死亡 before | 全死亡 after | B5死亡 before | B5死亡 after |
|---|---:|---:|---:|---:|
| trap | 459 (33.2%) | 501 (37.9%) | 13 | 14 |
| normal | 636 (46.0%) | 670 (50.7%) | 43 | 42 |
| elite | 0 (0.0%) | 0 (0.0%) | 0 | 0 |
| boss | 289 (20.9%) | 151 (11.4%) | 253 | 101 |

## 6工房状態（B20撤退系列、FLEE_POLICY=never）

`averageReachedFloor / survivalRate / materialEvPerTime / averageTimeCost`。素材EVの式・bankingは同じで、候補後の改善は到達・生還によるもの。

| 工房状態 | before reach | after reach | before survival | after survival | before EV/time | after EV/time | before time | after time |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 空 | 2.96 | 3.02 | 23.0% | 24.8% | 0.1064 | 0.1115 | 221.54 | 233.86 |
| ステータス投資中 | 3.24 | 3.43 | 27.9% | 31.1% | 0.1164 | 0.1261 | 246.04 | 274.96 |
| 初期装備解放済み | 3.43 | 3.72 | 28.9% | 33.4% | 0.1186 | 0.1263 | 265.60 | 307.36 |
| 血杖解放済み | 3.60 | 3.99 | 29.3% | 34.4% | 0.1154 | 0.1245 | 288.89 | 342.79 |
| 血杖・深層呪文 | 3.65 | 3.87 | 29.6% | 34.3% | 0.1143 | 0.1262 | 294.92 | 325.99 |
| 買い切り済み | 3.65 | 3.92 | 29.6% | 33.1% | 0.1152 | 0.1227 | 297.17 | 333.14 |

## ビルド質 × B5突破率

- B5 `combatBuildScore × depth` の class-centered 相関は `r=0.102, n=574` -> `r=0.153, n=573`。
- 既存 core 有無の到達差は `+0.25階 (95%CI [-0.18,+0.69])` -> `+0.18階 (95%CI [-0.40,+0.76])`。core単独の説明力が動いたとは言えない。
- 代わりに、既存の詠唱予兆中に実ダメージを通す encounter-local 軸を測定した。B5 guard break率は no-fleeで73.6%、flee .35で19.8%。したがって「全bossを弱くした」のではなく、予兆中に閾値へ到達するbuild差に依存する案として採用した。ただし相関は弱く、強いcore因果を主張していない。

## 掃引

### breakHpRate（N=800、exposure 4ターン、1.5倍）

`0.70 -> 0.80` で30.9%近辺を跨ぐkneeが出た。`0.80`をN=2000で再確認し、27.4%となった。

| breakHpRate | B5 d | guard break率 | B6/B7/B8/B9 d |
|---:|---:|---:|---:|
| 0.40 | 44.5% | 37.6% | 0.0 / 7.1 / 10.0 / 4.2% |
| 0.50 | 39.7% | 47.1% | 0.0 / 5.1 / 11.9 / 9.6% |
| 0.60 | 34.0% | 60.8% | 0.0 / 6.5 / 13.0 / 5.2% |
| 0.70 | 32.4% | 64.9% | 2.0 / 5.3 / 7.6 / 9.4% |
| **0.80** | **30.3%** | **73.1%** | 1.0 / 5.0 / 5.8 / 11.6% |
| 0.90 | 29.8% | 80.0% | 1.8 / 3.9 / 5.5 / 10.8% |

### exposure duration / multiplier sensitivity（N=800）

| exposure turns | multiplier | B5 d |
|---:|---:|---:|
| 2 | 1.50 | 36.1% |
| 4 | 1.25 | 30.1% |
| **4** | **1.50** | **30.3%** |
| 4 | 1.75 | 30.5% |
| 6 | 1.50 | 29.3% |

ターン数・倍率だけではN=800の点推定に明瞭なkneeはなく、追加の攻撃不能ターンは4から6へ増やさず、N=2000で安全側に確認できた4ターン/1.5倍を採用した。

## 却下案

- boss攻撃/被害の一律nerf: 0.5倍proxyでもB5 dは53.8% -> 42.6%に留まり、PR #303の軽減単独もboss勝率3.7% -> 4.1%だった。脅威の移動だけになるため不採用。
- 罠ダメージnerf: trapからnormal/bossへ致命元が移り、B5 dも悪化した。#352/#369の管轄でもあるため不採用。
- 状態耐性・状態回復薬の追加: 6種の状態回復をモデル化しても到達差signalが消えた。不採用。
- 直接防御core／新core: 現行canonに直接防御coreはなく、PR #384のcanonに反する追加はしない。既存coreを特別扱いする仮説も到達差CIが0を跨いだため不採用。
- B6-B9の難化、深度・到達・報酬・素材・bankingの補正: B5の関門問題を別の場所へ移すため不採用。

## 測定環境

revalidation と6工房比較で設定したenvは以下。`FLEE_POLICY`だけ `never` と `threshold` (`FLEE_HP_THRESHOLD=0.35`) を分けて実行した。

```text
SIM_SEED=271
SIM_RUNS=2000
SIM_CALIBRATION_RUNS=1000
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
TRAP_POLICY=conservative
TRAP_AVOIDANCE_POLICY=ev
TRAP_DAMAGE_MULTIPLIER=1
IDENTIFICATION_POLICY=legacy
STATUS_CURE_POLICY=smart
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
FLEE_POLICY=never | threshold
FLEE_HP_THRESHOLD=0.35
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
ELITE_POLICY=avoid
SIM_SCENARIOS=workshop-complete
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
SIM_PARALLEL=8
```

消耗品6種、状態回復、帰還の翼はモデル化したまま。床生成は `generateRunFloor` 経由、ダメージ倍率・遭遇判定は `src/rules/` の純関数を呼んで測定した。式の写経や `TRAP_POLICY` のsemantics変更はない。

## 検証

- `npm run lint` ✅
- `npm run test:unit` ✅（新規 `scratch/test_b5_boss_break.js` を含む）
- `npm run build` ✅
- `node scratch/test_sim_reward_paths.js` ✅
- browser E2E: スキップ。UIレイアウト・表示state遷移は変更せず、変更したcombatStateとsave→loadは単体テストでassertした。

適用checklist: `.agents/balance-simulation.md`、`.agents/game-logic.md`、`.agents/qa-regression.md`。

- 採用した所見: B5だけの離散関門として扱い、before/afterのhazard・BE・致命元・6工房指標・flee B10 entrant・掃引を同一envで比較した。B6-B9と罠・報酬経路は変更しない。
- 却下した所見: core単独の因果はCIが0を跨ぎ、罠/状態耐性/一律nerfは診断済みの置換または上限問題があるため採用しなかった。
- 判定: no-fleeのB5受入基準は達成。実プレイflee .35、B9点推定、core質依存の弱さは未決として残す。

## 未決・残課題

- #271 の B10 分は対象外。B10 dは `52.5% -> 42.6%`（no-flee）で、別Issue/設計として残る。このPRは #271 の B5 分のみであり、#271を自動closeしない。
- `flee .35`のB5 dは44.6%で30.9%未達。罠・逃走追撃を変更せずにこれをさらに下げることは、このPRの制約外。
- B9は点推定が上がったが、before/after CIは重なり、B6-B9のコード経路は不変。次回測定で同一build cohortの確認が必要。
- 既存core有無の到達差は有意化していない。今回のcounter windowは弱い正相関を示すが、core中心のbuild質依存へ昇格したとはまだ言わない。
