# Balance Simulation Checklist

## Role

Review progression, economy, combat difficulty, and reward pacing using
repeatable checks.

## Scope

- Progression, economy, materials, drops, enemies, rewards, difficulty, growth,
  and run pacing
- Repeatable simulations, deterministic seeds, outcome distributions, and
  resource/reward curves
- Interactions between data, rules, systems, combat, map, chest, and quest
  behavior

Target files are determined from the relevant rows in `.agents/file-map.md`.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the changed
enemy, reward, map, combat, rule, system, or run quest data path, then use the
smallest deterministic scratch check that exercises the changed values.

## Inputs

- Balance goal or changed values
- Affected enemies, items, rewards, spells, run quests, or map rules
- Simulation output or deterministic seeds, when available

## Agent Skills

- No skill is mandatory by default; prioritize deterministic source, data, and
  scratch simulation review.
- Recommended when balance changes are visible in mobile UI text, lists, or
  result screens: `web-design-guidelines`.
- Recommended when simulation output is large and needs summarizing:
  `context-mode`.
- Do not load browser skills unless the balance question depends on rendered UI
  or player-flow verification.

## Review Checklist

- Identify whether the change affects early, mid, or late progression.
- Compare risk, reward, cost, and recovery pressure.
- Check whether materials, items, XP, or run quest rewards create runaway growth.
- Check whether enemy damage, HP, traits, and encounter frequency match expected
  solo-character capability.
- Confirm balance-affecting values did not move into UI or action modules where
  deterministic checks are harder to target.
- Prefer deterministic seed checks over anecdotal play results.
- Flag balance changes hidden inside UI or unrelated logic diffs.

## Simulation Validity

Before trusting a `scratch/sim_*.js` result, confirm the simulation reproduces a
real run. Each item below has already produced a wrong conclusion at least once.

- Every `scratch/sim_*.js` must declare its scope in the first 20 lines with
  `// sim-scope: <run|formula|map|infra>`; `scratch/test_sim_reward_paths.js`
  fails without it. `run` measures depth, EV, or progression pace and must drive
  floors through `generateRunFloor` (`src/run_map_generator.js`) — a hand-rolled
  floor loop diverges silently at depth. `formula` is a narrow check that never
  places a floor. `map` measures the generator itself and is the only scope that
  may call `generateRandomMap`; it requires a reason on the same line. `infra` is
  a harness that measures nothing.
- Player-side mitigations must be modeled before any depth conclusion:
  `TOWN_PORTAL` retreat and status-cure consumables. Omitting them measures a
  self-imposed restriction, and can invert the sign of a depth EV result rather
  than just its magnitude.
- Equipment scoring must count `CORE_AFFIXES` (`src/data/affixes.js`), not only
  support affixes. Ignoring cores understates build completion.
- Rewards and level-ups must be reached through round resolution. Calling
  `applyCombatRewards` or `checkCharLevelUp` directly double counts;
  `scratch/test_sim_reward_paths.js` enforces this.
- State which mitigations the simulation models and which it omits in the
  written summary, so a later reader can tell the measured scenario from the
  real one.
- Before any measurement, freshly fetch `origin/main` and confirm that
  `origin/main` is an ancestor of the working tree's `HEAD`
  (`git merge-base --is-ancestor origin/main HEAD`). A stale checkout can omit
  recently merged balance PRs; #509 first ran against a local `main` missing
  #514/#517 and measured a B10 entrant baseline of 9.4–9.7% against a true
  post-#517 baseline of 14.4%. Always measure from a worktree freshly branched
  off `origin/main`, per AGENTS.md.

### Source tree provenance（Issue #519）

バランス測定は、`origin/main` を fetch した後にそこから切った新規 worktree で行う。
main チェックアウトで測定しない。測定 runner は開始前に `HEAD` と
`origin/main` の関係を `git merge-base --is-ancestor origin/main HEAD` で検査し、
`origin/main` の子孫でなければ警告ではなく非ゼロ終了する。
意図的な stale-tree 測定だけ `SIM_ALLOW_STALE_TREE=1` で継続でき、その事実を
summary md / summary JSON の `measurement` に記録する。
`measurement.sourceCommit`、`measurement.originMainAncestor`、
`measurement.staleTreeAllowed` を env hash と同じ実行記録へ必ず出力する。
測定結果の summary JSON と raw JSONL は `scratch/results/` へ出力するが、追跡しない。
共有入口 `scratch/sim_depth_material_ev.js` の module load 時に guard を実行する。
`isMainThread` が false の worker は再実行しない。unit test は
`SIM_SKIP_PROVENANCE=1`、または `test_*.js` entrypoint で skip する。
`node --check` は module を実行しないため guard 対象外。

2026-08-11 棚卸し: 既存 summary md 67件は source commit 記載なし。過去結果へ遡って
追記しない。記載ありは `issue-470-build-definition.md`、
`issue-485-build-definition-rebaseline.md`、`issue-496-in-run-recovery-supply.md`。
記載なし一覧:

- `issue-270-real-src-measurement.md`, `issue-271-atk-def-affix-unread.md`, `issue-271-atk-def-after-phase1.md`, `issue-271-atk-def-after-phase2.md`, `issue-271-atk-def-before-phase1.md`, `issue-271-atk-def-before-phase2.md`, `issue-271-atk-def-comparison.md`, `issue-271-b5-milestone-encounter.md`
- `issue-271-countermeasure-strength.md`, `issue-271-criteria-remeasurement.md`, `issue-271-quality-remeasure.md`, `issue-271-resistance-integrity-antidemon-b2-15-25-w1-weapon-accessory-phase1.md`, `issue-271-resistance-integrity-antidemon-b2-15-25-w1-weapon-accessory-phase2.md`, `issue-271-resistance-integrity-antidemon-b2-15-25-w1-weapon-phase1.md`, `issue-271-resistance-integrity-antidemon-b2-15-25-w1-weapon-phase2.md`
- `issue-271-resistance-integrity-antidemon-b3-30-w1-weapon-accessory-phase1.md`, `issue-271-resistance-integrity-antidemon-b3-30-w1-weapon-accessory-phase2.md`, `issue-271-resistance-integrity-baseline-phase1.md`, `issue-271-resistance-integrity-baseline-phase2.md`, `issue-271-resistance-integrity-guardian-a20-phase1.md`, `issue-271-resistance-integrity-guardian-a20-phase2.md`, `issue-271-resistance-integrity-guardian-c0-phase1.md`, `issue-271-resistance-integrity-guardian-c0-phase2.md`
- `issue-271-resistance-integrity-guardian-c10-phase1.md`, `issue-271-resistance-integrity-guardian-c10-phase2.md`, `issue-271-resistance-integrity-phase1-comparison.md`, `issue-271-resistance-integrity-progress.md`, `issue-271-resistance-integrity-src-after-phase1.md`, `issue-271-resistance-integrity-src-after-phase2.md`, `issue-271-spellguard-remeasure.md`, `issue-271-status-depth-scaling.md`
- `issue-271-trap-quality-after.md`, `issue-271-trap-quality.md`, `issue-292-after.md`, `issue-292-corrected-results.md`, `issue-292-sim-parallel-progress.md`, `issue-404-affix-volume.md`, `issue-409-second-accessory.md`, `issue-410-workshop-variety.md`
- `issue-419-identification-default.md`, `issue-433-curse-lock.md`, `issue-437-core-encounter.md`, `issue-440-magic-core-chance.md`, `issue-444-build-matching.md`, `issue-446-slot-vs-affix.md`, `issue-454-countermeasure-after.md`, `issue-454-paired-reaggregation.md`
- `issue-454-spellguard-remeasure.md`, `issue-454-trap-remeasure.md`, `issue-461-baseline.md`, `issue-468-exposure-ceiling.md`, `issue-473-priest-disarm.md`, `issue-483-heal-unit-sweep.md`, `issue-485-audit-468-473-main.md`, `issue-485-audit-468-473.md`
- `issue-485-audit-480.md`, `issue-485-rebaseline.md`, `issue-487-heal-priority.md`, `issue-489-heal-flee-threshold.md`, `issue-494-264-remeasurement.md`, `issue-494-combat-policy-default.md`, `issue-499-shallow-recovery-supply.md`, `issue-502-461-rebaseline.md`
- `issue-502-499-fixed-detection.md`, `issue-502-trap-detection.md`, `issue-507-blind-balance.md`, `issue-516-class-sustain.md`

事故 commit `55f8f30` にだけ存在した `issue-485-*.json` 6件は現 `origin/main` に
存在せず、現ブランチの index にも無いため `git rm --cached` 対象なし。

### Identification policy

`scratch/sim_depth_material_ev.js` の既定は `IDENTIFICATION_POLICY=powder`。
`powder` は `src/movement.js` の開始 `identifyTickets`、
`src/systems/identification.js` の `identifyEquipment`、
`src/rules/identification_rules.js` の `identifyCost` / `isCurseLocked`、
`src/systems/equipment_generation.js` の未鑑定装備生成を通る実装モデル。
装備生成の呪い率は `IDENTIFICATION_BALANCE` の floor-scaled base chance と
`coreCurseBonus` を通る。コア用の別定数は置かず、実測もこの generator 経路に従う。
`gamble` は `revealEquipmentOnEquip` を通る即着用の行動反実仮想。
`legacy` は全装備を鑑定済み・呪いなしとして扱う実装外反実仮想であり、
既定・実装モデルと呼ばない。

鑑定粉の入手経路は開始・工房・出発クラフト・宝箱・戦闘報酬（図鑑初撃破）を
source別に出力する。節目商人の鑑定粉は任意購入で、既定 sim は自動購入しない。
商人経路は「効果なし」ではなく、未観測・別購入方針が必要な経路として記録する。
各結果は粉の入手数・消費数・終了残量・枯渇率を出力し、枯渇率・到達/突破/死亡率・
core装備率（#471の監視値）/実発動率/定着率・終了時core数分布には Wilson 95% CI を付ける。
率の試行数が30未満の場合は未確定として結論に使わない。

### Measurement defaults

