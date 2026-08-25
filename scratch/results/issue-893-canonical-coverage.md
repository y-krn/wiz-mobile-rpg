# Issue #893 canonical Balance Simulation coverage audit

## 判定

- 対象 production SHA: `6aaf28aede87c3b53e1c0dac40c4b3b60fe2c584`
- canonical runner: `scratch/sim_depth_material_ev.js` (`sim-scope: run`)
- 結論: **#843 の標準 baseline は全指標について `blocked`**
- ただし、merchant / secret route / enhance・polish / `fromDrop` chest の影響を受けない、production combat round の狭い診断値は `ready` として別扱いできる。
- 本監査では production rule / balance value を変更していない。

`modelDomains` の宣言だけでは modeled と判定せず、production の定義・caller・player route・simulation route・record/telemetry を確認した。canonical runner の manifest 自体も、N=1 smoke では merchant purchase を必ず到達できないため、merchant を軽量 runtime coverage に含めていない（`scratch/simulation_manifest.js:72-113`）。

## 調査範囲と再現コマンド

Production inventory は以下を起点に、直接 caller と UI/action handler まで追跡した。

- map / floor: `src/run_map_generator.js`, `src/map_generator.js`, `src/movement.js`, `src/menu/explore_actions.js`
- combat / status: `src/combat_ui/encounter.js`, `src/combat_logic/round.js`, `src/combat_logic/status_effects.js`, `src/combat_logic/boss_actions.js`
- item / equipment: `src/chest.js`, `src/rules/chest_rules.js`, `src/systems/equipment_generation.js`, `src/systems/identification.js`, `src/craft.js`
- economy / progression: `src/systems/workshop.js`, `src/systems/milestone_merchant.js`, `src/systems/leveling.js`, `src/combat_logic/rewards.js`, `src/result.js`
- record / UI: `src/telemetry.js`, `src/state/codex_state.js`, `src/menu/milestone_merchant.js`, `src/equip.js`

実行したチェック:

```sh
node --check scratch/sim_depth_material_ev.js
SIM_RUNS=1 SIM_CALIBRATION_RUNS=1 SIM_PARALLEL=1 \
  SIM_SCENARIOS=workshop-empty-no-portal \
  node scratch/sim_depth_material_ev.js

SIM_SKIP_PROVENANCE=1 SIM_RUNS=10 SIM_CALIBRATION_RUNS=1 SIM_SEED=231 SIM_PARALLEL=1 \
  node --input-type=module -e 'const m=await import("./scratch/sim_depth_material_ev.js"); const r=m.runCalibratedDepthSimulationTask({kind:"scenario",scenarioId:"workshop-complete",identificationPolicyId:"powder",runCount:1},{}); console.log(JSON.stringify(r.results.map(x=>({label:x.label,runs:x.runs,merchantStock:x.merchantStock,statusObservations:x.statusObservations?.byStatus,trapActivations:x.trapActivations,chestsOpened:x.chestsOpened,expGained:x.expGained})),null,2));'
```

最後の N=10 は merchant / status の到達性を確認する targeted probe であり、統計 baseline ではない。probe では B10 で `heal_potion`, `antidote`, `wake_powder`, `paralyze_cure` が各 `attempts=1, successes=1`、B15/B20 でも merchant stock の成功が観測された。status も B5/B10/B15/B20 の集計で `poisoned`, `blind`, `sleep` の apply と cure / natural expiry / combat-end が観測された。

N=1 canonical smoke の出力では、`working tree clean: true`、`floorsTraversed > 0`、`statusObservations.byStatus.poisoned.applications=1` を確認した。production bundle positive controls も `dist/assets/index-CIQ3775P.js` で `宝箱の調査・解除`、`深層商人`、`研磨する`、`隠し扉発見` の各 player-facing string を検出した。

## Production mechanism inventory

分類は canonical run Simulation の標準経路に対するもの。

- `modeled`: production rule を呼び、標準 run で再現・観測できる。
- `partially modeled`: production rule の一部は使うが、player policy・到達条件・action・確率経路の一部が sim 固有または未到達。
- `omitted`: canonical run の責務外、または現状の runner では経路がない。

### Exploration / map

