## 結論

今回は実装せず、B5 の「質依存化」を判定する基準と設計案だけを定義する。

結論は、**B5 単体で質依存性を測る母数はあるが、現行 core/support が評価の場を作れているとは言えない**。`combatBuildScore` の上位/下位では死亡率に勾配が見える一方、#271 の本来の判定対象である combat core、core+対応support の効果はすべて 95% CI が 0 を跨ぐ。さらに `CORE_BLOOD_WAND` は B5 boss 内で発動機会が観測されるのに実発動が 0 だった。

主経路は `workshop-complete`、基本4職、`FLEE_POLICY=threshold` とする。`FLEE_POLICY=never` は #392 の B5 安全性を照合する参考値に限り、B10 の受入基準は今回定義しない。

## 測定条件

`generateRunFloor` から実配置を生成し、戦闘・罠・装備・消耗品・状態回復薬6種・帰還の翼は既存の `src/` 経路を呼んだ。式の写経はしていない。クラス内 centering で職業差を除き、率は Wilson 95% CI、相関は Fisher z 95% CI、差は 95% CI を併記した。N<30 は未確定として扱う。

主軸の全 env は次の通り。

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
FLEE_POLICY=threshold
FLEE_HP_THRESHOLD=0.35
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
ELITE_POLICY=avoid
SIM_SCENARIOS=workshop-complete
SIM_PARALLEL=8
```

`workshop-complete` は `pool_blood_wand` / `pool_deep_spells` を含む買い切り状態であり、旧 ID `workshop-unlocked` は使っていない。

主軸の B5 entrant は 504/2000。B5 死亡は 225/504 = **44.6% [40.4,49.0]**、B5→B6 突破は 36/504 = **7.1% [5.2,9.7]**。B5 死亡の fatal source は boss 182、通常戦 27、罠 16。全 run では罠 516、通常戦 272、boss 182 であり、#271 単独で罠を扱わない前提と整合する。

参考の `FLEE_POLICY=never` は B5 entrant 573、B5 死亡 **27.4% [23.9,31.2]**、`combatBuildScore×depth` の職内相関 **r=0.153 [0.072,0.232]**。これは #392 の照合値であって、B10 の 15.0% を今回へ持ち込む根拠にはしない。

## A. 測れる受入基準

### A1. 推奨する主指標: 職内 quality quartile の B5 生死分離

B5 到達時の `combatBuildScore` を職ごとに順位化して Q1〜Q4 に分け、B5 entrant の死亡率を測る。深度だけではなく、B5 で死亡したかを endpoint にする。

次回の受入基準は以下の三つを同時に満たすものとする。

1. Q4−Q1 の B5 死亡率差の 95% CI 上限が 0 未満。
2. Q1→Q4 の死亡率が単調減少する（点推定の knee を探索し、隣接区間の CI 重なりを含めて knee が無ければ「有意差なし」と報告する）。
3. Q4 の死亡率点推定が 30.9% 以下。30.9% は B5 の既存安全性ゲートであり、B10 の no-flee 由来 15.0% とは別物。

今回の現在値は次の通り。

| 職内 quartile | N | combatBuildScore 平均 | B5死亡率 | B5突破率 |
|---|---:|---:|---:|---:|
| Q1 | 127 | 32.8 | 50.4% [41.8,58.9] | 3.9% [1.7,8.9] |
| Q2 | 127 | 38.6 | 48.0% [39.5,56.7] | 5.5% [2.7,10.9] |
| Q3 | 127 | 43.5 | 48.0% [39.5,56.7] | 7.9% [4.3,13.9] |
| Q4 | 123 | 49.8 | 31.7% [24.1,40.4] | 11.4% [6.9,18.2] |

Q4−Q1 は死亡 **−18.7pp [−30.7,−6.7]**、突破 **+7.4pp [+0.9,+14.0]**。したがって「score の上位は生存しやすい」という候補は現時点で有望だが、Q4 の 30.9% ゲートを点推定でも超え、Q2/Q3 に明確な knee はない。**これだけで core/support による評価の場が成立したとは判定しない。**

### A2. 連続指標: class-centered 相関

相関だけを主基準にすると N の大きさで極小効果を拾うため、次の実務閾値を置く。

- `combatBuildScore×depth`: **r の点推定 0.20 以上、95% CI 下限 > 0**。
- `combatBuildScore×B5突破`: 補助 endpoint として同じ方向を確認する。

r=0.20 は約 4% の分散を説明する実務上の最小 signal として置く。p 値だけでなく CI と点推定を併用する理由は、#271 で CI が 0 を跨ぐことを否定根拠としてきたためである。これは既存 canon の値ではなく、オーナーが承認すべき測定基準案。

現在値（threshold）は、

- depth: **r=0.061 [−0.026,0.148], N=504**
- B5突破: **r=0.072 [−0.015,0.159], N=504**
- B5死亡: **r=−0.106 [−0.192,−0.019], N=504**

であり、depth/突破は不成立。no-flee の r=0.153 は threshold の主判定に流用しない。

### A3. 意図した build feature の差

「core がある」ではなく、次の feature を別々に測る。効果は「有−無」、職内 centering 後の B5 entrant endpoint とする。各群 N≥30 を最低条件にする。

| feature | B5突破差 | B5死亡差 | 到達深度差 |
|---|---:|---:|---:|
| core（任意） N=403/101 | −0.17pp [−5.74,+5.39] | +5.06pp [−3.97,+14.09] | +0.035階 [−0.183,+0.252] |
| combat core N=280/224 | +0.46pp [−4.02,+4.94] | +0.39pp [−7.24,+8.03] | −0.013階 [−0.207,+0.180] |
| core+対応support N=62/442 | +2.66pp [−5.04,+10.35] | −2.14pp [−13.41,+9.13] | +0.000階 [−0.269,+0.270] |

受入条件は、combat core と core+対応support を別々に判定し、**採用したB5設計で事前に指定した feature の方向が設計意図と一致し、95% CI が 0 を跨がないこと**。core があるだけで合格にはしない。現在は三つとも不成立。matched は N=62 なので母数不足ではないが、CI が広く、設計上の signal が出ていない。

## B. core が効かない理由

### B1. 16種の B5 到達時点の装備率と突破率

突破率は「その core を B5 開始時に装備していた run のうち、B5 を突破した率」。括弧内は 95% CI。`†` は装備 run N<30 で未確定。対応support列は同じ B5 snapshot に対応 support が1つ以上同居した run 数であり、raw item 抽選確率そのものではない。

| core | enabled | B5装備率 (N/504) | 装備runのB5突破率 | 対応support同居 |
|---|:---:|---:|---:|---:|
| CORE_LAST_STAND† | ○ | 5.8% [4.0,8.1] (29) | 10.3% [3.6,26.4] (3/29) | 15/29 |
| CORE_OPENER | ○ | 9.9% [7.6,12.8] (50) | 4.0% [1.1,13.5] (2/50) | 6/50 |
| CORE_BLOOD_WAND† | ○ | 5.4% [3.7,7.7] (27) | 7.4% [2.1,23.4] (2/27) | 21/27 |
| CORE_PURIFY_RING† | ○ | 5.4% [3.7,7.7] (27) | 0.0% [0.0,12.5] (0/27) | 6/27 |
| CORE_TRAP_EATER | ○ | 8.3% [6.2,11.1] (42) | 9.5% [3.8,22.1] (4/42) | 2/42 |
| CORE_CURSE_KEEPER† | ○ | 3.8% [2.4,5.8] (19) | 10.5% [2.9,31.4] (2/19) | 0/19 |
| CORE_GIANT_SLAYER | ○ | 7.3% [5.4,10.0] (37) | 16.2% [7.7,31.1] (6/37) | 3/37 |
| CORE_REARGUARD | × | 0.0% [0.0,0.8] (0) | — | 0/0 |
| CORE_THORN_SHIELD | ○ | 13.7% [11.0,17.0] (69) | 4.3% [1.5,12.0] (3/69) | 21/69 |
| CORE_EXECUTIONER† | ○ | 3.2% [2.0,5.1] (16) | 6.3% [1.1,28.3] (1/16) | 0/16 |
| CORE_SNEAK_STEP | ○ | 16.7% [13.7,20.2] (84) | 7.1% [3.3,14.7] (6/84) | 9/84 |
| CORE_TOMB_RAIDER | ○ | 7.7% [5.7,10.4] (39) | 5.1% [1.4,16.9] (2/39) | 3/39 |
| CORE_KEEN_EYE† | ○ | 3.6% [2.3,5.6] (18) | 0.0% [0.0,17.6] (0/18) | 3/18 |
| CORE_CAMP_MASTER | ○ | 19.2% [16.0,22.9] (97) | 6.2% [2.9,12.8] (6/97) | 9/97 |
| CORE_BOUNTY_HUNTER† | ○ | 3.8% [2.4,5.8] (19) | 5.3% [0.9,24.6] (1/19) | 3/19 |
| CORE_SCHOLAR_EYE† | ○ | 5.2% [3.5,7.5] (26) | 15.4% [6.2,33.5] (4/26) | 5/26 |

enabled は 15/16、直接防御 core は 0/16。したがって「core が存在しない」のではなく、B5で問われる combat core が少数 run にしか到達せず、到達しても効果の組み合わせが結果を分けていない。

### B2. 発動機会と実発動の切り分け

B5 boss に到達した「B5開始時 core 装備 run」を分母にして、boss encounter 内の実ログを調べた。分母は再逃走を重複させず run 数にした。

| core | B5 boss装備 run | 実発動 run / event |
|---|---:|---:|
| LAST_STAND | 18 | 11 / 17 |
| OPENER | 27 | 14 / 35 |
| BLOOD_WAND | 19 | **0 / 0** |
| PURIFY_RING | 16 | 0 / 0 |
| GIANT_SLAYER | 25 | 20 / 60 |
| THORN_SHIELD | 50 | 38 / 140 |
| EXECUTIONER | 9 | 0 / 0 |

`BLOOD_WAND` は `workshop-complete` の `pool_blood_wand=1` で抽選対象になる。B5装備は 27 run、同じ run 群の B5 boss 診断では、推奨攻撃呪文の MP不足かつ HP支払い可能な「発動候補」round が **43** あったのに、実際の「生命を魔力へ変えた！」は 0。全 run 観測でもその候補は 101 回あった。

これは供給不足だけでは説明できない。現行の action selector は MP が足りないと `fight` を返し、Blood Wand のログ/支払いは spell resolution 経路にしかないため、**「実装されているが、その action path へ届かない」欠陥**である。#329 最新コメントで旧 estimand を使わずに残した「実装済みでも届かない」型の診断と同じ分類になる。

`PURIFY_RING` は「撃破時」効果なので、bossを倒せていない B5 run では発動しない。B5装備 run の run 全体では対象 tag kill 92、MP空きの対象 kill 50 があるため、効果経路自体は通常戦で発動可能だが、B5 bossの評価機会としては不十分である。`TRAP_EATER`、経済 core、`CURSE_KEEPER` は boss event 発動を想定する core ではないため、bossログ 0 を欠陥とは数えない。`EXECUTIONER` は N<30 相当の boss run で未確定。

### B3. support 供給・予算

現行 generator の B5 budget は magic=3、rare=10、epic=16。core は全て cost=10、rare は core抽選時に coreだけ、epic は core+support×2 で core後の残予算6。support cost は1〜3なので、**epic では core+対応support の生成は予算上可能**。深層 pool weight も combat=3 / economy=1 で、combat coreを排除していない。

実測でも B5 snapshot の core+対応support 同居は全体 62/504=12.3%。BLOOD_WAND は 21/27、THORN_SHIELD は 21/69 で同居している。従って「support poolに全く出ない」問題ではなく、(1) core個別の到達 N が少ない、(2) 同居しても boss の対応機会がない、(3) Blood Wand のように発動 action path が閉じている、の複合と診断する。

## C. 設計案

### 推奨1: B5 bossを「core/supportの対応を問う」専用試験にする

B5だけに、既存の詠唱崩し窓とは別に、予兆→counter→結果が明示される2軸目を設ける。既存 core/support の条件を使い、直接防御 core は追加しない。例えば、現在すでに実発動している `GIANT_SLAYER` / `THORN_SHIELD` / `LAST_STAND` と、`antiDemon`・`guardian`・`firstStrike` などの対応 support を、同じ boss action の前後で観測可能にする。B6〜B9の敵強化、報酬、素材、banking、罠は変更しない。

期待する測定の動きは、A1の Q4−Q1 と A3の combat core / matched の CI が、設計意図の方向で 0 を跨がなくなること。効果量とB5死亡率は未測定。既存の B5 安全性 gate（#392 と同じ no-flee 軸の point d≤30.9%）を維持し、threshold は主軸として現行 44.6% から悪化させないことを同時に確認する。

### 推奨2: 供給ではなく「対応組み合わせの到達可能性」を pool内で保証する

報酬量・素材・bankingを変えず、既存の epic/core+support budget の範囲で、B4〜B5到達前の装備生成が選んだ combat core に対して少なくとも1つ対応 support を残す方式を検討する。狙いは B5 snapshot の対応support同居 N を増やし、各重点 core/support の測定 N を30以上にすること。現状は BLOOD_WAND 21/27、PURIFY_RING 6/27 など、個別には N<30 がある。

対応組み合わせの N を増やすことは A3 の CI を狭める見込みだが、効果の方向・B5死亡ハザードの改善量は未測定。生成確率を変える場合は、magic/rare/epic、slot、poolGroup、curse/identification の実経路を再測定し、単発値で採用しない。

### 推奨3: Blood Wand の action path を先に閉じる

`getBloodWandOpportunity` が数える候補を、MP不足時にも `getSpellPayment` → `paySpellCost` → spell resolution へ渡す。今回の B5 boss 診断では候補43に対し実発動0なので、ここは設計案の中で最も再現性の高い欠陥候補である。

期待値は、候補→実発動の coverage が 0 から正の値になり、BLOOD_WAND を評価軸へ戻せること。生存率・A3の効果量は未測定なので、修正後に候補 N、実発動 N、B5死亡/突破の CI を別々に測る。coverage の閾値は 25/50/75% を掃引して knee を採り、先に 80% などの数字を固定しない。

## what-if と却下案

- B5 boss の詠唱を無効化する scratch-only what-if（threshold、N=1000、B5 entrant=247）は、B5死亡 **32.0% [26.5,38.0]**、boss fatal source **25.1% [20.1,30.9]**。boss spellを消すだけでも全体のCI上限は30.9を超え、combat core差 **+0.33pp [−4.14,+4.80]** は 0 を跨いだ。B5 bossを弱くするだけでは quality gate にならないため却下する。
- `combatBuildScore` に matched bonus を 0/5/10/15/20 加える観測上の重み掃引では、depth r は 0.061/0.058/0.054/0.048/0.043、突破 r は 0.072/0.076/0.077/0.075/0.073で、両 endpoint とも CI が 0 を跨いだまま。死亡相関は低い bonus では負方向の CI が 0 を除外するが、bonus 20で 0 を跨ぎ、安定した knee ではない。scoreの重み合わせだけでは quality gate を作れないため却下する。
- 直接防御 core の追加は PR #384 の canonに反するため今回の解にしない。状態耐性 affix も状態回復薬で代替され、既存測定の到達差 +0.03階 [−0.51,+0.57] のため却下。
- 深度直接延長、到達ボーナス、報酬増、深度連動の延命/被害軽減、素材/banking、罠、B6〜B9の難化は制約違反または #352/#369 の管轄なので対象外。

## 推奨順序

1. Blood Wand の発動経路を直し、B5 bossの候補→発動 coverage を再測定する。
2. B5専用 counter/予兆と対応supportの同居を設計し、pool/予算の掃引を行う。
3. threshold を主軸に N=2000、基本4職、workshop-complete で A1〜A3を再測定する。no-flee は #392 の30.9% gate照合だけに使う。
4. A1の安全性、A2の intended feature、A3の連続指標の全てが成立するまで、#271の「質依存化」達成とは判定しない。

## 限界

- threshold の B5 entrant は N=504で十分だが、個別 core は N<30 が多い。†の突破率を確定値として使わない。
- B5 snapshot の core+support同居は実生成後の装備状態であり、raw抽選確率と因果効果を分離していない。
- class centering は職業差を除くが、装備供給・到達選択・逃走選択の交絡を除去しない。観測データなので因果効果ではない。
- B10 は threshold entrant N=18であり、今回の判定対象外。#329は最新コメントの estimand だけを参照し、旧推定は使っていない。
- #271単独では B1〜B4 の罠/通常戦損耗を解消できない。B5 bossの質依存化を進めても #264 の深度目標全体を単独で保証しない。

計測コードは `scratch/sim_issue_271_quality.js` のみ。`src/` のゲーム実装変更、commit、PRは行っていない。