通常のバランス測定は `SIM_RUNS=500`、`SIM_CALIBRATION_RUNS=100` を既定とする。
`SIM_CALIBRATION_RUNS=1000` は精度感度の比較時だけ明示する。
ただし Issue #461 の基準線測定は例外として `SIM_CALIBRATION_RUNS=1000` を固定する。
職業×工房状態ごとの core scoring profile を安定させ、職内 `combatBuildScore`
quartile と装備率の基準線が calibration の乱数揺れで変わるのを避けるためであり、
通常測定へ一般化しない。calibration の wall-clock 比率と総時間を実行記録へ残す。
`SIM_PARALLEL` は原則指定しない。未指定時はローカルで
`availableParallelism()`、CIで4を使い、タスク数を上限にする既定値へ任せる。
過去の測定コマンドを再利用する場合も `SIM_PARALLEL=4` を付けず、実行環境の既定値を
記録する。比較結果には出力 SHA、wall-clock、総 CPU 時間を併記する。

Map共有を使うシミュレーションの既定 cache 上限は `SIM_MAP_CACHE_ENTRIES=1024` とする。
多条件・多runの測定でも、通常は上書き不要。RSSを厳しく抑える必要がある環境だけ
下げる。一意 map 数が1,024を超える構成では `SIM_MAP_CACHE_ENTRIES` を上げると
redundancy 1.0xへ近づくが、RSSとのトレードオフを測定してから変更する。
`TARGET_DEPTHS` の複数結果を1 taskで返すsimは、各caseのtop-level resultを返却直前に
snapshotする。同一workerのtask再利用時に後続caseの集計値が先行caseへ混入し得るため、
scenario数・worker数だけで安全性を推測せず、raw resultとの差分で全フィールドを監査する。

### 判定・監査・診断の二段階運用

主状態は判定に必要な高Nで測定し、主状態以外のシナリオは `SIM_AUDIT_RUNS=500` を
基準とする低Nの監査として回す。監査は主状態とendpointの符号が食い違っていないか、
主状態が外れ値でないかを確認するだけで、判定と同じ検出力を要求しない。監査の符号が
食い違ったセルだけを主状態と同じNで追加測定する。監査セルまたは比較群の実測Nが30未満
なら `未確定` と出力し、そのセルから結論を引かない。

診断収集は `SIM_DIAGNOSTICS=off|compact|full` で切り替え、既定は `off` とする。
通常は診断offの軽い判定runを先に実行し、判定が決着したセルだけを少数runの
`compact`/`full` 診断runで調べる。診断runの死因・遭遇・roundログを判定Nの全runへ
付けない。実行報告には判定runと診断runを区別して記録する。

paired CI は、条件の変換段階がコード上で `post-generation`、生成乱数の消費が
`preserved`、対応runのキーと `randomSequenceId` が完全一致するときだけ使う。生成構成を
変えて乱数消費が変わる条件、対応集合が欠ける条件、乱数列の識別子が一致しない条件は
独立2標本へフォールバックし、その理由を出力する。生成後の介入で戦闘・探索軌跡が分岐
する場合も、paired差は同一生成runに対するoutcome差として扱うだけで、介入後の軌跡が
同一だとは解釈しない。

## Issue #461 固定条件（基本4職基準線）

この節は Issue #461 の基準線を再測定する際の固定条件。値を調整するための what-if
条件ではない。実行入口は `scratch/sim_issue_461_baseline.js`、`run` scope であり、
`simulateRun` から `generateRunFloor` を経由する。

- seed: `461`
- 対象: Fighter / Thief / Priest / Mage。各職・各 phase N=3000、calibration N=1000。
- 初回ラン: 素材0、departure craftなし、target depth=2。
- baseline: target depth=21（B20終了）、現行の departure kit と工房状態を使用。
- 工房状態は #343/#346 の観測分布を整数で固定する: empty 30/1200、stats 74/1200、
  gear 69/1200、blood wand 216/1200、blood wand+deep spells 47/1200、complete
  764/1200。各職へ同じ層化系列を適用する。
- `IDENTIFICATION_POLICY=powder`、`FLEE_POLICY=ev`、
  `TRAP_POLICY=conservative`、`TRAP_AVOIDANCE_POLICY=ev`、
  `STATUS_CURE_POLICY=smart`。`TOWN_PORTAL` と状態異常治療消耗品をモデルする。
- `SIM_PARALLEL` と `SIM_MAP_CACHE_ENTRIES` は指定しない。runtime の既定 parallelism
  と map cache（既定1024）を使い、実行時の resolved parallelism を記録する。
- 完成ビルド候補は職内 `combatBuildScore` Q4。判定は B5 死亡率の Q4−Q1 CI上限<0、
  統計的単調減少、職内 centered の3条件。単調性は点推定だけで決めず、隣接差
  `Q次−Q前` の正規近似95% CI下限>0を統計的反転とし、職層調整 Cochran–Armitage
  trend test の減少方向 p<.05、かつ統計的反転なしを成立条件とする。N<30 のセルは未確定。

測定時の固定 environment は次の通り（空欄は override なし）。

```text
SIM_SEED=461
SIM_RUNS=3000
SIM_CALIBRATION_RUNS=1000
SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete
DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION
IDENTIFICATION_POLICY=powder
IDENTIFICATION_STARTING_POWDER=2
IDENTIFICATION_COST_OVERRIDE=1
FLEE_POLICY=ev
FLEE_HP_THRESHOLD=0.20
HEAL_POTION_THRESHOLD=0.55
TRAP_POLICY=conservative
TRAP_AVOIDANCE_POLICY=ev
TRAP_DAMAGE_MULTIPLIER=1
STATUS_CURE_POLICY=smart
STATUS_CURE_HP_THRESHOLD=0.35
STATUS_CURE_MERCHANT_POLICY=missing
HEAL_POTION_MERCHANT_POLICY=missing
PORTAL_HP_THRESHOLD=0.35
PORTAL_MAX_HEAL_POTIONS=0
PORTAL_MIN_FLOOR=3
ELITE_POLICY=avoid
SIM_440_CONDITION=current
SIM_EQUIPMENT_POLICY=individual-score
SIM_EQUIPMENT_SLOT_MODE=standard
SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain
SIM_MATCHING_DEFINITION=exact
SIM_CURSE_LOCK_MODE=current
SIM_SUPPORT_SUPPLY_CEILING=none
SIM_CORE_SCORE_DROP_TOLERANCE=0
SIM_MAP_STATS=0
SIM_DAMAGE_PROBE=0
SIM_PRESET=
SIM_PARALLEL=<omitted; runtime default>
SIM_MAP_CACHE_ENTRIES=<omitted; runtime default 1024>
```

この測定の env hash・出力 SHA-256 は、固定条件で再測定した実行記録を正本とする。
`SIM_CORE_SCORE_DROP_TOLERANCE=0` は、Issue #461 が現行の個別スコア選択方針を測る基準線であり、
装備スコア低下を許容する反実仮想を混ぜないため採用する。#442 採用設定 `0.10` は、
同一条件比較測定として別記し、基準線へ混在させない。
## Issue #485 再基準線（PR #484後）

PR #484 の上薬追加を含む現行 `scratch/sim_depth_material_ev.js` で再測定した。
HPが35%以下なら `GREATER_HEAL` を優先して能動使用し、`hasRecoveryPotion` でも上薬を
回復・ポータル判定の保有品として数える。上薬を省略した旧基準線とは混ぜない。

- env hash は旧基準線と同じ `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`。
- raw JSONL SHA-256: `ead737b0eb771da6a28d50fcac61572a7a34413c1925fcc13d33636978bd0391`。
- summary JSON SHA-256: `202aae1dac74e448f42d1d181fbd3ed18c679df7e32f85f1d8ed2cef5fb6b598`。
- #484以前の履歴SHAは raw JSONL `560673693bdff8e87895faf12b88fcfe4e977c99e19c2a5f23d5907d81138cc0`、
  summary JSON `81fa80b96eb8aeac5a28f21815a6bf7ecddab15557d2eeb6b8a9a3965b1cf966`。
- 全run平均到達floor: **3.59 [3.56, 3.63]**（旧 3.66 [3.62, 3.69]）。
- B5 entrant: **23.5% [22.8%, 24.3%]**（旧 23.4% [22.6%, 24.1%]）。
- core装備率: **66.9% [66.1%, 67.8%]**（旧 69.0% [68.2%, 69.8%]）。
- A1: Q1=34.9%、Q2=29.9%、Q3=23.4%、Q4=24.5%。Q4−Q1 は
  **−10.4pt [−15.0, −5.9]**で、CI上限<0・単調減少・職内centeredをすべて維持した。

B5 entrant内 endpoint は breakthrough / death / retreat の順で、各行の合計は100%。
旧→新の比較は、旧結果を履歴として参照し、現行値は上薬能動使用後の新測定を採用する。

| 職 | B5 entrant率 旧→新 | breakthrough 旧→新 | death 旧→新 | retreat 旧→新 | 平均floor 旧→新 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fighter | 7.3%→9.2% | 1.8%→8.7% | 8.6%→6.5% | 89.5%→84.8% | 3.15→3.08 |
| Thief | 38.3%→41.3% | 15.9%→19.3% | 21.4%→24.3% | 62.7%→56.5% | 3.92→4.08 |
| Priest | 42.8%→36.9% | 64.3%→59.1% | 34.9%→40.3% | 0.8%→0.6% | 4.45→4.25 |
| Mage | 5.1%→6.6% | 0.6%→3.6% | 12.3%→15.7% | 87.0%→80.7% | 3.10→2.97 |

旧基準線のSHAと「Q3→Q4 21.2%→24.1%」という記録は #484以前の履歴として保持する。
新測定ではQ3→Q4は23.4%→24.5%で、差は0を跨ぐ。N<30のB10職別endpointは未確定とする。

### #475 A3の再確認

