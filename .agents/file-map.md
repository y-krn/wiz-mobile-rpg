# Agent File Map

Use this map before broad repository searches. Start from the row that matches
the request, then expand only to direct imports, touched files, or tests needed
to verify the change.

## Core Flow

- App bootstrap: `index.html`, `src/main.js`, `src/game.js`
- Persistent state and save shape: `src/state.js`, `src/state/*`; compact
  floor-grid and visited-map encoding: `src/state/map_codec.js`
  (`tests/node/unit/test_compact_save_maps.js`); active-run
  object-loot ownership and terminal settlement: `src/state/run_loot.js`
- Static game data and formulas: `src/data.js`, `src/data/*`,
  `src/rules/*`, `src/systems/*`, `src/constants/*`
- Global UI rendering and HUD: `src/ui.js`, `src/ui/*`
- Submenu routing and history: `src/navigation.js`, `src/menu.js`,
  `src/menu/*`
- Combat UI flow: `src/combat.js`, `src/combat_ui/*`
- Combat deterministic rules: `src/combat_logic.js`, `src/combat_logic/*`
- Mobile styling: `src/style.css`, `src/styles/*`
- Browser/mobile coverage: `tests/*.spec.js`
- Unit-style deterministic checks: `tests/node/*/test_*.js`
- Progression/economy design: `.agents/game-design.md`
- Equipment affixes (cores/supports), workshop inscriptions/polish/seal:
  `src/data/affixes.js`, `src/rules/affix_rules.js`, `src/craft.js`,
  `src/data/equipment_tables.js`, `src/rules/chest_rules.js`,
  `src/systems/equipment_generation.js`,
  `tests/node/unit/test_loot_supply.js`, `.agents/game-design-equipment-builds.md`

## Module Boundaries

- Facade files (`src/data.js`, `src/state.js`, `src/combat.js`,
  `src/combat_logic.js`, `src/menu.js`, `src/ui.js`) preserve
  existing imports and should stay thin.
- Data modules (`src/data/*`, `src/constants/*`) should not read runtime state,
  mutate game objects, or call random functions.
- Rules modules (`src/rules/*`, `src/combat_logic/damage.js`,
  `src/combat_logic/targeting.js`) should prefer
  explicit inputs over global state.
- System/action modules (`src/systems/*`, `src/state/*`, `src/combat_ui/*`) may
  mutate state for a specific flow.
- UI modules (`src/ui/*`, `src/combat_ui/*_menu.js`,
  `src/combat_ui/combat_overlay.js`) own DOM construction. Avoid duplicating
  the same control in both an overlay and `submenu-options`.

## TypeScript Migration Routing

- Keep JavaScript and TypeScript coexistence explicit. For a migrated contract,
  identify one canonical TypeScript owner and retain a thin compatibility
  facade only when existing consumers require it.
- Route raw runtime, save, and external inputs through runtime validation before
  typed internal use. Do not treat a type assertion as validation.
- Inspect direct consumers and every reached Node, Vite, browser, or simulation
  import path before widening a typed owner. Preserve behavior, object identity,
  state-owned references, hot-path cost, and save compatibility.
- Load `.agents/skills/typescript-migration/SKILL.md` for migration, typed
  boundary, facade, interop, or TypeScript soundness work.
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
| Solo HUD and character display | `src/styles/solo-hud.css` |
| Combat target, spell, and item overlays | `src/styles/overlays-combat.css` |
| Equipment overlay | `src/styles/overlays-equip.css` |
| Spell overlay and spell target selection | `src/styles/overlays-spell.css` |
| Result overlay | `src/styles/overlays-result.css` |
| Archives and codex overlays | `src/styles/overlays-archives.css` |
| Full-floor map overlay | `src/styles/overlays-map.css` |
| Touch behavior and bottom action bars | `src/styles/mobile-touch.css` |
| Floor themes and viewport effects | `src/styles/floor-themes.css` |

## Implementation Lookup

