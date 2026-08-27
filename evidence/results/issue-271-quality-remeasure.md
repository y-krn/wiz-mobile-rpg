# Issue #271 Phase 1: quality remeasurement（レビュー差し戻し対応）

Refs #271。Phase 1は測定のみ。`src/`の変更なし。深層の脅威設計は未着手。

## 結論

旧PR #443の「`workshop-complete`でA2成立」は、Nを増やした再測定で**撤回**する。

主判定（`workshop-complete`、threshold、B5 entrant N=524）:

- **A1 成立**。Q4−Q1のB5死亡率差は-19.1pp、95% CI [-29.4pp, -8.7pp]。Q1→Q4は単調減少し、Q4は16.0% [10.7%, 23.3%]で30.9%以下。隣接quartileのCIは重なり、kneeは**有意差なし**。
- **A2 不成立**。class-centeredな`combatBuildScore × depth`は`r=0.178`、95% CI [0.093, 0.259]。CI下限は正だが、点推定が0.20未満。補助endpointのB5突破は`r=0.129` [0.044, 0.213]で同方向。
- **A3 不成立**。二値のcore有無を廃止し、core個数の順序軸へ変更。combat core個数軸は成立したが、core+対応supportはN=54/470でCIが0を跨ぐため不成立。設計意図の2条件を同時には満たさない。

実ランの主状態（`workshop-core-pools`、threshold、B5 entrant N=507）:

- **A1 不成立**。Q4−Q1は-0.9pp、95% CI [-12.2pp, +10.5pp]。Q4死亡率29.6% [22.3%, 38.1%]はゲート内だが、Q4で点推定が上がる非単調で、差のCIも0を跨ぐ。
- **A2 不成立**。`combatBuildScore × depth`は`r=0.181`、95% CI [0.096, 0.264]。補助endpointの突破は`r=0.163` [0.077, 0.247]。両方ともCI下限は正だが、主endpointの点推定は0.20未満。
- **A3 不成立**。combat core個数軸、core+対応supportとも設計方向とCI条件を満たさない。対応supportはN=39/468で、N<30ではない。

両状態のNはA2の近似80% power目安194を十分に超えた。それでもrは0.178/0.181に収束し、旧500-run値の0.209/0.093の開きは標本変動で説明できる。今回の結果では、N不足を理由にA2を成立とはしない。

## 測定条件とN設計

各シナリオ2,200 run、calibration 100 run。`SIM_PARALLEL`は未指定（実解決値15）。seedは271。`IDENTIFICATION_POLICY=powder`、主経路は`workshop-complete`、基本4職（Fighter / Thief / Priest / Mage）、`FLEE_POLICY=threshold`。`workshop-empty`、`workshop-stats`、`workshop-gear`、`workshop-blood-wand`、`workshop-blood-wand-spells`、`workshop-core-pools`、`workshop-complete`の7シナリオを同一envで測定した。

500-run時点のB5 entrant率はcomplete 123/500=24.6%、core-pools 127/500=25.4%。A2のN=194には約800 runで届く計算だが、A3の対応support少数群も両状態でN≥30にする必要があった。1,500-run確認でcore-poolsの対応supportは25件だったため、少数群に余裕を持たせて2,200 runへ増量した。最終B5 entrantはcomplete 524、core-pools 507、対応supportは54/524、39/507となった。

departure kitは`TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`。罠は`conservative` / `ev`、状態回復は`smart`、merchant補充は`missing`、eliteは`avoid`。実行は`generateRunFloor`から実配置を作り、現行`simulateRun`の戦闘・罠・装備・消耗品・状態回復・帰還経路を通した。式だけの再現ではない。

`FLEE_POLICY=never`は参考値のみ取得した。B10の受入基準は定義していない。

## 7シナリオ結果（threshold）

率はWilson 95% CI。core供給は全2,200 runの最終装備、`core+support`はB5 entrant内の条件付き値。

