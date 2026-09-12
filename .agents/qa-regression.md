# QA Regression Checklist

## Role and ownership

Review changes for regressions across unit tests, browser tests, and
reproducible game flows.

This checklist owns how to prove the invariants in `.agents/game-logic.md` and
how to choose sufficient regression coverage. The logic checklist owns what
must be true. Source and tests own the concrete current state shapes, transition
tables, field allowlists, selectors, module names, and exact scenario
inventories.

## Scope

- Unit-test, browser-test, and reproducible game-flow regression coverage
- Test configuration, package scripts, and changed source behavior
- Facade wiring, concrete module behavior, and change-specific integration risk

## Playwright test ownership and discovery

- Playwright discovers only test files ending in `.spec.js` under `tests/` as
  domain entrypoints, as set by `playwright.config.js`; the current suite can
  be enumerated with
  `npx playwright test --list`.
- Focused test modules ending in `.cases.js` under `tests/` are
  lifecycle-owned by exactly one domain entrypoint and are imported from that
  entrypoint. They must not be discovered as independent suites or imported by
  another case module.
- `scripts/check_playwright_test_ownership.js` enforces that ownership graph;
  `scripts/check_playwright_test_names.js` enforces stable filenames and test
  titles. These rules are run by `npm run lint:tests`.
- Shared browser health and console-error policy belongs in
  `tests/fixtures/browser-health.js`. Browser tests cover user-visible flows;
  rule-only behavior belongs in deterministic unit tests when appropriate.

## Verification patterns

### State-transition coverage

For each changed state machine or interaction boundary, cover the smallest
representative set of observable outcomes:

- a legal input reaches the intended next boundary and applies its complete
  effect;
- where the flow defines navigation-only cancellation, back or cancel before
  commitment leaves the pending outcome and live state unchanged;
- missing, stale, invalid, repeated, and guarded input is rejected without a
  duplicate effect or unintended navigation; and
- terminal, interrupted, failure, and recovery paths finish in a valid state
  when those paths are reachable.

Use the current source/tests for exact phases and fields. The checklist should
describe the failure classes, not copy a feature's transition table.

### Persistence-boundary coverage

For every changed persistence boundary, select fixtures and assertions for:

- a complete serialization and JSON round trip;
- a current payload with missing optional data, supported legacy data, and
  unknown legacy data;
- malformed top-level and nested values;
- unsupported or incompatible versions; and
- unreadable primary data with the existing backup, fresh-state, or explicit
  recovery path.

Verify that normalization and migration validate before live mutation, that
malformed input cannot partially apply, and that valid progress is preserved or
reported through the intended fail-safe path. Assert the declared transient or
resumable classification rather than duplicating the current save schema in
this checklist. Loading must not reroll deterministic outcomes or replay
completed gameplay effects.

### Atomic and ownership coverage

When a change groups multiple state updates, test a projected validation path,
an invalid path, a no-op or cancel path, and a successful commit. Invalid,
no-op, and canceled operations should leave live state and action cost unchanged
unless the mechanic explicitly says otherwise; a successful operation should
apply every expected mutation once at its defined action boundary.

When a flow exposes a preview or inspection step, assert that it does not grant
discovery, knowledge, progression, or other commit-only effects; the owning
action must apply those effects exactly once.

When rewards or items cross an ownership boundary, cover unresolved, taken,
left, intermediate, and terminal outcomes that the changed flow can reach.
Assert placement, ownership, settlement, and evidence separately so a passing
inventory assertion cannot hide a settlement or persistence regression.

### Deterministic and generated-content coverage

Use explicit seeds for map, combat, inventory, drop, or other random behavior
when reproducibility matters. Repeating the same inputs should produce the
same resolved result, while observation, inspection, and save/load should not
advance gameplay randomness.

For generated or derived content, exercise representative shallow/deep or
context changes and confirm that the declared candidate set, weighting,
repetition, caching, and information-disclosure policies are respected. Keep
the exact pools and scenario inventory in source/tests.

### Observation and lifecycle coverage

