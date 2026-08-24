# Renderer, UI, and navigation state boundary

The runtime `state` object remains the source of gameplay data. Renderer, UI,
and navigation code consume a validated screen snapshot from
`src/state/view_state.js` instead of independently interpreting raw
`state.gameState` and `menuContext` values.

The canonical snapshot shape is:

```js
{
  gameState: "town" | "explore" | "combat" | "chest" | "submenu" |
    "trap_encounter" | "equip_overlay" | "result" | "gameover" | "victory",
  menuType: string,
  previousGameState: string | null,
  isSubmenu: boolean,
  isDeparturePrepSubmenu: boolean,
  isWorkshopSubmenu: boolean,
  isTownSubmenu: boolean,
  isCombatOverlaySubmenu: boolean,
  isEventSubmenu: boolean,
  isItemSubmenu: boolean,
  hasMap: boolean,
  hasCombat: boolean,
  hasChest: boolean,
}
```

`menuType` and `previousGameState` are empty/null outside a submenu. Unknown
screen values fall back to `explore`; invalid context fields fall back to
empty strings, `-1`, or `null`. A combat scene is renderable only when its
combat state has an array of monsters. This makes a stale or partially loaded
state safe for one render/update cycle without changing save payloads.

Navigation normalizes submenu types and history entries when they cross into
the router. Back navigation preserves the existing history/previous-screen
rules, while malformed history falls back through the normal submenu-close
path. Gameplay modules continue to own mutations; the snapshot is read-only
and is not persisted.