| scenario | B5 entrant N | B5死亡 | B5突破 | 平均到達floor | material EV/time | 最終core有 | 最終core 2+ | B5 core+support |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| empty | 307 | 36.5% [31.3,42.0] | 27.0% [22.4,32.3] | 3.003 | 0.1518 | 53.3% | 24.2% | 9.8% |
| stats | 358 | 36.0% [31.2,41.1] | 27.9% [22.9,33.5] | 3.145 | 0.1607 | 60.4% | 27.0% | 6.7% |
| gear | 438 | 28.1% [24.1,32.5] | 29.7% [25.7,34.2] | 3.416 | 0.1730 | 63.0% | 31.8% | 9.1% |
| blood-wand | 469 | 29.6% [25.7,33.9] | 33.0% [28.9,37.5] | 3.531 | 0.1683 | 64.5% | 32.3% | 11.1% |
| blood-wand-spells | 488 | 26.8% [23.1,30.9] | 36.3% [32.1,40.6] | 3.563 | 0.1655 | 65.3% | 33.3% | 12.7% |
| core-pools | 507 | 27.6% [23.9,31.7] | 36.3% [32.2,40.6] | 3.624 | 0.1699 | 68.6% | 37.3% | 7.7% |
| complete | 524 | 25.4% [21.8,29.3] | 35.9% [31.9,40.1] | 3.714 | 0.1709 | 73.0% | 42.9% | 10.3% |

## A1: completeのquartile

quartileはB5 floor-startの`combatBuildScore`を職内順位化して作成。endpointはB5で死亡したか。

| Q | N | score平均 | B5死亡率 |
| ---: | ---: | ---: | ---: |
| Q1 | 131 | 31.48 | 35.1% [27.5,43.6] |
| Q2 | 131 | 40.15 | 29.0% [21.9,37.3] |
| Q3 | 131 | 50.77 | 21.4% [15.2,29.2] |
| Q4 | 131 | 70.93 | 16.0% [10.7,23.3] |

Q4−Q1差は-19.1pp [-29.4,-8.7]。3条件（差のCI上限<0、単調減少、Q4≤30.9%）をすべて満たす。隣接CIはすべて重なるため、点推定の最大落差をkneeとは扱わない。

## A2: class-centered相関

職ごとに`combatBuildScore`とendpointを平均中心化してからPearson rを計算し、Fisher zの95% CIを付けた。

| state | B5 N | depth r | B5突破 r（補助） | A2 |
| --- | ---: | --- | --- | --- |
| complete | 524 | 0.178 [0.093,0.259] | 0.129 [0.044,0.213] | 不成立（点推定<0.20） |
| core-pools | 507 | 0.181 [0.096,0.264] | 0.163 [0.077,0.247] | 不成立（点推定<0.20） |

r=0.20でFisher CI下限>0となる最小Nは97。近似80% powerの目安は194。両状態ともNは十分だが、点推定が閾値に届かない。両CIは大きく重なるため、completeとcore-poolsのr差に有意な状態差があるとは判定しない。

## A3: feature対比の再定義

旧A3のcore有無は、供給改善後にB5でほぼ全員がcore有となり対照群を失った。そのため、**B5 floor-start時点のcore個数を0 / 1 / 2 / 3+の順序軸**として扱う。個数はcore単体、combat core、economy coreに分け、3+に上限化する。

順序軸の効果は職内固定効果を除いた線形傾き（個数が1段増えたときの差）とし、95% CIを併記する。全B5 N≥194、かつ中心となるlevel 1/2が各N≥30をデータ十分条件とする。0と3+のtailは分布確認用であり、tail単独の結論は出さない。これは「coreがあるだけ」を合格条件にせず、core数の増加、combat coreの増加、対応supportの噛み合わせを別々に問うためである。

対応supportは設計意図を直接表すため、`core+対応support`だけは二値対比を維持した。今回はこちらも有/無の両群N≥30を満たす。

### complete（主判定）

効果は突破・到達floorが正、死亡が負。率の差はpp、到達floorはfloor/個数。