同じ新基準線のB5 entrant N=2,822で、core個数（0 / 1 / 2 / 3+）は
109 / 698 / 1,209 / 806。職内centered ordinal slope は breakthrough
**+2.9pt [+1.0, +4.8]**、death **−2.2pt [−4.1, −0.2]**、平均floor
**+0.230 [+0.131, +0.328]**で、3 endpointともCIが0を跨がない。
#475/#271のA3は維持し、判定材料を再オープンしない。値はbalance調整ではなく測定結果。

旧 #461 基準線のenv hashは同じだが、PR #484後の新測定を #471 の現行監視値と依存canonの基準にする。

## Issue #470 固定結論（完成ビルド定義）

Issue #470 の採用定義は、現行 `combatBuildScore`（equipment + first combat core）の職内
quartile Q4。#485でPR #484後の同一 #461 固定条件を再評価し、B5 entrant N=2,821を得た
（#484以前の観測はN=2,799）。
結果を見る前に固定した隣接差CI＋職層調整 Cochran–Armitage trend testで全7候補を再判定した。
現行 total は A1 の3条件を満たすため、深層生存 B5 `deathFloor === 5` を完成度の主 endpointとして採用する。

- 単調性判定: Δ=Q次−Q前の正規近似95% CIを全隣接ペアで出力。CI下限>0だけを統計的反転とし、
  Δ>0でもCIが0を跨ぐ点推定反転は失格にしない。全体傾向は職を層とする Cochran–Armitage
  trend test（Q1〜Q4 score=0〜3）の減少方向 p<.05、かつ統計的反転なしを成立とする。
- #485再評価の現行 total は Q1→Q4 B5死亡率 **35.4%→28.7%→24.7%→24.0%**。
  Q3→Q4 は **−0.7pt [−5.2, +3.8]**で0を跨ぎ、統計的非単調ではない。trend z=-5.208、
  減少方向 p<0.0001。Q4−Q1 職内 centered 差は **−11.4pt [−16.0, −6.9]**。
- equipment-only と equipment + 全 combat core も A1成立。ただし採用優先順位は既存の現行 totalを先とし、
  all-core total は測定専用の有力な代替。first-core-only / all-core-only は減少 trend 不成立。
- #485再評価のQ3→Q4切り分けは equipment-only +0.1pt [-4.6, +4.3]、
  first core-only -0.1pt [-4.9, +4.6]、all-core-only -0.6pt [-5.3, +4.1]で、いずれもCIが0を跨ぐ。
  反転の実在も主因もこのNでは確定せず、
  「反転の主因はequipment側」とは書かない。

- B5 snapshot は `floor=5` / `point=floor-start`。`reachedFloor` は run 終了後の値であり、
  B5 entry スコアの深度正規化へ使わない。B5 entrant 内の score と終了到達floorの相関は、
  到達選別後の関連であって因果効果ではない。
- 現行 total の寄与は equipmentStatScore が支配的。#485再評価のQ1/Q4で first combatCoreScore の
  total寄与比は4.0%/5.9%、全 combat core 合計でも5.0%/7.8%。equipment-only の Q3→Q4は
  −0.1pt [−4.6, 4.3]で、all-core total化後も
  Q3→Q4 は点推定では戻る（統計的反転とは扱わない）。
- #485再評価のB5 entrantの複数 combat core は25.2% [23.6, 26.8]。first coreのみの score は
  16.9% [15.6, 18.3]で全core合計を過小評価し、first→all 差は全体0.94 [0.83, 1.05]、
  複数core限定3.73 [3.35, 4.10]。ただし all-core-only は A1のQ4−Q1 CI上限<0を満たさず、
  core 1個制限の修正だけで判定力は生じない。
- 正式候補7個、A1主条件21個、単調性補助チェック28個、報告総数49個。α=.05の機械的な
  期待偽陽性2.45件、Bonferroni family-wise α=.00102。候補追加・結果後の採用変更なし。
- 絶対閾値は score の外部校正値がなく、結果後の threshold 選択が数字合わせになるため正式候補にしない。
- #485再評価でも採用定義は変わらず、#271 の A1（Q4−Q1、統計的単調性、Q4安全性gate）/ A2（class-centered score×depth）/
  A3（core / 対応support feature）、完成ビルド率、quality quartile入力のdepth-quality表・要約・派生判断を
  同じ #461 固定条件で取り直す。観測分析のrawは #485で更新した。balance 値・srcのゲーム挙動は変更しない。

## Issue #494 戦闘方針の既定値（2026-08-11）

Issue #494 はゲーム本体のbalance値・逃走成功判定を変更せず、simの戦闘中行動方針だけを比較した。
seed=494、各職・条件 N=500、6工房シナリオ、B20終了で、固定回復35%の逃走15/20/25/30/35%、
固定回復45/55/65/70%の逃走15/20/25/30/35%、敵強度EV回復55%の逃走15/20/25/35%を測定した。
率はWilson 95% CI、平均は正規近似95% CI、N<30のセルは未確定とした。詳細は
`scratch/results/issue-494-combat-policy-default.md` を正本とする。

- 採用: `FLEE_POLICY=ev`、`FLEE_HP_THRESHOLD=0.20`、`HEAL_POTION_THRESHOLD=0.55`。
- 採用理由: EV/逃走20%が全職集約で平均floor **3.92 [3.81, 4.04]**、B5 entrant **26.6% [24.7, 28.5]**。
  職別B10 entrantは盗賊 **9.0% [6.8, 11.8]**、僧侶 **16.0% [13.0, 19.5]**で、EV/逃走15%・25%・35%より
  到達床の点推定が高く、B5死亡は
  **16.8% [13.8, 20.2]**でEV系と同程度。EV系4点の差はCI重複を含むため、点推定による深度目的の採用であり、
  有意差とは扱わない。
- トレードオフ: 現行固定35/35に対し、生還率は **45.3%→40.9%**、bank保持率は
  **0.5731→0.5397**、素材EV/時間は **0.1561→0.1480**。深度・到達性を優先する既定値として記録し、
  bank/EVを別監視指標に残す。
- 反映先: `scratch/sim_depth_material_ev.js` の既定/preset、`src/rules/recovery_rules.js` のsim helper既定、
  #461基準線runner。ゲーム本体のaction loopはhelperを呼ばず、ゲームプレイの逃走成功率は変更しない。
- 実施: #461基準線の再集計、#264の傷薬本数掃引・回復単価掃引の採用値再測定。
  詳細は
  `scratch/results/issue-494-264-remeasurement.md`。
- 下流の再測定対象: #471 core監視、#468/#473 罠/解除監査、#480 罠方針比較。#470/#475のA1は
  既存rawの再集計でcanon準拠を確認した。

### #494後の#461再基準線

採用値で #461 固定条件（seed=461、各職N=3000、calibration N=1000、6工房状態）を再測定した。
平均floorは Fighter 3.15 / Thief 4.77 / Priest 4.52 / Mage 2.89、4職合算3.83。
Q4−Q1 B5死亡率差は **−6.7pt [−10.1, −3.2]**。Q1→Q2 / Q2→Q3 / Q3→Q4 の
隣接差（次−前）は **−0.6pt [−4.5, +3.3] / −4.5pt [−8.2, −0.8] /
−1.6pt [−4.9, +1.8]**で、統計的反転なし。職層調整 Cochran–Armitage は
**z=−4.346、減少方向 p<0.0001**。Q4安全性・統計的単調減少・職内centeredが成立し、
canon通りrunnerのA1判定は **成立** に戻った。

- env hash: `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`
- raw JSONL SHA-256: `a0b882dfff27caf88214feda416cfa71f5e4cc7f735500446999b4d19e2b56b8`
- summary JSON SHA-256: `b5590bbb5c8453532ce158641a62948f0697234598df1b3c4fbccb3f598ec07c`
- #470/#475のA1再判定は既存rawの再集計で完了し、追加シミュレーションは不要。
- #471 core装備率監視、#468/#473 罠/解除監査、#480 罠方針比較は、戦闘方針変更の下流影響として別途再測定対象に残す。

### #485再評価の実行記録

- env hash: `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`。
- source commit: `21322272216f5ad0e25ed85b3e55517e52e8ed0b`。
- raw JSONL SHA-256: `ee10e70724f3d47a57105613b0d7bc533872f0fecd24dba69c23a165e8a003a0`。
- summary JSON SHA-256: `1eb4b34f5916d207d146ffd7698f5aa195f17b7ae64ddbb7db665bc4ad60504f`。
- 結論は current total Q4 の採用を維持。候補通過は current-total / equipment-only /
  all-combat-total、A1のQ4安全性・統計的単調減少・職内centeredを維持した。

## Issue #271 固定受入基準（2026-08-10 オーナー決定）

この節が #271 の現行 canon。基準を測定側で再解釈しない。

### A1: 主状態は `workshop-complete` のみ

完成ビルドは #470 / PR #474 の現行 `combatBuildScore`（equipment + first combat core）の職内 Q4。
endpoint は B5 entrant の `deathFloor === 5`。次の3条件をすべて満たすと A1 成立とする。

- Q4−Q1 の B5 死亡率差（職内 centered、正規近似95% CI）の上限 < 0
- 職層調整 Cochran–Armitage trend test の減少方向 p<.05、かつ統計的反転なし
- Q4 B5 死亡率 ≤30.9%

単調性は #470 / PR #474 の CI ベース判定を固定する。隣接差 Δ=Q次−Q前の95% CI下限>0
だけを統計的反転とし、点推定が上がってもCIが0を跨ぐ反転は失格にしない。各率は Wilson 95% CI、
N<30 は未確定とする。

`workshop-core-pools` は主状態から外す。#461 の実測工房分布（#343/#346、1,200 run）では
0/1,200、95% CI上限0.31%で一度も現れず、#442 のcore供給検証用実験状態。実プレイ頻度は最大でも
0.3%であり、実ラン最頻の `workshop-complete` 63.7%と同列にして両方の成立を要求しない。
core-pools は参考監査値として出力してよいが、A1判定へ使わない。

