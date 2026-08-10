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
core装備率/実発動率/定着率・終了時core数分布には Wilson 95% CI を付ける。
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
- `IDENTIFICATION_POLICY=powder`、`FLEE_POLICY=threshold`、
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
FLEE_POLICY=threshold
FLEE_HP_THRESHOLD=0.35
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
この再測定の env hash は `e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda`。
出力 SHA-256 は raw JSONL `560673693bdff8e87895faf12b88fcfe4e977c99e19c2a5f23d5907d81138cc0`
、summary JSON `81fa80b96eb8aeac5a28f21815a6bf7ecddab15557d2eeb6b8a9a3965b1cf966`。
Q4 の点推定は Q3→Q4 で 21.2%→24.1% と上昇したが、同一測定の隣接差95% CIは0を跨ぐ。
点推定反転を統計的非単調と扱わず、Issue #470で全候補を再判定する。balance 値は変更しない。

## Issue #470 固定結論（完成ビルド定義）

Issue #470 の採用定義は、現行 `combatBuildScore`（equipment + first combat core）の職内
quartile Q4。同一の Issue #461 固定条件・同一 raw run（B5 entrant N=2799）を使い、
結果を見る前に固定した隣接差CI＋職層調整 Cochran–Armitage trend testで全7候補を再判定した。
現行 total は A1 の3条件を満たすため、深層生存 B5 `deathFloor === 5` を完成度の主 endpointとして採用する。

- 単調性判定: Δ=Q次−Q前の正規近似95% CIを全隣接ペアで出力。CI下限>0だけを統計的反転とし、
  Δ>0でもCIが0を跨ぐ点推定反転は失格にしない。全体傾向は職を層とする Cochran–Armitage
  trend test（Q1〜Q4 score=0〜3）の減少方向 p<.05、かつ統計的反転なしを成立とする。
- 現行 total は Q1→Q4 B5死亡率 32.95%→26.47%→21.57%→24.03%。Q3→Q4 は
  +2.46pt [-1.94, +6.86]で0を跨ぎ、点推定反転だが統計的非単調ではない。trend z=-4.357、
  減少方向 p<0.0001。Q4−Q1 職内 centered 差は -8.9pt [-13.5, -4.3]。
- equipment-only と equipment + 全 combat core も A1成立。ただし採用優先順位は既存の現行 totalを先とし、
  all-core total は測定専用の有力な代替。first-core-only / all-core-only は減少 trend 不成立。
- Q3→Q4切り分けの equipment-only +2.2pt [-2.2, +6.6]、first core-only -0.2pt [-4.8, +4.3]、
  all-core-only -0.8pt [-5.4, +3.8]はいずれもCIが0を跨ぐ。反転の実在も主因もこのNでは確定せず、
  「反転の主因はequipment側」とは書かない。

- B5 snapshot は `floor=5` / `point=floor-start`。`reachedFloor` は run 終了後の値であり、
  B5 entry スコアの深度正規化へ使わない。B5 entrant 内の score と終了到達floorの相関は、
  到達選別後の関連であって因果効果ではない。
- 現行 total の寄与は equipmentStatScore が支配的。Q1/Q4で first combatCoreScore の
  total寄与比は3.8%/5.3%、全 combat core 合計でも4.5%/7.1%。equipment-only の Q3→Q4も
  +2.2pt [−2.2, 6.6] と点推定では Q3→Q4 が戻るがCIが0を跨ぎ、all-core total化後も
  Q3→Q4 は点推定では戻る（統計的反転とは扱わない）。
- B5 entrant の複数 combat core は24.9% [23.3, 26.5]。first coreのみの score は
  16.8% [15.5, 18.3]で全core合計を過小評価し、複数core runの first→all 差は
  3.28 [2.95, 3.61]。ただし all-core-only は A1のQ4−Q1 CI上限<0を満たさず、
  core 1個制限の修正だけで判定力は生じない。
- 正式候補7個、A1主条件21個、単調性補助チェック28個、報告総数49個。α=.05の機械的な
  期待偽陽性2.45件、Bonferroni family-wise α=.00102。候補追加・結果後の採用変更なし。
- 絶対閾値は score の外部校正値がなく、結果後の threshold 選択が数字合わせになるため正式候補にしない。
- 採用定義により #271 の A1（Q4−Q1、統計的単調性、Q4安全性gate）/ A2（class-centered score×depth）/
  A3（core / 対応support feature）、完成ビルド率、quality quartile入力のdepth-quality表・要約・派生判断を
  同じ #461 固定条件で取り直す。#470のB5 raw再測定は不要。balance 値・srcのゲーム挙動は変更しない。

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

## Output

Use the repository review output format from `.agents/README.md`.
