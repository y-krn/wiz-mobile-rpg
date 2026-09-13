# Accessibility Golden Journey baseline

## Baseline identity

- Issue: #1226
- Parent / related: #1224, #1225, #1023, #1133, #1181, #1230
- PR #1231: merged; merge commit `a8a2e20b4607bfb3fe33101440f736973f52ea6d`
- Source: `origin/main`
- Baseline SHA: `a8a2e20b4607bfb3fe33101440f736973f52ea6d`
- SHA verification: `git fetch origin main` completed before branching; `origin/main` resolved to the recorded SHA.
- Push base: `origin/main` advanced to `e969fe29ef19338cf8aa04cfaef4d3b58c71e633` after the baseline run when PR #1232 merged; the scoped commit was rebased onto that latest base before push.
- Baseline date: 2026-09-13 (Asia/Tokyo)
- Browser evidence: Playwright 1.61.0 / repository Chromium revision 1228 / Darwin runner
- Supported viewports: `320x568`, `360x800`, `390x844`, `430x932`
- Primary accessibility conditions: `390x844` default motion; `320x568` short screen; `320x568` text-scaling proxy; `390x844` `prefers-reduced-motion: reduce`

This audit was started from the merged #1231 main before the #1226
implementation. The existing Golden Journey smoke/e2e entrypoint passed four
tests at this SHA. It proved journey reachability and geometry, but did not yet
prove the cross-cutting accessibility invariants below.

## Audit matrix

The registry in `tests/golden-journeys.js` remains the source of truth. Rows
below select representative critical states rather than multiplying every
journey by every viewport, zoom, and motion condition.