この主状態決定は endpoint を見た後の採用ではない。#475 のオーナー決定コメントは
2026-08-10 11:42:15 UTC、測定着手コメントは 11:49:03 UTC、結果記録は 12:08:18 UTC。
根拠は実測工房頻度（`core-pools` 0/1,200、95% CI上限0.31%、`complete` 63.7%）であり、
endpointの値ではない。参考監査では `core-pools` の A1 は成立（Q4−Q1 −7.6pp [−12.2, −3.0]、
trend p=0.0000674、Q4 27.3% [24.2, 30.6]）する一方、A3 combat-core死亡は
−0.6pp [−2.9, +1.6]で0を跨ぐ。core-poolsを主状態に残していた場合、A3は不成立だった。
core-poolsでのA1成立は主状態決定の根拠ではなく、その決定の妥当性を補強する参考監査である。

### A2: 撤廃

A2（class-centered `combatBuildScore` × 終了到達floor、r≥.20）は受入基準から外す。A1と主張が
重複し、#470 / PR #474 が canon 化した「B5 entrant内の相関は到達選別後の関連であり因果効果ではない」
というestimandと衝突する。過去の r=.165〜.181 は r²=2.7〜3.3%で質依存の成立根拠にしない。
r=.20にも受入水準としての根拠はなく、実測N=507/524は旧目安194を超えておりN不足でもない。
数値は参考値として測定・併記してよいが、受入判定に使わない。水準を下げて復活させない。

### A3: core個数軸のみ

`core + 対応support` は AND から外す。A3 は #467 で使用した B5 combat core の個数順序軸（文中の
core個数軸）のみで判定し、次の3 endpointをすべて満たすと成立とする。

- B5突破差が正
- B5死亡差が負
- 終了到達floor差が正

いずれも職内 centered の95% CIが0を跨がないこと。個数軸の隣接段階/3+集約、中心levelのN<30は
未確定として結論に使わない。`core + 対応support` を外す根拠は #445 の決着で、成立率を9.5%から
71.1%（6.2倍）へ上げてもB5 endpointは動かなかった（突破+1.3pt、死亡−2.5pt、いずれもCIが0を跨ぐ）。
support軸とcore-poolsは参考値として出力してよいが、A3判定へ使わない。

### B10実測移行の判定（#510）

#516後の#461固定条件（seed=461、4職各N=3,000、calibration N=1,000、6工房状態）で、
`generateRunFloor` 経由の `run` scope を再測定した。A1/A3の定義・B5基準線・固定envは変更しない。
B10 entrant は **1,554/12,000 = 12.95%**。職別は戦士103/3,000=3.4%、盗賊577/3,000=19.2%、
僧侶825/3,000=27.5%、魔術師49/3,000=1.6%。盗賊+僧侶は1,402/1,554=90.2%である。

- A1（B10、`combatBuildScore` 職内Q1〜Q4、`deathFloor===10`）: Q1〜Q4のNは391/388/388/387、
  死亡率は10.5% [7.8, 13.9] / 6.2% [4.2, 9.0] / 9.0% [6.6, 12.3] / 10.1% [7.5, 13.5]
  （各Wilson 95% CI）。職内centered Q4−Q1は **−0.4pt [−4.7, +3.9]**、trendの減少方向
  p=0.5964、最小セルN=12。戦士・魔術師の職内quartileはN<30で未確定。符号はB5（−7.3pt）と
  一致するが、効果量はほぼ消失しCIは0を跨ぐため、A1は不成立または未確定。
- A3（B10 entrant内、B10時点のcombat core個数0/1/2/3+、N=1,554）: level分布30/569/715/240。
  突破 **+2.3pp [−0.4, +5.0]**、死亡 **−2.2pp [−4.2, −0.2]**、終了到達floor **+0.263
  [+0.102, +0.424]**（職内centered、正規近似95% CI）。死亡とfloorはCIが0を跨がないが突破は跨ぐため、
  3 endpoint全てを要求するA3は不成立。点推定の符号自体はB5（+3.5pp/−2.7pp/+0.182）と一致する。
- B10 build snapshotはfloor-start 1,540件、floor 9→10直後のportal終了でfloor-startが無い14件は
  同一seedの診断再実行によるfinish snapshotで補完した。分母・endpointは通常runの結果を維持した。

Claudeの楽観的な理論N（B5効果量が持続する仮定）は、A1が232/群、entrant総数928、約7,167run、
A3死亡が1,622/群、entrant総数7,130、約55,058runだった。B10実測効果で再計算すると、A1は
**86,812/群、entrant総数347,248、約2,681,452run**（simulation約8,164秒＋calibration約102秒）、
A3死亡は**2,602/群、entrant総数8,211、約63,406run**（simulation約193秒＋calibration約102秒）となる。
A1はB5の−7.3ptから−0.4ptへ大幅縮小、A3死亡は−2.7ptから−2.2ptへ縮小した。N<30セルを埋めるだけでも
各職120 entrantが必要で、現行率では魔術師7,347run、4職均等runで約29,388runが下限となる。
いずれもB10 entrant分母で計算し、有群率でrun数を割っていない。

**判定: B5代理を残す。** B10への全面移行は、A1のCI跨ぎ・職内N<30、およびA3突破CI跨ぎにより採用しない。
盗賊・僧侶限定測定は90.2%のentrantを覆う追加監査候補だが、#461の4職共通層化系列を崩す別estimandであり、
B5受入基準の置換にはしない。B10 entrantは到達済みrunの選別集団であり、質・core個数の関連には
`deathFloor === floor` と同種の選別罠がある。balance値・srcのゲーム挙動は変更しない。

測定記録は `scratch/results/issue-510-b10-criteria-migration.md` に固定する。
`measurement.sourceCommit` は `aab93d62fb5b51caff0f22f313ad07d60c10aa3f`、
`measurement.originMainAncestor=true`、env hashは
`6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`、raw JSONL SHA-256は
`92f882a5cf4a84fed3cb7ac6b31d8516ac60fa740014eaf6f23e632439bd737d`、summary JSON SHA-256は
`ffe4d4330fbd7e35d57b40a3bffe973a133dda4d919bf2adcd6378355971d219`。wall-clockはcalibration 102.460秒、
simulation 36.537秒、合計138.997秒、総CPUは677.103秒、resolved parallelismは15
（`SIM_PARALLEL`未指定）である。raw JSONL/summary JSONはコミットしない。

### #271 効果量の正本（#467との取り違え防止）

#467（B5 entrant N=524）から今回（N=3,176）へ、効果量はすべて縮小した。

- A1 Q4−Q1: −16.3pp → **−9.3pp**
- A3突破: +5.4pp → **+3.5pp**
- A3死亡: −5.1pp → **−2.7pp**
- A3終了到達floor: +0.320 → **+0.182**

判定は今回のN増でCIが狭まったことで堅くなったが、効果量の実水準は今回の値。全項目の縮小は
小Nでの過大推定（winner's curse）の典型的な形であり、#271の効果を語る際に #467の値へ
取り違えない。balance値と測定結果は変更しない。

### 測定区間・分母・系統

#271 の基準はすべて B5 で測る。設計上の試験区間はB10以降だが、#461基準線のB10 entrantは
戦士0.0% / 盗賊1.0% / 僧侶9.7% / 魔術師0.0%で測定が成立しない。#271 は「B5時点での質依存」に
限定して判定し、B10以降の試験は到達性の課題 #264 に属する。

再測定は #467 系（seed271、基本4職、#467と同じ `FLEE_POLICY`、7シナリオ可）を継続する。
判定だけ #470 方式へ更新する。#461 基準線の工房分布・env・測定系と混ぜない。A1/A3 の分母は
B5 entrant 全体であり、有群率で割ってrun数を下げない（PR #472 の逆算事故を再発させない）。
`generateRunFloor` 経由、95% CI、多重比較、無条件の全run平均到達floor、出力SHA-256・wall-clock・
総CPU・既定parallelismを必ず記録する。balance値は変更しない。

## Issue #471 固定結論（core装備率の扱い）

この節が core 装備率の現行 canon。#471で目標帯と判定用途を固定し、#532で`killHeal`
採用後の#461基準線を再測定した。#532の値を現行監視値とし、過去値は履歴として残す。

### 決定と監視値

- 35〜40%の core 装備率目標帯を撤廃する。core 装備率は監視値であり、合否判定に使わない。
- 測定点は **終了時・全run・実プレイ工房分布** に固定する。#461 固定条件と同じ env で、#532のenv hashは `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`。
- 現行値は #532 再基準線の **85.8% [85.1%, 86.4%; N=12,000]**。職業別は戦士
  **94.1%** / 盗賊 **91.4%** / 僧侶 **71.4%** / 魔術師 **86.3%**（各 N=3,000）。
  #516時点（`killHeal`採用前）の監視値は83.5% [82.8%, 84.1%]、#485は66.9% [66.1%, 67.8%]、
  #484以前は69.0% [68.2%, 69.8%]（戦士66.4% / 盗賊76.7% / 僧侶64.3% / 魔術師68.7%）。
- 判定は #476 の A3（core個数軸）のみ。core 装備率で供給や完成を合否判定しない。

### 目標帯を撤廃する根拠

1. **35〜40%の出所を追跡できない。** #440 の issue 本文には「目標」の語が0件で、35〜40%の記載もない。本節追加前の `.agents/game-design-equipment-builds.md` にも記載はなかった。PR #442 は「目標判定は Issue で指定された点推定に基づく」と記録するが、その指定は #440 に存在しない。したがって、この帯を再設定する canon 上の根拠はない。
2. **同じ core 装備率でも測定点・条件が違う。** 数字を同じ目標へ比較しない。

| 測定 | 測定点 | 条件 | 値 |
| --- | --- | --- | ---: |
| #442 | B20 終了時 | `core-pools`、出発クラフト・治療なし（縛りプレイ条件） | 37.2% |
| #469（#484以前） | 終了時 | 全run、6工房分布加重、実プレイ条件 | 69.0% |
| #485 | 終了時 | 全run、6工房分布加重、上薬能動使用 | **66.9%** |
| #532 | 終了時 | 全run、6工房分布加重、`killHeal`採用後 | **85.8%** |
| #476 | B5 entry 時点 | `complete`、B5 entrant | 82.1% |

