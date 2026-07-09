# Mobile UI/UX Checklist

## Role

Review mobile browser UX for one-handed operation, touch safety, and clear state
transitions.

## Scope

- `src/ui.js`
- `src/ui/*`
- `src/menu.js`
- `src/menu/*`
- `src/style.css`
- `src/styles/*`
- `src/shop.js`
- `src/shop/*`
- `src/combat.js`
- `src/combat_ui/*`
- `src/training.js`
- `src/equip.js`
- `src/camp.js`
- `src/spell_menu.js`
- `src/contracts.js`
- `src/chest.js`
- `src/result.js`
- `tests/ui-ux.spec.js`

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the relevant
`src/styles/*.css` file, the affected UI or overlay module, and
`tests/ui-ux.spec.js`; expand only to direct UI callers such as `src/ui.js`,
`src/ui/*`, `src/menu.js`, `src/menu/*`, `src/combat_ui/*`, or
`src/navigation.js`. Read `src/style.css` only when import order or cascade
behavior may be relevant.

## Inputs

- User-facing flow being changed
- Mobile viewport screenshots or Playwright observations, when available
- Changed files or planned diff

## Agent Skills

- Required for all UI/UX reviews: `web-design-guidelines`.
- Required when the review needs browser interaction, screenshots, console
  inspection, or mobile viewport verification: `webapp-testing` or `playwright`.
- Recommended for frontend implementation quality checks that involve rendered
  behavior: `build-web-apps:frontend-testing-debugging`.

## Review Checklist

- Main actions are reachable near the lower thumb zone.
- Frequent actions are closer than rare or destructive actions.
- Back, close, delete, remove, and cancel actions are not easy to mistap.
- Tap targets are at least 44px tall and visually distinct.
- Current state, selected target, and next action are visible without guessing.
- Lists, filters, tabs, and execution buttons form a continuous flow.
- Overlay flows use one rendering path per choice surface. Do not duplicate the
  same combat/shop/menu controls in both an overlay and `submenu-options`.
- Combat action flows explicitly cover `combat_target`, `combat_spell`, and
  `combat_item`.
- No horizontal scrolling or tiny tap targets are introduced.
- Repeated taps do not cause accidental zoom, scroll interference, or duplicate
  actions.
- Text fits inside controls on 360px, 390px, and 430px wide mobile viewports.
- Tap height, font size, spacing, and radius come from shared tokens in
  `src/styles/tokens.css`, not per-screen hardcoded `px`. The same-role element
  (list row, primary button, chip) has the same height across screens; no
  `!important` overrides drift it below `--tap-min`.
- Grid or list containers do not vertically stretch a small number of controls
  to fill a fixed-height panel. Rows size to content (`grid-auto-rows`/
  `align-content: start`) and overflow scrolls, so a single button never inflates
  into a full-panel bar. Watch `#submenu-options.submenu-grid` in
  `src/styles/controls.css` and few-button submenus (`enter_dungeon_select`,
  `camp_main`, `gameover_main`, `event_*`, `item_action`).
- Every referenced CSS custom property is defined in `src/styles/tokens.css`
  (e.g. `--neon-glow-purple`); an undefined var silently drops the effect.
- Positioning context is checked, not just the edited rule. Flex shrink
  distribution, `absolute`/`fixed` containing-block, `aspect-ratio`, and
  `max-height` media queries break by *combination*, not by a single property.
  When touching a panel's size or position, trace up to its parent's
  `position`/`padding`/`flex` and the layout siblings that compete for space.
  Known traps: default `flex-shrink:1` crushing `#controls-panel` buttons
  (`src/styles/controls.css`); `absolute; top:0` overlays ignoring the
  `#game-container` `--safe-area-top` padding and sliding under the status bar
  (`src/styles/overlays-*.css`); log/content height feeding the flex basis and
  starving buttons (`src/styles/app-shell.css`).
- Hiding, collapsing, or conditionally showing a UI element requires an
  information audit: list what that element uniquely displays, confirm each
  datum also surfaces elsewhere, and if the element is the *only* source
  (log-only results, trap-estimate confidence, who took trap damage), move that
  datum to a persistent surface for the hidden context. A layout-only test
  (class toggled, panel hidden, buttons ≥ 44px) does NOT prove the information
  survived — assert the datum is present and visible in the DOM. Regression
  precedent: the `chest-mode` log hide (TICKET-072) silently dropped the
  trap-estimate uncertainty and who-took-the-hit lines that only lived in the
  log.
- New CSS, its DOM, and its JS wiring land together — no dead CSS, no unwired
  handlers. A new selector has a matching element in `index.html`; a
  `getElementById` in `src/ui/*` hits a real element; an exported open/close
  handler is actually bound in `src/game.js`. `lint`/`build`/`test:browser` do
  not catch these: exported-but-uncalled functions pass `no-unused-vars`, a
  `getElementById` miss is a silent runtime null, and a selector with no element
  is ignored. Verify the three-way link by cross-reference or live check.

## Required Verification

- `npm run test:browser`
- Verify against *computed boxes*, not declared CSS. Flex shrink, safe-area
  offsets, and effective tap height cannot be read statically — measure with
  `getBoundingClientRect` / preview `inspect`.
- Measure in the *worst-case state*, not the empty one: full log history
  (~50 lines), long submenu lists, and injected `safe-area-inset` (59/34), across
  every affected `gameState` (combat / submenu / explore / trap / town). The
  060 button collapse only appeared with logs full — an empty-state review never
  sees it.
- Any UI invariant proven here (buttons unclipped inside `#controls-panel`, HUD
  MP row visible, overlay header below the safe area, tap targets ≥ `--tap-min`)
  is added to `tests/ui-ux.spec.js` as a guard, not left to manual review.
- Manual or browser-driven check at:
  - 360x800
  - 390x844
  - 430x932

## Must Not Do

- Do not propose desktop-first layouts.
- Do not add explanatory in-app text when layout or state can make the action
  clear.
- Do not redesign unrelated screens.
- Do not prioritize visual novelty over thumb reach and clarity.

## Output

Use the repository review output format from `.agents/README.md`.
