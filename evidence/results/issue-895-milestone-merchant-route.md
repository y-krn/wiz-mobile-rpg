# Issue #895 canonical milestone merchant / portal route

## 判定

- canonical runner: `scratch/simulations/sim_depth_material_ev.js` (`sim-scope: run`)
- production source SHA used by the measurement: `ebd39078585810076fe5df812bfddad4d706d7f8`
- measurement runner commit: `658c663f5c59db2dcc6eea638de3a9d0bd6cf717`
- conclusion: **milestone boss → merchant → return portal is now modeled and measured**
- no production balance constant or production behavior was changed.

The runner now uses production `generateRunFloor`, finds the three milestone
cells, and schedules the route in this order: `boss`, `event_merchant`,
`return_portal`. Merchant and portal actions call the production purchase /
uncurse APIs. A merchant or portal visit before the corresponding boss victory
is recorded as blocked; an unresolved milestone boss prevents the simulator
from descending the stairs. A flee keeps the event pending and retries it on a
later exploration step, matching the production cell-preservation behavior.

## Modeled policy

The policy is explicit and configurable through `SIM_MERCHANT_POLICY` and
`SIM_MILESTONE_PORTAL_POLICY`.

| policy | behavior |
|---|---|
| `supply-missing` | At an unlocked merchant, buy only missing policy supplies: identification powder when an unidentified item exists and no powder is held; uncurse each currently cursed equipped item when affordable; buy a return wing only when `buyMerchantTownPortal` or `SIM_MERCHANT_RETURN_WING` is enabled and no portal is held; buy missing `ANTIDOTE`, `WAKE_POWDER`, and `PARALYZE_CURE`; then run the existing missing-supply policies for healing, strength, and mana. |
| `never` | Visit and record the merchant cell, but make no merchant purchase or uncurse attempt. |
| portal `continue` | Visit an unlocked return portal and continue the route. |
| portal `retreat` | Visit an unlocked return portal and finish as `retreat` with reason `milestone_portal`. |

Guard / haste / trap-kit / trap-sense-stone and arbitrary human offer
selection remain omitted from the automatic policy. They remain available in
the production merchant UI and are represented by the `never`/manual-policy
boundary rather than silently selected.

## Reachability audit

| layer | evidence | result |
|---|---|---|
| definition | `src/data/milestone_merchant.js` defines stock and `MILESTONE_UNCURSE_COST`; `src/run_map_generator.js` places one boss, merchant, and portal on each 5-floor milestone | evidenced |
| caller / execution | `src/movement.js` blocks milestone merchant, portal, and stairs until `defeatedMilestones` contains the floor; `src/combat_ui/outcome_rewards.js` records victory; `src/systems/milestone_merchant.js` owns purchase and uncurse mutation | evidenced |
| player operation / UI | `src/menu/milestone_merchant.js` exposes every stock entry and uncurse option; `src/menu/milestone_portal.js` exposes continue / retreat | evidenced in production, automatic human choice remains out of scope |
| simulation route | `scratch/simulations/sim_depth_material_ev.js` schedules and records all three cells, retries a fled boss, applies the stairs gate, and emits route, policy, spend, cure, and uncurse counters | evidenced by deterministic probe and N=500 |
| record / telemetry | per-run result and `ISSUE895_MEASUREMENT_JSON` include visits, blocked visits, stock attempts/successes/failures, material spend, status supply/use/cure, uncurse, outcome, and provenance | evidenced; production analytics transport remains out of balance scope |

## Deterministic probe

Command used by `scratch/tests/regression/test_milestone_route.js`:

```sh
node scratch/tests/regression/test_milestone_route.js
```

The probe fixes the simulation seed and uses a generous consumable supply with
floor traps disabled so route conditions are isolated. It verifies:

- both B5 and B10 route events are exactly `boss → event_merchant → return_portal`;
- merchant and portal `gateOpen` are true only after the milestone boss victory;
- `unlockedMilestones` is `[5, 10]` after continuing;
- portal `retreat` ends at `milestone_portal` after B5;
- `merchantPolicy=never` makes zero stock attempts;
- repeating the same run returns an identical result.

## N=500 measurement

Command:

```sh
SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 SIM_PARALLEL=1 \
  node scratch/simulations/sim_depth_material_ev.js
```

The table below is the `workshop-complete`, `powder`, `continue` slice from
`ISSUE895_MEASUREMENT_JSON`. `targetDepth=10` explores through B9, so B5 is
the first milestone facility opportunity; `targetDepth=20` includes B5, B10,
and B15 opportunities. Counts labelled `/run` are averages over all 500 runs;
purchase counters and material spend are total counters for those runs.

| target | merchant visits/run | blocked merchant visits | portal visits/run | blocked portal visits | merchant stock successes | uncurse attempts / purchases | merchant material spend | survival / retreat / death |
|---:|---:|---:|---:|---:|---|---:|---|---:|
| 10 | 0.026 | 0 | 0.024 | 0 | heal 12, antidote 12, wake 10, paralyze 12 | 23 / 8 | 獣の牙12, 硬い皮12, 毒腺12, 霊粉50, 呪布24, 黒角8 | 11.4% / 11.4% / 88.6% |
| 20 | 0.022 | 0 | 0.018 | 0 | heal 9, antidote 11, wake 7, paralyze 7 | 16 / 11 | 獣の牙9, 硬い皮7, 毒腺11, 霊粉62, 呪布33, 黒角11 | 11.6% / 11.6% / 88.4% |

For target 10, the uncurse failure count was 15 (`insufficient_materials`);
for target 20 it was 5. Status supply and status cure remained observable in
the same output: target 10 acquired merchant `ANTIDOTE=12`, `WAKE_POWDER=10`,
`PARALYZE_CURE=12`, used `ANTIDOTE=62`, and recorded `poisoned=108`,
`blind=70` cures. Target 20 acquired merchant `ANTIDOTE=11`,
`WAKE_POWDER=7`, `PARALYZE_CURE=7`, used `ANTIDOTE=59`, and recorded
`poisoned=106`, `blind=59` cures.

The full raw runner output is intentionally not tracked; the durable result is
the JSON line and this summary. Provenance was clean:

```text
sourceCommit=658c663f5c59db2dcc6eea638de3a9d0bd6cf717
gameplaySourceCommit=ebd39078585810076fe5df812bfddad4d706d7f8
measurementRunnerCommit=658c663f5c59db2dcc6eea638de3a9d0bd6cf717
measurementRunnerDiffSha256=c9eb5110aa5bcd42d2c206480d10e3a24fdc3718c3704f16dca252bdb2fa3242
workingTreeClean=true
```

## #893 coverage update

The #893 merchant row is upgraded from `partially modeled` due to direct
floor-end purchase to **modeled for the configured automatic policy**. The
remaining limitation is human selection of optional stock and the production
UI/input route; those are not represented as a default balance policy. The
milestone merchant / portal route is no longer a reason by itself to block the
canonical material and progression measurement. Secret search, `fromDrop`
chests, enhance, and polish remain the independent #894 / #896 gaps.
