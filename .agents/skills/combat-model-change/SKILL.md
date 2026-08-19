---
name: combat-model-change
description: Plan or review changes to physical or spell damage formulas, shared combat stages, class scaling, or combat observability. Do not use for UI-only combat changes.
---

# Review a combat model change

Use this skill when a change can alter damage, mitigation, scaling, targeting,
or the information a player uses to choose an attack. Keep
[game-design-combat-model.md](../../game-design-combat-model.md) as the source
of truth for formulas and design decisions. Keep source constants in source.

## When to use

Use it before changing a combat expression, application order, physical or
spell pipeline, class contribution, equipment scaling, level contribution, or
combat telemetry and display. Do not use it for an isolated combat button,
layout change, or text-only correction that cannot change model observability.

## Read before deciding

- [AGENTS.md](../../../AGENTS.md) for design, worktree, and verification gates
- [file-map.md](../../file-map.md) for combat source and test routing
- [game-design-combat-model.md](../../game-design-combat-model.md) for the
  official formulas, stages, measured limits, and settled decisions
- [game-logic.md](../../game-logic.md) for state and deterministic resolution
- [balance-simulation.md](../../balance-simulation.md) when the change affects
  progression, difficulty, or a simulation result

## Trace and review the model

1. State the proposed expression or term change, its application stage, the
   intended player-facing effect, and the acceptance evidence. Use current
   source for executable behavior and the combat design document for official
   specification. Do not silently resolve a conflict between them.
2. Trace the complete resolution path from inputs through pre-target effects,
   target mitigation, post-resolution effects, rounding or clamps, and records.
   Inspect both physical and spell paths even when only one changes. Separate
   shared stages from class-specific data and undocumented fallbacks.
3. Check each impact surface:
   - formula terms, order, signs, random range, rounding, clamps, resistance,
     criticals, and affix stages
   - physical versus magic behavior, including intentional asymmetry
   - common pipeline versus class-specific behavior
   - equipment, level, and class contributions, including hidden weights
   - player observability: labels, tooltips, logs, telemetry, and records use
     the same effective unit as the model
   - simulation inputs, baseline, and whether the real resolution path is used
4. Compare the proposed behavior with the official combat model and linked
   design documents. If the change alters an official rule, apply the
   `AGENTS.md` design-document gate. Keep formulas and values in their existing
   canonical files instead of copying them into this skill.
5. Choose verification from the affected surfaces: focused deterministic
   checks, `npm run test:unit`, `npm run lint`, `npm run build` for import or
   boundary changes, browser checks for observable UI, and a valid before/after
   simulation for balance impact. Report omitted surfaces explicitly.

## Stop before implementation or approval when

- the exact formula, affected stage, or intended asymmetry is not decided
- source and the official combat model disagree without an owner decision
- physical, spell, common, and class-specific paths cannot be separated
- equipment, level, class, or fallback contributions are hidden or untraced
- the result is not observable in the stated player-facing unit, or the
  telemetry and display disagree with effective damage
- a balance claim lacks a valid current-code simulation and comparable baseline
- the required design-document update is outside the authorized scope

## Verification and report

Report in this order:

1. **Model change**: exact term and application stage, with source links
2. **Impact map**: physical, spell, shared, class, equipment, level, and
   fallback effects
3. **Observability**: player labels, logs, telemetry, and records, including
   unit consistency
4. **Evidence**: focused tests, lint, build or browser checks, and simulation
   baseline/after results when applicable
5. **Specification status**: alignment with the official combat model, required
   document changes, unresolved decisions, and verdict

Use `pass`, `pass with notes`, or `blocked`. A blocked report must name the
missing design decision or evidence instead of inferring a rule.