| mechanism | status | evidence / limitation | priority |
|---|---|---|---|
| run floor generation | modeled | `generateRunFloor` が `generateRandomMap`、floor template、biome、trap/secret counts、validation を通る（`src/run_map_generator.js:155-207`）。runner は同じ production export を呼ぶ（`scratch/sim_depth_material_ev.js:61-64,10676`）。 | — |
| biome / floor progression | modeled | `getFloorTemplate` と production `generateRunFloor` により B1→B20 の floor/biome を生成し、runner は `floorsTraversed` を出力する（`scratch/sim_depth_material_ev.js:9714-9717`）。 | — |
| encounter generation / enemy pool | modeled | `generateEncounter` は biome pool、rare chance、encounter size、depth scaling を production rule で選ぶ（`src/combat_ui/encounter.js:10-75`）。 | — |
| normal / elite / boss / midboss placement | partially modeled | boss/midboss と roaming elite は production map / `createFloorElite` を読んで route に配置するが、normal movement と roaming AI は path schedule に置き換える（`scratch/sim_depth_material_ev.js:8377-8418,8508-8647`）。 | P2 |
| milestone guardian / checkpoint start | partially modeled | production は milestone floor の boss/merchant/portal を map cell に配置し、`executeEnterDungeon` が start state を作る（`src/run_map_generator.js:41-60`, `src/movement.js:736-792`）。sim は `createSimulationState` と milestone floor transition を使うが、実際の entry UI / cell traversal は通らない（`scratch/sim_depth_material_ev.js:3475-3783,11311-11333`）。 | P2 |
| milestone merchant cell / return portal cell | partially modeled | production は boss 撃破後に cell へ到達して UI submenu を開く（`src/movement.js:592-614`）。sim は floor 完了時に stock rule を直接呼ぶため、cell 到達・blocked-before-boss・portal cell の route cost は未再現（`scratch/sim_depth_material_ev.js:11311-11333`）。 | P1 |
| hidden doors / secret search | partially modeled | production は `searchSecretDoor` が encounter chance を払い、成功時 `openWall` する（`src/menu/explore_actions.js:33-124`）。sim の route planner は未発見 secret door を壁として扱う一方、chest は map 全体から数え、70% pickup を独立抽選する（`scratch/sim_depth_material_ev.js:8283-8331,8650-8661`）。secret room の探索時間・発見率・報酬への到達が一致しない。 | P1 |
| exploration items / exploration spells | partially modeled | issue #412 tactical item policy と optional exploration spell policy は sim に存在する（`scratch/sim_depth_material_ev.js:10777-10791`）。manual tool selection、search timing、UI input は未再現。 | P2 |
| floor-specific B5 fire trap | partially modeled | production は B5 の非-special step で 5% roll、5-step cooldown、`triggerFlameTrap` を通る（`src/movement.js:959-968`）。sim は同じ chance/cooldown/effect を独自 step schedule に適用する（`scratch/sim_depth_material_ev.js:8685-8754`）ため、実移動・special-cell判定は近似。 | P2 |
| camp / stairs recovery | partially modeled | production camp submenu / rest は `camp_rest`、stairs heal は movement にある。sim は `applySimulatedCampRest` と floor transition heal を使うが UI action / camp choice は固定 policy（`scratch/sim_depth_material_ev.js:8892-8935,11311`）。 | P2 |

### Combat

