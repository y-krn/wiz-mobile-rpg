# Issue #271 Phase 1: quality remeasurement

Refs #271。Phase 1は測定のみ。`src/`の変更なし。深層の脅威設計は未着手。

## 結論

主判定（`workshop-complete`）:

- **A1 成立**。Q4−Q1のB5死亡率差は -33.4pp、95% CI [-54.2pp, -12.6pp]。Q1→Q4は単調減少し、Q4は10.3% [3.6%, 26.4%]で30.9%以下。隣接quartileのCIは重なり、kneeは**有意差なし**。
- **A2 成立**。class-centeredな`combatBuildScore × depth`は`r=0.209`、95% CI [0.034, 0.373]。補助endpointのB5突破は`r=0.216`、95% CI [0.041, 0.379]で同方向。
- **A3 未確定**。combat coreはN=110/13、core+対応supportはN=13/110で、いずれも片群が30未満。core単体もN=122/1。効果の結論は出さない。

実ランの主状態（`workshop-core-pools`）:

- **A1 不成立**。Q4−Q1は+5.0pp、95% CI [-17.8pp, +27.7pp]、Q4死亡率32.3% [18.6%, 49.9%]。Q4で上昇する非単調であり、kneeとは呼ばない。
- **A2 不成立**。`combatBuildScore × depth`は`r=0.093`、95% CI [-0.083, 0.263]。補助endpointの突破は`r=0.180`、95% CI [0.006, 0.344]で同方向だが、主endpoint条件を満たさない。
- **A3 未確定**。core N=124/3、combat core N=109/18、core+対応support N=14/113。N<30のため結論は出さない。

したがって、現時点で「評価の場がある」とは確定しない。`workshop-complete`のA1/A2は成立したが、意図したfeature差（A3）が未確定で、実ラン主状態ではA1/A2も再現しない。

## 測定条件

各シナリオ500 run、calibration 100 run。`SIM_PARALLEL`は未指定（実解決値15）。seedは271。`IDENTIFICATION_POLICY=powder`、主経路は`workshop-complete`、基本4職（Fighter / Thief / Priest / Mage）、`FLEE_POLICY=threshold`。`workshop-empty`、`workshop-stats`、`workshop-gear`、`workshop-blood-wand`、`workshop-blood-wand-spells`、`workshop-core-pools`、`workshop-complete`の7シナリオを同一envで測定した。

departure kitは`TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`。罠は`conservative` / `ev`、状態回復は`smart`、merchant補充は`missing`、eliteは`avoid`。実行は`generateRunFloor`から実配置を作り、現行`simulateRun`の戦闘・罠・装備・消耗品・状態回復・帰還経路を通した。式だけの再現ではない。

`FLEE_POLICY=never`は参考値のみ取得した。B10の受入基準は定義していない。

## 7シナリオ結果（threshold）

率はWilson 95% CI。core供給は全500 runの最終装備、`core+support`はB5 entrant内の条件付き値。

| scenario | B5 entrant N | B5死亡 | B5突破 | 平均到達floor | material EV/time | 最終core有 | 最終core 2+ | B5 core+support |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| empty | 72 | 31.9% [22.3,43.4] | 34.7% [24.8,46.2] | 3.096 | 0.1513 | 56.2% | 25.2% | 8.3% |
| stats | 92 | 37.0% [27.8,47.2] | 25.0% [17.3,34.7] | 3.304 | 0.1688 | 66.0% | 32.4% | 9.8% |
| gear | 104 | 23.1% [16.0,32.0] | 26.9% [19.3,36.2] | 3.346 | 0.1724 | 62.2% | 31.4% | 9.6% |
| blood-wand | 104 | 34.6% [26.2,44.2] | 30.8% [22.7,40.2] | 3.486 | 0.1635 | 64.4% | 34.2% | 11.5% |
| blood-wand-spells | 126 | 22.2% [15.8,30.2] | 38.1% [30.1,46.8] | 3.668 | 0.1680 | 66.0% | 33.6% | 11.9% |
| core-pools | 127 | 25.2% [18.5,33.4] | 39.4% [31.3,48.1] | 3.674 | 0.1693 | 71.4% | 39.2% | 11.0% |
| complete | 123 | 29.3% [22.0,37.8] | 28.5% [21.2,37.0] | 3.676 | 0.1700 | 73.4% | 44.0% | 10.6% |

