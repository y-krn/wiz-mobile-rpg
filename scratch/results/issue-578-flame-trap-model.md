# Issue #578: B5F 火炎の罠モデル化

## 結論

`scratch/sim_depth_material_ev.js` に、B5F の非特殊セル歩行を対象とする火炎の罠を追加した。`src/` は変更していない。既存の床罠スケジュール、`trapGuard`、`TRAP_POLICY`、罠回避・軽減経路とは分離している。

`targetDepth=5` の「B5撤退」行は B5F を歩かず B5F 到達直前を表すため、同行の生還率はモデル化前後で変わらない。実際の B5F の影響は B20 撤退ケースの B5F gate と、B10 以深の結果で確認した。

レビュー追補の B20 同一条件では、B5F死亡の主経路は間接死ではなく `cause === "火炎の罠"` の直接死だった。全職合計の B5F死亡は 402/577=69.7%（entrant分母）、direct は 309/2,000=0.155 run だが、entrant分母では53.6ptを占める。火炎発動後の別要因死は14.9pt、火炎発動なしのその他死は1.2ptで、HP分布も8–16 damageが低HP帯を直接致死へ押し込むことを示す。従って、数字の差は「direct deathが小さいのに全体死亡率が5倍」という比較分母の混在であり、モデルの過剰な弱体化や間接死主因という推測は採用しない。

## モデル

- `state.floor === 5` のみ発火対象。
- `floorSteps` から route path へ写像した歩ごとに、特殊セル（階段、midboss/boss、chest、merchant、return portal、message）を除外して 5% を試行。
- `floorSteps` は `getFloorStepCount` の推定値であり、src の実際の1歩数ではない。推定値が実歩数より大きければ試行歩・被害を過大、小さければ過小にする。推定歩を route path へ線形写像する際の特殊セル位置のずれも、試行を増減させ得るため、現測定だけではバイアス方向を一意に決めない。
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

旧 B10撤退ケースの火炎の罠集計（各職 N=125、run 当たり）は参考履歴として残す。B5F gate との因果比較には、後述の同一 B20撤退条件を使う。

| 職業 | 発動/run | 被害HP/run | 死亡者/run | 試行対象歩/run |
|---|---:|---:|---:|---:|
| Fighter | 1.26 | 14.60 | 0.14 | 26.83 |
| Thief | 1.01 | 11.61 | 0.27 | 19.94 |
| Priest | 0.77 | 9.42 | 0.09 | 15.56 |
| Mage | 0.38 | 4.63 | 0.10 | 6.43 |

## レビュー追補: 同一 B20 条件の B5F 内訳

旧表の条件差を解消するため、`workshop-complete`・B20撤退ケースだけで再集計した。各職 N=500（合計 N=2,000）、seed=578、B5F entrant が分母の gate 率である。`試行歩/run(全)` は非entrantの0歩も含み、`試行歩/entrant` は B5Fへ入った run だけの平均である。

再現コマンド:

```sh
env SIM_PRESET=balance-main SIM_SEED=578 SIM_RUNS=2000 \
  SIM_CALIBRATION_RUNS=100 SIM_SCENARIOS=workshop-complete \
  node scratch/sim_depth_material_ev.js
```

実行記録は env hash `ea532fd61f540581`、source commit `13e91ea988144229ee909c95822bc7d338a9fec8`、stdout SHA-256 `c0baeb31737995498188dadd7f40bdb4af29be43fc844441974a522d458502cf`。`SIM_PARALLEL` は未指定、raw dump は保存・コミットしていない。

### B5F gate と職業別火炎曝露

| 職業 | B5 entrant | 試行歩/run (全) | 試行歩/entrant | 発動/entrant | 被害HP/entrant | B5突破 | B5死亡 | B5撤退 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fighter | 166/500 (33.2%) | 20.75 | 62.49 | 3.07 | 37.39 | 27.1% [20.9, 34.3] | 57.8% [50.2, 65.1] | 15.1% [10.4, 21.3] |
| Thief | 231/500 (46.2%) | 23.47 | 50.80 | 2.60 | 30.90 | 11.7% [8.2, 16.5] | 75.8% [69.8, 80.8] | 12.6% [8.9, 17.4] |
| Priest | 100/500 (20.0%) | 11.53 | 57.67 | 3.09 | 37.01 | 35.0% [26.4, 44.7] | 65.0% [55.3, 73.6] | 0.0% [0.0, 3.7] |
| Mage | 80/500 (16.0%) | 7.05 | 44.08 | 2.20 | 25.95 | 10.0% [5.2, 18.5] | 82.5% [72.7, 89.3] | 7.5% [3.5, 15.4] |

