# Issue #652 base再監査

## 結論

対象baseは `origin/main` の `3e659a62a2b7acca1442feddf101b9b71849458f`。
`measure/652-rebaseline` はこのcommitから作成し、simのsource provenanceも同commitを確認した。
ゲーム側のルール・バランス値は変更していない。

| 対象 | 判定 | 判定根拠 |
|---|---|---|
| #624 | 基準線更新が必要（本体測定外） | 翼あり#612基準線の平均到達階が Fighter **5.778** / Thief **5.162** / Priest **4.740** / Mage **6.474**。要求値6.14 / 5.22 / 4.83 / 6.44を再現せず、#624の4条件は実行しない。 |
| #275 | 結論維持 | 現行`workshop-complete`のEV/時間はB5→B10→B15→B20で **0.1862 / 0.1123 / 0.1219 / 0.1357**。B5最大かつ非単調。逃走run率も **75.6% / 80.0% / 77.6% / 78.8%** と高水準だが、旧「90%前後」より低い。 |
| #419 | 結論維持 | `powder`は`legacy`より平均floorがB5/B10/B15/B20で **2.89/3.12/3.16/3.24** 対 **2.78/3.12/3.02/3.23**。生存率はpowder **28.2/8.8/7.0/12.6%** 対 legacy **26.6/14.0/10.8/10.8%**で一様優位ではないが、実装対応方針を`powder`とする結論は反転しない。 |
| #499 | 結論維持 | 固定察知・seed499・各職N=3000で、基準線B10 entrant **11.5% [10.9,12.1]**、最小+0.4点は実測**0.513本/run**・**14.1% [13.5,14.8]**。10%以上は維持。ただし+0.4のB5死亡**35.8% [34.8,36.9]**は旧制約30.9%を超える。 |
| #502 | 判定不能（予算関係のみ） | 固定条件の主結論は維持。現行→確定察知・撤去→解除転換で平均floor **5.150→5.516→5.473**、B10 entrant **9.5→11.5→11.1%**、床罠被害**22.097→18.571→18.385 HP/run**。ただし旧「罠66HP/run対回復予算51HP」は合計罠HP・回復予算の出力列が専用runnerにないため、不等式自体は再判定しない。 |
| #516 | 結論維持 | 現行baseでtrapGuard=40/50の効果を再現。Fighter B5 entrant **34.8→74.4%**、B10 **2.2→13.2%**、平均floor **4.04→5.75**。Mage B5 **7.8→73.6%**、B10 **0.6→18.2%**、平均floor **2.82→6.55**。Thief/Priestは不変。 |
| #534 | 結論維持 | 現行基準線はB5死亡率が Fighter **2.3%** / Thief **4.2%** / Priest **14.2%** / Mage **15.8%**、B10 entrantは **30.8/20.6/29.0/8.6%**、平均floorは **7.37/6.37/6.34/5.33**。魔術師がB5死亡率最悪・B10/平均floor最下位の順序を維持。 |

明確な「反転」はない。上表のとおり、#499の旧制約PASSは崩れ、#275の逃走率の数値水準は低下したが、各Issueで指定された主判定の向きは変わらない。#502は予算関係だけ判定不能であり、Issueの状態変更や結論編集は提案しない。

## 測定条件と再現

深度simの既定値を確認し、`SIM_RUNS=500`、`SIM_CALIBRATION_RUNS=100`、`SIM_SEED=231`、
`SIM_PARALLEL`未指定で実行した。識別方針の比較だけ`IDENTIFICATION_POLICY=legacy`を明示し、
通常runは既定の`powder`を使用した。率はWilson 95% CI、平均値は正規近似95% CI、N<30セルは未確定とした。

主な再現コマンドは次のとおり。

```sh
node --check scratch/simulations/sim_depth_material_ev.js
SIM_RUNS=1 SIM_CALIBRATION_RUNS=1 node scratch/simulations/sim_depth_material_ev.js
SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 node scratch/simulations/sim_depth_material_ev.js
SIM_SEED=231 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 IDENTIFICATION_POLICY=legacy node scratch/simulations/sim_depth_material_ev.js

# #624: issue612_exp_pace_env.js の翼あり固定env + sim_commit_depth_624.js
# #499: ISSUE499_FIXED_DETECTION=1 node scratch/simulations/sim_issue_499_shallow_recovery_dose_sweep.js
# #502: node scratch/simulations/sim_issue_502_trap_detection.js
# #516: SIM_SEED=461 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 node scratch/simulations/sim_issue_516_class_sustain.js
# #534: SIM_SEED=461 SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 node scratch/simulations/sim_issue_534_mage_death.js
```

#499/#502は固定結論の専用条件を優先した。#499はseed499・各職N=3000/calibration1000、
#502はseed502・各職N=3000/calibration1000であり、いずれも`SIM_PARALLEL`を指定していない。

## #646方式の実行時間

`SIM_ISSUE646_CAMP_LEVEL=1/2/3`、seed231、N=500、calibration N=100の3水準を再実行した。

| level | 実時間 | 終了 |
|---:|---:|---|
| 1 | 19.25s | PASS |
| 2 | 19.78s | PASS |
| 3 | 18.98s | PASS |

18〜20秒程度を再現した。測定範囲縮小を示す所見はなく、追加調査は行っていない。

## 検証

- `node --check scratch/simulations/sim_depth_material_ev.js`: PASS
- N=1 smoke: PASS（依存関係導入前にsandboxのGit fetch権限と依存不足で一度停止したが、`npm ci --ignore-scripts`後に再実行してPASS）
- `npm run lint`: PASS
- `npm run test:unit`: **83 pass / 0 fail / 3 skip**。既知skipは依存変更なしによるもの。今回フレークは未発生。
- UI変更なしのため、build/browserは未実行

## 記述更新

`.agents/balance-simulation.md`に、#502/#516のpre-camp-correction固定値を履歴値として残したうえで、
現行baseの再測定値・再現条件を追記した。ゲーム設計正本、src、simロジック、バランス値は変更していない。

## オーナー判断が必要な点

- #624は基準線を更新してから着手する。
- #499の+0.4はB10閾値を満たすがB5死亡制約に失敗するため、採用可否は別途判断する。
- #502の「66対51」の合計予算関係を確定させる場合は、必要な集計列を持つ別測定を起票する。
- #275の「90%前後」という数値表現を現行の約76〜80%へ更新するかはオーナー判断とする。