「B5 conditionalでcore有が99.2%」のような値は全runの供給率と同じ分母ではない。供給改善の確認には上表の全run最終装備率も併記した。

## A1: completeのquartile

quartileはB5 floor-startの`combatBuildScore`を職内順位化して作成。endpointはB5で死亡したか。

| Q | N | score平均 | B5死亡率 |
| ---: | ---: | ---: | ---: |
| Q1 | 32 | 32.07 | 43.8% [28.2,60.7] |
| Q2 | 31 | 41.54 | 32.3% [18.6,49.9] |
| Q3 | 31 | 51.79 | 29.0% [16.1,46.6] |
| Q4 | 29 | 68.45 | 10.3% [3.6,26.4] |

Q4−Q1差は-33.4pp [-54.2,-12.6]。単調条件、CI上限<0条件、Q4≤30.9%条件の3本を満たす。隣接CIはすべて重なるため、点推定の最大落差をkneeとは扱わない。

## A2: class-centered相関

completeのB5 entrant N=123で、職ごとに`combatBuildScore`とendpointを平均中心化してからPearson rを計算し、Fisher zの95% CIを付けた。

- depth: `r=0.209` [0.034, 0.373]。点推定≥0.20、CI下限>0で成立。
- B5突破（補助）: `r=0.216` [0.041, 0.379]。同方向。
- r=0.20でFisher CI下限>0となる最小Nは97。近似80% powerの目安は194。観測N=123は判定条件の最小Nは超えるが、80% power目標には届かない。

## A3: feature別の差

効果は「有−無」、職内centering後のB5 entrant endpoint。死亡は負、突破と到達floorは正が設計方向。数値は推定値 [95% CI]。

### complete（主判定）

| feature | 有/無 N | 突破差 | 死亡差 | 到達floor差 | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| core | 122/1 | 0.0pp [-6.7,+6.7] | -0.0pp [-7.9,+7.9] | -0.000 [-0.302,+0.302] | 未確定（N<30） |
| combat core | 110/13 | +4.0pp [-20.3,+28.4] | -10.9pp [-38.0,+16.1] | +0.767 [0.073,1.462] | 未確定（N<30） |
| core+対応support | 13/110 | -1.6pp [-18.3,+15.2] | -6.7pp [-32.3,+18.8] | +0.285 [-0.683,+1.252] | 未確定（N<30） |

combat coreとcore+対応supportはいずれも両群N≥30を満たさない。従って、CIの一部が0を跨がない項目があってもA3の成立とはしない。

### core-pools（主状態の併記）

| feature | 有/無 N | 突破差 | 死亡差 | 到達floor差 | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| core | 124/3 | +32.3pp [+24.3,+40.3] | +14.4pp [+7.0,+21.7] | +0.898 [+0.605,+1.192] | 未確定（N<30） |
| combat core | 109/18 | +3.3pp [-19.5,+26.0] | -3.6pp [-23.4,+16.1] | -0.183 [-1.102,+0.737] | 未確定（N<30） |
| core+対応support | 14/113 | -23.0pp [-43.6,-2.5] | +4.1pp [-19.7,+27.9] | -0.676 [-1.403,+0.050] | 未確定（N<30） |

ここでもN<30なので、点推定が大きいcore単体や逆方向のcore+supportを効果・反証とは読まない。

## `combatBuildScore`の定義と二重計上確認

判定中心指標はB5 floor-start snapshotの

`combatBuildScore = equipmentStatScore + combatCoreScore`

である。

- `equipmentStatScore`は、現在装備キャラクターと装備を空にした同一キャラクターの`getBaseEquipmentScore`の差。
- `getBaseEquipmentScore`の重みは、weapon ATK×2、defense×2、max HP×0.25、STR×1、VIT×1、INT×0.5、PIE×0.5、AGI×0.25、guardian×0.2、spellGuard×0.15、followUp×0.15、firstStrike×0.1、arcane×0.1、devotion×0.1。
- `combatCoreScore`は、各coreの手書き固定値の足し算ではなく、現行実行経路をcalibrationして、LAST_STAND / GIANT_SLAYER / EXECUTIONER / OPENER / BLOOD_WAND / PURIFY_RING / TRAP_EATER / THORN_SHIELDの実発動率・対象率・ダメージ/回復・罠結果などを合成した値。
- `CORE_CURSE_KEEPER`は`combatCoreScore`では0。呪いによる全statsは`getCharAllStatsAffixBonus`経由で`getBaseEquipmentScore`に一度だけ入る。受動coreを`combatCoreScore`に再加算していないことを確認した。