3. **完成判定は別に確定済み。** #470 は職内 `combatBuildScore` quartile の Q4 を完成ビルドとし、「core 1個以上 + スロット充足」を二重定義として却下した。core 装備率は完成判定ではなく、供給が届いているかの監視値。
4. **供給の十分性は core 個数軸で判定できる。** #476 の A3 は core 個数軸で成立した（突破 +3.5pp [+1.5, +5.5] / 死亡 −2.7pp [−4.8, −0.6] / 終了到達floor +0.182 [+0.092, +0.273]）。個数が成績に効く以上、「1個以上が X%」という目標は情報を捨てる。

### 併記する core 個数分布

#476 の B5 entrant、`complete`、N=3,176 では、core 数は 0個 17.9% / 1個 54.5% / 2個 24.8% / 3個以上 2.8%。#442 の元問題「run の8割が core ゼロ」は、B5 entrant 17.9%・全run終了時 31%まで改善済み。

### 比較時の禁止事項

#442 の 37.2% と #469 の 69.0% は比較しない。測定点と条件が違い、#442 は `DEPARTURE_CRAFT_IDS=`（空）かつ `STATUS_CURE_HP_THRESHOLD=1` の自己制限条件。比較が必要な場合は env を突き合わせ、特に `DEPARTURE_CRAFT_IDS` と `STATUS_CURE_HP_THRESHOLD` を確認する。

### 過去参照の扱い

- `scratch/results/issue-440-magic-core-chance.md` と `scratch/results/issue-461-baseline.md` は当時の測定記録。目標帯・37.2%・69.0%の当時の判断を履歴として残し、書き換えない。
- `scratch/sim_issue_461_baseline.js` は #461 基準線の歴史的 runner。生成する「採らなかった完成定義」の 35〜40%記述も当時の判断記録であり、現行 canon ではない。#471 の判断は本節を参照する。
- grep で見つかった他の `37.2%` は別指標の過去測定値であり、core 装備率目標の参照ではない。

## 宝箱解除率と解除判断経路の扱い（#341 / #473）

### #485 固定kit再監査（#468 / #473）

- 低N監査は `SIM_AUDIT_RUNS=500`、seed=271、4セル、95% CI。符号差セルを確認した結果、
  #468のpaired floor/death/breakthrough差は本Nでは低Nの一時的な符号差を維持しないセルもあり、
  受入判定を更新しない。N<30セルは未確定のまま扱う。
- #473のPriest解除率は本測定で反転を再確認した。#468 ceiling−current の固定kit本測定
  （N=50,100/cell、smart/never × core-pools/complete）は次の通り。値は Priest の
  `chestDisarmSuccesses / chestDisarmAttempts`、CIはWilson 95%。

| cell | ceiling−current floor | ceiling−current B5 death | ceiling−current B5 breakthrough | Priest current→ceiling |
| --- | ---: | ---: | ---: | ---: |
| smart / core-pools | +2.21pt [+1.26,+3.16] | +0.28pt [−0.46,+1.03] | +0.85pt [+0.16,+1.53] | 29.6%→37.7%（+8.1pt） |
| never / core-pools | +1.86pt [+0.91,+2.81] | +0.96pt [+0.21,+1.71] | +0.11pt [−0.60,+0.81] | 29.5%→37.8%（+8.4pt） |
| smart / complete | +1.79pt [+0.78,+2.81] | +1.17pt [+0.47,+1.88] | +0.26pt [−0.40,+0.93] | 29.5%→38.2%（+8.7pt） |
| never / complete | +2.38pt [+1.37,+3.40] | +0.31pt [−0.39,+1.01] | +0.90pt [+0.24,+1.55] | 29.6%→38.4%（+8.9pt） |

- #473の旧主系列→ceiling差（−6.19 / −6.79 / −8.47 / −6.53pt）に対し、#485は4セルすべて
  +8.1〜+8.9ptへ反転した。分母・経路が変わる実挙動として記録し、balance値や#468のA1/A2判定は変更しない。
- 低N監査の raw / summary SHA-256 は `d2cfffb43ab5f5f118c90cd066e6bf5341005e779e1c878f06ae35a21a44621d` /
  `69ba8c6bcc760792c6e2f69c2eb08ebca1759901f844ab62f44c08697b43813b`。本測定は
  `e72a6b355ffb22f48104a22875eb77d53f177748906055bfec1da1628b5fbc0d` /
  `bc1505d0936d8261e278d9ee93d6ae0f04351e0fb3c9ced7beebab6c5d82ea56`。
- 本測定のpaired対応は生成run単位で、介入後の戦闘・探索軌跡を同一とは解釈しない。N<30セルは
  未確定とし、符号だけで受入基準やbalance方針を反転させない。

- 宝箱解除率は `chestDisarmSuccesses / chestDisarmAttempts` で記録する。ただし、対策 affix の評価にこの率を単独で使わない。必ず `kit` / `direct` / `forced` の経路内訳と `chestDisarmAttempts`（試行数）を併記する。
- 解除率は経路構成の変化で低下し得る。`kit`（確定成功）の比率が下がり、`direct`（確率成功）が増えると、対策を強化した場合でも率が下がることがある。分母も動く（#473 の Priest core-pools smart では attempts `6079→7044`）。率が低下した場合、まず経路内訳と試行数を確認する。
- sim の床罠・宝箱解除判断は同じ `TRAP_POLICY` 軸で制御する。明示した
  `TRAP_POLICY=legacy|conservative|disabled` は床罠・宝箱へ共通適用する。
  - 未指定時の既定は、宝箱 `DEFAULT_TRAP_POLICY_ID=legacy`（TRAP_KIT優先後に50%固定）、
    床罠 `DEFAULT_FLOOR_TRAP_POLICY_ID=conservative`（#341のEV既定）。宝箱既定を戻しても
    #341の床罠既定は変えない。
  - `disabled`: #326 以前の罠効果なし互換。
  - `legacy`: 罠効果あり。床罠は50%、宝箱はTRAP_KIT優先後に50%。旧simを再現する。
  - `conservative`: 床罠・宝箱ともEV分岐。選択肢として残すが、宝箱の現行近似は既定にしない。
- 宝箱の解除判断は50%固定を既定とする。`conservative` のEV分岐は、異種効果（HP・素材・時間）の
  共通効用が定義されておらず、HPと中身を比較する重み付けが恣意的になる。#480の現行条件
  （N=50,100 run/cell、4セル、95% CI）では、EV分岐で到達floorが `-0.15〜-0.19`、宝箱素材が
  `-2.3〜-2.9/run`、罠被害が `+0.45〜+0.88 HP/run`。4セルすべてでCI非重複。EV最大化の
  目的関数がendpointを悪化させたため、宝箱の既定へ採用しない。
- #480の旧/新実装比較（`TRAP_POLICY`未指定、同一seed/env、1セル、N=100）では、乱数消費順と
  run trajectory の出力SHAが一致した。したがって既定宝箱経路は旧挙動と同一であり、#461基準線
  （env hash `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`）は取り直し不要。
  取り直し対象は、`TRAP_POLICY=conservative`を明示指定して宝箱EVを選ぶ測定だけ。宝箱を
  `legacy`へ固定した#341の床罠のみの監査は対象外。素材EV、bank素材EV、工房投資額、#461再測定は
  未実施であり、実施済みとは扱わない。
- #485でPR #484後の固定kitを使い、宝箱を`legacy`に固定して床罠だけを切り替える方向監査を
  再測定した（seed=480、`workshop-complete`、N=1,000/方針、95% normal mean CI）。
  legacy→conservative は、平均到達floor **3.869 [3.719, 4.019]→3.871 [3.730, 4.012]**、
  素材/run **66.064 [62.387, 69.741]→66.242 [62.752, 69.732]**、床罠被害HP/run
  **21.208 [19.696, 22.720]→21.376 [19.790, 22.962]**。差は順に +0.002 / +0.178 /
  +0.168で、いずれもCI重複。旧監査の点差（−0.003 / −1.184 / −0.065）から符号は変わったが、
  N=1,000の方向監査であり、#341の既定を再判定しない。
- #485床罠監査のsummary JSON SHA-256は legacy `eb48ecddc2633a345bc28f5f58b3cd699bd63553433e8f0d33c49f210aa66b15`、
  conservative `c951322da0b3ec0fdf17197a4fdbfb0aee063ef9f6f238e507b1d864dc09eef2`。
- 方針変更のPRでは、新方針の値だけで判断せず、endpointのbefore/afterを全指標（到達floor、
  素材、罠被害など）について95% CI付きで出す。N<30のセルは未確定として結論に使わない。
- 宝箱の保守EVは `src/rules/trap_effect_rules.js` の `calculateChestTrapExpectedRisk` と、
  `src/rules/trap_rules.js` の `calculateChestDisarmActionEv` / `calculateChestDisarmEvThreshold` から導出する。
  directの損失は `(1−解除成功率)×完全効果risk`、強行の損失は `弱体効果risk＋usable中身の破損期待値`。
  `src/chest.js` のusable破損率30%は `CHEST_USABLE_BREAK_CHANCE` として共有し、simで再掲しない。
- 罠効果は、完全/弱体の期待HP、致死確率、毒・盲目・teleporter発動確率を計算する。異種効果を素材・HP・時間へ換算する共通効用はないため、riskは「party最大HPに対する期待HP割合」と各確率の最大成分を採る保守近似。item品質、状態異常継続時間、teleporterの追加歩数は数値化しない。
- 宝箱中身は生成済みmain itemの存在を1 content unitとする。装備品質・usable個別効用を捏造せず、force時のusable30%損失だけEVへ反映する。素材束は罠発動後も同じ生成経路で記録し、素材収入・bank素材EVは実測指標として別に併記する。
- TRAP_KITは有限在庫。現在floorで既知の未来chest数があり、kit数が未来機会数以下なら現在kitを温存する。現在chestの最良non-kit損失を1段先の機会費用近似に使い、未生成の未来floorの罠・中身分布を数字で作らない。現在floorに未来chestがない、またはkitが余剰ならkit使用を比較対象に含める。
- 代表近似（完全効果risk=1、弱体効果risk=0.5、中身損失なし）の等価点は50%。これは説明用の値であり、保守方針の実判定はtrap、party、main item、kit在庫、未来chest数で動く。

