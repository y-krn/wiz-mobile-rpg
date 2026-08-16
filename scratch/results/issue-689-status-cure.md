# Issue #689 状態異常治療の観測

## 結論

- 現行 base (`origin/main` = `568a1899a1ceecb9b32f6adf9953d5cae131f391`) の固定条件では、状態回復経路は 0 回ではない。
- `STATUS_CURE_HP_THRESHOLD=0.35` で、判定は `selected=2,563`、実消費は 2,556 個だった。最大の落ち先は `policy-deferred=89,141` だが、状態異常が発生していないことや、閾値で完全に抑制されていることは確認できなかった。
- 掃引では `0.016` 以下で発火 0、`0.017` で初発火（selected 2 / 実消費 1）。したがって折れ点は `0.016 < threshold <= 0.017`（この seed・N=500 の観測）であり、`0.35` は初発火点ではない。
- 4 職の到達階平均は基準線と完全一致した。観測追加による挙動変更は検出されなかった。
- 是正、既定値変更、アイテム定義変更、`src/` 変更は行っていない。ゲーム設計として治療アイテムが不要かどうかも、この観測だけでは確定しない。

## 実行条件と再現方法

`scratch/sim_commit_depth_624.js` は、固定環境の到達階基準線を再現する既存 harness であり、実際の `simulateRun` と `calibrateCoreScoringProfile` は `scratch/sim_depth_material_ev.js` から import している。`SIM_PARALLEL` は未設定。

```text
env SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 \
  SIM_INDEPENDENT_RUN_RANDOM=1 \
  DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION \
  TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev STATUS_CURE_POLICY=smart \
  STATUS_CURE_HP_THRESHOLD=0.35 FLEE_POLICY=ev HEAL_POTION_THRESHOLD=0.55 \
  SIM_EXPLORATION_FACTOR=1.4 SIM_EQUIPMENT_POLICY=individual-score \
  SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current \
  SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 \
  SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 ISSUE689_DETERMINISTIC=1 \
  node scratch/sim_commit_depth_624.js
```

`ISSUE689_DETERMINISTIC=1` は harness の wall/cpu 計測値を 0 に固定して生出力 SHA を比較可能にする観測用出力設定で、シミュレーション経路・乱数・状態は変更しない。

直接 `scratch/sim_depth_material_ev.js` に出発クラフト列を渡す経路は、現行 main depth case がその列を「実 bank」扱いするため、初期 bank 不足で停止する。固定基準線と同じ実行経路を維持するため、結果は上記の既存 harness で取得した。

## 基準線と決定性

| 職 | 基準線 | 観測値 |
| --- | ---: | ---: |
| Fighter | 5.8720 | 5.8720 |
| Thief | 4.8980 | 4.8980 |
| Priest | 4.5980 | 4.5980 |
| Mage | 6.4800 | 6.4800 |

- 行数: 2,000（4 職 × 500）
- seed: 231 / calibration: 100
- source commit: `568a1899a1ceecb9b32f6adf9953d5cae131f391`
- 同一条件の生 stdout SHA-256（2 回とも）: `9e5eb5507da469a6324e22865462feab20f5cbb5e484a7ea8a3d271013b28fe7`

## 1. statusCureDecisions の内訳

件数は判定イベントであり、run 数ではない。

| 判定 | 件数 |
| --- | ---: |
| unavailable | 13,571 |
| policy-deferred | 89,141 |
| incapacitated | 6 |
| selected | 2,563 |

`selected` のうち実際に減った治療アイテムは 2,556 個。状態別の unavailable は毒 7,253 / 盲目 6,223 / 睡眠 95、麻痺は 0。`policy-deferred` の保持状態は毒 85,524 / 盲目 3,492 / 麻痺 48 / 睡眠 83。主な落ち先は HP 閾値による defer だが、selected と実消費が存在するため「閾値が全発火を抑制」という結論にはならない。

## 2. 状態異常の発生

発生率は 2,000 run 中、1 回以上その状態になった run の割合。damage は状態中に観測された値で、状態が原因と断定できない受傷は `incoming` と分けた。

| 状態 | 発生 run / 率 | 付与回数 | episode | combat round / episode | 探索 step / episode | 状態由来の観測値 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 毒 | 1,770 / 88.50% | 7,511 | 2,763 | 15.64 | 94.43 | poison damage 23.55 HP / episode、incoming 41.44 HP |
| 盲目 | 1,091 / 54.55% | 1,970 | 1,953 | 4.06 | 5.58 | 攻撃試行 2.96、miss 1.47、命中攻撃 damage 17.59 / episode |
| 麻痺 | 23 / 1.15% | 68 | 53 | 1.57 | 0 | 行動不能 0.91 回 / episode、incoming 1.32 HP |
| 睡眠 | 177 / 8.85% | 233 | 207 | 1.61 | 0 | 行動不能 0.86 回 / episode、incoming 0.93 HP |

したがって、付与側が 0 という論点ではない。毒・盲目は頻発し、麻痺・睡眠も低率ながら発生している。

## 3. 閾値掃引

