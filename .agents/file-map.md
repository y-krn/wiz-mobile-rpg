# Agent File Map

Use this map before broad repository searches. Start from the row that matches
the request, then expand only to direct imports, touched files, or tests needed
to verify the change.

## Core Flow

- App bootstrap: `index.html`, `src/main.js`, `src/game.js`
- Persistent state and save shape: `src/state.js`
- Static game data and formulas: `src/data.js`
- Global UI rendering and HUD: `src/ui.js`
- Submenu routing and history: `src/navigation.js`, `src/menu.js`
- Mobile styling: `src/style.css`
- Browser/mobile coverage: `tests/ui-ux.spec.js`
- Unit-style deterministic checks: `scratch/test_*.js`

## Implementation Lookup

| Request area | Start here | Also check when relevant | Verify |
| --- | --- | --- | --- |
| App startup, button binding, viewport lock | `src/game.js`, `src/main.js` | `index.html`, `src/navigation.js`, `src/ui.js` | `npm run build`, `npm run test:browser` |
| Global HUD, logs, goal banner, overlays | `src/ui.js`, `src/style.css` | `src/state.js`, screen module being rendered | `npm run test:browser` |
| Town menu and generic submenu flow | `src/menu.js`, `src/navigation.js` | `src/ui.js`, `src/style.css` | `npm run test:browser` |
| Shop | `src/shop.js` | `src/data.js`, `src/state.js`, `src/menu.js`, `src/style.css` | `npm run test:browser` |
| Training and party changes | `src/training.js`, `src/state.js` | `src/data.js`, `src/menu.js`, `tests/ui-ux.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Equipment and inventory | `src/equip.js`, `src/data.js`, `src/state.js` | `src/menu.js`, `src/shop.js`, `src/chest.js`, `src/style.css` | `npm run test:unit`, `npm run test:browser` |
| Camp, spells, recovery, utility effects | `src/camp.js`, `src/spell_menu.js`, `src/data.js` | `src/state.js`, `src/menu.js`, `src/combat.js` | `npm run test:unit`, `npm run test:browser` |
| Dungeon movement and cell events | `src/movement.js`, `src/map_generator.js` | `src/state.js`, `src/data.js`, `src/renderer.js`, `src/result.js` | `npm run test:unit` |
| Map generation and reachability | `src/map_generator.js`, `src/seed_rng.js` | `scratch/test_map_reachability.js`, `scratch/test_reachability_loop.js` | `npm run test:unit` |
| Combat UI and action selection | `src/combat.js`, `src/ui.js`, `src/style.css` | `src/combat_logic.js`, `src/data.js`, `src/state.js` | `npm run test:unit`, `npm run test:browser` |
| Combat rules and deterministic resolution | `src/combat_logic.js`, `src/data.js` | `src/combat.js`, `src/state.js`, `scratch/test_combat_inventory.js` | `npm run test:unit` |
| Enemies, items, spells, classes, formulas | `src/data.js` | `src/combat_logic.js`, `src/state.js`, affected screen module | `npm run test:unit` |
| Treasure chest, traps, drops | `src/chest.js`, `src/data.js` | `src/state.js`, `src/combat.js`, `src/contracts.js` | `npm run test:unit` |
| Contracts and codex/progress tracking | `src/contracts.js`, `src/state.js` | `src/ui.js`, `src/result.js`, `scratch/test_contracts.js` | `npm run test:unit`, `npm run test:browser` |
| Run result, rewards, return reasons | `src/result.js`, `src/state.js` | `src/contracts.js`, `src/chest.js`, `src/combat.js` | `npm run test:unit`, `npm run test:browser` |
| Audio toggle or sound effects | `src/audio.js`, `src/game.js` | Calling module for the changed event | `npm run build` |
| Mobile layout, tap targets, thumb flow | `src/style.css`, affected UI module | `tests/ui-ux.spec.js`, `index.html` | `npm run test:browser` |
| Browser/mobile test changes | `tests/ui-ux.spec.js`, `playwright.config.js` | Affected UI module, `src/style.css` | `npm run test:browser` |
| Unit test or simulation changes | Matching `scratch/test_*.js` | Source module under test, `package.json` | `npm run test:unit` |

## Sub-Agent Starting Points

| Sub-agent | Start with | Expand to |
| --- | --- | --- |
| `qa-regression` | `package.json`, changed files, relevant `scratch/test_*.js` or `tests/ui-ux.spec.js` | Direct imports of changed files and failing test targets |
| `mobile-ui-ux` | `src/style.css`, affected UI module, `tests/ui-ux.spec.js` | `src/ui.js`, `src/menu.js`, `src/navigation.js`, screenshots or browser observations |
| `game-logic` | Changed mechanic module from the lookup table | `src/state.js`, `src/data.js`, direct caller/callee modules |
| `balance-simulation` | `src/data.js`, `src/combat_logic.js`, changed reward/enemy/map module | Relevant scratch simulation or deterministic test |
| `content-design` | `src/data.js` and changed user-facing text | Affected UI module and `balance-simulation` lens if values change progression |

## Expansion Rules

- If a request names a file, start there and use this map only for supporting
  files.
- If a change crosses UI and logic, use both rows, but keep edits scoped to the
  requested behavior.
- If save data shape changes, always inspect `src/state.js` and add migration or
  compatibility reasoning.
- If mobile UI changes, always include `src/style.css` and `tests/ui-ux.spec.js`
  in review and verification.
- If numbers affect enemies, drops, rewards, XP, gold, contracts, or map pacing,
  include the `balance-simulation` review lens.
- Do not read all of `src/` unless the request is architectural or the map does
  not identify a credible starting point.