## Issue #507 固定結論（盲目の持続）

- #461/#485 の固定kit条件を引き継ぎ、seed=507、6工房分布加重、4職×3,000 run
  （合計12,000）、calibration=1,000で測定した。乱数並列数は未指定で、実行時は
  available=15 / resolved=15、map cache=1024。各点のCIはWilson 95%（平均値は
  normal 95% CI）で、N<30セルは未確定扱いとする。
- B案を採用する。`src/combat_logic/round.js` で、味方が生存したまま勝利または逃走で
  戦闘終了した時、盲目を解除する。全滅時には回復イベントを発生させない。
- A案（攻撃のダメージ半減だけを除去）は改善するが、B案より到達floor・B5/B10到達が低い。
  C案（標準kitの回復薬1個を目薬へ交換）は、目薬の使用数を増やす一方、回復薬競合で
  到達floor・生存を悪化させた。両案は採用しない。
- 宝箱解除時の盲目補正（`blind ? chance / 2 : chance`）は維持する。戦闘中の持続と別の
  counterplayであり、解除率単独ではなく試行数・`kit`/`direct`/`forced`経路と併記して評価する。
- 詳細な実行コマンド、endpoint、カバー率、実害、素材EV、raw SHA-256は
  `scratch/results/issue-507-blind-balance.md` に固定する。今回の結論は、B案の実ソース変更を
  反映した再測定に基づく。

## Issue #502 固定結論（不意打ち撤廃・trapSense転換）

- 主案を採用する。隣接床罠の察知を確定化し、旧 `trapSense` は既存装備・刻印の値を
  罠解除へ転換する。察知失敗による不意打ちは **29.2% [28.9, 29.6] → 0.0% [0.0, 0.0]**
  （床罠発動数を分母）になった。床罠発動原因の分類は、現行の不意打ち/察知後強行/解除失敗
  **29.2% / 59.9% / 10.9%** から、確定察知・撤去で **0.0% / 87.0% / 13.0%**、
  解除転換で **0.0% / 84.9% / 15.1%**。各条件で分類合計は発動数と一致した。
- seed=502、4職（Fighter/Thief/Priest/Mage）、各条件12,000 run（各職N=3,000）、
  6工房分布、target=B20終了、`TRAP_POLICY=conservative`、`TRAP_AVOIDANCE_POLICY=ev`、
  Wilson 95% CI / 平均値は正規近似95% CIで測定した。N<30セルは未確定扱い。
- 主要比較（平均到達floor / B10 entrant / 生還率 / 床罠被害HP/run）は、現行
  **4.362 [4.310, 4.414] / 9.2% [8.7, 9.7] / 46.0% [45.1, 46.9] /
  24.523 [23.949, 25.097]**、確定察知・撤去 **4.886 [4.823, 4.950] /
  12.6% [12.0, 13.2] / 50.6% [49.7, 51.5] / 24.002 [23.272, 24.731]**、
  解除転換 **4.916 [4.852, 4.980] / 12.9% [12.4, 13.6] /
  50.8% [49.9, 51.7] / 23.832 [23.114, 24.551]**。撤去と解除転換の差はCIが重なり、
  統計的優越を主張しない。解除転換は既存投資を無価値化しない設計理由で採用する。
- #499の固定察知用量掃引（seed=499、各職N=3,000、+0.4〜+4.0、敵ドロップ同量比較）では、
  旧 #499 の +2.0設定点は実測 **2.645本/run**、B10 entrant **21.8% [21.1, 22.6]**、
  B5死亡 **7.4% [6.7, 8.0]**、B10死亡 **7.5% [6.5, 8.6]**、素材EV/時間
  **0.162 [0.160, 0.164]**。同掃引のB10 entrant≥10%最小点は +0.4設定・実測
  **0.455本/run**（B10 entrant **14.6% [14.0, 15.3]**）であり、固定察知後に
  +2.0供給をゲーム側へ追加採用する変更は行わない。
- #502時点の#461固定条件の再基準線（seed=461、各職N=3,000、calibration N=1,000）は、平均到達floor
  が Fighter **3.54** / Thief **6.26** / Priest **6.31** / Mage **3.11**、4職Q4−Q1の
  B5死亡率差 **−4.5pt [−6.7, −2.3]**、trend **z=−4.388, p<0.0001**、A1成立。
  Q4完成率は **8.8% [8.3, 9.3]**、終了時core装備率は **74.6% [73.8, 75.4]**。
- 詳細なendpoint表・原因分解・実行条件は `scratch/results/issue-502-trap-detection.md`、
  `scratch/results/issue-502-499-fixed-detection.md`、
  `scratch/results/issue-502-461-rebaseline.md` に固定する。raw JSONLはコミットしない。
- 実行記録: #502 env hash `84ca46ba0d91d8c92a672a4b165a519f30f92eda6adebac26409877a48e80392`,
  raw SHA-256 `0521257c771484ce91697f656daeca86da334b77f989cf2b5914a051d885b408`。
  #499固定察知 env hash `807295c85697da44c79c17b0d250acfe3622fa306a76ffc8ed112f67fbf4e49e`,
  raw SHA-256 `44514221b8a92344afa2ede3256d18bb2922e5b01303b908cee04f38a8dc15cd`。
  #461再基準線 env hash `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`,
  raw SHA-256 `27c340238c1634e5385c26ac9818136e777442a7020c972d8b3e46f24e898408`。

## Issue #516 固定結論（基本4職sustain非対称）

- #516前対照は、同一の#461固定条件（seed=461、6工房状態の観測分布、現行kit・罠・逃走方針）で
  各職N=500、calibration N=100を実行した。率はWilson 95% CI、平均値は正規近似95% CI、
  N<30のセルは未確定とした。戦士・魔術師は死亡時の累積HP寄与で宝箱罠が大きく、罠由来の
  sustain非対称と判断した。
- 戦士の `trapGuard=40`、魔術師の `trapGuard=50` を採用する。軽減は床罠・宝箱罠のHPダメージ
  だけ（正のダメージは最低1）で、発見・解除、MP drain、状態異常、転送は変更しない。
  盗賊・僧侶のクラスpassiveと上級4職は変更しない。

| 職 | B5 entrant 前→後 | B10 entrant 前→後 | 平均floor 前→後 | 素材EV/時間 前→後 |
| --- | ---: | ---: | ---: | ---: |
| Fighter | 15.8% → 43.4% | 0.0% → 3.0% | 3.44 → 4.41 | 0.2303 → 0.2538 |
| Thief | 74.8% → 74.8% | 21.2% → 21.2% | 6.62 → 6.62 | 0.2066 → 0.2066 |
| Priest | 42.4% → 42.4% | 25.2% → 25.2% | 6.04 → 6.04 | 0.0798 → 0.0798 |
| Mage | 7.6% → 50.2% | 0.0% → 2.4% | 3.07 → 4.53 | 0.1516 → 0.1962 |

- guardian強化、arcane強化はB10 entrantを改善せず、全職camp/階層移動回復は平均floorを
  押し上げるが魔術師のB10 entrantを改善しなかったため不採用。罠被害-20%/-30%は弱く、
  -40%/-50%で両職の改善が確認できたため、クラス固有値として採用した。
- 期待されるプレイヤー影響は回復薬を追加配布せず、罠による浅層の即時HP損失と薬枯渇を後ろへ
  ずらし、戦士・魔術師の到達性を補うこと。固定測定では薬枯渇floorが戦士2.46→3.17、
  魔術師2.38→3.44となった。B10の突破/死亡/撤退はentrant N=15（戦士）/12（魔術師）のため、
  方向確認に留め、確定的な率とは扱わない。
- 採用後に#461を再測定した（各職N=3,000、calibration N=1,000）。平均到達floorは
  Fighter **4.48** / Thief **6.27** / Priest **6.30** / Mage **4.47**、4職Q4−Q1の
  B5死亡率差は **−7.3pt [−9.2, −5.4]**、trend **z=−7.598, p<0.0001**、A1成立。
  4職Q4完成率は **13.2% [12.6, 13.8]**、終了時core装備率は **83.5% [82.8, 84.1]**。
- 詳細なendpoint、終了理由、被害源、薬枯渇、候補比較、実行条件は
  `scratch/results/issue-516-class-sustain.md` に固定する。#461再基準線の実行記録は
  `scratch/results/issue-461-baseline.md` に固定し、raw JSONLはコミットしない。
- 実行記録: #516 env hash `caf2dec19affd4c86e36c367ef71aff5889ef4a3c884452eb103b0b59ca7c2ab`,
  raw SHA-256 `731ebfb1a93d7b8128e55799f15e0bbc1604e9647cf8d23946af0403ba80a725`。
  #461再基準線のraw SHA-256は
  `ba1487eccedc51a8b6c590291103d4f802fca5b40cd4252e7f536cfaab349f97`、env hashは
  `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`。

## Issue #528 フェーズ2固定結論（職業固有撃破sustain）

- フェーズ1で撤退閾値を sweep し、現行の `PORTAL_HP_THRESHOLD=0.35`、
  `PORTAL_MAX_HEAL_POTIONS=0`、`PORTAL_MIN_FLOOR=3` より浅くする案はEV/時間を
  改善するだけで戦士・魔術師の問題を解決しないと確認した。フェーズ2は探索回復点と
  汎用装備affixを除外し、既存 `killHeal` 経路をクラスpassiveへ適用する候補だけを測定した。
- seed=461、#461固定条件、工房6状態の観測分布、各ケース・職N=500、calibration N=100で
  戦士と魔術師を別々に sweep した。盗賊・僧侶のB10 entrantは全ケースでそれぞれ
  **21.2% / 25.2%（Δ0.0pt）**だった。

| 職 | 採用値 | B5撤退率 | B10 entrant | 平均floor | 素材EV/時間 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fighter | `killHeal +2` | 75.1% → **31.8%** | 3.0% → **30.8%** | 4.41 → **7.24** | 0.2538 → **0.2346** |
| Mage | `killHeal +4` | 59.0% → **39.5%** | 2.4% → **11.4%** | 4.53 → **5.45** | 0.1962 → **0.1753** |