| mechanism | status | evidence / limitation | priority |
|---|---|---|---|
| normal / elite / boss combat | modeled | encounter は production `generateEncounter`、各 round は production `runCombatRoundCalculation` を呼ぶ（`scratch/sim_depth_material_ev.js:6109-6730`）。boss / midboss / elite の special event も同じ round path に入る（`scratch/sim_depth_material_ev.js:10964-11017`）。 | — |
| physical / spell damage, hit, mitigation | modeled | action selection は sim policy だが resolution は production combat round / damage / spell resolution。`scratch/test_sim_follow_gate.js` の canonical smoke gate が round resolution を要求する。 | — |
| flee / retreat policy | partially modeled | combat flee は production round path に接続し、`FLEE_POLICY` を比較できる。逃走後の実 UI movement / `ESCAPE_SCROLL` の確率 route は再現せず、`TOWN_PORTAL` は sim 固有の HP/stock policy（`scratch/sim_depth_material_ev.js:7053-7083,11104-11111`）。 | P2 |
| class passives | modeled | class state と core/passive parameters を production data/rules から読み、round action / recovery / equipment score に反映する。 | — |
| core / support / affix | partially modeled | production equipment generator と affix definitions を通り、core scoring/equip policy と activation counters がある（`scratch/sim_depth_material_ev.js:7985-8210`）。ただし人間の build choice と compatibility outside configured policy は未再現。 | P2 |
| MP / recovery spells | modeled | production spell payment/effect と combat round を呼び、MP pressure、Dios/heal、mana recovery を記録する（`scratch/sim_depth_material_ev.js:6733-6810,9911-9921`）。 | — |
| boss-specific mechanics | partially modeled | boss action implementation は production round/boss action に接続し、boss special battle を記録する。ただし boss cell への実移動と player action policy は sim schedule/policy。 | P2 |

### Status

Current main の status IDs は `poisoned`, `blind`, `sleep`, `paralyzed`, `silence`, `bleeding`（`src/combat_logic/status_effects.js:1-25`）。`vulnerable` は current main の status ID として存在しないため、別の未モデル status としては数えない。

| mechanism | status | evidence / limitation | priority |
|---|---|---|---|
| poison apply / refresh / exploration tick / natural expiry | modeled | production `applyStatusEffect` / `resolveExplorationPoisonStep` を使用し、sim は chest/enemy application、exploration damage、natural cure、death を `statusObservations` に記録する（`src/combat_logic/status_effects.js:167-270`, `scratch/sim_depth_material_ev.js:10741-10756,9674-9677`）。 | — |
| blind / sleep / paralyzed apply and combat expiry | partially modeled | production round applies enemy status and sim uses production round; N=10 probe で blind/sleep application と combat-end / incapacitated-action を観測した。標準 smoke では確率経路が未確定で、status ごとの大規模代表値は未測定。 | P1 |
| bleeding apply / refresh / trigger / expiry | partially modeled | production round path contains bleeding application/payoff/expiry（`src/combat_logic/round.js:110-140,400-425`）。sim は `bleedingTelemetry` を返すが、標準 status observation aggregate と cure policy の対象外。 | P1 |
| silence apply / tick / cure | partially modeled | production spell effect/status adapter exists（`src/systems/spell_effects.js:580-600`, `src/combat_logic/status_effects.js:189-219`）。sim の exploration spell policy と round path が一部を通るが、standard policy での apply/cure coverage と dedicated metric はない。 | P1 |
| cure items / cure spells | partially modeled | production `item_resolution` / spell effects と sim cure policy を通る。merchant/status-cure supply は optional policy、N=1 では item unavailable が起きるため、自然入手から cure までの代表性は未保証（`scratch/sim_depth_material_ev.js:5327-5451,6617-6624`）。 | P1 |
| boss / midboss status paths | partially modeled | boss action は production round に接続するが、到達回数は route/survival policy に依存し、N=1 smoke の保証対象ではない。 | P1 |

### Inventory / item / equipment

| mechanism | status | evidence / limitation | priority |
|---|---|---|---|
| equipment generation | modeled | `generateRandomEquipment` / `generateRandomAccessory` を production module から呼び、runtime call と `equipmentFound` を記録する（`src/systems/equipment_generation.js:176-178,475-477`, `scratch/sim_depth_material_ev.js:8970-8992`）。 | — |
| item drop / combat reward equipment | modeled | combat round victory から production reward path を通り、equipment/material/codex reward を集計する（`src/combat_logic/rewards.js:30-81`, `scratch/sim_depth_material_ev.js:11131-11169`）。 | — |
| identify / curse / identify powder | modeled | `identifyEquipment` を実 decision path として呼び、starting/chest/codex/merchant supply と depletion を記録する（`scratch/sim_depth_material_ev.js:908-909,7261-7278,9741-9751`）。 | — |
| equipment enhance | omitted | production `executeEnhance` は +1 と meta-material spend を実行する（`src/craft.js:120-177`）。canonical runner は `getEnhanceCost` で material competition を参照するだけで、`executeEnhance` / enhance spend は呼ばない（`scratch/sim_depth_material_ev.js:3447-3464`）。 | P1 |
| support-affix polish | omitted | production `executePolish` / `polishSupportAffix` は support value を 1.5 倍にする（`src/craft.js:179-238`）。runner に polish action/policy/costはない。 | P1 |
| consumable acquisition / selection / consumption | partially modeled | chest, combat, departure craft, merchant supply と combat item resolution はモデル化される。spring/tablet/manual tool selection、任意の inventory choice は固定 policy で、production `handleExploreAction("tool")` の UI route は通らない（`src/menu/explore_actions.js:127-153`）。 | P2 |
| Return Wing / TOWN_PORTAL | partially modeled | production item resolution は inventory から消費して town escape（`src/combat_logic/item_resolution.js:9-24`）。sim は TOWN_PORTAL acquisition/use と source/floor/HP band を記録するが、portal cell navigation と manual selection は省略（`scratch/sim_depth_material_ev.js:7053-7083,10037-10048`）。 | P2 |