| feature | level / 有無 N | 突破差 | 死亡差 | 到達floor差 | 判定 |
| --- | --- | ---: | ---: | ---: | --- |
| core個数 | 0/1/2/3+=9/118/235/162 | +2.6pp [-1.7,+6.9] | -4.0pp [-8.7,+0.8] | +0.210 [+0.014,+0.407] | 不成立 |
| combat core個数 | 0/1/2/3+=78/290/143/13 | +5.6pp [+0.8,+10.4] | -5.6pp [-11.0,-0.3] | +0.316 [+0.097,+0.535] | **成立** |
| economy core個数 | 0/1/2/3+=113/344/67/0 | -2.7pp [-8.5,+3.1] | +0.6pp [-5.9,+7.0] | -0.007 [-0.272,+0.258] | 不成立 |
| core+対応support | 54/470 | +2.5pp [-7.3,+12.3] | -7.5pp [-18.7,+3.7] | +0.352 [-0.144,+0.848] | **不成立** |

combat core個数軸は3 endpointすべて設計方向でCIが0を跨がない。一方、対応supportは方向の点推定こそ設計方向だが、3 endpointともCIが0を跨ぐため、A3全体は不成立。

### core-pools（主状態の併記）

| feature | level / 有無 N | 突破差 | 死亡差 | 到達floor差 | 判定 |
| --- | --- | ---: | ---: | ---: | --- |
| core個数 | 0/1/2/3+=22/124/221/140 | +5.4pp [+0.9,+10.0] | -1.2pp [-5.9,+3.4] | +0.309 [+0.115,+0.503] | 不成立 |
| combat core個数 | 0/1/2/3+=102/277/108/20 | +3.7pp [-1.4,+8.8] | +1.7pp [-3.5,+6.9] | +0.242 [+0.024,+0.460] | 不成立 |
| economy core個数 | 0/1/2/3+=126/307/74/0 | +4.7pp [-1.3,+10.8] | -4.5pp [-10.7,+1.6] | +0.270 [+0.010,+0.529] | 不成立 |
| core+対応support | 39/468 | +10.5pp [-4.0,+25.0] | -9.4pp [-22.0,+3.3] | +0.565 [-0.084,+1.215] | **不成立** |

Nは足りているが、combat core個数と対応supportの両方が設計方向・CI条件を満たさない。

## 同一条件内で確認できたcore供給と噛み合わせの分離

今回の7シナリオは同一envなので、内部の方向比較は有効な観測である。工房投資を進めると全run最終core有はempty 53.3%からcomplete 73.0%へ上がるが、B5 entrantのcore+対応supportはempty 9.8%からcomplete 10.3%にほぼ留まる。core-poolsでも最終core有68.6%に対し対応supportは7.7%だった。

これは「coreの入手」から「対応supportの噛み合わせ」へ律速候補が移ったことと整合する。ただし、同一runの反実仮想やsupport供給の因果操作はしていないため、**律速であると断定せず、今回観測された設計上の警告**として扱う。coreが増えても対応supportが増えないなら、深層の脅威をビルドで対策できるランは増えない可能性がある。

## `combatBuildScore`の定義と二重計上確認

判定中心指標はB5 floor-start snapshotの

`combatBuildScore = equipmentStatScore + combatCoreScore`

である。

- `equipmentStatScore`は、現在装備キャラクターと装備を空にした同一キャラクターの`getBaseEquipmentScore`の差。
- `getBaseEquipmentScore`の重みは、weapon ATK×2、defense×2、max HP×0.25、STR×1、VIT×1、INT×0.5、PIE×0.5、AGI×0.25、guardian×0.2、spellGuard×0.15、followUp×0.15、firstStrike×0.1、arcane×0.1、devotion×0.1。
- `combatCoreScore`は各coreの手書き固定値の足し算ではなく、現行実行経路をcalibrationして、LAST_STAND / GIANT_SLAYER / EXECUTIONER / OPENER / BLOOD_WAND / PURIFY_RING / TRAP_EATER / THORN_SHIELDの実発動率・対象率・ダメージ/回復・罠結果などを合成した値。
- `CORE_CURSE_KEEPER`は`combatCoreScore`では0。呪いによる全statsは`getCharAllStatsAffixBonus`経由で`getBaseEquipmentScore`に一度だけ入る。受動coreを`combatCoreScore`に再加算していないことを確認した。