- B5撤退率を主指標に、B10到達性・平均到達階・素材EV/時間を併読し、戦士は +2、
  魔術師は +4をkneeとして採用する。+6以上は到達が深くなる一方EV/時間が悪化する。
  上級職・盗賊・僧侶は変更しない。
- 詳細表・CI・薬指標・実行条件は `scratch/results/issue-528-class-sustain-phase2.md`、
  再現コマンドは `node scratch/sim_issue_528_class_sustain_phase2.js` とする。
- 実行記録: env hash `cf75043b8049fc68892c4c0e63dc567082c76670bd58305c5692694889b93970`、
  raw SHA-256 `533f7354352efabc16c660cb4eaa0c57b95f98063447b941430158b32565a24b`。

## Issue #532 固定結論（`killHeal`採用後の#461基準線）

- `origin/main` のPR #531後、#461固定条件を再測定した。seed=461、基本4職各N=3,000、
  calibration N=1,000、target depth=B20終了、工房6状態の観測分布、現行departure kit・
  powder鑑定・EV逃走・保守罠・状態治療・`TOWN_PORTAL`を使用。`SIM_PARALLEL`とmap cache overrideは未指定。
- B1の内訳は全職 entrant=100%で、突破/死亡/撤退は戦士 **98.0% / 2.0% / 0.0%**、
  盗賊 **96.5% / 3.5% / 0.0%**、僧侶 **85.2% / 14.8% / 0.0%**、魔術師
  **97.4% / 2.6% / 0.0%**。初回B1突破率は順に **64.1% / 74.1% / 38.5% / 67.3%**。
- B5は、戦士 **76.1% / 65.5% / 1.3% / 33.2%**、盗賊 **72.8% / 59.9% /
  4.0% / 36.0%**、僧侶 **43.6% / 87.4% / 12.6% / 0.0%**、魔術師 **63.6% /
  37.5% / 14.8% / 47.7%**（各行は entrant / 突破 / 死亡 / 撤退）。
- B10は、戦士 **27.9% / 52.1% / 2.9% / 45.0%**、盗賊 **19.2% / 31.7% /
  10.3% / 58.1%**、僧侶 **27.5% / 89.6% / 7.9% / 2.5%**、魔術師 **8.1% /
  50.4% / 7.0% / 42.6%**（各行は entrant / 突破 / 死亡 / 撤退）。全run平均到達floorは
  戦士 **7.12** / 盗賊 **6.26** / 僧侶 **6.30** / 魔術師 **5.32**。
- Q4完成率は4職合算 **16.0% [15.4%, 16.7%; N=12,000]**、職別は戦士19.0% /
  盗賊18.2% / 僧侶10.9% / 魔術師15.9%。終了時core装備率は4職合算 **85.8%
  [85.1%, 86.4%; N=12,000]**、職別は戦士94.1% / 盗賊91.4% / 僧侶71.4% /
  魔術師86.3%。
- A1はQ1→Q4のB5死亡率 **11.7% / 7.3% / 6.6% / 3.8%**、Q4−Q1
  **−7.9pt [−9.5, −6.3]**、class-stratified Cochran–Armitage **z=−9.417、減少方向
  p<0.0001**。統計的反転なし、職内centered成立。**A1成立**。各職個別判定は戦士/盗賊が不成立、
  僧侶/魔術師が成立だが、基準線の主判定は4職合算。
- PR #531のN=500採用点（戦士B10 entrant **30.8% [26.9, 35.0]**、魔術師
  **11.4% [8.9, 14.5]**）と比較すると、N=3,000はそれぞれ **27.9% [26.3, 29.5]**、
  **8.1% [7.2, 9.2]**（−2.9pt / −3.3pt）。完全一致ではないがCIは僅かに重なり、改善方向・採用値の
  妥当性は一致。小N点推定を基準線へ流用せず、N=3,000を正本とする。
- env hashは前回#516基準線と同じ `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`。
  `killHeal`は職業データ変更であり、固定env hashの入力ではないため hash は変わらない。source commitは
  `373980411fc44a5f5da119d44e8feacd2a78f3a3`、`origin/main` ancestor=true、stale overrideなし。
- 実行記録: calibration 122.797s、simulation 47.184s、合計169.981s、総CPU858.443s、
  resolved parallelism=15、raw JSONL SHA-256 `8786d7b113e72714909fc5957348cec681bda121a4a7ba8b22261bea1f9745fe`、
  summary JSON SHA-256 `a9fabc14cb6bc050433f53493f91f56e44b424d9fb52b8ea276d4296792fe05b`。
- 主結果は `scratch/results/issue-461-baseline.md` / 同名summary JSON。N<30の主endpointはなし。
  本Issueでは#470/#475/#510/#264の下流再測定は別途実施せず、#532基準線更新のみ。ゲームコード・balance値は変更しない。

## Issue #512 固定結論（宝箱盲目ループ）

- オーナー判断（2026-08-11）の現行条件を入力し、#461固定env（seed=461、4職各N=3,000、
  calibration N=1,000、6工房状態、B5代理）で測定した。`SIM_PARALLEL` は未指定、率はWilson 95% CI、
  平均は正規近似95% CI、N<30セルは未確定とした。解除率は単独で評価せず、試行数と
  `kit/direct/forced` 経路を併記した。
- 入力したowner基準線は Fighter **44.4% / 72.6% / 3.4% (B10 N=103) / 4.48**、
  Thief **72.8% / 35.9% / 19.2% (N=577) / 6.27**、Priest **43.7% / 0.0% /
  27.5% (N=825) / 6.30**、Mage **49.9% / 63.7% / 1.6% (N=49) / 4.47**
  （順にB5 entrant / B5 retreat / B10 entrant / 平均floor）。下表は同一固定条件の観測値で、表示を丸めている。

| 職 | B5 entrant | B5撤退 | B10 entrant | 平均floor | 宝箱盲目付与数 | 床罠盲目付与数 | 敵盲目付与数 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fighter | 44.4% | 72.6% | 3.4% | 4.48 | 2,185 | 0 | 964 |
| Thief | 72.8% | 35.9% | 19.2% | 6.27 | 1,574 | 0 | 2,087 |
| Priest | 43.7% | 0.0% | 27.5% | 6.29 | 3,673 | 0 | 1,679 |
| Mage | 49.9% | 63.6% | 1.7% | 4.48 | 1,908 | 0 | 232 |

- Fighter: clear解除 **30.2% (7,053/23,368)**、blind解除 **15.9% (137/860)**。全経路
  `kit/direct/forced=1,725/22,503/43,055`、blind時 `40/820/1,583`、blind時失敗723、罠発動2,306、
  盲目罠HP被害4,802、失敗後B5撤退 **31.6% (155/491)**、HP被害後B5撤退 **30.3% (241/795)**。
- Thief: clear解除 **85.5% (85,305/99,795)**、blind解除 **47.6% (413/868)**。全経路
  `3,328/97,335/981`、blind時 `43/825/978`、blind時失敗455、罠発動1,433、
  盲目罠HP被害5,075、失敗後B5撤退 **20.2% (70/346)**、HP被害後B5撤退 **21.3% (121/568)**。
- Priest: clear解除 **31.7% (12,470/39,307)**、blind解除 **18.2% (258/1,420)**。全経路
  `3,549/37,178/59,994`、blind時 `99/1,321/2,558`、blind時失敗1,162、罠発動3,720、
  盲目罠HP被害11,655、失敗後B5撤退 **0.0% (0/684)**、HP被害後B5撤退 **0.0% (0/1,062)**。
- Mage: clear解除 **29.8% (7,050/23,672)**、blind解除 **15.5% (123/791)**。全経路
  `1,655/22,808/42,828`、blind時 `38/753/1,396`、blind時失敗668、罠発動2,064、
  盲目罠HP被害3,430、失敗後B5撤退 **31.7% (139/439)**、HP被害後B5撤退 **30.4% (221/728)**。

- 盲目時解除率低下→解除失敗→罠発動は4職すべてで実在。戦士・魔術師は失敗後B5撤退へ接続し、
  僧侶はB5撤退0.0%のため同経路の深度影響なし。盗賊は解除率の絶対低下が最大だが、失敗後撤退率は
  戦士・魔術師より低い。**盲目ループは職業格差の一因**と固定するが、観測測定のため単独因果量は識別しない。
- 全体では盲目状態の解除試行3,939件中成功931件、失敗3,008件、罠発動9,523件、罠HP被害24,962。
  盲目罠HP被害後のB5撤退は **18.5% (583/3,153)** で、罠発動数だけでなくHP被害経路も追跡した。
- `trapGuard` は `src/data/classes.js` の実在値を sim の
  `getSimulationTrapGuardByParty`→`applyTrapGuardToEffect` で使用・適用する。閃光罠効果通過
  **52,730件**、非ゼロguard通過 **27,741件**、盲目効果不変 **52,730件**。軽減対象はHP damageのみで、
  閃光罠の盲目へは効かない。現行床罠に盲目効果はない。
- 対策は追加しない。解除率半減を撤廃すると#480の宝箱EV分岐と経路構成が同時に動くため、
  #511の解除条件、`blind ? chance / 2 : chance`、現行EV方針、#517の`trapGuard`を維持する。
- 詳細JSON/MDは `scratch/results/issue-512-chest-blind-loop.md` に固定し、raw JSONL/summary JSONは追跡しない。
  実行記録: env hash `6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572`、
  source commit `6bf1f4e8f6a781d1a0cf5e533876a3ff3178426d`、raw SHA-256
  `2a1c30a017baf44c5edfbe3c1f5bb60dfa935cc58acf41a4c102cd617c9e0a6c`、summary SHA-256
  `8e2d18ba6b3d566244d3304b0eb9bf2a6c2e57dea668f59d22b38416a1922065`。

## Issue #509 固定結論（浅層回復供給の追加は不採用）

