# Issue #271 新基準再測定

Refs #475, #271, #467, #470, #474, #445, #461。`src/` と balance 値は変更していない。

## 結論

**#271 は「B5時点での質依存が成立」として解決。** 主状態 `workshop-complete` で A1 と A3 が両方成立した。
判定対象はB5のみ。B10以降の試験は到達性の課題 #264 に残す。

## A1: `workshop-complete` のみ

B5 entrant 全体 N=3,176、職内 quartile。B5死亡率は Wilson 95% CI。

- Q4−Q1（職内 centered、正規近似95% CI）: **−9.3pp [−13.6, −5.1]**。CI上限<0
- Q1: 31.8% [28.6, 35.1]、Q2: 26.9% [23.9, 30.1]、Q3: 23.7% [20.9, 26.8]、Q4: 22.4% [19.7, 25.5]
- Q4≤30.9%: 成立
- 職層調整 Cochran–Armitage: z=−4.569、減少方向 p=0.00000246、最小セルN=39
- 隣接差（Q次−Q前、正規近似95% CI）:
  - Q1→Q2: −4.9pp [−9.3, −0.6]
  - Q2→Q3: −3.2pp [−7.4, +1.0]
  - Q3→Q4: −1.2pp [−5.3, +2.8]

隣接差CI下限>0の統計的反転なし。点推定反転もなし。A1 **成立**。

## 多重比較の感度記録（判定は変更しない）

受入 family 10（A1主条件3 + 単調性補助4 + A3 endpoint3）に Bonferroni を適用すると、
各両側区間は α=.005、99.5% CI（z=2.807）となる。下記は、既存の最終 summary に記録された
未丸めの estimate/95% CI から標準誤差を戻して計算した補正後区間であり、表示は丸めている。

- A1 Q4−Q1: 約 **−9.3pp [−15.4, −3.2]**。上限はなお0未満。trend p=0.00000246は
  Bonferroni調整後 **0.0000245842** で、α=.005を下回る。
- A3突破: 約 **+3.5pp [+0.7, +6.3]**。0を跨がず、補正後も成立方向。
- A3死亡: 約 **−2.7pp [−5.7, +0.3]**。95%では成立だが、補正後は0を跨ぎ、補正後判定では不成立。
- A3終了到達floor: 約 **+0.182 [+0.053, +0.312]**。0を跨がず、補正後も成立方向。

したがって、元の受入判定（通常の95% CI）での A3 **成立**は変更しないが、family-wise
補正後の頑健性は3 endpointで一様ではなく、死亡だけ境界を越える。測定・基準・結論・balance値は変更しない。

## A3: core個数軸のみ

#467で提示された値と対応する B5 `combatCoreCount` 軸を、canonの「core個数軸」として判定した。
N=3,176、level=0/1/2/3+ は 567/1,731/789/89。職内 centered、正規近似95% CI。

- B5突破: **+3.5pp [+1.5, +5.5]**
- B5死亡: **−2.7pp [−4.8, −0.6]**
- 終了到達floor: **+0.182 [+0.092, +0.273]**

3 endpointすべて設計方向、CIは0を跨がない。A3 **成立**。
`core + 対応support` は判定へ使用しない。

参考として全core個数（combat以外も含む）軸も突破 +2.4pp [+0.6, +4.1]、死亡 −2.5pp
[−4.4, −0.6]、floor +0.125 [+0.044, +0.206]で3 endpoint成立。判定軸を追加した扱いにはしない。

## A2 / core-pools / support 参考値

A2は受入判定から撤廃。completeの class-centered Fisher z 相関は、score×終了到達floor
`r=.174 [.140, .208]`、score×B5突破 `r=.115 [.080, .149]`。A2の gate・合否へ使わない。

オーナー決定は endpoint を見た後の採用ではない。#475 のコメントで 2026-08-10 11:42:15 UTC に
`workshop-complete` のみを主状態とする決定が行われ、測定着手コメントは 11:49:03 UTC、結果記録は
12:08:18 UTC。根拠は #461/#343/#346 の実測工房頻度（`core-pools` 0/1,200、95% CI上限0.31%、
`complete` 63.7%）であり、endpointの値ではない。

`workshop-core-pools` は参考監査のみ。B5 entrant N=2,896、平均到達floor=3.573。
A1は Q4−Q1 −7.6pp [−12.2, −3.0]、trend z=−3.818 / p=0.0000674、Q4=27.3%
[24.2, 30.6]で成立する。一方、A3 combat core個数は突破 +3.3pp [+1.2, +5.4]、死亡
−0.6pp [−2.9, +1.6]、floor +0.185 [+0.096, +0.273]で死亡CIが0を跨ぐ。したがって、
core-poolsを主状態に残していた場合、A3は不成立だった。core-poolsでも A1 は成立しているが、
これは主状態選択の根拠ではなく、選択の妥当性を補強する参考監査である。

completeの `core + 対応support` は339/3,176。突破 +4.0pp [−0.8, +8.7]、死亡 −3.0pp
[−7.8, +1.7]、floor +0.181 [−0.032, +0.393]。判定力なしという #445 の決着と整合。

## N設計

#467の比較値を使用した。2,200 run/cell、complete B5 entrant N=524、死亡軸の効果 −.051
[−.104, +.002]。半幅=.053、SE=.053/1.96=.02704、観測z=1.886。

- CIだけを0未満にする1.08倍計算は、N増加による点推定移動を無視するため不採用
- 観測効果、両側95% CI、90% powerで `((1.96+1.282)/1.886)^2=2.954` 倍
- 必要 entrant=ceil(524×2.954)=1,548、entrant率524/2,200=.2382から6,500 run/cell
- 点推定移動へ1.25倍余裕を置き、初期計画8,500 run/cell
- 8,500中間測定で complete Mage B5 entrant=101、quartile最小N=25。A1は Q4−Q1 **−14.0pp
  [−19.2, −8.9]**、trend z=−5.687、減少方向 p=0.00000000648。数値上は設計方向で成立条件を
  満たすが、Mage各quartile N<30のため正式判定は未確定。
