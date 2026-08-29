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
  isUsableCombatOverlaySubmenu: boolean,
  isSpellOverlaySubmenu: boolean,
  isUsableSpellOverlaySubmenu: boolean,
  isEventSubmenu: boolean,
  isItemSubmenu: boolean,
  hasMap: boolean,
  hasCurrentCell: boolean,
  hasCombat: boolean,
  hasStructurallyUsableCombatParty: boolean,
  hasUsableCombatActor: boolean,
  isActionableCombat: boolean,
  hasChest: boolean,
}
```

`menuType` and `previousGameState` are empty/null outside a submenu. Unknown
screen values fall back to `explore`; invalid context fields fall back to
empty strings, `-1`, or `null`.

`hasMap` is true only for a non-empty rectangular map whose rows and cells are
all present and valid; `hasCurrentCell` additionally requires integer `x`/`y`
coordinates pointing at a valid cell. `hasCombat` requires a non-empty dense
monster array whose entries are records. `hasStructurallyUsableCombatParty`
requires a non-empty dense party of actor records with a name and one of the
known statuses `ok`, `poisoned`, `blind`, `sleep`, `paralyze`, `paralyzed`, or
`dead`; it remains true for an all-dead party so the existing defeat/game-over
recovery can run.
`hasUsableCombatActor` additionally requires at least one actor with an
action-capable status (`ok`, `poisoned`, or `blind`); incapacitated
`sleep`/`paralyze`/`paralyzed` actors remain structural but are not actionable.

`isActionableCombat` is true only for combat or an explicitly combat-originated
combat overlay with usable combat and a live actor, during `choose_actions` and
while not transitioning. `isCombatOverlaySubmenu` and
`isSpellOverlaySubmenu` classify only their validated origin and supported
submenu types. Their `isUsable*` counterparts additionally validate the
current caster, owned/known spell, and target semantics; invalid or stale modal
contexts therefore fail closed. These fields make a stale or partially loaded
state safe for one render/update cycle without changing save payloads.

Navigation normalizes submenu types and history entries when they cross into
the router. Back navigation preserves the existing history/previous-screen
rules, while malformed history falls back through the normal submenu-close
path. Gameplay modules continue to own mutations; the snapshot is read-only
and is not persisted.

## Renderer input boundary

`src/state/renderer_view.js` is the raw-state conversion point for canvas
rendering. `getRendererInput(state, menuContext)` creates one read-only,
per-operation input with the validated `view` snapshot, `sceneVisibility`,
player position, current map/visited map, floor visual signature, lighting,
roaming monsters, party names/affix visibility, and renderable combat monsters.
`src/game.js` creates this input once per render-loop tick and passes it to
`DungeonRenderer`; renderer methods consume this shape instead of reading
runtime state or navigation context directly. State-owned collections remain
referenced rather than copied to avoid adding per-frame map/combat work.