- #509 は #499 の「+2.0本/run が必要」を根拠にしていたが、その後 #511（盲目解除）/
  #514（確定察知）/ #517（`trapGuard`）で、供給を追加せずに目標を達成した
  （[[Issue #516 固定結論]] 参照、4職合算 B10 entrant 12.95%）。実装前に、現行
  `origin/main`（#517後）を基準として `scratch/sim_issue_499_shallow_recovery_dose_sweep.js`
  を seed=461・N=3,000/職・calibration N=1,000・6工房状態で再実行し、供給0/+0.4/+1.0/
  +2.0/+3.0/+4.0本/run を掃引した。
- 基準線（供給+0）の4職合算 B10 entrant は **14.4% [13.8, 15.1]**（職業別: 戦士2.5%
  [2.0, 3.2] / 盗賊23.5% [22.0, 25.1] / 僧侶29.4% [27.8, 31.0] / 魔術師2.3% [1.8, 2.9]）。
  受入目標≥10%を、CI下限を含めて既に達成している。#516固定結論の12.95%とは掃引スクリプト
  固有の乱数消費順・calibration経路の違いで数ポイントずれるが、両者とも目標達成という結論は
  一致する。
- 用量掃引（4職合算 B10 entrant、装備拾得拒否/run）:

| 用量目標 | 実測追加/run | B10 entrant | 装備拒否/run |
| ---: | ---: | ---: | ---: |
| +0（基準線） | 0.000 | 14.4% [13.8, 15.1] | 0.758 |
| +0.4 | 0.502 | 16.1% [15.5, 16.8] | 0.993 |
| +1.0 | 1.436 | 20.4% [19.7, 21.2] | 1.364 |
| +2.0 | 3.143 | 29.5% [28.7, 30.3] | 2.324 |
| +3.0 | 4.612 | 36.3% [35.5, 37.2] | 3.355 |
| +4.0 | 5.849 | 41.5% [40.7, 42.4] | 4.148 |

  B5死亡・B10死亡・素材EV/時間はすべての点でPASS（掃引上のFAIL点なし）。制約はすべての
  用量で満たすが、目標達成に必要な用量は0（追加不要）。
- 職業別 B10 entrant（+2.0本/run時、参考）: 戦士2.5%→17.0%、盗賊23.5%→44.7%、僧侶29.4%→
  38.6%、魔術師2.3%→17.6%。低位職の相対倍率は大きいが、盗賊−戦士の絶対pt差は21.0pt→
  27.7ptへ拡大しており、供給増による職業差是正効果はない（[[Issue #516 固定結論]]と同じ結論）。
- **結論: 不採用。** 目標は追加供給なしで達成済みであり、追加供給は制約を満たしながらも
  装備拾得拒否だけを増やす（+0.4で0.758→0.993/run、+31%）。所持枠20の圧迫を理由なく
  増やすため、(A)宝箱追加抽選 / (B)敵ドロップ / (C)キャンプのいずれも実装しない。
- 実行記録: env hash `c7b419ecb53cbb0a66ec13ce34d7fed4cd2904679d4aeb6a180e6c01c3eae86c`、
  raw JSONL SHA-256 `4a4abbe45293b17e214efe403f3d5cd3c94e8b4cdd831085ec589db47c587d43`
  （コミットしない）。詳細は `scratch/results/issue-499-shallow-recovery-supply.md` に固定する。

## Issue #508 固定結論（回復単位密度）

- 2026-08-12のオーナー判断を主判定として、#509の供給増は再提案せず、現行#461の出発kit
  **傷薬15×4 = 60HP/run**を固定した。傷薬25/40は周期配分（2/3個、1/2個）で
  60HP/runの期待値を維持し、上薬40浅層素材what-ifも同じ60HP/runで比較した。
- `scratch/sim_depth_material_ev.js` に自然回復候補の単位正規化、回復薬使用時の要求/実回復/切捨て監査、
  source別offer監査を追加した。`scratch/sim_issue_508_heal_unit_density.js` は#461と同じ
  workshop分布・seed系列で4職を個別測定する。
- オーナー提供の#461基準線は Fighter **44.4% / 72.6% / 3.4% / 4.48**、Thief
  **72.8% / 35.9% / 19.2% / 6.27**、Priest **43.7% / 0.0% / 27.5% / 6.30**、
  Mage **49.9% / 63.7% / 1.6% / 4.47**（順にB5 entrant / B5撤退 / B10 entrant /
  平均floor）。本測定の傷薬15 controlもこの基準線と整合した。

|条件|Fighter B5撤退|Mage B5撤退|Thief B10 entrant|Priest B10 entrant|Fighter平均floor|Mage平均floor|
|---|---:|---:|---:|---:|---:|---:|
|傷薬15|73.0% [70.5, 75.3]|65.9% [63.5, 68.3]|22.0% [20.5, 23.5]|28.9% [27.3, 30.5]|4.40|4.42|
|傷薬25|77.7% [74.6, 80.5]|70.6% [66.7, 74.2]|14.2% [13.0, 15.5]|20.3% [18.9, 21.8]|3.78|3.52|
|傷薬40|77.8% [73.6, 81.5]|73.5% [67.7, 78.6]|8.7% [7.7, 9.7]|15.9% [14.6, 17.2]|3.24|2.93|
|上薬40（浅層素材）|76.8% [72.8, 80.3]|70.6% [65.5, 75.2]|11.2% [10.2, 12.4]|18.3% [17.0, 19.8]|3.36|3.08|

- 主判定は不成立。単位25/40で戦士・魔術師のB5撤退率は低下せず、両職の平均floorも低下した。
  上薬40浅層素材は傷薬40より改善するが、傷薬15 controlを上回らない。制約の盗賊・僧侶B10 entrantも
  単位25/40および上薬what-ifで低下するため採用しない。
- 過剰回復切捨ては単位拡大とともに増加し、15→25→40で **19.071→32.594→44.262HP/run**。
  上薬40浅層素材は **41.766HP/run**で、枠効率の利得より切捨て損失が大きい。3点で主判定が
  一貫して悪化し、採用候補がないため中間点を追加せず、kneeは「15未満の未探索域」と固定する。

|条件|出発個数/run|出発HP/run|差分|自然候補HP/run|自然取得HP/run|観測総候補HP/run|観測総取得HP/run|
|---|---:|---:|---:|---:|---:|---:|---:|
|傷薬15|4.000|60.000|0.000|42.735|40.705|102.735|100.705|
|傷薬25|2.400|60.000|0.000|31.688|30.524|91.688|90.524|
|傷薬40|1.500|60.000|0.000|24.585|23.607|84.585|83.607|
|上薬40（浅層素材）|1.500|60.000|0.000|27.022|25.912|87.022|85.912|

  出発HPは固定供給（全条件60HP/run）。自然分と観測総量は到達経路に依存するため、候補/取得を
  別指標として記録し、固定供給の判定へ混ぜない。詳細な職業別endpoint、経済、枯渇、拾得拒否、
  レベル帯別切捨ては `scratch/results/issue-508-heal-unit-density.md` に固定する。
- seed=461、4職各N=3,000、calibration N=1,000、6工房分布、B5代理、`SIM_PARALLEL`未指定、
  Wilson 95% CI / 平均は正規近似95% CI、N<30は未確定。実行は
  `node scratch/sim_issue_508_heal_unit_density.js`。raw JSONL/summary JSONは追跡せず、summary MDのみを
  コミットする。
- ゲーム本体のbalance値・craftレシピ・回復効果は変更しない。測定インフラと監査だけのため、
  Design Canonは影響なし。プレイヤー影響は単位変更を採用せず現行15HPを維持すること。

## Required Verification

- `npm run test:unit`
- Deterministic scratch simulation when changing enemy, reward, map, drop, or
  progression values.
- `node scratch/test_sim_reward_paths.js` when adding or changing a
  `scratch/sim_*.js` file.
- Short written summary of expected player impact.

## Must Not Do

- Do not tune by feeling without reproducible evidence.
- Do not request complex simulation infrastructure unless a simple scratch check
  cannot answer the question.
- Do not optimize for perfect balance before the core rule is stable.
- Do not fix a threshold from an override-based what-if run. Overrides shift
  random consumption order, so the number does not survive the equivalent change
  in `src/`; re-measure against the real source change before settling on a
  value.
- Do not carry forward a prior simulation conclusion without checking which
  mitigations that run modeled.

## Issue #534 固定結論（魔術師の死亡律速）

- #532基準線で魔術師のB5死亡率は14.8%、B10到達率は8.1%だった。#534のN=500
  診断では現行 Mage のB5死亡率15.8% [12.3,20.2; N=322]、死亡runの最後の
  被害sourceは通常戦闘43.9% [36.7,51.4; N=173]、宝箱罠24.9%、boss23.1%、
  床罠8.1%だった。`killHeal`は6.77回/run、実回復23.25HP/runだが、死亡runの
  34.7%は発動0回。死亡直前被害は9.16HP、最大HP比0.448、1.16hit/runであり、
  `killHeal`増量を第一候補にしない。
- Mageのみを対象に `killHeal`、初期HP、レベルHP成長、`trapGuard`、戦闘短縮、
  非撃破回復を掃引した。採用点は初期HP+2・レベルHP成長+1（初期HP21、成長4..6）。
  N=500ではB5死亡10.3%、B10到達16.2%、平均floor6.11、素材EV/時間0.1755だった。
  killHeal増量は発動0死亡を安定して減らさず、trapGuard増量と追加回復は素材EV/時間を
  改善せず、戦闘短縮は平均turnを示したうえで不採用とした。
- 候補介入では他3職を変更せず、B10 entrant差は戦士/盗賊/僧侶すべて0.0pt。
  採用値の#461基準線を `scratch/results/issue-461-baseline.md`、診断と候補比較を
  `scratch/results/issue-534-mage-death.md` に記録する。両結果の率はWilson 95% CI、
  N<30のセルは未確定として扱う。採用後のN=3,000ではMage B5死亡10.6%、B10到達
  15.5%、平均floor6.08となり、4職合算A1も成立した。

## Output

Use the repository review output format from `.agents/README.md`.
