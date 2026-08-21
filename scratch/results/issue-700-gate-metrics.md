# Issue #700 legacy / EV 関門指標（同一条件の対比較）

- source commit: `ff1403a424841e62aa7a0c5414d6af331a1657f7`
- origin/main base: `ff1403a424841e62aa7a0c5414d6af331a1657f7`（HEAD の祖先: true）
- 条件: N=500 / 職、4職合計 2000 run、SIM_SEED=231、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL=未指定
- 共通条件: #699 の既存 `sim_commit_depth_624.js` harness、実 `sim_depth_material_ev.js` / `generateRunFloor` 経路、`SIM_INDEPENDENT_RUN_RANDOM=1`、出発クラフト・罠・逃走・薬・装備条件は legacy/EV 共通。
- legacy: `STATUS_CURE_POLICY=legacy STATUS_CURE_HP_THRESHOLD=0.35`。EV: `STATUS_CURE_POLICY=ev`（HP率値は EV 判定では参照しない）。

## 定義

既存 sim の定義をそのまま集計: B5 entrant=`reachedFloor >= 5`、B5 death=`deathFloor === 5`、B5 mortality=B5 death/B5 entrant、B10 reached=`reachedFloor >= 10`、B10 reach rate=B10 reached/全run。

## 関門指標

| 条件 / 職 | B5 entrant | B5 deaths | B5 mortality | B10 reached | B10 reach rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy / overall | 1525 | 432 | 28.33% | 529 | 26.45% |
| legacy / Fighter | 360 | 42 | 11.67% | 88 | 17.60% |
| legacy / Thief | 475 | 207 | 43.58% | 149 | 29.80% |
| legacy / Priest | 241 | 112 | 46.47% | 69 | 13.80% |
| legacy / Mage | 449 | 71 | 15.81% | 223 | 44.60% |
| ev / overall | 1578 | 444 | 28.14% | 686 | 34.30% |
| ev / Fighter | 389 | 42 | 10.80% | 174 | 34.80% |
| ev / Thief | 473 | 203 | 42.92% | 189 | 37.80% |
| ev / Priest | 259 | 141 | 54.44% | 48 | 9.60% |
| ev / Mage | 457 | 58 | 12.69% | 275 | 55.00% |

## B5 entrant 分母の変化（EV − legacy）

| 職 | legacy entrant | EV entrant | 差 | 相対差 |
| --- | ---: | ---: | ---: | ---: |
| overall | 1525 | 1578 | +53 | 3.48% |
| Fighter | 360 | 389 | +29 | 8.06% |
| Thief | 475 | 473 | -2 | -0.42% |
| Priest | 241 | 259 | +18 | 7.47% |
| Mage | 449 | 457 | +8 | 1.78% |

## legacy 旧基準線照合

| 職 | 旧基準線 | 今回 legacy 平均到達階 | 差 | 判定 |
| --- | ---: | ---: | ---: | --- |
| Fighter | 5.8720 | 6.0840 | 0.2120 | 不一致 |
| Thief | 4.8980 | 7.8340 | 2.9360 | 不一致 |
| Priest | 4.5980 | 5.0480 | 0.4500 | 不一致 |
| Mage | 6.4800 | 9.5920 | 3.1120 | 不一致 |

旧基準線照合: **不一致**。旧値の出所は #699 の base `8e3379457d522a40d8c22fc454efded6ce84b75d` / source `41b9b5cddf7fc400afb65b4f86d68850659a173b`。今回の current base はそれ以降の変更を含むため、旧値を再利用せず今回の実測値を採用する。

差分条件の具体例（個別コミットの寄与はこの測定では分離していない）: #712 の盗賊罠passive配線、#735 のタグ特効呪文配線、#739/#746/#753/#763 の物理式・軽減・乱数幅・最低ダメージ、#767 の隠れ魔法fallback撤去、#768 の職別レベル成長。これらは現行 `src/` と sim が実際に通るルールであり、#699 時点の旧基準線と同一条件ではない。

## 受入基準の判定

- B5 mortality <=30.9%: legacy 28.33% / EV 28.14% → PASS
- B10 reach rate >=15.0%: legacy 26.45% / EV 34.30% → PASS
- 結論: 閾値は変更しない。30.9% は報酬側の損益分岐、15.0% は既存の受入基準であり、今回の方針比較だけでは分岐点自体を変更する根拠にならない。EV は到達・入場分母を変えるため、率だけでなく上表の entrant 数を併読する。

## 決定性・再現性

- legacy replicate 1 SHA-256: `eb89a3c97b8557004e644ab2a4f4b15fa6884fb64a79980cb8e08885ddb4183e`
- legacy replicate 2 SHA-256: `eb89a3c97b8557004e644ab2a4f4b15fa6884fb64a79980cb8e08885ddb4183e`
- EV replicate 1 SHA-256: `32e6d7da3723fd38e7578e8e3fd4c7243a39d69e163c07f9fcba63b8544c7422`
- EV replicate 2 SHA-256: `32e6d7da3723fd38e7578e8e3fd4c7243a39d69e163c07f9fcba63b8544c7422`
- legacy raw stdout一致: **PASS**
- EV raw stdout一致: **PASS**
- legacy/EV paired run keys一致（class/run/scenario/randomSequence）: **PASS**

再現コマンド（raw stdout は `/private/tmp/issue-700-gate-metrics-raw/` に保存）:

```sh
node scratch/issue700_gate_metrics.js
```

ゲーム本体 `src/`、ゲームルール、バランス値、アイテム定義、閾値、経済は変更していない。
