# Agent File Map

Use this map before broad repository searches. Start from the row that matches
the request, then expand only to direct imports, touched files, or tests needed
to verify the change.

## Core Flow

- App bootstrap: `index.html`, `src/main.js`, `src/game.js`
- Persistent state and save shape: `src/state.js`, `src/state/*`
- Static game data and formulas: `src/data.js`, `src/data/*`,
  `src/rules/*`, `src/systems/*`, `src/constants/*`
- Global UI rendering and HUD: `src/ui.js`, `src/ui/*`
- Submenu routing and history: `src/navigation.js`, `src/menu.js`,
  `src/menu/*`
- Shop flow: `src/shop.js`, `src/shop/*`
- Combat UI flow: `src/combat.js`, `src/combat_ui/*`
- Combat deterministic rules: `src/combat_logic.js`, `src/combat_logic/*`
- Mobile styling: `src/style.css`, `src/styles/*`
- Browser/mobile coverage: `tests/ui-ux.spec.js`
- Unit-style deterministic checks: `scratch/test_*.js`
- Progression/economy design: `.agents/game-design.md`

## Module Boundaries

- Facade files (`src/data.js`, `src/state.js`, `src/combat.js`,
  `src/combat_logic.js`, `src/menu.js`, `src/shop.js`, `src/ui.js`) preserve
  existing imports and should stay thin.
- Data modules (`src/data/*`, `src/constants/*`) should not read runtime state,
  mutate game objects, or call random functions.
- Rules modules (`src/rules/*`, `src/shop/shop_rules.js`,
  `src/combat_logic/damage.js`, `src/combat_logic/targeting.js`) should prefer
  explicit inputs over global state.
- System/action modules (`src/systems/*`, `src/state/*`, `src/combat_ui/*`,
  `src/shop/appraisal.js`, `src/shop/purchase.js`) may mutate state for a
  specific flow.
- UI modules (`src/ui/*`, `src/shop/*_view.js`, `src/combat_ui/*_menu.js`,
  `src/combat_ui/combat_overlay.js`) own DOM construction. Avoid duplicating
  the same control in both an overlay and `submenu-options`.
- `src/style.css` is the CSS entrypoint and should stay limited to `@import`
  statements. Feature styles live under `src/styles/*`; start with the relevant
  feature stylesheet instead of reading all CSS.

## CSS Style Routing

| Area | Start here |
| --- | --- |
| Theme tokens and resets | `src/styles/tokens.css`, `src/styles/base.css` |
| App shell, header, goal banner, viewport, logs | `src/styles/app-shell.css` |
| Shared buttons and focus states | `src/styles/buttons.css` |
| Explore, town, combat, and submenu controls | `src/styles/controls.css` |
| Party HUD | `src/styles/party-hud.css` |
| Shop overlay | `src/styles/overlays-shop.css` |
| Training overlay | `src/styles/overlays-training.css` |
| Combat target, spell, and item overlays | `src/styles/overlays-combat.css` |
| Equipment overlay | `src/styles/overlays-equip.css` |
| Spell overlay and spell target selection | `src/styles/overlays-spell.css` |
| Camp overlay | `src/styles/overlays-camp.css` |
| Result overlay | `src/styles/overlays-result.css` |
| Archives, contracts, warehouse, codex overlays | `src/styles/overlays-archives.css` |
| Touch behavior and bottom action bars | `src/styles/mobile-touch.css` |
| Floor themes and viewport effects | `src/styles/floor-themes.css` |

## Implementation Lookup