| Request area | Start here | Also check when relevant | Verify |
| --- | --- | --- | --- |
| Dungeon View / renderer | `src/renderer.js`, `src/pixi_renderer.js`, `src/pixi_pixel_art.js` (biome wall/floor patterns, wall decor, trap decals), `src/rules/wall_decor.js` (deterministic decor placement), `src/state/renderer_view.js`, `src/rules/renderer_topology.js` | `src/minimap.js`, full-floor map (`src/ui/full_map.js`, `src/ui/full_map_overlay.js`), floor themes, combat target caller, renderer selection/fallback tests | focused unit (`tests/node/unit/test_biome_surfaces.js` for biome surfaces), Canvas/Pixi browser tests, `npm run test:browser`, build/lint when final |
| App startup, button binding, viewport lock | `src/game.js`, `src/main.js` | `index.html`, `src/navigation.js`, `src/ui.js` | `npm run build`, `npm run test:browser` |
| Global HUD, logs, goal banner, overlays | `src/ui.js`, `src/ui/*`, `src/styles/app-shell.css` | `src/state.js`, `src/state/*`, screen module being rendered, relevant `src/styles/overlays-*.css` | `npm run test:browser` |
| Town menu and generic submenu flow | `src/menu.js`, `src/menu/*`, `src/navigation.js`, `src/styles/controls.css` | `src/ui.js`, `src/ui/*`, `src/styles/buttons.css`, `src/styles/mobile-touch.css` | `npm run test:browser` |
| Equipment and inventory | `src/equip.js`, `src/data.js`, `src/data/*`, `src/rules/item_inventory.js`, `src/rules/*`, `src/state.js`, `src/state/*` | `src/menu.js`, `src/menu/*`, `src/chest.js`, `src/styles/overlays-equip.css` | `npm run test:unit`, `npm run test:browser` |
| Spells, camp recovery, utility effects | `src/spell_menu.js`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*` | `src/state.js`, `src/state/*`, `src/menu.js`, `src/menu/*`, `src/combat.js`, `src/combat_ui/*` | `npm run test:unit`, `npm run test:browser` |
| Dungeon movement and cell events | `src/movement.js`, `src/map_generator.js` | `src/state.js`, `src/state/*`, `src/data.js`, `src/data/*`, `src/constants/*`, `src/renderer.js`, `src/result.js` | `npm run test:unit` |
| Map generation and reachability | `src/run_map_generator.js` (`generateRunFloor`, run-floor composition), `src/map_generator.js` (base map generation), `src/map_layout_archetypes.js` (biome layout archetypes), `src/map_traversal_gimmicks.js` and `src/rules/traversal_gimmicks.js` (biome traversal gimmicks), `src/map_special_rooms.js`, `src/rules/special_rooms.js`, and `src/menu/special_room_menu.js` (biome special rooms), `src/seed_rng.js` | `tests/node/unit/test_map_reachability.js`, `tests/node/unit/test_reachability_loop.js`, `tests/node/unit/test_layout_archetypes.js`, `tests/node/unit/test_traversal_gimmicks.js`, `tests/node/unit/test_special_rooms.js` | `npm run test:unit` |
| Combat UI and action selection | `src/combat.js`, `src/combat_ui/*`, `src/ui.js`, `src/ui/*`, `src/styles/overlays-combat.css`, `src/styles/controls.css` | `src/combat_logic.js`, `src/combat_logic/*`, `src/data.js`, `src/data/*`, `src/state.js`, `src/state/*` | `npm run test:unit`, `npm run test:browser` |
| Combat rules and deterministic resolution | `src/combat_logic.js`, `src/combat_logic/*`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*` | `src/combat.js`, `src/combat_ui/*`, `src/state.js`, `src/state/*` | `npm run test:unit` |
| Enemies, items, spells, classes, formulas | `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*`, `src/constants/*` | `src/combat_logic.js`, `src/combat_logic/*`, `src/state.js`, `src/state/*`, affected screen module | `npm run test:unit` |
| Five-floor trials, band roles, Portal clues | `src/data/floor_trials.js`, `src/rules/floor_trials.js` | `src/data/encounters.js`, `src/combat_ui/encounter.js`, `src/combat_ui/combat_start.js`, `src/menu/milestone_portal.js`, `src/state/run_floor_state.js` | `npm run test:unit`, `npm run test:browser` |
| Affix cores/supports, budgets, seal/polish rules | `src/data/affixes.js`, `src/rules/affix_rules.js`, `.agents/game-design-equipment-builds.md` | `src/systems/equipment_generation.js`, `src/craft.js`, `src/combat_logic/damage.js`, `src/combat_logic/round.js`, `tests/node/unit/test_affixes.js`, `tests/node/unit/test_core_affixes.js` | `npm run test:unit` |
| Build vNext trial: weapon techniques, technique Cores, graded legible supply, build seed (#1801) | `src/data/techniques.js`, `src/rules/technique_rules.js`, `src/combat_logic/technique_resolution.js`, `src/rules/build_vnext_supply.js`, `src/systems/build_vnext_seed.js`, `.agents/game-design-equipment-builds.md` | `src/data/affixes.js` (`BUILD_VNEXT_CORE_AFFIXES`), `src/systems/equipment_generation.js`, `src/chest.js`, `src/pending_rewards.js`, `src/combat_logic/round.js`, `src/combat_ui/action_selection.js`, `src/ui/ui_root.js`, `tests/node/unit/test_build_vnext_techniques.js`, `tests/node/unit/test_build_vnext_supply.js` | `npm run test:unit`, `npm run test:browser`, `scratch/measurements/run_browser_playtest.js` |
| Equipment families and their set effects (#2024) | `src/rules/equipment_sets.js`, `.agents/game-design-equipment-builds.md` | `src/rules/item_rules.js` (`getCharAffixSum`), `src/rules/character_stats.js` (`getCharDef`), `src/rules/equipment_preview.js`, `src/equip_ui.js`, `tests/node/unit/test_equipment_sets.js`, `tests/ui-equipment-sets.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Dungeons: which floor belongs to which dungeon, the floor inside it, per-dungeon enemy multipliers, opening and clearing (#2060) | `src/rules/dungeons.js`, `src/data/dungeons.js`, `src/systems/dungeon_progress.js` | `src/menu/solo_start.js` (dungeon choice), `src/menu/stairs_down.js`, `src/movement.js` (`executeEnterDungeon`, `descendToFloor`), `src/result.js`, `src/rules/depth_scaling.js`, `src/rules/phase4c_v1_trial.js`, `tests/node/unit/test_dungeons.js`, `tests/ui-dungeon-select-2060.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Round-trip prototype rule: climbing back, the hunter, the treasure (#2066) | `src/rules/round_trip.js`, `src/systems/round_trip.js`, `src/state/run_round_trip.ts`, `src/menu/stairs_up.js` | `src/movement.js` (`ascendToFloor`, `advanceRoamingTurn`), `src/menu/stairs_down.js`, `src/menu/solo_start.js`, `src/combat_ui/outcome_rewards.js`, `src/result.js`, `tests/node/unit/test_round_trip.js`, `tests/ui-round-trip-2066.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Treasure chest, traps, drops | `src/chest.js`, `src/data.js`, `src/data/*`, `src/systems/*` | `src/state.js`, `src/state/*`, `src/combat.js`, `src/combat_ui/*` | `npm run test:unit` |
| Feats (long-term goals) and codex/progress tracking | `src/data/feats.js`, `src/systems/feats.js`, `src/state/feats_state.ts`, `src/state.js`, `src/state/*` | `src/ui/ui_root.js`, `src/ui/town_home.js`, `src/ui/feat_card.js`, `src/menu/feat_list.js`, `src/ui/result_screen.js`, `src/result.js`, `tests/node/unit/test_feats.js` | `npm run test:unit`, `npm run test:browser` |
| Town facilities per biome band, rescued keepers, facility starting kits (#2009, #2018), orders settled by a safe return (#2014), and the chapel offering and grave (#2018) | `src/data/facilities.js`, `src/systems/facilities.js`, `src/systems/facility_rooms.js`, `src/state/facilities_state.ts`, `src/state/initial_state.js` (`UNLOCKABLE_STARTING_KITS`) | `src/menu/facility_view.js`, `src/ui/town_home.js`, `src/menu/special_room_menu.js`, `src/systems/departure_preparation.js`, `tests/node/unit/test_facilities.js`, `tests/node/unit/test_chapel.js`, `tests/node/unit/test_weaver_scribe.js`, `tests/node/unit/test_smith_hall.js`, `tests/ui-facilities.spec.js`, `tests/ui-chapel.spec.js`, `tests/ui-weaver-scribe.spec.js`, `tests/ui-smith-hall.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Dungeon guidebook: fragments and decoded pages (#2013) | `src/data/guidebook.js`, `src/systems/guidebook.js`, `src/state/guidebook_state.ts` | `src/combat_logic/rewards.js`, `src/result.js`, `src/menu/guidebook_view.js`, `src/ui/town_home.js`, `src/ui/run_stakes.js`, `tests/node/unit/test_guidebook.js`, `tests/ui-guidebook.spec.js` | `npm run test:unit`, `npm run test:browser` |
| Run result, rewards, return reasons | `src/result.js`, `src/systems/run_return.js`, `src/state.js`, `src/state/*` | `src/chest.js`, `src/combat.js`, `src/combat_logic/*`, `src/ui/result_screen.js` | `npm run test:unit`, `npm run test:browser` |
| Core Loop vNext telemetry and observability | `src/telemetry.js`, `.agents/game-design-telemetry.md` | `src/state/run_loot.js`, `src/state/inventory_state.js`, `src/movement.js`, `src/chest.js`, portal/equipment/elite callers | `npm run test:unit`, `npm run build`, `npm run lint` |
| Progression economy, materials, workshop, post-clear loop | `.agents/game-design.md`, `src/data.js`, `src/data/*`, `src/state.js`, `src/state/*` | `src/systems/*`, `src/combat_logic.js`, `src/combat_logic/*`, `src/chest.js`, `src/menu.js`, `src/menu/*`, `src/result.js`, `tests/node/*/test_*.js`, `tests/*.spec.js` | `npm run test:unit`, `npm run build`, `npm run test:browser` |
| Audio toggle or sound effects | `src/audio.js`, `src/game.js` | Calling module for the changed event | `npm run build` |
| Input guards and error telemetry | `src/controls_guard.js`, `src/error_context.js`, `src/sentry.js` | `src/game.js`, `src/navigation.js`, `src/state/save_storage.js`, `tests/node/unit/test_transition_input_guard.js` | `npm run lint`, `npm run test:unit` |
| Mobile layout, tap targets, thumb flow | Relevant `src/styles/*.css`, affected UI module | `tests/*.spec.js`, `index.html`, `src/style.css` import order when cascade changes are suspected | `npm run test:browser` |
| Browser/mobile test changes | `tests/*.spec.js`, `playwright.config.js` | Affected UI module, relevant `src/styles/*.css` | `npm run test:browser` |
| Unit test or simulation changes | Matching `tests/node/*/test_*.js` | Source module under test, `package.json` | `npm run test:unit` |

## Review Checklist Starting Points

| Checklist | Start with | Expand to |
| --- | --- | --- |
| `qa-regression` | `package.json`, changed files, relevant `tests/node/*/test_*.js` or `tests/ui-*.spec.js` | Direct imports of changed files and failing test targets |
| `mobile-ui-ux` | Relevant `src/styles/*.css`, affected UI module or overlay module, `tests/ui-*.spec.js` | `src/style.css` import order, `src/ui.js`, `src/ui/*`, `src/menu.js`, `src/menu/*`, `src/combat_ui/*`, `src/navigation.js`, screenshots or browser observations |
| `game-logic` | Changed mechanic module from the lookup table | `src/state.js`, `src/state/*`, `src/data.js`, `src/data/*`, `src/rules/*`, `src/systems/*`, direct caller/callee modules |
| `balance-simulation` | `.agents/balance-simulation.md`, then the changed source path from this map | Load `.agents/skills/balance-simulation/SKILL.md` only when measuring; executable runner/manifest/provenance checks under `scratch/` when the harness is involved |
| `content-design` | `src/data.js`, `src/data/*`, and changed user-facing text | Affected UI module and `balance-simulation` lens if values change progression |

## Expansion Rules

- If a request names a file, start there and use this map only for supporting
  files.
- If a change crosses UI and logic, use both rows, but keep edits scoped to the
  requested behavior.
- If save data shape changes, always inspect `src/state.js`, `src/state/*`, and
  add migration or compatibility reasoning.
- If mobile UI changes, always include the relevant `src/styles/*.css` file and
  `tests/ui-*.spec.js` in review and verification. Inspect `src/style.css`
  only when import order or cascade behavior may be relevant.
- If numbers affect enemies, drops, rewards, XP, materials, feats, or map pacing,
  include the `balance-simulation` review lens.
- If the request changes XP, milestone merchant purchases, loot,
  materials, workshop actions, feats, or B5F clear behavior, read
  `.agents/game-design.md` before
  implementation or review.
- If the request changes equipment affixes, cores, inscriptions, polish, or
  seal behavior, read `.agents/game-design-equipment-builds.md` before
  implementation or review.
- If a facade file is touched, inspect the concrete module it re-exports from;
  avoid changing facade behavior without checking direct importers.
- If combat selection UI changes, verify `combat_target`, `combat_spell`, and
  `combat_item` overlay paths, not only generic submenu rendering.
- Do not read all of `src/` unless the request is architectural or the map does
  not identify a credible starting point.
