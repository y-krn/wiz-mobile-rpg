# Playwright test inventory

This inventory records the 44 `tests/*.spec.js` files present on the
`origin/main` snapshot used for #1065. No test case was removed as part of the
consolidation.

The discovered suite now contains domain entrypoints (`*.spec.js`). Focused
case modules use `*.cases.js` and are imported by exactly one entrypoint. This
keeps Playwright lifecycle ownership at the domain level without duplicating
fixtures or reducing coverage.

| Baseline file | Layer / domain | Classification | Result |
| --- | --- | --- | --- |
| `bleeding-ui.spec.js` | visual / combat status | merge | `combat-bleeding.cases.js` → `combat.spec.js` |
| `death-cause.spec.js` | E2E + visual / result | keep | `death-cause.spec.js` |
| `dungeon-theme-visual.spec.js` | visual / dungeon renderer | keep + merge | Receives landmark and chest cases |
| `elite-perception.spec.js` | visual / dungeon event | keep | `elite-perception.spec.js` |
| `issue-710-visual.spec.js` | visual / monster renderer | rename + merge | `monster-variants.cases.js` → `monster-render-visual.spec.js` |
| `issue-831-landmarks-visual.spec.js` | visual / dungeon renderer | rename + merge | `dungeon-landmarks.cases.js` → `dungeon-theme-visual.spec.js` |
| `issue-930-chest-scene-visual.spec.js` | visual / dungeon renderer | rename + merge | `dungeon-chest.cases.js` → `dungeon-theme-visual.spec.js` |
| `monster-render-visual.spec.js` | visual / monster renderer | keep + merge | Receives monster variant cases |
| `ui-abandon-run.spec.js` | E2E / run lifecycle | keep | `ui-abandon-run.spec.js` |
| `ui-archives.spec.js` | E2E / archives | keep | `ui-archives.spec.js` |
| `ui-castle-adventure.spec.js` | E2E / town history | keep | `ui-castle-adventure.spec.js` |
| `ui-castle-workshop-regression.spec.js` | visual / workshop navigation | rename + merge | `workshop-navigation.cases.js` → `workshop.spec.js` |
| `ui-combat-target-selection.spec.js` | E2E / combat targeting | rename + merge | `combat-target-ui.cases.js` → `combat.spec.js` |
| `ui-common-shell.spec.js` | visual + smoke / app shell | keep + merge | Receives shell layout and viewport cases |
| `ui-departure.spec.js` | E2E + visual / departure | keep + merge | Receives run lifecycle case |
| `ui-dungeon.spec.js` | E2E + visual / dungeon | keep + merge | Receives exploration survey case |
| `ui-explore-combat-vnext.spec.js` | E2E / combat flow | rename + merge | `combat-flow.cases.js` → `combat.spec.js` |
| `ui-hud.spec.js` | visual / HUD | keep | `ui-hud.spec.js` |
| `ui-issue-1031.spec.js` | cross-flow + layout | split + merge | Layout → `shell-layout.cases.js`; flow → `departure-flow.cases.js` |
| `ui-loot-bag.spec.js` | smoke / loot ownership | keep | `ui-loot-bag.spec.js` |
| `ui-loadout-transaction.spec.js` | smoke / loadout transaction | keep | `ui-loadout-transaction.spec.js` |
| `ui-mobile.spec.js` | visual + E2E / mobile UX | keep | `ui-mobile.spec.js` |
| `ui-modals.spec.js` | visual + E2E / equipment and logs | keep | `ui-modals.spec.js` |
| `ui-portal-wing.spec.js` | E2E / portal and return wing | keep | `ui-portal-wing.spec.js` |
| `ui-pending-rewards.spec.js` | smoke / pending chest rewards | keep | `ui-pending-rewards.spec.js` |
| `ui-result-town-vnext.spec.js` | E2E / result and town | keep | `ui-result-town-vnext.spec.js` |
| `ui-run-quest-board.spec.js` | E2E / run quests | keep | `ui-run-quest-board.spec.js` |
| `ui-town-submenu.spec.js` | visual + E2E / town navigation | keep | `ui-town-submenu.spec.js` |
| `verify-chest-teleport-smash.spec.js` | E2E / chest trap | rename + merge | `chest-teleporter.cases.js` → `chest-trap.spec.js` |
| `verify-chest-trap-ui.spec.js` | E2E / chest actions | rename + merge | `chest-actions.cases.js` → `chest-trap.spec.js` |
| `verify-combat-auto.spec.js` | E2E + visual / combat | rename + merge | `combat-auto.cases.js` → `combat.spec.js` |
| `verify-dumapic.spec.js` | E2E / exploration spell | rename + merge | `exploration-survey.cases.js` → `ui-dungeon.spec.js` |
| `verify-item-menu.spec.js` | E2E + visual / inventory | rename + merge | `inventory-menu.cases.js` → `inventory.spec.js` |
| `verify-item-use.spec.js` | E2E / inventory | rename + merge | `inventory-use.cases.js` → `inventory.spec.js` |
| `verify-pitfall-transition.spec.js` | E2E / floor traps | rename + merge | `trap-pitfall.cases.js` → `trap-encounter.spec.js` |
| `verify-resistance-disclosure.spec.js` | E2E + visual / combat knowledge | rename + merge | `combat-resistance.cases.js` → `combat.spec.js` |
| `verify-shop.spec.js` | E2E / workshop catalog | rename + merge | `workshop-catalog.cases.js` → `workshop.spec.js` |
| `verify-single-target-skip.spec.js` | E2E + visual / combat targeting | rename + merge | `combat-target.cases.js` → `combat.spec.js` |
| `verify-sleep-combat-flow.spec.js` | E2E / combat incapacitation | rename + merge | `combat-incapacitation.cases.js` → `combat.spec.js` |
| `verify-spell-tag-affinity.spec.js` | E2E / combat spells | rename + merge | `combat-spells.cases.js` → `combat.spec.js` |
| `verify-trap-choices.spec.js` | E2E / floor traps | rename + merge | `trap-choices.cases.js` → `trap-encounter.spec.js` |
| `verify-viewport-stability.spec.js` | visual / viewport | rename + merge | `mobile-viewport.cases.js` → `ui-common-shell.spec.js` |
| `vulnerable-ui.spec.js` | visual / combat status | rename + merge | `combat-vulnerable.cases.js` → `combat.spec.js` |
| `workshop-sticky.spec.js` | visual / workshop | rename + merge | `workshop-scroll.cases.js` → `workshop.spec.js` |

## Guardrails

- `playwright.config.js` discovers only `**/*.spec.js` entrypoints.
- `*.cases.js` files are imported by one domain entrypoint and are not
  independently discovered.
- `scripts/check_playwright_test_names.js` rejects Issue/verify filenames and
  test titles in the lint path.
- Browser health remains provided by `tests/fixtures/browser-health.js`.
- Rule-only pitfall coverage remains in
  `scratch/tests/unit/test_pitfall_transition.js`; browser coverage keeps the
  user-visible trap entry and descent flow.