| Journey / critical state | Viewport / zoom / motion | Name, role, state | Focus entry / exit / restoration / hidden leak | Keyboard-equivalent / long content / non-color / renderer | Automated finding / manual finding / impact / owner / child |
|---|---|---|---|---|---|
| 1. `fresh-start-to-b1f` — starting kit, B1F departure | 390x844 default; 320x568 short | Kit and floor controls expose visible names and `aria-pressed`; departure action is a named native button | Entry goes to the selected kit; Back returns to Town origin; no hidden-surface focus after close | Enter/click-equivalent native buttons; short-screen overflow guard; selected state has text plus `aria-pressed`; renderer class A | Automated PASS in focused gate and existing #1225 owner tests. Screen-reader decision order and physical zoom pending. Player impact if broken: P1. Owner: `ui-departure` / `ui-golden`. Child: none. |
| 2. `explore-combat-result-explore` — combat entry and result | 390x844 reduced motion; 320x568 combat shell | Combat/result surfaces have dialog or status semantics; result exposes outcome and next action | Combat surface entry is tested; result action is reachable; hidden dialog leak guard applies | Native combat actions and DOM result; result meaning remains text when motion is reduced; renderer class B equivalent is semantic-only | Automated PASS for result/reduced-motion representative. Full screen-reader order and physical device review pending. Player impact: P1 if outcome/next action disappears. Owner: `ui-dungeon` / `ui-pending-rewards`. Child: none. |
| 3. `combat-target-back-reselect` — enemy target selection, Back | 390x844 default | Target buttons expose enemy identity, observed HP, role button, and action name; Canvas has selection label and description | Entry moves into `#combat-overlay`; Back restores `btn-combat-fight`; hidden target surface cannot retain focus | Native target buttons are the keyboard-equivalent route; Back cancels only uncommitted selection; no hidden stats/probability added; renderer class B | Automated PASS in focused gate. Canvas information equivalence and decision order require manual assistive-tech review. Player impact of regression: P0/P1. Owner: `combat-target-ui.cases.js`; presentation density remains #1133. Child: none. |
| 4. `loot-inspect-compare-settle` — equipment compare and commit footer | 320x568 text-scaling proxy (`documentElement` font-size 200%); default motion | Item row and equip/discard/back controls are named; ownership and comparison state use text plus ARIA state | Entry enters equipment dialog; detail back and close do not leave focus in the hidden overlay | Native buttons; long realistic Japanese equipment name/description wraps; critical actions remain within viewport; renderer class A | Automated PASS in focused gate and existing transaction tests. This is not physical browser zoom proof; manual zoom/text scaling and screen-reader order pending. Player impact: P1 if commit/back is clipped or focus is lost. Owner: `ui-loadout-transaction`; child: none. |
| 5. `full-bag-replacement` — replacement decision, commit/cancel | 320x568 text proxy; 390x844 representative | Capacity, replacement consequence, disabled/available action state are exposed by text/native button state | Owner tests cover cancel preservation; shared hidden-focus guard covers overlay exits | Keyboard-equivalent native commit/cancel path; long action labels use wrapping; no color-only replacement meaning; renderer class A | Automated mapped PASS through owner tests plus shared helper. Direct replacement keyboard traversal and manual decision order pending. Player impact: P1. Owner: `ui-loadout-transaction` / `ui-pending-rewards`. Child: none. |
| 6. `chest-trap-decision` — inspect, decision, result | 320x568 reduced motion; 390x844 representative | Inspect/disarm/leave/result controls are native named actions; risk and outcome are text/status | Owner tests prove inspect-before-decision and result boundary; shared guard applies where surface closes | Keyboard-equivalent action buttons; result remains understandable without shake/flash; renderer class B uses semantic event state only | Automated mapped PASS; direct reduced-motion trap playback and screen-reader decision order pending. Player impact: P1 if trap result is only motion/color. Owner: `chest-actions.cases.js` / `chest-trap.spec.js`. Child: none. |
| 7. `portal-resolution` — Push/Return and confirmation | 390x844 reduced motion; all widths remain owner-tested | Equal named choices, confirmation text, `aria-live` confirmation, and native buttons | Choice entry and return to choice surface are tested; no hidden submenu focus leak | Push/Return are text-equivalent decisions, not green/red recommendation; confirmation is keyboard reachable; renderer class A | Automated PASS in focused gate and #1225 owner tests. Manual screen-reader order and physical zoom pending. Player impact: P1 if consequence is unclear or one choice is unreachable. Owner: `ui-portal-wing`. Child: none. |
| 8. `wing-rescue-selection` — candidates and selection limit | 320x568 text proxy; 390x844 representative | Candidate identity, equipped ownership, selected count, and disabled limit are text/native state | Owner cancel path preserves ownership; shared hidden-focus guard applies | Native candidate buttons provide keyboard-equivalent route; count is text plus disabled state; renderer class A | Automated mapped PASS through owner tests. Direct short-screen keyboard commit/cancel and screen-reader order pending. Player impact: P1. Owner: `ui-portal-wing`; child: none. |
| 9. `death-result-town` — death result and Town return | 390x844 reduced motion; 320x568 required owner state | Death result uses dialog, outcome text, retained/lost wording, and named Town action | Result entry focuses a result action; Town return releases dialog focus; hidden leak guard applies | Outcome/loss is text, not only red; long death-cause fixture is realistic; renderer class A | Automated PASS in focused gate for result semantics and reduced motion. Actual VoiceOver decision order, zoom, and loss comprehension pending. Player impact: P1. Owner: `ui-result-town-vnext` / `death-cause`. Child: none. |
| 10. `town-preparation-next-run` — Town context and preparation | 320x568 short; 390x844 primary | Town sections and preparation controls expose names, selected kit/floor state, and next action | Entry focuses first preparation choice; Back restores Town entry; no hidden surface focus | Native controls support keyboard-equivalent route; 20-slot bag and action remain reachable; renderer class A | Automated PASS in focused gate and #1225 owner tests. Manual screen-reader grouping/order and physical zoom pending. Player impact: P1 if next run cannot be started. Owner: `ui-departure` / `ui-town-submenu`. Child: none. |

## Findings and scope decisions

### Semantics

- The current implementation already provides meaningful text, native button
  roles, `aria-pressed`/`aria-selected`/`aria-checked` where the player has a
  selection, disabled native state, `aria-live` for changing status, and a DOM
  target list for combat selection.
- The new helper rejects visible interactive controls without a usable role or
  name and validates any exposed ARIA state values. It does not treat an
  arbitrary `aria-label` as proof that the decision is understandable.
- No hidden enemy stats, probabilities, or recommendations were added.

### Focus / keyboard

- Baseline audit found a real P1-equivalent focus leak: after an equipment
  overlay was closed from a test-created state, focus could remain on the
  hidden `btn-equip-close`. The smallest fix was a shared focus manager that
  enters the decision surface, remembers an external invoking control, and
  restores it or a visible fallback on exit.
- Modal surfaces now have an actual Tab/Shift+Tab containment guard, so the
  `aria-modal="true"` contract does not allow keyboard focus to escape to
  controls such as mute or log expansion. Focusability checks walk visible
  ancestors, including Action Dock groups switched by `display: none`.
- Preparation's kit, floor, and craft controls explicitly restore a meaningful
  replacement target after their child DOM is rebuilt. Kit selection enters the
  first floor choice and floor selection returns to the same floor choice.
- Combat target selection keeps the existing DOM target buttons as the
  keyboard-equivalent route. Back still cancels only the uncommitted target;
  it does not undo combat or movement.

### Zoom / long content

