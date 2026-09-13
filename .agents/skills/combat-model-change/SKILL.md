---
name: combat-model-change
description: Use when combat damage, hit, crit, mitigation, resistance, targeting, scaling, shared stages, or combat observability semantics change; not for UI-only/rendering work, balance measurement, or reachability audits.
---

# Combat model review

Load `file-map.md`, `game-design-combat-model.md`, and `game-logic.md`. Keep
formulas and executable constants in their canonical source files.

## Evidence gate

State the changed term or stage, intended effect, and acceptance evidence.
Trace inputs through pre-target effects, mitigation, post-resolution effects,
rounding/clamps, and records. Inspect physical, spell, shared, class,
equipment, level, and fallback paths as applicable.

Check physical/spell asymmetry, targeting, random range, resistance, criticals,
affix stages, and player-facing labels, logs, telemetry, and records for unit
consistency. Compare the result with the official combat model; do not silently
resolve source/spec conflicts. A balance claim also needs
`balance-simulation`, and a mechanic path claim also needs
`gameplay-reachability-audit`.

Choose focused deterministic tests and the affected unit, build, browser, or
simulation gates. Every touched model surface needs current evidence or an
explicit omitted/blocked disposition. Stop when the formula/stage, intended
asymmetry, path ownership, observability, or required design decision is
unresolved.

## Report

Report model change, impact map, observability, evidence, specification status,
and a `pass`, `pass with notes`, or blocked verdict.