対応supportの定義は、coreごとに次を使った：LAST_STAND=`hp/vit/guardian/killHeal`、OPENER=`firstStrike/firstTurnAttack/fullHpDamage/followUp`、BLOOD_WAND=`hp/vit/int/pie/arcane/devotion`、PURIFY_RING=`antiUndead/antiDemon/arcane/devotion`、TRAP_EATER=`trapBonus`、CURSE_KEEPER=なし、GIANT_SLAYER=`antiDragon/antiBeast/antiSpirit`、THORN_SHIELD=`guardian/def/vit/hitFlinch`、EXECUTIONER=なし。

## 前回値との対比（参考のみ）

前回の#271診断は`IDENTIFICATION_POLICY=legacy`、`SIM_RUNS=2000`、calibration=1000、`SIM_PARALLEL=8`で、現行モデル/規約と一致しない。さらにPR #441以前の測定バグを含むため、下表の差分を効果として読まない。

| 指標 | 前回/既知値（無効条件） | 今回 complete（threshold） | 読み方 |
| --- | ---: | ---: | --- |
| B5 entrant N | 504 | 524 | envとrun数が異なる。差分は効果ではない |
| B5死亡率 | 44.6% | 25.4% [21.8,29.3] | `legacy`、バグ、env差を含むため比較不能 |
| core+対応support N | 62/504 = 12.3% | 54/524 = 10.3% | 前回値との厳密比較は不可。今回A3は別estimand |
| 全run最終core有 | PR #442の32.4%（別estimand） | 73.0% [71.2,74.9] | env/分母差があるため効果比較ではない |
| 全run最終core 2+ | PR #442の14.0%（別estimand） | 42.9% [40.8,44.9] | 同上 |

前回値は無効条件の参考値であり、今回の差を効果として扱わない。一方、今回7シナリオ内のempty→completeのcore有率とcore+support率の差は同一条件内の観測として報告できる。

## 参考: flee=never

受入判定には使わない。2200-runでcompleteはB5 N=645、死亡30.4% [27.0,34.0]、depth相関`r=0.196` [0.121,0.269]。core-poolsはB5 N=585、死亡32.3% [28.6,36.2]、depth相関`r=0.201` [0.122,0.278]。B10の受入基準は今回定義していない。

## 前提変更の寄与

`powder`既定化、PR #441の逃走無限ループ/worker結果汚染修正、PR #442のcore供給変化は、今回の取り直しまでに同時に変わった。before/afterの因子分解や同一runの反実仮想を測っていないため、どれが結果を動かしたかは**切り分け不能**。今回のA2不成立やsupport停滞を、いずれか1件だけの効果とは主張しない。

測定監査では、7×2,200の15,400行をscenario/run/classキーで照合し重複0。B5死亡の主な発生源はcompleteでboss84、normal27、trap22、core-poolsでboss85、normal31、trap24だった。機構を説明できない差は設計判断に使わず、必要なら別factorial測定で切り分ける。

## 出力と検証

threshold:

- raw JSONL SHA-256: `81996dab57539b968bc9a4fcccc493a502f2ca2c592ce3ca2190af553f7f9c9a`
- summary JSON SHA-256: `5a55d63b2064616b086c9ed915668467f515c28742f795158515fcd9f91331e0`
- calibration wall-clock: 8.487s
- simulation wall-clock: 24.676s
- total CPU: 366.497s

flee=never参考:

- raw JSONL SHA-256: `e4df914f7cb35f965147efb2f57653c0a9ef5d05e796b8f3f156cec9dd0e8d3a`
- summary JSON SHA-256: `b447209b7f7856ed9d9b131ae5298b828dbe6a32493fb266a0ed306f6618acb1`
- calibration wall-clock: 10.198s
- simulation wall-clock: 32.001s
- total CPU: 474.663s

適用したレビュー: `.agents/balance-simulation.md`。採用事項は現行既定calibration、powder、7シナリオ、実配置/実行経路、Wilson/Fisher、職内centering、N≥194、A3の順序軸、N<30未確定、出力監査。UI/mobile・game-logicのレビューは、Phase 1で`src/`とゲームルールを変更していないため対象外。

raw JSON/JSONLは再現用の未追跡出力であり、リポジトリにはこの要約と測定スクリプトだけをコミットする。
