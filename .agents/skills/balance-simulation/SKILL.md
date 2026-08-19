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

- [AGENTS.md](../../../AGENTS.md) for worktree, search, and verification rules
- [file-map.md](../../file-map.md) to route to the smallest source and test set
- [balance-simulation.md](../../balance-simulation.md) for all sim invariants
- [game-design.md](../../game-design.md) when progression or economy rules are involved

## Run the measurement

1. State the question, comparison, target metric, and expected decision. Fetch
   `origin/main` and confirm the measurement worktree descends from it. Never
   measure from the main worktree.
2. Route from `file-map.md` to the changed source. Select the existing
   simulation whose `sim-scope` and execution path match the question. Verify
   that it uses current source modules and real run mechanisms. Do not replace
   a missing mechanism with a hand-rolled loop.
3. Validate the runner before a long run: run `node --check`, then one run
   (`N=1` or the runner's equivalent) and inspect exit status and finite output.
   Confirm that the smoke run reaches the side effects under test.
4. Record a baseline from the same source tree, configuration, seed policy,
   and output schema. Repeat the baseline or smoke command to test determinism.
   Run the after case only after the baseline is valid.
5. Follow the simulation validity rules in `balance-simulation.md`. Model its
   required player mitigations, real reward and level-up paths, and complete
   equipment scoring. Record modeled and omitted mechanisms instead of hiding
   them in the conclusion. Write raw output only to the repository's temporary
   results area; keep durable summaries concise.
6. Interpret before/after differences against the baseline, uncertainty, and
   the stated decision. Separate an unexecuted path, an omitted mechanism, and
   a measured zero. Do not turn a small or non-deterministic difference into a
   balance conclusion.

## Stop before interpreting when

- the worktree is stale, the provenance check fails, or the source commit is
  not recorded
- the selected sim has the wrong scope, bypasses the current mechanism, or
  lacks the required inputs
- `node --check`, the `N=1` smoke run, or the determinism check fails
- the baseline and after cases use different seeds, configuration, source
  commits, output schema, or modeled mitigations
- an unexpected mechanism, direct reward call, or hidden fallback changes the
  measured path and its effect is not explained
- the result requires a design decision that the existing official documents do
  not settle

## Verification and report

Report these fields in order:

1. **Question and scope**: target metric, sim path, `sim-scope`, and source
   commit provenance
2. **Validity**: `node --check`, `N=1` smoke, determinism, environment, seed
   policy, and modeled or omitted mitigations
3. **Comparison**: baseline and after configurations, sample counts, outputs,
   uncertainty, and the command used to reproduce them
4. **Interpretation**: supported conclusion, limits, and whether the result is
   measured, unexecuted, or not reachable through this sim
5. **Decision**: pass, needs more measurement, or stopped with the exact
   blocker

Link source and summary files. Do not report raw dumps as durable evidence.