対応supportの定義は、coreごとに次を別featureとして使った：LAST_STAND=`hp/vit/guardian/killHeal`、OPENER=`firstStrike/firstTurnAttack/fullHpDamage/followUp`、BLOOD_WAND=`hp/vit/int/pie/arcane/devotion`、PURIFY_RING=`antiUndead/antiDemon/arcane/devotion`、TRAP_EATER=`trapBonus`、CURSE_KEEPER=なし、GIANT_SLAYER=`antiDragon/antiBeast/antiSpirit`、THORN_SHIELD=`guardian/def/vit/hitFlinch`、EXECUTIONER=なし。

## 前回値との対比（参考のみ）

前回の#271診断は`IDENTIFICATION_POLICY=legacy`、`SIM_RUNS=2000`、calibration=1000、`SIM_PARALLEL=8`で、現行モデル/規約と一致しない。さらにPR #441以前の測定バグを含むため、下表の差分を効果として読まない。

| 指標 | 前回/既知値（無効条件） | 今回 complete（threshold） | 読み方 |
| --- | ---: | ---: | --- |
| B5 entrant N | 504 | 123 | 分母が異なる。差分は効果ではない |
| B5死亡率 | 44.6% | 29.3% [22.0,37.8] | `legacy`、バグ、env差を含むため比較不能 |
| core+対応support N | 62/504 | 13/123 | 今回もA3母数不足。改善したと結論しない |
| 全run最終core有（今回の供給監査） | PR #442の32.4%（別estimand） | 73.4% [69.4,77.1] | env/分母差があるため効果比較ではない |
| 全run最終core 2+ | PR #442の14.0%（別estimand） | 44.0% [39.7,48.4] | 同上 |

core供給の前提は変わったが、旧値と今回値は同じenv・同じestimandで取り直したbefore/afterではない。今回の全run供給率は確認材料であり、A3の合格根拠ではない。

## 参考: flee=never

受入判定には使わない。completeはB5 N=162、死亡27.2% [20.9,34.5]、depth相関`r=0.178` [0.024,0.323]、core-poolsはB5 N=145、死亡32.4% [25.3,40.4]、depth相関`r=0.220` [0.060,0.370]。thresholdとの違いから、flee方針をゲーム制約や効果の原因とは解釈しない。

## 前提変更の寄与

`powder`既定化、PR #441の逃走無限ループ/worker結果汚染修正、PR #442のcore供給変化は、今回の取り直しまでに同時に変わった。before/afterの因子分解や同一runの反実仮想を測っていないため、どれが結果を動かしたかは**切り分け不能**。特にA1/A2の成立をcore供給だけの効果とは主張しない。

測定監査では、7×500の3,500行をscenario/run/classキーで照合し重複0。B5死亡の主な発生源はcompleteでboss23、normal9、trap4、core-poolsでboss20、normal5、trap7だった。機構を説明できない差は設計判断に使わず、必要なら別factorial測定で切り分ける。

## 出力と検証

threshold:

- raw JSONL SHA-256: `51abc04bd8204cb8f3f1d7a650f36161f1dc78de19ebec3f49193c6dc45d6f30`
- summary JSON SHA-256: `200ede4b40497888f7ec36c7af09982b393d4c9610e6b6ad843eab9b13ef4099`
- calibration wall-clock: 8.493s
- simulation wall-clock: 6.615s
- total CPU: 97.844s

flee=never参考:

- raw JSONL SHA-256: `025f4c7ef73b65bdcd8d192516d73a1b88b7284d6fd981dd3100441ea217bc0d`
- summary JSON SHA-256: `c9e71d8042b36df3c3f352d4a710a97068beba98410bbfda0ecda3f0b8ecb271`
- calibration wall-clock: 9.803s
- simulation wall-clock: 7.955s
- total CPU: 117.454s

適用したレビュー: `.agents/balance-simulation.md`。採用事項は現行既定run数、powder、7シナリオ、実配置/実行経路、Wilson/Fisher、職内centering、N<30未確定、出力監査。UI/mobile・game-logicのレビューは、Phase 1で`src/`とゲームルールを変更していないため対象外。

raw JSON/JSONLは再現用の未追跡出力であり、リポジトリにはこの要約と測定スクリプトだけをコミットする。
