# Issue #271 spellGuard追加再測定

再現コマンド: `CI=true SG_STRENGTHS=5 SIM_RUNS=140000 SIM_CALIBRATION_RUNS=100 SIM_DIAGNOSTICS=full node scratch/simulations/sim_issue_271_spellguard_remeasure.js`。

既存の全体掃引は再測定せず、spellGuard の 5x × smart / never、主状態 workshop-core-pools の2セルだけを再測定した。

## 結論

追加測定の有群・なし群Nは全2セルで目標N≥200を満たしたか: **yes**。
5xのA（両cureのB5 entrant死亡差の95% CIが0を跨がず、同符号）再現: **yes**。
したがって spellGuard については、A=5xが追加測定で再現され、既存100xでB（対策なし生存率20%未満）が未観測だったため、A<Bの窓を `[5x, >100x]` と観測する。これは単一affixについて #271 の「質依存化と自由度の両立」が成立しうることを示す。

## 機構とStep 2との整合

`src/combat_logic/damage.js:136-168` の `reduceIncomingDamage` は `options.spell` のときだけ `getCharAffixSum(char, "spellGuard")` を読み、`spellGuard + mabarrier` を最大60%として呪文ダメージを軽減する。通常物理攻撃、初手被弾、罠、毒ダメージはこの分岐を通らない。
敵側はscratch overrideでB3以降の通常遭遇を `HALITO`・発動率100%へした。full診断で呪文roundと「魔除け」軽減ログを数え、5x効果が実際にこの経路へ到達したかを確認した。
全run平均のHP消耗を支配した初手・毒・罠は spellGuard の対象外であり、Step 2の「深層endpointは戦闘攻撃力ではなく、罠 + 初手 + 毒に支配され得る」という結論と整合する。spellGuardの差は、強制した通常戦の呪文被害に限って現れる。

## 追加掃引

| 強度 | smart 有/なしN | smart 死亡差 | never 有/なしN | never 死亡差 | smart 呪文round全/到達・軽減全/到達 | never 呪文round全/到達・軽減全/到達 | なし群生存 smart / never |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5x | 486/2535 | -21.1pp [-25.2, -17.0] | 470/2515 | -22.7pp [-26.8, -18.6] | 311417/297845・18212/18133 | 309063/295514・17668/17590 | 46.4% / 42.0% |

死亡差は有群−なし群。95% CIが0を跨ぐcell、またはN<200はA判定に使わない。順位の非単調やCIが重なる強度差はknee・結論反転と呼ばない。

## N設計・曝露・多重比較

既存14,000 runの spellGuard matched N は 1x smart/never=21/25、5x=45/50、10x=36/47。最小観測率は 21/14000=0.0015。したがって `ceil(200 / 0.0015)=133,334` run/cellが必要で、余裕を加えて 140,000 run/cell（2セル、280,000 rows）とした。
B3到達率（全run分母）は 5x=73.7%/73.4%（smart/never）。呪文round・軽減回数は全run分母とB3到達run分母を分離し、表では全/到達の順に示した。B5 entrantの有/なしNも各cellに併記した。
元の全体掃引は30 conditions × 2 cure × 7 scenario × 3 endpoint = 1,260検定、α=0.05の期待偽陽性63.0本。今回の追加2セルはその単発ヒットの事前指定replicationであり、追加のendpoint記録は6本である。追加結果が再現しない場合、元の5x単発は採用しない。

## 実行監査

- 主状態: workshop-core-pools; smart / never; 基本4職; target depth 21
- SIM_CALIBRATION_RUNS=100; SIM_PARALLEL未指定（解決値=4); IDENTIFICATION_POLICY=powder; FLEE_POLICY=threshold
- full診断で forceSpell=HALITO / spellChance=1、spellGuard実測行のみ。src変更なし。SIM_DIAGNOSTICS=full。
- wall-clock 758.495s; total CPU 3448.647s
- raw JSONL SHA-256: 1df87d5aa88f676bb13d08644a5ac744983d23949cfe91225429382f0a0f83f1
- summary JSON SHA-256: 5ff52e1d04c910c1804b65e8bd5a96eead312ee5e59385b6c5c4d210839c622a
