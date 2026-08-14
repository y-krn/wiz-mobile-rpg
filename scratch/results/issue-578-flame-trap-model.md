# Issue #578: B5F 火炎の罠モデル化

## 結論

`scratch/sim_depth_material_ev.js` に、B5F の非特殊セル歩行を対象とする火炎の罠を追加した。`src/` は変更していない。既存の床罠スケジュール、`trapGuard`、`TRAP_POLICY`、罠回避・軽減経路とは分離している。

`targetDepth=5` の「B5撤退」行は B5F を歩かず B5F 到達直前を表すため、同行の生還率はモデル化前後で変わらない。実際の B5F の影響は B20 撤退ケースの B5F gate と、B10 以深の結果で確認した。

## モデル

- `state.floor === 5` のみ発火対象。
- `floorSteps` から route path へ写像した歩ごとに、特殊セル（階段、midboss/boss、chest、merchant、return portal、message）を除外して 5% を試行。
- 発火時にクールダウンを 5 に設定し、発火歩と次の 4 歩を含めて再発火させない。
- 生存中の party member 全員へ 8–16 damage を個別に適用し、HP 0 を `火炎の罠` の死因で死亡扱いにした。検知、回避、軽減、trap kit は適用しない。
- 配線検査へ `火炎の罠-発動` を追加した。

## 測定条件と provenance

再現コマンド（before/after 共通）:

```sh
env SIM_PRESET=balance-main SIM_SEED=578 SIM_RUNS=500 \
  SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-complete \
  node scratch/sim_depth_material_ev.js
```

`run` scope / `generateRunFloor` 経由、N=500、calibration N=100、Wilson 95% CI。`SIM_PARALLEL` は指定していない（実行時 `availableParallelism=15`）。乱数消費順が変わるため、before/after の出力は同一 seed でも別測定として扱う。

| 項目 | モデル化前 | モデル化後 |
|---|---:|---:|
| env hash | `22cdfc0e875e77cc` | `015c824ae2e0d42c` |
| source commit | `7e884905290835950aec2eee2abf5fa495224eea` | 同左（作業ツリー未コミット） |
| 出力 SHA-256 | `c754670e520bf260ea5151ac0b639bb25cf105ab91adfb52d48920afe3442543` | `f099584540e064c8e7307a04f5fe6de012518d71de70e93cc8a6a5185b34b7ec` |
| wall-clock | 24.50 s | 18.26 s |
| CPU time (user+sys) | 42.21 s | 39.71 s |

after の env signature には `flameTrapModel={floor:5,chance:0.05,cooldownTurns:5,minDamage:8,maxDamage:16}` が追加されている。両測定とも `origin/main` ancestor は true、stale override はなし。

## モデル化前後の比較

「生還」は既存出力の撤退成功を指す。

| endpoint | 指標 | before | after | 差分 |
|---|---|---:|---:|---:|
| B5撤退（B5F未歩行 proxy） | 生還率 | 33.8% [29.8, 38.1] | 33.8% [29.8, 38.1] | 0.0 pt |
| B5撤退（B5F未歩行 proxy） | 死亡率 | 66.2% [61.9, 70.2] | 66.2% [61.9, 70.2] | 0.0 pt |
| B5撤退（B5F未歩行 proxy） | 平均到達階 | 2.93 | 2.91 | -0.02 |
| B10撤退 | 生還率 | 26.2% [22.5, 30.2] | 12.6% [10.0, 15.8] | -13.6 pt |
| B10撤退 | 死亡率 | 73.8% [69.8, 77.5] | 87.4% [84.2, 90.0] | +13.6 pt |
| B10撤退 | 平均到達階 | 3.83 | 3.18 | -0.65 |
| B15撤退 | 生還率 | 23.8% [20.3, 27.7] | 8.8% [6.6, 11.6] | -15.0 pt |
| B15撤退 | 死亡率 | 76.2% [72.3, 79.7] | 91.2% [88.4, 93.4] | +15.0 pt |
| B15撤退 | 平均到達階 | 4.38 | 3.14 | -1.24 |
| B20撤退 | 生還率 | 22.4% [19.0, 26.3] | 10.4% [8.0, 13.4] | -12.0 pt |
| B20撤退 | 死亡率 | 77.6% [73.7, 81.0] | 89.6% [86.6, 92.0] | +12.0 pt |
| B20撤退 | 平均到達階 | 4.58 | 3.29 | -1.29 |

B20撤退 run の B5F gate（B5F に入った run を分母とする）は次の通り。

| 指標 | before | after |
|---|---:|---:|
| B5F entrant | 32.4% (N=500) | 28.8% [25.0, 32.9] (N=500) |
| B5F突破 | 76.5% [69.5, 82.4] (N=162) | 25.7% [19.3, 33.4] (N=144) |
| B5F死亡 | 12.3% [8.1, 18.3] (N=162) | 61.1% [53.0, 68.7] (N=144) |
| B5F撤退 | 11.1%（100%-突破-死亡 の導出値） | 13.2% [8.6, 19.7] (N=144) |

## 職業別

B20撤退 run、各職 N=125。B5F の conditional 列は B5 entrant が分母、全run 列は N=125 が分母。Priest/Mage の B5F conditional は分母が 30 未満のため未確定扱い。