### Chest / traps

| mechanism | status | evidence / limitation | priority |
|---|---|---|---|
| chest generation / main + accessory + special reward | modeled | shared `src/rules/chest_rules.js` owns trap/reward/accessory rolls and sim calls those rules（`src/rules/chest_rules.js:6-11,143-242`, `scratch/sim_depth_material_ev.js:9150-9297`）。 | — |
| chest open / disarm / trap kit / smash | partially modeled | sim has deterministic action policy, disarm/force/smash loss counters, and shared smash-loss rules. It does not execute `src/chest.js` phase transitions, inspect, leave, or actual `useTrapKit` UI handlers（`src/chest.js:204-410,419-430,689-723`）。 | P1 |
| `fromDrop` chest | omitted | production `setupChestState(..., { fromDrop: true })` selects a distinct candidate pool and suppresses special reward（`src/chest.js:95-137,182-193`）。canonical runner has no `fromDrop` call or flag; its reward chest path is a separate sim roll. | P1 |
| chest trap types and reward damage/loss | partially modeled | shared `rollChestTrap` / trap effect / smash loss rules and trap telemetry are used. Per-action UI state, inspection reliability, and lethal terminal transition are not the production caller. | P2 |
| floor trap detection / disarm / avoidance / pitfall | partially modeled | shared trap/effect rules and production trap parameters are used, with detection/disarm/avoidance counters. Movement interception and pitfall state transition are simulated by a route schedule (`scratch/sim_depth_material_ev.js:8774-8890`). | P2 |

### Economy / progression

| mechanism | status | evidence / limitation | priority |
|---|---|---|---|
| material acquisition / bank on retreat or death | modeled | chest/combat/quest sources are tracked and bank calculation is checked against production `getBankedMaterials` (`scratch/sim_depth_material_ev.js:9650-9654,10106-10110`); material banking rates are production rules. | — |
| departure craft | partially modeled | `purchaseDepartureCraft` / `getDepartureCraftGrants` are production systems and canonical sim measures craft demand, but selection is automatic/measurement-driven rather than player policy (`scratch/sim_depth_material_ev.js:3413-3444,3536-3577`). | P2 |
| workshop purchase / permanent progression | partially modeled | production `purchaseWorkshopNode` is exercised for affordability probes and scenarios apply fixed workshop snapshots (`src/systems/workshop.js:29-46`, `scratch/sim_depth_material_ev.js:3452-3464,3493-3500`). No run-to-run player purchase policy or post-result workshop loop is measured. | P1 |
| milestone merchant purchase | partially modeled | production `purchaseMilestoneStock` is used for selected heal/status/return-wing/strength/mana policies, and N=10 targeted probe observed successes (`src/systems/milestone_merchant.js:6-15`, `scratch/sim_depth_material_ev.js:7095-7231`). identify powder, uncurse, guard/haste/trap-kit and human offer selection are not in the standard policy. | P1 |
| XP / leveling / spell acquisition | modeled | production combat reward/level path is reached through round resolution; final level, exp, MP and spell usage are emitted. No direct reward/level call is used as a substitute (canonical reward guard in `scratch/test_sim_reward_paths.js`). | — |
| run start / departure preparation | partially modeled | workshop grants, starting gear, identify powder, departure craft and return items are applied in `createSimulationState`; actual town menu/input and save boundary are omitted. | P2 |
| permanent save/result/codex progression | partially modeled | run result and bank values are computed, and combat reward code can populate in-memory codex state. Persistent save serialization, result UI choice, and cross-run workshop/codex operation are not part of the canonical balance run. | Safe omission for balance transport; P1 for long-horizon progression |

