# UI vNext shell migration

Issue #1025 establishes the shared shell contract for the UI vNext work.
Existing screen modules keep their stable element IDs while the shared shell
adds `data-shell-region` and `data-dock-state` attributes. This lets later
screen Issues migrate content without creating a second rendering path.

## Shared regions

| Contract region | Current element | Ownership |
| --- | --- | --- |
| `minimal-hud` | `#game-header` + `#character-panel` | location, sound setting, and the compact party HUD |
| `dungeon-view` | `#viewport-panel` | Canvas and viewport accessibility text |
| `current-event-strip` | `#log-panel` / `#log-content` | unresolved observations plus transient results; full history stays in `#log-overlay` |
| `action-dock` | `#controls-panel` | the one visible choice surface for the current state |

The legacy IDs are compatibility selectors, not invitations to add duplicate
controls. A new screen should render its choice surface inside the existing
Action Dock or replace the active group's contents in one place.

## Dock and navigation contract

`src/ui/common_shell.js` owns the three shared Dock states:

- `compact`: ordinary exploration or town navigation;
- `decision`: a small irreversible or contextual choice;
- `expanded`: lists, comparison, or selection that needs more vertical space.

Back actions use `data-action-role="back"` and mean cancel the pending choice,
never undo movement or an already executed action. Confirm actions use
`data-action-role="confirm"` and state the outcome in their label. Later screen
Issues must reuse these roles and the existing Dock position.

## Event information audit

`#log-content` shows a short current-event view. Lines classified as
`unresolved` remain visible even after unrelated transient logs are added.
The expandable `#log-overlay-body` remains the access path to the complete
stored history, so compacting the strip does not remove log-only information.
When a future mechanic has an unresolved fact that is not represented by a log
line, it must call the common Event Strip API or add a persistent log entry
before hiding any other log surface.

## Ownership display

`getItemOwnership()` and `appendOwnershipBadge()` expose the shared display
contract. They read existing `townInventory`, `unbankedObjectLoot`, and result
arrays; they do not add inventory slots, alter settlement, or change save
rules. The four labels are:

- `town-confirmed`: 街から持込・確定済み
- `dungeon-unconfirmed`: 迷宮で取得・未確定
- `wing-selected`: 翼で救出選択中
- `lost`: 喪失済み

The owning screen remains responsible for choosing when a badge is relevant.
The next migration Issues should use the same badge for Bag, Portal, Wing, and
Result contexts rather than inventing per-screen wording.
