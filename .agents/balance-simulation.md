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
