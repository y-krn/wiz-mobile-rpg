---
name: balance-simulation
description: Measure progression, economy, combat difficulty, or reward pacing with repository simulations. Do not use for pure formula review or UI-only changes.
---

# Measure balance with the current game model

Use this skill when a balance claim needs a repeatable simulation. Keep
`.agents/balance-simulation.md` as the source of truth for simulation validity,
defaults, provenance, and interpretation. This skill supplies the workflow.

## When to use

Use it for progression, economy, drops, rewards, encounter difficulty, growth,
or run-pacing measurements. Use a formula-only check when the question never
places a floor. Do not use it for a source-only combat review, UI work, or an
unrelated test failure.

## Read before measuring

- [file-map.md](../../file-map.md) to route to the smallest source and test set
- [balance-simulation.md](../../balance-simulation.md) for all sim invariants
- Read the existing design document that owns the affected `file-map.md` area,
  such as [game-design.md](../../game-design.md) for progression or economy and
  the matching `.agents/game-design*.md` for combat, enemies, drops, rewards,
  maps, or other rules. Do not copy its specifications or values here.

## Run the measurement

1. State the question, comparison, target metric, and expected decision. Use
   the measurement worktree and base SHA supplied by the parent when available
   (the SHA is passed as `CODEX_BASE_SHA`). The parent's prefetch of
   `origin/main` is a recommended optimization, not a blanket prohibition on
   worker network operations. Confirm that the local `origin/main` resolves to
   that SHA and that the worktree descends from it. Never measure from the main
   worktree.
2. Route from `file-map.md` to the changed source. Select the existing
   simulation whose `sim-scope` and execution path match the question. Verify
   that it uses current source modules and real run mechanisms. Do not replace
   a missing mechanism with a hand-rolled loop.
3. Validate the runner before a long run: run `node --check`, then one run
   (`N=1` or the runner's equivalent) and inspect exit status and finite output.
   Confirm that the smoke run reaches the side effects under test.
4. Record each case's source SHA, configuration, seed policy, dataset or
   fixture, runner version, and output schema. Keep those comparison conditions
   identical across baseline and after; the source SHA normally differs because
   the after case contains the change. Repeat both baseline and after under
   those same conditions. Compare replicate output, determinism, and instability
   before comparing the cases.
5. Follow the simulation validity rules in `balance-simulation.md`. Model its
   required player mitigations, real reward and level-up paths, and complete
   equipment scoring. Record modeled and omitted mechanisms instead of hiding
   them in the conclusion. Write raw output only to the repository's temporary
   results area; keep durable summaries concise.
6. Interpret before/after differences against the baseline, uncertainty, and
   the stated decision. Separate an unexecuted path, an omitted mechanism, and
   a measured zero. Do not turn a small or non-deterministic difference into a
   balance conclusion.

During skill execution, do not silently retry network operations, bypass an
approval boundary, or use an alternate route. If a network operation is
needed, return an `[APPROVAL_REQUIRED]` request containing the exact command,
purpose, target, and required permissions or impact. The parent may run the
equivalent operation in its context or return the approval result. After
receiving approval, the child may execute the original command exactly as
approved; alternatively, the parent may run the equivalent operation. Afterward,
revalidate the base SHA, local ref, ancestor relationship, and worktree state
before resuming. Approval waiting alone is not `BLOCKED`; report `BLOCKED` only
when approval is refused or the parent cannot transmit the result.

## Stop before interpreting when

- the worktree is stale, the provenance check fails, or the source commit is
  not recorded
- the selected sim has the wrong scope, bypasses the current mechanism, or
  lacks the required inputs
- `node --check`, the `N=1` smoke run, or the determinism check fails
- the baseline and after cases use different seeds, configuration, dataset or
  fixture, runner version, output schema, environment, or modeled mitigations
- the source diff changes the metric definition, population, or execution path
  beyond the requested change, so no paired comparison is valid. A different
  source SHA alone is not a stopping condition.
- an unexpected mechanism, direct reward call, or hidden fallback changes the
  measured path and its effect is not explained
- the result requires a design decision that the existing official documents do
  not settle

## Verification and report

Report these fields in order:

1. **Question and scope**: target metric, sim path, `sim-scope`, and each case's
   source SHA
2. **Validity**: `node --check`, `N=1` smoke, determinism, environment, seed
   policy, and modeled or omitted mitigations
3. **Comparison**: matched baseline and after conditions, replicate outputs,
   sample counts, determinism, instability, uncertainty, and the reproduction
   command
4. **Interpretation**: supported conclusion, limits, and whether the result is
   measured, unexecuted, or not reachable through this sim
5. **Decision**: pass, needs more measurement, or stopped with the exact
   blocker

Link source and summary files. Do not report raw dumps as durable evidence.
