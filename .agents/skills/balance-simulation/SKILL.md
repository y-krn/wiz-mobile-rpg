---
name: balance-simulation
description: Measure progression, economy, combat difficulty, or reward pacing with repository simulations. Do not use for pure formula review or UI-only changes.
---

# Measure balance with the current game model

Use this skill when a balance claim needs a repeatable simulation. The
`.agents/balance-simulation.md` standard defines the principles and claim
boundaries; this skill defines the actions and decision points for performing a
measurement.

## When to use

Use it for progression, economy, drops, rewards, encounter difficulty, growth,
depth, EV, or run-pacing measurements. A repeatable formula or map measurement
may use the corresponding scope when a full run is unnecessary. Do not load it
for a prose-only formula review, UI work, or an unrelated test failure.

For combat rule or formula ownership, use `combat-model-change`; for a
definition-to-player or simulation path audit, use
`gameplay-reachability-audit`. This skill supplies measurement evidence only.

## Prepare the measurement

1. Read `.agents/file-map.md` and `.agents/balance-simulation.md`. Read the
   design document that owns the affected area when values or progression are
   involved.
2. State the question, comparison, target metric, population, decision, and
   expected evidence scope (`formula`, `map`, `infra`, or `run`). Select the
   smallest existing runner that can support the claim.
3. Use a dedicated measurement worktree, never the main checkout. When the
   parent supplies `CODEX_BASE_SHA`, verify that local `origin/main` resolves to
   it and that the measurement `HEAD` descends from it.
4. Inspect the current executable manifest and runner tests for lifecycle,
   scope, source ownership, and runtime-evidence requirements. Reuse the
   existing production-backed runner; do not replace a missing mechanism with a
   hand-written loop or copy current manifest details into this skill.

If the source ref or base SHA must be fetched, use the repository/environment
approval path. Do not silently retry network operations, bypass approval, or
measure from a stale tree. After an approved refresh, revalidate the ref, SHA,
ancestor relationship, and worktree state.

## Execute in increasing cost

1. Validate the selected runner with `node --check`.
2. Run one case (`N=1` or the runner's equivalent). Confirm a successful exit,
   finite output, and the production side effects relevant to the claim. A
   smoke run proves path execution or reachability, not distributional balance.
3. Repeat the same smoke case and compare the complete result for determinism.
   Resolve any random-input, hidden fallback, direct reward, or disconnected
   path before running a long measurement.
4. Configure the actual measurement. Keep baseline and candidate conditions
   identical: runner contract, metric definition, population, seed policy,
   dataset/fixture, environment, and modeled player mitigations. Use the
   repository's current standard profile for normal balance comparisons and
   increase the sample when the decision requires more precision; do not lower
   a distributional measurement to a smoke run.
5. Run the measurement through the repository entrypoint. Record the source
   revision and provenance produced by the runner, not a manually typed
   substitute. Keep raw JSON, logs, and debug output in a temporary directory
   or CI artifact; do not commit raw dumps.

The measurement phase is complete only when every requested case has a
deterministic smoke result, matched conditions, runner provenance, recorded
uncertainty and omissions, and a reproduction command. Otherwise stop with the
missing evidence.

For a code or harness change, run the relevant unit/regression gate after the
smoke. The canonical simulation-follow and provenance checks are executable
checks; use their current test entrypoints rather than recreating their rules
in a report.

## Record and interpret

Record, for every case:

- question, evidence scope, runner path/version, source and baseline revision;
- configuration, seed policy, environment, dataset/fixture, and sample size;
- modeled mitigations and omitted mechanics;
- output schema, relevant side effects, population/denominators, and result;
- uncertainty, instability, unobserved paths, and limitations.

Compare matched baseline and candidate records only after checking determinism,
provenance, and condition parity. Interpret the estimate together with its
distribution and uncertainty. Distinguish a measured zero from no observation,
an unexecuted path, and an intentionally omitted mechanic. Stop before making
a balance conclusion if the runner bypasses production behavior, the source
tree is invalid, or the requested decision is not settled by the evidence.

## Stop conditions

Stop and report the exact blocker when:

- the worktree, source revision, ancestry, or provenance is invalid;
- `node --check`, the smoke run, or the determinism check fails;
- the selected runner has the wrong scope, bypasses the production mechanism,
  or lacks required inputs;
- baseline and candidate conditions differ beyond the requested change;
- an unexpected shortcut, fallback, direct reward, or hidden policy changes the
  measured path;
- the result is too sparse or unstable for the stated decision; or
- the official design documents do not settle a required interpretation.

## Report

Report in this order:

1. **Question and scope** — claim, metric, population, evidence scope, runner,
   and each case's source revision.
2. **Validity** — syntax check, smoke, determinism, environment, seed policy,
   provenance, sample size, and modeled/omitted mechanics.
3. **Comparison** — matched conditions, distributions, replicate outputs,
   denominators, uncertainty, and the reproduction command.
4. **Interpretation** — supported conclusion, limits, and whether each result is
   measured, unobserved, omitted, or unreachable through the runner.
5. **Decision** — pass, needs more measurement, or stopped with the exact
   blocker.