`getFloorStepCount` はフロア生成値から計算するため職業非依存である。それでも全run試行歩が Fighter 20.75 / Mage 7.05（2.94倍）と開くのは、B5 entrant率（33.2% / 16.0%）と、到達後に死亡・撤退せず歩き続ける歩数の差が掛け合わされるためである。entrant 内では 62.49 / 44.08（1.42倍）まで縮む。旧 B10 表で見えた約4倍差の大半は「B5へ入るrunの割合」と「入った後の継続」の選別で説明され、floorSteps が職業別に変わったことを示さない。

### B5F 死亡 cause の分類

分類は B5F entrant のうち `deathFloor === 5` の死亡だけを対象にした。

- `direct`: death log の `cause === "火炎の罠"`。これは直接死として確定。
- `afterFlame`: direct ではなく、同じ B5F でそれ以前に火炎が1回以上発動していた死亡。HP低下後の時系列 proxy であり、火炎が死因だったとまでは断定しない。
- `noFlame`: B5Fで火炎発動を観測しなかったその他死。これも「因果的に無関係」の証明ではなく、観測上の分類である。

| 職業 | B5F死亡 | direct | direct/run | afterFlame | afterFlame/run | noFlame | afterFlame が発動後5歩以内 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fighter | 96 | 68 (70.8%) | 0.136 | 25 (26.0%) | 0.050 | 3 (3.1%) | 3 |
| Thief | 175 | 142 (81.1%) | 0.284 | 31 (17.7%) | 0.062 | 2 (1.1%) | 7 |
| Priest | 65 | 43 (66.2%) | 0.086 | 21 (32.3%) | 0.042 | 1 (1.5%) | 2 |
| Mage | 66 | 56 (84.8%) | 0.112 | 9 (13.6%) | 0.018 | 1 (1.5%) | 1 |

3分類は各職で B5F死亡数に一致する。全職合計では entrant 577/2,000、B5F死亡 402/577=69.7%、direct 309/2,000=0.155 run、afterFlame 86/2,000=0.043 run、noFlame 7/2,000=0.004 run である。したがって、以前の「0.09〜0.27人/run」と「B5F死亡率」の不整合は、前者が全run分母、後者が entrant 分母だったことに加え、今回の after-run composition では direct が B5F死亡の 53.6pt、afterFlame が 14.9pt、noFlame が 1.2ptを占めることで説明できる。直接死が主経路であり、間接経路だけを主因とはしない。

なお、旧 N=500 の before/after 表（B5F死亡 12.3%→61.1%、+48.8pt）は対応runを保存した paired測定ではないため、上の cause 内訳から差分を厳密に逆算しない。直接死の実測規模が差分と同じオーダーで、他要因死のうち火炎発動後が補助的に続く、という結論に留める。

### B5F HP 分布

最低HPは0を含めると死亡を再掲するだけになるため、表は「生存中の最低HP」を p10 / median / p90 で示す。HP比は各runの最大HPに対する比率で、回復後に入場したrunも含む。

| 職業 | B5入場HP p10 / med / p90 | 生存中最低HP p10 / med / p90 | 入場HP比 p10 / med / p90 | 最低HP比 p10 / med / p90 |
|---|---:|---:|---:|---:|
| Fighter (N=166) | 27 / 42 / 52 | 1 / 6 / 17 | 68.6% / 100.0% / 100.0% | 2.4% / 13.5% / 37.0% |
| Thief (N=231) | 19 / 32 / 40 | 1 / 7 / 12 | 72.0% / 100.0% / 100.0% | 3.6% / 19.2% / 38.2% |
| Priest (N=100) | 22 / 29 / 38 | 2 / 7 / 14 | 82.9% / 100.0% / 100.0% | 6.7% / 25.0% / 45.8% |
| Mage (N=80) | 14 / 22 / 30 | 1 / 7 / 13 | 73.7% / 100.0% / 100.0% | 5.0% / 26.3% / 55.0% |

B5 entrant の中央値でも Mage 22HP、Priest 29HP、Thief 32HP、Fighter 42HPであり、床内の生存中最低HP中央値は6〜7HPまで下がる。8–16 damage の火炎が低HP帯を直接死亡へ押し込む余地は十分にあり、モデルの5倍級の gate 変化は「小さな direct death では説明不能」ではなく、entrant 分母へ揃えると direct death が主経路として整合する。`afterFlame` は補助経路だが、5歩以内に限定すると Fighter 3 / Thief 7 / Priest 2 / Mage 1 件であり、直前数歩の proxy だけを根拠に間接死を過大評価しない。

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
- レビュー追補 N=2,000（B20・各職N=500）: B5F gate の同一条件集計、death cause 3分類、B5 entrant HP / 生存中最低HP分布、entrant率と試行歩の関係を追加。`afterFlame` は因果断定を避けた時系列 proxy として明記した。
