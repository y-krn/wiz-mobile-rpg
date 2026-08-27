# Issue #271 spellGuard追加再測定

既存の全体掃引は再測定せず、`spellGuard` の `1x / 5x / 10x × smart / never`、主状態 `workshop-core-pools` の6セルだけを再測定した。

## 結論

追加測定の有群・なし群Nは全6セルで目標N≥200を満たしたか: **yes**。
5xのA（両cureのB5 entrant死亡差の95% CIが0を跨がず、同符号）再現: **yes**。
したがって spellGuard については、A=5xが追加測定で再現され、既存100xでB（対策なし生存率20%未満）が未観測だったため、A<Bの窓を `[5x, >100x]` と観測する。これは単一affixについて #271 の「質依存化と自由度の両立」が成立しうることを示す。

## 機構とStep 2との整合

`src/combat_logic/damage.js:136-168` の `reduceIncomingDamage` は `options.spell` のときだけ `getCharAffixSum(char, "spellGuard")` を読み、`spellGuard + mabarrier` を最大60%として呪文ダメージを軽減する。通常物理攻撃、初手被弾、罠、毒ダメージはこの分岐を通らない。
敵側はscratch overrideでB3以降の通常遭遇を `HALITO`・発動率100%へした。full診断で呪文roundと「魔除け」軽減ログを数え、5x効果が実際にこの経路へ到達したかを確認した。
全run平均のHP消耗を支配した初手・毒・罠は spellGuard の対象外であり、Step 2の「深層endpointは戦闘攻撃力ではなく、罠 + 初手 + 毒に支配され得る」という結論と整合する。spellGuardの差は、強制した通常戦の呪文被害に限って現れる。

## 追加掃引

| 強度 | smart 有/なしN | smart 死亡差 | never 有/なしN | never 死亡差 | smart 呪文round全/到達・軽減全/到達 | never 呪文round全/到達・軽減全/到達 | なし群生存 smart / never |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1x | 244/2812 | -6.7pp [-12.9, -0.5] | 257/2739 | -0.8pp [-6.6, 5.1] | 326279/311680・10694/10619 | 324109/309406・10932/10848 | 43.5% / 43.3% |
| 5x | 544/2802 | -19.6pp [-23.6, -15.6] | 514/2676 | -21.6pp [-25.5, -17.6] | 335613/320988・19914/19842 | 330609/315862・18494/18414 | 44.2% / 44.0% |
| 10x | 509/2836 | -20.2pp [-24.2, -16.2] | 549/2755 | -18.8pp [-22.6, -14.9] | 336198/321299・20007/19924 | 332605/318037・19391/19303 | 45.3% / 46.3% |

死亡差は有群−なし群。95% CIが0を跨ぐcell、またはN<200はA判定に使わない。順位の非単調やCIが重なる強度差はknee・結論反転と呼ばない。

## N設計・曝露・多重比較

既存14,000 runの spellGuard matched N は 1x smart/never=21/25、5x=45/50、10x=36/47。最小観測率は 21/14000=0.0015。したがって `ceil(200 / 0.0015)=133,334` run/cellが必要で、余裕を加えて 140,000 run/cell（6セル、900,000 rows）とした。
B3到達率（全run分母）は 1x=73.6%/73.4%、5x=73.4%/73.3%、10x=73.5%/73.6%（smart/never）。呪文round・軽減回数は全run分母とB3到達run分母を分離し、表では全/到達の順に示した。B5 entrantの有/なしNも各cellに併記した。
元の全体掃引は30 conditions × 2 cure × 7 scenario × 3 endpoint = 1,260検定、α=0.05の期待偽陽性63.0本。今回の追加6セルはその単発ヒットの事前指定replicationであり、追加のendpoint記録は18本（同じαなら期待0.9本）である。追加結果が再現しない場合、元の5x単発は採用しない。

## 実行監査

- 主状態: workshop-core-pools; smart / never; 基本4職; target depth 21
- SIM_CALIBRATION_RUNS=100; SIM_PARALLEL未指定（解決値=15); IDENTIFICATION_POLICY=powder; FLEE_POLICY=threshold
- full診断で forceSpell=HALITO / spellChance=1、spellGuard実測行のみ。src変更なし。
- wall-clock 1702.199s; total CPU 22825.456s
- raw JSONL SHA-256: f47cd14e819777d55d866e5f570112720fdc11298e1deac509ded3787c9b7dec
- summary JSON SHA-256: 8daf1cca7df46ceb5b4371fd1d0338050a4ef4314b673b842682f7c0cc573dc4
