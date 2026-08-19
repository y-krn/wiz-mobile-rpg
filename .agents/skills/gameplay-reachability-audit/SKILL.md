---
name: gameplay-reachability-audit
description: Audit whether a gameplay mechanic reaches definition, caller/execution, player operation/UI, simulation, or telemetry/records. Do not use for ordinary code search or unrelated cleanup.
---

# Audit gameplay reachability

Use this skill when a claim says that a mechanic is live, dead, hidden, or
missing from a player flow. Treat [AGENTS.md](../../../AGENTS.md) as the source
of truth for reachability evidence and use this skill for the audit sequence.

## When to use

Use it for a gameplay rule, action, reward, encounter, class feature, or record
whose path from definition to observable effect is uncertain. A known caller or
execution path does not complete the player, simulation, UI, or record audit.
Do not use it for style-only searches or naming cleanup.

## Read before searching

- [AGENTS.md](../../../AGENTS.md), especially the reachability rules
- [file-map.md](../../file-map.md) to choose the smallest source and test set
- [game-logic.md](../../game-logic.md) for state and mechanic boundaries
- [qa-regression.md](../../qa-regression.md) when runtime or regression evidence is needed

## Trace and verify the path

1. Define the exact mechanic, entry condition, expected player operation, and
   observable effect. Record the target symbol, string, state, or data key.
2. Trace the static path from definition through imports, callers, and exports.
   Check barrel re-exports and both forms of dynamic import. Search string
   dispatch, HTML inline handlers, `data-action` routers, `window` or
   `globalThis` bindings, `eval`, and `new Function`. Do not treat one `grep`
   or `rg` result as proof of reachability or absence.
3. Confirm every target layer in this order: **definition**, **caller and
   execution**, **player operation and UI**, **simulation**, and **telemetry or
   record**. A known caller does not satisfy any later layer, and it does not
   remove those layers from the audit. Mark each layer as evidenced, not
   exercised, unreachable, out of scope, or unknown. For `not exercised`, cite
   evidence that the path exists but the test or sim omitted it. For
   `unreachable`, cite static or production-build evidence. For `out of scope`,
   cite why the layer cannot observe or exercise this mechanic. Conclude when
   every target layer has one of these evidence-backed statuses. An unsupported
   status or inference remains unknown and blocks the conclusion.
4. Run the smallest relevant unit, simulation, or browser check. For a
   player-facing claim, build production output and inspect
   `dist/assets/index-*.js`. Search stable player-facing strings, not minified
   function names, and include a known-live positive control. Explain every
   unexpected hit before concluding.
5. Compare the evidence with the requested claim. State whether the mechanic
   is implemented, executed, player-operable, simulated, recorded, or only
   defined. Keep missing coverage separate from dead code.

## Stop before concluding when

- a dynamic dispatch, binding, re-export, or generated route remains unresolved
- the production build is required but failed or was not run
- a negative bundle search lacks a positive control or an unexplained hit
- a layer is labeled `not exercised`, `unreachable`, or `out of scope` without
  evidence supporting that specific status
- the claimed player operation has no input route, state transition, or
  observable result to inspect
- source, simulation, UI, and record paths disagree and the disagreement has no
  documented explanation

## Verification and report

Report a compact evidence table with these columns:

| Layer | Evidence | Status | Missing or next check |
| --- | --- | --- | --- |
| Definition | path and symbol or key | evidenced / unknown | exact gap |
| Caller and execution | caller and state transition | evidenced / not exercised / unreachable / out of scope / unknown | exact gap |
| Player operation and UI | input route, guard, and visible result | evidenced / not exercised / unreachable / out of scope / unknown | exact gap |
| Simulation | runner and exercised mechanism | evidenced / not exercised / unreachable / out of scope / unknown | exact gap |
| Telemetry or record | log, metric, or saved record | evidenced / not exercised / unreachable / out of scope / unknown | exact gap |

Also report the search scope, build and test commands, production-bundle
positive control, unexplained hits, and a verdict: reachable, partially
reachable, not exercised, unreachable, or blocked. Link every source and
artifact. Do not call a path unreachable when the evidence only shows no test
coverage.
