---
name: gameplay-reachability-audit
description: Use when a mechanic is claimed to be live, dead, hidden, or missing across definition, execution, player operation, simulation, or records; not for ordinary code search, balance measurement, combat semantics, or unrelated cleanup.
---

# Audit gameplay reachability

Load `file-map.md`, `game-logic.md`, and `qa-regression.md` when runtime or
regression evidence is needed.

## Evidence gate

Define the mechanic, entry condition, expected operation, observable effect,
and target symbol/key. Trace definition, imports, wrappers, dynamic dispatch,
callers, and execution before deciding what a search result means.

Classify each layer—definition; caller/execution; player operation/UI;
simulation; telemetry/record—as `evidenced`, `not exercised`, `unreachable`,
`out of scope`, or `unknown`, with evidence for that exact status. Run the
smallest relevant unit, simulation, or browser check. For player-facing
negative claims, build production output, use a stable player-facing positive
control, and explain unexpected hits.

Keep missing coverage separate from dead code. A conclusion is blocked by an
unresolved dynamic route, unsupported status, failed required build, missing
positive control, or disagreement between source, simulation, UI, and records.

## Report

Report a compact five-layer evidence table, search scope, build/test evidence,
positive control, unexplained hits, and a verdict of `reachable`, `partially
reachable`, `not exercised`, `unreachable`, or blocked. Link every source and
artifact; do not call a path unreachable when the evidence only shows no test
coverage.