- 同時点の A3 combat-core個数軸は N=2,111、level=0/1/2/3+ は 368/1,165/518/60。
  突破 **+4.0pp [+1.6, +6.4]**、死亡 **−3.5pp [−6.1, −0.9]**、終了到達floor
  **+0.205 [+0.094, +0.316]**で、3 endpointは成立。
- N増の判定基準は endpoint の値・CI・p値ではなく、Mage各quartile **N≥30**。この基準を満たす
  10,100 run/cellへさらに1.25倍余裕を置き、最終値を **13,000 run/cell** に固定した。
- 最終 complete はB5 entrant=3,176、全職×全quartile最小N=39。A3死亡CIも0を跨がない

A1/A3の分母はB5 entrant全体。feature有群率でrun数を割っていない。
8,500中間値は sizing/auditであり、N増の判断へ endpointの値を使っていない。A1はN<30により正式
判定未確定、A3は3 endpoint成立という中間結果を、そのまま記録した。

## 効果量記録（#467との取り違え防止）

#467（B5 entrant N=524）から今回（N=3,176）へ、報告する効果量はすべて縮小した。

- A1 Q4−Q1: −16.3pp → **−9.3pp**
- A3突破: +5.4pp → **+3.5pp**
- A3死亡: −5.1pp → **−2.7pp**
- A3終了到達floor: +0.320 → **+0.182**

CIは今回のN増で狭まり、判定は堅くなった。一方、効果量の実水準は今回の値であり、
全項目の縮小は小Nでの過大推定（winner's curse）の典型的な形。今後 #271 の効果を語る際は
#467の値を使わず、今回の値を正本とする。

## 無条件指標

全run平均到達floor（13,000 run/cell）:

- empty 3.021
- stats 3.211
- gear 3.439
- blood-wand 3.535
- blood-wand-spells 3.577
- core-pools 3.573
- complete 3.727

## 測定系と判定方法

測定系は #467 系。`scratch/sim_issue_271_quality_remeasure.js` から現行
`scratch/sim_depth_material_ev.js` を呼び、実 `generateRunFloor` 経路、戦闘、罠、装備、状態回復、
帰還を使用した。seed=271、基本4職、#467と同じ threshold逃走、7シナリオを同一条件で測定した。
`workshop-complete`だけを主判定し、他6シナリオは監査・参考値。

判定方法は #470 / PR #474 方式。A1は職内 centered Q4−Q1、隣接差CI下限>0だけを統計的反転、
職層調整 Cochran–Armitageの減少方向 p<.05、反転なし。率はWilson、A2参考相関はFisher z、
平均/差は正規近似95% CI。つまり「測定系=#467、判定方法=#470」の組み合わせであり、#461基準線とは別系統。

受入familyの報告数は A1主条件3 + A1単調性補助4 + A3の3 endpoint = **10**。α=.05での機械的な期待偽陽性数は **0.50**。
A2、core-pools、core+support、全core/economy軸、7シナリオ監査は参考・診断であり、受入familyへ追加して
基準を動かしていない。

## 実行環境・完全env

実行コマンド:

```sh
SIM_RUNS=13000 ISSUE271_RESULT_SUFFIX=issue475-final node scratch/sim_issue_271_quality_remeasure.js
```

シミュレーションenv:

```text
SIM_SEED=271
SIM_RUNS=13000
SIM_CALIBRATION_RUNS=100
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
TRAP_POLICY=conservative
TRAP_AVOIDANCE_POLICY=ev
TRAP_DAMAGE_MULTIPLIER=1
IDENTIFICATION_POLICY=powder
IDENTIFICATION_STARTING_POWDER=2
IDENTIFICATION_COST_OVERRIDE=1
STATUS_CURE_POLICY=smart
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
HEAL_POTION_MERCHANT_POLICY=missing
FLEE_POLICY=threshold
FLEE_HP_THRESHOLD=0.35
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
ELITE_POLICY=avoid
BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50
SIM_CORE_SCORE_DROP_TOLERANCE=0
SIM_440_CONDITION=current
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-core-pools,workshop-complete
SIM_PARALLEL=<omitted; runtime default>
SIM_MAP_CACHE_ENTRIES=<omitted; runtime default 1024>
```

`ISSUE271_RESULT_SUFFIX=issue475-final` は出力ファイル名だけに使った。resolved/available parallelism=15。
calibration wall=9.775s、simulation wall=189.953s、総wall=199.728s、calibration CPU=12.775s、
simulation CPU=2,827.300s、総CPU=2,840.075s、raw rows=91,000。

- env SHA-256: `f5f457c0970d168cdfecb2d6be10830b5bd8fad036cf6dd955fa72be41d597d9`
- raw JSONL SHA-256: `b4f472bbe1ad1d28b1fa27861d29383b71e4b91c7667b0032c7bba4a37519b86`
- summary JSON SHA-256: `f19b66d72fd36ea4b25f29d1f310a8919a82259c47e3945513dd16947bbda6b6`

## 検証

- `node --check scratch/sim_issue_271_quality_remeasure.js`: PASS
- import/export存在確認、`generateRunFloor` 配線確認: PASS
- N=1・complete 1セル smoke: PASS
- `npm run lint`: PASS
- `node scratch/test_sim_reward_paths.js`: PASS（40 sim files）

raw JSONL/summary JSONは再現用の未追跡出力。commit対象はこの要約と測定スクリプト、canonのみ。