## Layer evidence summary

| Layer | Evidence | Status | Missing / next check |
|---|---|---|---|
| Definition | production symbols listed above; `simulation_manifest.js` maps balance-impact paths to domains | evidenced | New production mechanism needs explicit inventory row and manifest mapping. |
| Caller and execution | canonical runner imports production map, encounter, combat, reward, chest rule, equipment, identification, recovery and status modules; N=1 smoke has finite output and traverses floors | evidenced for modeled rows; partially modeled for policy rows | Run targeted deterministic probes for each P1 path before using its metric. |
| Player operation and UI | movement cell dispatch, explore action router, chest menu, merchant menu, equipment workshop menu are present in production (`src/movement.js:495-638`, `src/menu/explore_actions.js:127-153`, `src/chest.js:204-410`, `src/menu/milestone_merchant.js:78-143`, `src/equip.js:838-965`) | evidenced in production, not exercised by canonical sim | UI/input/rendering is outside balance scope; action-policy omissions are not safe for affected balance metrics. |
| Simulation | `scratch/sim_depth_material_ev.js`, runtime counters and N=1/N=10 probes | evidenced for modeled rows; not exercised for enhance/polish/fromDrop/secret search | Follow-up runner work required. |
| Telemetry or record | production `src/telemetry.js` and codex state exist; sim emits its own aggregate JSON and does not transport production telemetry | out of scope for analytics transport; partially modeled for in-memory reward records | Do not use production analytics absence as a balance omission; keep simulator output provenance separate. |

## #843 standard metrics impact

| #843 metric family | Impacting gap | Decision |
|---|---|---|
| B5/B10 reach, death, retreat | merchant supply policy, Return Wing cell route, hidden/secret route, enhance/polish power | blocked for canonical baseline; combat-only counterfactuals may proceed |
| material acquisition / banked material EV | secret-room chest pickup, `fromDrop` chest, merchant spend, workshop/enhance/polish material competition | blocked |
| equipment/core acquisition and completion | enhance/polish, merchant/secret chest supply, manual identification/build policy | blocked |
| combat rounds / damage / MP pressure | production round path is live; omitted exploration/player actions still affect long runs | ready only as a clearly scoped combat diagnostic, not as a full-game baseline |
| status/trap rates | production paths are live for several sources, but representative rates for blind/sleep/paralyze/bleeding/silence and cure are policy/probability dependent | blocked until targeted calibration and metric scope are fixed |

## P1 follow-ups

The following independent Issues must be completed before #843 claims a full-game baseline:

1. [#896](https://github.com/y-krn/wiz-mobile-rpg/issues/896): canonical sim の production `executeEnhance` / `executePolish` と material spend/policy を model する。
2. [#895](https://github.com/y-krn/wiz-mobile-rpg/issues/895): canonical sim の milestone merchant policy と merchant-cell/portal route を model する（未選択 stock、uncurse を含める）。
3. [#894](https://github.com/y-krn/wiz-mobile-rpg/issues/894): canonical sim の secret search/secret-room reachability と `fromDrop` chest/action path を model する。

## Acceptance mapping

- [x] current main の production mechanism inventory を作成
- [x] `modeled / partially modeled / omitted` を付与
- [x] source path、caller、runtime evidence を記録
- [x] safe omission と balance-impacting omission を分離
- [x] P1 follow-up Issues — [#896](https://github.com/y-krn/wiz-mobile-rpg/issues/896), [#895](https://github.com/y-krn/wiz-mobile-rpg/issues/895), [#894](https://github.com/y-krn/wiz-mobile-rpg/issues/894)
- [x] #843 の指標ごとの影響を記録
- [x] #843 baseline の判断を `blocked` と記録
- [x] production behavior / balance values は変更なし
- [ ] `npm run lint` / focused tests / deterministic checks — PR verification に記録
