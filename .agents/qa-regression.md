# QA Regression Checklist

## Role

Review changes for regressions across unit tests, browser tests, and reproducible
game flows.

## Scope

- Unit-test, browser-test, and reproducible game-flow regression coverage
- Test configuration, package scripts, and changed source behavior
- Facade wiring, concrete module behavior, and change-specific integration risk

Target files are determined from the relevant rows in `.agents/file-map.md`.

## Chest transition regression matrix

Chest tests should cover menu entry, inspection, back/cancel from both
selection screens, successful and failed disarm, trap-kit disarm, direct open,
smash, reward completion, leave, and lethal terminal paths. Each action also
needs a representative invalid or repeated call (missing chest, stale phase,
or `state.transitioning`) asserting no duplicate trap, reward, telemetry, or
navigation effect. Save-payload checks must assert that ordinary active chest
phase data is omitted and reload starts from `explore` with no `chestState`; an
unopened `fromDrop` chest must retain its reward/trap state and reload into the
chest menu.

## Save/apply boundary regression matrix (#835)

Save tests must cover a full JSON round trip, a current-version payload with
missing optional fields, legacy unknown fields, malformed top-level/nested
values, and backup recovery when the primary save is unreadable. Assertions
must verify that only `SAVE_PAYLOAD_FIELDS` are written, that menu/equipment
overlay context, transition guards, map revision, and session-only counters do
not leak into the payload, and that ordinary chest/trap phases reload as
`explore`. Malformed direct application must not mutate `state` before the
existing `loadGame()` fallback path handles the payload. Active-run map damage
remains a separate fail-closed recovery path so #799 progress is preserved.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the changed
files, the matching test target, and only the source modules listed for that
request area.

## Inputs

- User request or feature goal
- Changed files or planned diff
- Existing test output, when available
- Reproduction steps for bugs, when available

## Agent Skills

- Required when browser behavior, screenshots, or end-to-end UI flows are part
  of the review: `webapp-testing` or `playwright`.
- Recommended when debugging a failing Playwright test from terminal output:
  `playwright-cli`.
- Do not load browser-focused skills for pure unit-test or data-only reviews.

## Review Checklist

- Confirm the change has a clear success condition.
- Check whether existing unit coverage exercises the changed logic.
- Check whether browser coverage exercises changed UI flows on mobile widths.
- Look for deterministic seeds when validating map, combat, inventory, or drop
  behavior.
- Check facade re-exports and direct imports for divergent behavior after a
  module split.
- Check for duplicated UI or state mutation paths that tests may exercise only
  through one route.
- Identify missing negative cases for validation or state transitions.
- Confirm failures can be reproduced with a specific command.

## Required Verification

- Logic changes: `npm run test:unit`
- UI changes: `npm run test:browser`
- Broad changes: `npm run test`
- Build-sensitive changes: `npm run build`

## Must Not Do

- Do not request broad refactors unrelated to the regression risk.
- Do not require new tests for untouched behavior.
- Do not approve a change only because manual testing passed when deterministic
  unit coverage is practical.

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