| 職業 | B5 entrant | B5突破 | B5死亡 | B5撤退 | 全run生還率 | 全run死亡率 | 平均到達階 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fighter | 40.0% | 30.0% (N=50) | 54.0% (N=50) | 16.0% (N=50) | 19.2% [13.3, 27.0] | 80.8% [73.0, 86.7] | 4.07 |
| Thief | 42.4% | 13.2% (N=53) | 66.0% (N=53) | 20.8% (N=53) | 17.6% [11.9, 25.2] | 82.4% [74.8, 88.1] | 3.64 |
| Priest | 21.6% | 44.4% (N=27; 未確定) | 55.6% (N=27; 未確定) | 0.0% (N=27; 未確定) | 3.2% [1.3, 7.9] | 96.8% [92.1, 98.7] | 3.05 |
| Mage | 11.2% | 21.4% (N=14; 未確定) | 78.6% (N=14; 未確定) | 0.0% (N=14; 未確定) | 1.6% [0.4, 5.6] | 98.4% [94.4, 99.6] | 2.42 |

B10撤退ケースの火炎の罠集計（各職 N=125、run 当たり）は次の通り。全員へ同じ 8–16 damage を与えるため、HP・歩行到達状況の差が職業差として現れる。

| 職業 | 発動/run | 被害HP/run | 死亡者/run | 試行対象歩/run |
|---|---:|---:|---:|---:|
| Fighter | 1.26 | 14.60 | 0.14 | 26.83 |
| Thief | 1.01 | 11.61 | 0.27 | 19.94 |
| Priest | 0.77 | 9.42 | 0.09 | 15.56 |
| Mage | 0.38 | 4.63 | 0.10 | 6.43 |

## 配線検査抜粋

after の出力には次の非ゼロ行が出ている。既存集計と同じく scenario/milestone 結果を合算した「延べ推定」。

```text
配線検査（延べ推定）: 罠-発動(被弾) 発火回数=34204
配線検査（延べ推定）: 罠-被害HP 発火回数=90048
配線検査（延べ推定）: 火炎の罠-発動 発火回数=1435
```

## 取り直し候補の過去測定

次の検索で B5 endpoint、B5 entrant/proxy、`targetDepth=5`、B5F を参照する過去 summary を抽出した。B5 を比較軸として含むものもあるため保守的な候補一覧であり、全件を再測定候補とする。

```sh
rg -l -i "B5 endpoint|B5代理|B5 entrant|target.?depth.?5|B5F" scratch/results/*.md | sort
```

対象:

`issue-271-b5-milestone-encounter.md`, `issue-271-countermeasure-strength.md`, `issue-271-criteria-remeasurement.md`, `issue-271-quality-remeasure.md`, `issue-271-spellguard-remeasure.md`, `issue-271-status-depth-scaling.md`, `issue-271-trap-quality-after.md`, `issue-271-trap-quality.md`,

`issue-404-affix-volume.md`, `issue-409-second-accessory.md`, `issue-413-stage1-461-baseline.md`, `issue-419-identification-default.md`, `issue-433-curse-lock.md`, `issue-437-core-encounter.md`, `issue-444-build-matching.md`, `issue-446-slot-vs-affix.md`,

`issue-454-countermeasure-after.md`, `issue-454-spellguard-remeasure.md`, `issue-454-trap-remeasure.md`, `issue-461-baseline.md`, `issue-468-exposure-ceiling.md`, `issue-470-build-definition.md`, `issue-473-priest-disarm.md`, `issue-483-heal-unit-sweep.md`,

`issue-485-audit-468-473-main.md`, `issue-485-audit-468-473.md`, `issue-485-build-definition-rebaseline.md`, `issue-485-rebaseline.md`, `issue-487-heal-priority.md`, `issue-489-heal-flee-threshold.md`, `issue-494-264-remeasurement.md`, `issue-494-combat-policy-default.md`,

`issue-496-in-run-recovery-supply.md`, `issue-499-shallow-recovery-supply.md`, `issue-502-461-rebaseline.md`, `issue-502-499-fixed-detection.md`, `issue-507-blind-balance.md`, `issue-508-heal-unit-density.md`, `issue-510-b10-criteria-migration.md`, `issue-512-chest-blind-loop.md`,

`issue-516-class-sustain.md`, `issue-523-461-rebaseline.md`, `issue-528-class-sustain-phase2.md`, `issue-528-portal-sweep.md`, `issue-536-close-264-audit.md`, `issue-538-upper-spells.md`。

優先度が高いのは、直接の基準線・再測定である `issue-413-stage1-461`、`issue-461`、`issue-485-rebaseline`、`issue-502-461-rebaseline`、`issue-523-461-rebaseline` と、それらを参照する職業継続・ポータル・上位呪文系（`issue-516`、`issue-528-*`、`issue-538`）。

## チェックリストと検証

- 適用: `.agents/balance-simulation.md`。run scope、実生成 floor、既定測定条件、Wilson CI、source/env/output provenance、raw dump 非コミットを採用。
- 採用した判断: 火炎の罠は独立 resolver とし、既存罠の軽減・回避・検知・キット価値を流用しない。既存の回復・撤退・戦闘・床罠モデルは `balance-main` のまま。
- 却下した判断: `src/` 改変、#579 相当のバランス調整、`SIM_PARALLEL` 指定、火炎の罠を `TRAP_POLICY` へ混入すること。
- `node --check scratch/sim_depth_material_ev.js`: 成功。
- N=1 smoke（同じ `generateRunFloor` / run scope）: 成功。火炎キーは 0（1 run のため）だが、B5F gate と出力配線を通過。
- `npm run lint`: 成功。
- `npm run test:unit`: 成功（80 passed / 3 skipped / 0 failed）。
- `node scratch/test_sim_reward_paths.js`: 成功（60 sim files）。
- `git diff --check`: 成功。変更ファイルは `scratch/sim_depth_material_ev.js` と本 summary のみ、`src/` 差分なし。