- `A11Y_LONG_EQUIPMENT_NAME` and its description are based on the existing
  equipment naming/description style and are near the long end of current
  player-facing content, not repeated filler.
- The automated 2x condition is explicitly a font-size/text-scaling proxy.
  It is evidence that the representative layout keeps actions reachable under
  a stress condition, not evidence of real browser zoom or text scaling.
- Physical browser zoom and assistive text scaling remain manual gates.

### Color / non-color

- Representative decisions retain visible words for selected/current,
  disabled/unavailable, unknown ownership/knowledge, danger/loss, success, and
  pending confirmation. Existing shared owner tests cover their exact state
  surfaces; the focused gate checks Portal text choices, result outcome text,
  and native/ARIA state exposure.
- No contrast scanner was added. Contrast is not accepted from a scanner score
  alone, and no renderer biome/pixel redesign was made. A future contrast
  defect must carry player impact and be split to the appropriate visual-system
  owner rather than folded into this gate.

### Reduced motion

- The focused gate runs a reduced-motion Result/Portal representative. The
  result seal animation is removed while outcome and next action remain in
  text. Existing shared shell and floor CSS retain the same policy for non-
  essential motion.
- Physical player understanding with VoiceOver and reduced motion is pending;
  this record does not claim VoiceOver verification.

### Renderer-shared equivalent

- Combat target selection is classified B: visual Canvas targeting remains
  renderer-owned, while enemy identity, observed HP, selection mode, and a
  keyboard-equivalent target route remain in DOM semantics.
- Result, danger, and current combat state remain in existing DOM/status
  surfaces. Minimap/topology/lighting/material/particles are not changed by
  #1226. No player-unknown information is exposed to assistive technology.

## Evidence level and remaining manual gates

### Automated evidence

- `tests/ui-accessibility-golden-journeys.spec.js`: registry matrix, named
  controls/roles/states, focus entry/restoration, hidden-surface focus leak,
  keyboard-equivalent combat target route, 320x568 overflow, realistic long
  Japanese content, text-scaling proxy, Portal confirmation, Result semantics,
  and reduced-motion CSS behavior.
- Existing owner tests remain authoritative for the detailed gameplay paths:
  departure, combat target, loadout transaction, pending rewards, chest/trap,
  Portal/Wing, result/Town, and shared shell geometry.
- No axe-core or other generic scanner was introduced.

### Manual-required evidence

- VoiceOver/TalkBack decision order and whether headings/groups/statuses are
  announced in a useful player order.
- Physical browser zoom and OS/browser text scaling at representative critical
  states; the CSS/font-size proxy must not be reported as browser zoom proof.
- Physical assistive-tech focus restoration meaning, especially combat target
  cancel and equipment replacement cancel.
- Canvas/Pixi/Three visual information equivalence as perceived by a player;
  renderer-specific visual review remains #1181/#1230-owned.
- Player understanding of result, damage, selection, and rejection with
  reduced motion enabled.

## Verification record

Baseline before implementation:

```text
PLAYWRIGHT_PORT=18573 npm run test:browser:e2e -- tests/ui-golden-journeys.spec.js
4 passed
```

Focused #1226 gate after implementation:

```text
PLAYWRIGHT_PORT=18650 npm run test:browser:e2e -- tests/ui-accessibility-golden-journeys.spec.js
4 passed
```

Canonical checks before the follow-up focus repair:

```text
PLAYWRIGHT_PORT=18648 npm run test:browser
93 passed

npm run test:unit
190 passed / 3 skipped

npm run lint
passed

npm run build
passed (existing large-chunk warning only)
```

Follow-up focus repair verification at HEAD `525954d49168a5b19657c314f439208e89960265`:

```text
PLAYWRIGHT_PORT=18652 npm run test:browser:e2e -- tests/ui-accessibility-golden-journeys.spec.js
4 passed

npm run test:unit:full
201 passed / 0 failed / 0 skipped

GitHub Actions run 34731187801
unit / lint / browser / browser-parallel: all green
```

Relevant visual ownership check:

```text
PLAYWRIGHT_PORT=18646 npm run test:browser:visual -- tests/ui-golden-journeys.spec.js
1 passed
```

The focused browser runs required sandbox escalation to bind the local Vite
server. The initial default-port attempt failed with `EPERM` before the server
started; it was not a test assertion failure.

## Follow-up ownership

- No child Issue was created. The only actual defect found was the small hidden
  focus leak essential to making this quality gate valid, and it was fixed in
  this PR with the scope reason recorded above.
- Direct target-selection visual density remains #1133-owned.
- Dungeon View visual implementation/readability remains #1181/#1230-owned.
- Token/visual-system redesign remains #1228-owned.
- Golden Journey ownership and visual baseline remain #1225-owned.