For telemetry or lifecycle instrumentation, assert that observation is
observation-only: gameplay state, control flow, save data, and simulation RNG
are unchanged. Exercise duplicate calls at the semantic boundary and verify
that one logical event is recorded once, with stable run/object identity and no
replay after save/load.

### Integration and facade coverage

When a change crosses module boundaries, test the public/facade path and the
concrete path that owns the behavior when both are supported. Check that
callers do not duplicate state mutation and that direct imports and re-exports
remain behaviorally aligned.

When browser behavior changes, cover representative supported mobile widths and
the primary touch flow in addition to the relevant desktop or default path.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the changed
files, the matching test target, and only the source modules listed for that
request area.

## Inputs

- User request or feature goal
- Changed files or planned diff
- Existing test output, when available
- Reproduction steps or deterministic seed, when available

## Agent Skills

- Use a browser-testing skill when browser behavior, screenshots, or end-to-end
  UI flows are part of the review.
- Use `playwright-cli` for interactive browser reproduction or inspection of
  DOM/rendered state, console, network, trace, or storage evidence. QA keeps
  ownership of test selection, regression coverage, and the final verdict.
- When browser evidence leaves the cause or reproduction path unresolved, use
  `diagnosing-bugs` for the tight repro and causal investigation, then return
  the regression test and final verification to this checklist.
- Do not load browser-focused skills for pure unit-test or data-only reviews.

## Verification cadence

Use the smallest sufficient deterministic verification at each stage.

### Inner loop

During implementation, prefer the narrowest test or syntax check that covers
the changed behavior. Use `npm run test:unit:fast` for broader unit confidence
before the implementation is complete. Do not run repository-wide lint, normal
unit tests, browser suites, or the build after every edit.

### Final local gate

Before the first push, run the verification required by the completed change:

- logic, state, or rule changes: `npm run test:unit`;
- UI or browser-flow changes: `npm run test:browser`;
- broad changes: `npm run test`;
- build-sensitive changes: `npm run build`; and
- source or documentation covered by lint: `npm run lint`.

Batch related fixes before rerunning the final local gate. A passing local
verification remains valid while the relevant working-tree content is
unchanged. Git operations, commits, status checks, PR metadata changes, review
inspection, and other metadata-only operations do not invalidate it.

If code, tests, configuration, or other relevant content changes after the
gate, rerun only the verification invalidated by that change.

### CI gate

After push, required CI is the authoritative verification for that pull
request head. Do not reuse results from an older head or repeat a completed
successful check without a concrete reason. Pending checks require a bounded,
completion-aware wait; a failed, timed-out, or canceled required check blocks
the merge.

### Unit suite levels

- Targeted test: preferred implementation inner loop.
- `npm run test:unit:fast`: broad smoke check; heavy tests may reduce their
  workload through `FAST=1`.
- `npm run test:unit`: normal local gate; all cheap tests run and heavy tests
  are selected from the current diff and its source dependencies.
- `npm run test:unit:full`: CI/full gate; all heavy tests are forced on.

## Must Not Do

- Do not request broad refactors unrelated to the regression risk.
- Do not require new tests for untouched behavior.
- Do not make manual testing the only confidence for deterministic behavior.
- Do not copy feature-specific matrices or current implementation schemas into
  this durable checklist.

## Output

Use the repository review output format from `.agents/README.md`.

## Playwright worker diagnostics

The standard browser command is intentionally serial:
`npm run test:browser`. Use `npm run test:browser:parallel` for the explicit
two-worker smoke probe. Both commands print the effective worker count, base
URL/port, Playwright and Chromium versions, executable/cache paths, and the
temporary/test-data paths. The Playwright config does not set a persistent
`userDataDir`; each test uses Playwright's isolated browser context, so a
shared profile lock is not expected.

If macOS reports `EACCES`, `EPERM`, quarantine, or signature errors, use the
reported target path and reinstall the pinned browser with
`npx playwright install chromium`, then inspect the macOS security prompt or
signature status. Do not disable Gatekeeper/sandboxing or remove broad cache
directories. A port collision is reported before Vite starts; retry with a
task-owned `PLAYWRIGHT_PORT` after stopping only the process that owns that
port.
