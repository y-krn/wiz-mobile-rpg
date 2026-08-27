# Issue #691 状態異常治療 EV 是正

## 結論

深度 sim の状態異常治療を、HP率ゲートではなく状態別 EV 述語へ置き換えた。
`STATUS_CURE_POLICY=legacy` では旧 `STATUS_CURE_HP_THRESHOLD=0.35` 判定を退避再現でき、
旧4職基準線と完全一致した。EV 方針の新基準線は、到達階の上昇ではなく、sim側の抑制が外れた量として記録する。

## 測定条件と出所

- base / source: `origin/main` / `8e3379457d522a40d8c22fc454efded6ce84b75d`（`8e33794`）
- seed: `231`
- runs: 4職 × 500 = 2,000
- calibration: `100`
- target depth: B20（`targetDepth=21`）
- `SIM_PARALLEL`: 未指定（実行時 resolved parallelism: 15）
- `SIM_MAP_CACHE_ENTRIES`: 未指定
- 観測値の出所: `evidence/results/issue-689-status-cure.md`
- 出力の時刻・CPU計測は `ISSUE689_DETERMINISTIC=1` で固定。シミュレーションの乱数・経路は変更しない。

4職の行集計は既存の `scratch/simulations/sim_commit_depth_624.js` を使用した。この harness は実際の
`scratch/simulations/sim_depth_material_ev.js` の `simulateRun` / `generateRunFloor` 経路を呼ぶ。

```text
env SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 \
  SIM_INDEPENDENT_RUN_RANDOM=1 \
  DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION \
  TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev STATUS_CURE_POLICY=ev \
  STATUS_CURE_HP_THRESHOLD=0.35 FLEE_POLICY=ev HEAL_POTION_THRESHOLD=0.55 \
  SIM_EXPLORATION_FACTOR=1.4 SIM_EQUIPMENT_POLICY=individual-score \
  SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current \
  SIM_SUPPORT_SUPPLY_CEILING=none SIM_CORE_SCORE_DROP_TOLERANCE=0 \
  SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 ISSUE689_DETERMINISTIC=1 \
  ISSUE624_CONDITION_ID=ev-691 node scratch/simulations/sim_commit_depth_624.js
```

## 状態別 EV 判定

述語は `continueLoss > actionLoss + itemLoss`。`itemLoss=1` はアイテム1個、治療に使う1行動の損失を加算する。
毒・盲目の行動損失は、盲目では #689 の命中時 damage を観測値として使い、その他は
`src/rules/character_stats.js` の `calculatePhysicalAttackFormula` から現在のsim状態に応じて導出する。
麻痺・睡眠は1行動単位で比較する。EVが負または同値の場合は治療しない。

| 状態 | 継続時の損失 | 治療時の損失 | EV評価 | 正のEV / 判定 |
| --- | ---: | ---: | ---: | ---: |
| 毒 | 残探索step × `23.55 / 94.43` HP/step。評価平均 **87.1506** | 1行動 **42.6130** + item **1** = **43.6130** | 変動 | **5,686 / 11,246** (50.56%) cure |
| 盲目 | `1.47 miss/episode × 17.59 HP/hit` = **25.8573** | 1行動 **17.59** + item **1** = **18.59** | **+7.2673** | **1,155 / 1,155** (100%) cure |
| 麻痺 | **0.91 action/episode** | 1行動 **1** + item **1** = **2** | **−1.09** | **0 / 169** cure |
| 睡眠 | **0.86 action/episode** | 1行動 **1** + item **1** = **2** | **−1.14** | **0 / 145** cure |

毒の継続損失は残探索stepにより評価ごとに変わるため、表の平均値だけを閾値として実装していない。
麻痺・睡眠は観測された行動損失が1行動以下であり、治療しない結論が正しい。
0.6を定数として使用していない。

## 新基準線

| 職 | 旧基準線（legacy） | EV | 差（抑制が外れた量） |
| --- | ---: | ---: | ---: |
| Fighter | 5.8720 | **7.9200** | **+2.0480** |
| Thief | 4.8980 | **5.8360** | **+0.9380** |
| Priest | 4.5980 | **4.9760** | **+0.3780** |
| Mage | 6.4800 | **6.9580** | **+0.4780** |