| Request area | Start here | Also check when relevant | Verify |
| --- | --- | --- | --- |
| App startup, button binding, viewport lock | `src/game.js`, `src/main.js` | `index.html`, `src/navigation.js`, `src/ui.js` | `npm run build`, `npm run test:browser` |
| Global HUD, logs, goal banner, overlays | `src/ui.js`, `src/ui/*`, `src/styles/app-shell.css` | `src/state.js`, `src/state/*`, screen module being rendered, relevant `src/styles/overlays-*.css` | `npm run test:browser` |
| Town menu and generic submenu flow | `src/menu.js`, `src/menu/*`, `src/navigation.js`, `src/styles/controls.css` | `src/ui.js`, `src/ui/*`, `src/styles/buttons.css`, `src/styles/mobile-touch.css` | `npm run test:browser` |
| Shop | `src/shop.js`, `src/shop/*`, `src/styles/overlays-shop.css` | `src/data.js`, `src/data/*`, `src/rules/*`, `src/state.js`, `src/state/*`, `src/menu.js`, `src/menu/*`, `src/styles/mobile-touch.css` | `npm run test:browser` |
| Training and party changes | `src/training.js`, `src/state.js`, `src/state/*` | `src/data.js`, `src/data/*`, `src/rules/*`, `src/menu.js`, `src/menu/*`, `tests/ui-ux.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Equipment and inventory | `src/equip.js`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/state.js`, `src/state/*` | `src/menu.js`, `src/menu/*`, `src/shop.js`, `src/shop/*`, `src/chest.js`, `src/styles/overlays-equip.css` | `npm run test:unit`, `npm run test:browser` |
| Camp, spells, recovery, utility effects | `src/camp.js`, `src/spell_menu.js`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*` | `src/state.js`, `src/state/*`, `src/menu.js`, `src/menu/*`, `src/combat.js`, `src/combat_ui/*` | `npm run test:unit`, `npm run test:browser` |
| Dungeon movement and cell events | `src/movement.js`, `src/map_generator.js` | `src/state.js`, `src/state/*`, `src/data.js`, `src/data/*`, `src/constants/*`, `src/renderer.js`, `src/result.js` | `npm run test:unit` |
| Map generation and reachability | `src/map_generator.js`, `src/seed_rng.js` | `scratch/test_map_reachability.js`, `scratch/test_reachability_loop.js` | `npm run test:unit` |
| Combat UI and action selection | `src/combat.js`, `src/combat_ui/*`, `src/ui.js`, `src/ui/*`, `src/styles/overlays-combat.css`, `src/styles/controls.css` | `src/combat_logic.js`, `src/combat_logic/*`, `src/data.js`, `src/data/*`, `src/state.js`, `src/state/*` | `npm run test:unit`, `npm run test:browser` |
| Combat rules and deterministic resolution | `src/combat_logic.js`, `src/combat_logic/*`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*` | `src/combat.js`, `src/combat_ui/*`, `src/state.js`, `src/state/*`, `scratch/test_combat_inventory.js` | `npm run test:unit` |
| Enemies, items, spells, classes, formulas | `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*`, `src/constants/*` | `src/combat_logic.js`, `src/combat_logic/*`, `src/state.js`, `src/state/*`, affected screen module | `npm run test:unit` |
| Treasure chest, traps, drops | `src/chest.js`, `src/data.js`, `src/data/*`, `src/systems/*` | `src/state.js`, `src/state/*`, `src/combat.js`, `src/combat_ui/*`, `src/contracts.js` | `npm run test:unit` |
| Contracts and codex/progress tracking | `src/contracts.js`, `src/state.js`, `src/state/*` | `src/ui.js`, `src/ui/*`, `src/result.js`, `scratch/test_contracts.js` | `npm run test:unit`, `npm run test:browser` |
| Run result, rewards, return reasons | `src/result.js`, `src/state.js`, `src/state/*` | `src/contracts.js`, `src/chest.js`, `src/combat.js`, `src/combat_logic/*` | `npm run test:unit`, `npm run test:browser` |
| Progression economy, materials, workshop, post-clear loop | `.agents/game-design.md`, `src/data.js`, `src/data/*`, `src/state.js`, `src/state/*` | `src/combat_logic.js`, `src/combat_logic/*`, `src/chest.js`, `src/menu.js`, `src/menu/*`, `src/contracts.js`, `src/result.js`, `scratch/test_*.js`, `tests/ui-ux.spec.js` | `npm run test:unit`, `npm run build`, `npm run test:browser` |
| Audio toggle or sound effects | `src/audio.js`, `src/game.js` | Calling module for the changed event | `npm run build` |
| Mobile layout, tap targets, thumb flow | Relevant `src/styles/*.css`, affected UI module | `tests/ui-ux.spec.js`, `index.html`, `src/style.css` import order when cascade changes are suspected | `npm run test:browser` |
| Browser/mobile test changes | `tests/ui-ux.spec.js`, `playwright.config.js` | Affected UI module, relevant `src/styles/*.css` | `npm run test:browser` |
| Unit test or simulation changes | Matching `scratch/test_*.js` | Source module under test, `package.json` | `npm run test:unit` |

## Review Checklist Starting Points

| Checklist | Start with | Expand to |
| --- | --- | --- |
| `qa-regression` | `package.json`, changed files, relevant `scratch/test_*.js` or `tests/ui-ux.spec.js` | Direct imports of changed files and failing test targets |
| `mobile-ui-ux` | Relevant `src/styles/*.css`, affected UI module or overlay module, `tests/ui-ux.spec.js` | `src/style.css` import order, `src/ui.js`, `src/ui/*`, `src/menu.js`, `src/menu/*`, `src/combat_ui/*`, `src/navigation.js`, screenshots or browser observations |
| `game-logic` | Changed mechanic module from the lookup table | `src/state.js`, `src/state/*`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*`, direct caller/callee modules |
| `balance-simulation` | `src/data.js`, `src/data/*`, `src/combat_logic.js`, `src/combat_logic/*`, changed reward/enemy/map module | Relevant scratch simulation or deterministic test |
| `content-design` | `src/data.js`, `src/data/*`, and changed user-facing text | Affected UI module and `balance-simulation` lens if values change progression |

## Expansion Rules

- If a request names a file, start there and use this map only for supporting
  files.
- If a change crosses UI and logic, use both rows, but keep edits scoped to the
  requested behavior.
- If save data shape changes, always inspect `src/state.js`, `src/state/*`, and
  add migration or compatibility reasoning.
- If mobile UI changes, always include the relevant `src/styles/*.css` file and
  `tests/ui-ux.spec.js` in review and verification. Inspect `src/style.css`
  only when import order or cascade behavior may be relevant.
- If numbers affect enemies, drops, rewards, XP, gold, contracts, or map pacing,
  include the `balance-simulation` review lens.
- If the request changes XP, gold, shops, loot, materials, workshop actions,
  contracts, or B5F clear behavior, read `.agents/game-design.md` before
  implementation or review.
- If a facade file is touched, inspect the concrete module it re-exports from;
  avoid changing facade behavior without checking direct importers.
- If combat selection UI changes, verify `combat_target`, `combat_spell`, and
  `combat_item` overlay paths, not only generic submenu rendering.
- Do not read all of `src/` unless the request is architectural or the map does
  not identify a credible starting point.