全条件 N=500、seed=231、calibration=100。同一の固定環境で `STATUS_CURE_HP_THRESHOLD` だけを env 上書きした。到達階平均は、観測基準線を確認するため `0.35` のみ併記する。

| threshold | selected | 実消費 | Fighter | Thief | Priest | Mage |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.000 | 0 | 0 | 5.3160 | 4.5120 | 4.2680 | 6.2500 |
| 0.010 | 0 | 0 | 5.3160 | 4.5120 | 4.2680 | 6.2500 |
| 0.016 | 0 | 0 | — | — | — | — |
| 0.017 | 2 | 1 | — | — | — | — |
| 0.020 | 12 | 11 | — | — | — | — |
| 0.050 | 139 | 130 | — | — | — | — |
| 0.100 | 459 | 447 | 5.2920 | 4.5600 | 4.1520 | 6.2440 |
| 0.200 | 1,210 | 1,201 | 5.3240 | 4.7100 | 4.3640 | 6.3060 |
| 0.300 | 2,149 | 2,142 | 5.5620 | 4.8100 | 4.5800 | 6.3800 |
| 0.350 | 2,563 | 2,556 | 5.8720 | 4.8980 | 4.5980 | 6.4800 |
| 0.400 | 2,997 | 2,988 | 6.2420 | 5.0020 | 4.6360 | 6.4440 |
| 0.500 | 3,966 | 3,958 | 7.0680 | 5.2320 | 4.7320 | 6.6240 |
| 0.600 | 5,693 | 5,691 | 8.1260 | 5.5500 | 4.7680 | 7.3100 |
| 0.700 | 6,394 | 6,392 | 7.9300 | 5.6740 | 4.7500 | 7.3600 |
| 0.800 | 6,935 | 6,933 | 8.0640 | 5.6800 | 5.0080 | 7.2820 |
| 1.000 | 7,149 | 7,149 | 7.9320 | 5.8660 | 4.9920 | 6.9740 |

`0.016` は 0.001 刻み掃引での最終ゼロ点、`0.017` は最初の発火点。発火数はそこから単調に近く増えるが、到達階は単調ではないため、単発値を採用する根拠にはしない。

## 4. 資源の入手数と消費数

`STATUS_CURE_ITEMS` 経路で集計した `statusCureItemsAcquired` / `statusCureItemsUsed`。専用 5 種の入手合計は 6,868 個で、今回の実消費合計は 2,268 個。

| item | 入手 | 状態回復経路で消費 |
| --- | ---: | ---: |
| ANTIDOTE | 3,027 | 1,963 |
| PANACEA | 1,407 | 179 |
| WAKE_POWDER | 1,007 | 0 |
| EYE_DROPS | 854 | 126 |
| PARALYZE_CURE | 573 | 0 |
| **専用 5 種合計** | **6,868** | **2,268** |
| HOLY_WATER（候補） | 1,722 | 288 |

## 5. 持続時間・被害量と 1 ターン治療の比較

現在の `0.35` run では、combat 中に選択された治療は 1 combat action として比較できる。`selected=2,563` には post-trap / post-flee の戦闘外判定も含まれるため、全選択を一律に「1ターン」とは換算しない。

- 毒: 1 episode あたり 15.64 combat round + 94.43 探索 step、毒 damage 23.55 HP。行動不能はない。
- 盲目: 1 episode あたり攻撃 miss 1.47 回、命中攻撃 damage 17.59。1 combat action の治療と比べ、攻撃機会の損失が観測できる。
- 麻痺: 行動不能 0.91 回 / episode、incoming 1.32 HP。観測された行動損失は 1 ターン未満だが、発生頻度は 1.15% と低い。
- 睡眠: 行動不能 0.86 回 / episode、incoming 0.93 HP。こちらも観測された平均行動損失は 1 ターン未満で、発生頻度は 8.85%。

治療なしの対照（threshold=0）では selected / 実消費が 0、毒 damage は 80,326 HP / 1,767 episode（45.46 HP / episode）、麻痺の行動不能は 1 回、睡眠は 98 回だった。ただし治療の有無で到達階・生存・状態 episode 数自体が変わるため、これは反実仮想の厳密な差分ではない。

以上から、毒・盲目には継続的な損失があり、麻痺・睡眠は 1 ターン治療と同程度以下の観測損失だった、という判断材料は得られた。閾値やアイテムの採用値、ゲーム設計上の要否は是正フェーズへ持ち越す。

## 検証

- `node --check scratch/sim_depth_material_ev.js`: PASS
- `node --check scratch/sim_commit_depth_624.js`: PASS
- 固定条件 N=1 smoke: PASS
- 固定条件 N=500: PASS
- threshold 粗掃引（0.00–1.00）: PASS
- threshold 細掃引（0.001–0.019）: PASS
- 到達階基準線: PASS（4 職すべて一致）
- 同一 seed 生出力 SHA-256: PASS（2 回一致）
- `npm run lint`: PASS
- `npm run test:unit`: PASS（85 実行 / 3 skip）

観測コード以外の `src/`、閾値の既定値、`HEAL_POTION_THRESHOLD`、アイテム定義、game-design canon は変更していない。