旧方針の実行は `STATUS_CURE_POLICY=legacy STATUS_CURE_HP_THRESHOLD=0.35` とし、
Fighter / Thief / Priest / Mage が **5.8720 / 4.8980 / 4.5980 / 6.4800** で完全一致した。
旧方針 raw stdout SHA-256 は `3cff71705bf79fbb49442f740a30eae1ee50709b177c78813e67aebfcbedb02b`。

## 資源の拘束

| item | #689 reference 入手 | EV 入手 | EV 状態回復経路消費 |
| --- | ---: | ---: | ---: |
| `ANTIDOTE` | 3,027 | 3,622 | 3,094 |
| `PANACEA` | 1,407 | 2,121 | 1,625 |
| `WAKE_POWDER` | 1,007 | 1,110 | 0 |
| `EYE_DROPS` | 854 | 844 | 529 |
| `PARALYZE_CURE` | 573 | 728 | 0 |
| **専用5種 合計** | **6,868** | **8,425** | **5,248** |
| `HOLY_WATER`（候補） | 1,722 | 2,384 | 1,593 |
| **状態回復経路 合計** | — | — | **6,841** |

#689の6,868個は旧基準線の4職合計であり、run間で共有する固定在庫ではない。EVで到達階が変わるため、
同じ N=500 のEV runでは入手数も8,425個へ変化する。したがって入手数を6,868に人工的に固定する変更は行っていない。
参考として #689 の threshold 0.8 は状態回復経路消費6,933で、専用5種6,868を上回る観測だった。

run内の専用5種在庫は **1,291 / 2,000 run** で枯渇した。初回枯渇 floor の内訳は次の通り。

| 初回枯渇 floor | run数 |
| ---: | ---: |
| B1 | 894 |
| B2 | 255 |
| B3 | 77 |
| B4 | 46 |
| B5 | 19 |

専用5種が尽きた後も `HOLY_WATER` が残るrunでは selected **3,262** 件が発生した。
残りの判定は unavailable **50,090** 件、policy-deferred **3,967** 件で、専用候補が尽きた後は
共有候補（主に `HOLY_WATER`）だけが治療経路として残る。

## B5 / B10 関門

B5は `reachedFloor >= 5` を入場、`deathFloor === 5` を死亡と数え、B10は `reachedFloor >= 10` とした。

| 職 | B5 入場 | B5 死亡 | B5死亡率 | B10到達 | B10到達率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fighter | 390 | 36 | 9.23% | 160 | 32.0% |
| Thief | 396 | 216 | 54.55% | 67 | 13.4% |
| Priest | 258 | 151 | 58.53% | 55 | 11.0% |
| Mage | 381 | 115 | 30.18% | 93 | 18.6% |
| **全体** | **1,425** | **518** | **36.35%** | **375** | **18.75%** |

受入基準に対して、B5死亡率 **36.35% > 30.9%** は未達、B10到達率 **18.75% ≥ 15.0%** は通過。
到達階が上がったこと自体は改善成果として扱わない。

## 決定性・検証

- `node --check scratch/simulations/sim_depth_material_ev.js`: PASS
- `node --check scratch/simulations/sim_commit_depth_624.js`: PASS
- `node --check scratch/tests/unit/test_status_cure_ev.js`: PASS
- N=1 smoke（`SIM_PRESET=balance-main`, calibration 1）: PASS
- `npm run lint`: PASS
- `npm run test:unit`: PASS（86実行 / 0失敗 / 3 skip）
- legacy退避経路: PASS（旧4職基準線と完全一致）
- EV N=500 run 1: PASS
- EV N=500 run 2: PASS
- 生 stdout SHA-256（2回とも）: **`2b4ea8a6c270a1432de58473dc0790fb0862116a7f8a9ac17318f568742d1907`**
- `originMainAncestor`: `true`

ゲーム本体 `src/`、治療アイテム、`HEAL_POTION_THRESHOLD`、計装カウンタは変更していない。
