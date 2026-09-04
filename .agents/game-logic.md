# Game Logic Checklist

## Role

Review game mechanics for correctness, maintainability, and compatibility with
existing state and data structures.

## Scope

- Combat, movement, map generation, state transitions, data/rule/system
  boundaries, and compatibility
- Deterministic resolution, random behavior, save/state shape, and flow wiring
- Facade-to-concrete module behavior for mechanics

Equipment loadouts use the two-hand invariant from `src/rules/equipment_hands.js`:
weapon/medium hands plus shield hands must remain at or below two after every
single equipment action. Invalid replacements are rejected before mutation;
the existing shield is never silently discarded. Active `defend` resolution is
owned by `src/rules/guard_rules.js`, and combat callers must not reintroduce
per-attack half-damage or status-block branches outside that resolver.

Target files are determined from the relevant rows in `.agents/file-map.md`.

## Chest Transition Contract

`state.chestState.phase` is transient runtime state. The legal phases and
transitions are:

| Phase | Legal input and output |
| --- | --- |
| `menu` | A live chest at the current cell. Inspect stays in `menu`; kit disarm stays in `menu` with `trap: "none"`; disarm selection enters `disarm_select`; opener selection enters `open_select`; smash or direct open enters `resolving`; leave enters `terminal`. |
| `disarm_select` | Back/cancel returns to `menu`; a live eligible character enters `resolving`. |
| `open_select` | Back/cancel returns to `menu`; a live eligible character enters `resolving`. |
| `resolving` | A trap is resolved at most once, then enters `reward`; an interrupted or lethal smash may enter `terminal`. Repeated actions are rejected while `state.transitioning` is true. |
| `reward` | Generated materials, identification powder, and the existing main/special/accessory rewards are applied once, then enter `terminal`. |
| `terminal` | No chest action is legal. The chest state is cleared and exploration or game-over owns the next screen. |

The selection screens are navigation-only: their back/cancel path must restore
the chest menu without consuming a trap or reward. Ordinary active chest phase
state is never written to a save payload; saves flatten those encounters to
`explore` and reload with `chestState: null`, leaving the map event to be
entered again. The exception is an unopened `fromDrop` chest, which has no map
event to re-enter: its reward/trap state is saved, its phase is normalized to
`menu`, and load restores the chest menu. This keeps inspection, disarm, smash,
and reward bookkeeping out of later phases while preserving reward, trap,
telemetry, and navigation behavior.

## Save/Apply State-Shape Contract (#835)

`createSavePayload()` is the persistence allowlist. The fields in
`SAVE_PAYLOAD_FIELDS` are persisted; unknown keys and the following runtime-only
fields are intentionally omitted: `menuContext`, `menuHistory`, `equipState`,
`transitioning`, `controlsGuardUntil`, `mapRevision`, and `sessionMaxFloor`.
`gameState` is persisted only as a stable screen (`town`, `explore`, `combat`,
`result`, `gameover`, or `victory`). Submenu, equipment-overlay, ordinary chest,
and trap-encounter state is flattened to a stable screen. The exception is an
unopened `chestState.fromDrop`, which is persisted with phase `menu` because no
map event can recreate it. Unknown direct screens and unsupported submenu parent
screens fall back to `explore` during an active run and `town` otherwise.

At the apply boundary, `normalizeSavePayload()` validates the top-level object,
filters or defaults malformed collections, restores missing scalar defaults,
and canonicalizes supported nested state before any mutation of `state`.
`migrateSavePayload()` then applies current-version compatibility transforms:
character equipment/spell defaults, affix/status metadata, run outcomes,
retired workshop refunds, map cell defaults, and removed legacy fields. The
current version remains `13`; unknown legacy fields are ignored, while an
older/incompatible version or an unreadable payload uses `loadGame()`'s existing
backup/fresh-game fallback.

Persisted gameplay data includes coordinates, party/inventory (including each
unknown equipment item's knowledge stage, observed hints, and trial count), maps and visited
maps, exploration timers, chest/kill/run records, codex/progression, seed,
supported combat state, roaming/noise state, storage/workshop/materials/key
items, dungeon memory, and the last 30 log entries. Defaults cover missing
optional values (empty collections, town/standard coordinates, zero timers,
fresh codex/records, and the standard dungeon-memory seed). `floorChestsTotal`
is derived from loaded maps when absent. Combat is resumed only when it has a
non-empty, object-shaped monster list; otherwise the screen falls back safely.
Run-history and death-log arrays discard non-record entries and repair malformed
archive fields while preserving valid legacy records. A malformed active-run
map is preserved for `RunFloorRecoveryError` handling rather than silently
regenerated. Normalization starts from a structured clone so migration repairs
cannot mutate caller-owned or state-shared nested data.

Roaming elite lifecycle is part of `currentRun.eliteFloors`, keyed by floor. Each
entry records whether the entry roll was resolved, whether the elite spawned or
was defeated, the qualitative warning stage, consumed prolonged-check indices,
the internal Greed action pressure, whether the exit stairs were found, and
dedupe keys for one-time optional-area actions. This state is normalized and
persisted with the run so walking alone cannot advance the threat and save/load
cannot reroll an entry roll, a prolonged check, or a warning.

## Object-loot ownership contract (#1006)

`state.inventory` and `party[*].equipment` describe placement only. During an
active run, `currentRun.townInventory` contains the Town-provided preparation
items still unused, and `currentRun.unbankedObjectLoot` contains stable loot
entries acquired in the dungeon. Loot remains unbanked when equipped. The
terminal transition records `bankedObjectLoot`/`lostObjectLoot`, returns unused
Town items and returned dungeon consumables to `state.storage`, and clears active
ownership. Recovered dungeon equipment remains terminal evidence rather than
permanent storage. Portal settles all unbanked entries, Wing settles only its
selected IDs, and death/abandon settle none. Push never invokes settlement. These fields are additive save data and
normalize to empty collections for older current-version saves.

The bag contract is fixed at 20 ordinary slots, with one array entry per item
and no consumable stacking. Item-use actions still receive only the base item
ID; when Town and dungeon entries share that ID, the resolver deliberately
consumes Town stock first. Object identity or `instanceId` is used first when
available for equipment replacement, with the same Town-first fallback for
legacy primitive IDs. A future individual-selection UI may pass the ownership
entry ID instead of relying on this fallback.

## Loot generation contract (#1009)

`src/data/equipment_tables.js` and `src/rules/chest_rules.js` expose explicit
B1–B30 candidate pools. Deep pools retain earlier bases and add horizontal
possibilities; they do not fall back to B5. `src/data/affixes.js` owns the
three role labels, Core `buildAxis` values, and their five-floor supply
weights, while `src/systems/equipment_generation.js` rolls a `lootRole` target
and uses it to softly weight actual affix choices. Generation never uses
current equipment to choose a missing slot. Generated equipment stores
`lootRole` plus `buildRole`/`buildRoles` as additive metadata, so existing saves
remain valid. `equipment_decision.buildDecision = "transition"` is reserved
for a change to the explicit `main` Core axis; auxiliary Core and Support
changes remain an ordinary `"swap"`.

## Five-floor trial contract (#1010)

`src/rules/floor_trials.js` derives one main and one sub-theme per five-floor
band from `currentRun.runSeed` and the band index. The selected IDs are cached
in `currentRun.trialBands`; older saves can reconstruct the same selection from
their existing `runSeed`. Main-theme repetition is soft-weighted rather than
hard-banned. Floor roles are also weights: introduction, development, change,
temptation, and settlement affect existing encounter composition, enemy
affinity, and rare-encounter selection without disabling a player action.

Boss encounters carry the same selected IDs and inherit representative existing
enemy traits/behavior as a high-density confirmation of known pressure. The
Guardian therefore changes actual targeting, status, defense, or queued-action
behavior without adding a new rule. Portal clues use coarse signals from the
resolved next band and never reveal theme names, exact probabilities, or a
threat meter.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md`. Start with the mechanic
module named by the request, then inspect the concrete module behind any facade
(`src/state.js`, `src/data.js`, `src/combat.js`, `src/combat_logic.js`,
`src/menu.js`, or `src/ui.js`). Expand to state, data/rules,
systems, and direct callers only when the state shape, formulas, random
behavior, or flow wiring are affected.

## Inputs

- Intended rule or mechanic change
- Changed files or planned diff
- Existing save/state shape, when relevant
- Test output or reproduction seed, when relevant

## Agent Skills

- No skill is mandatory by default; prioritize direct source and test review.
- Recommended when the change touches frontend state wiring or rendered game
  flow as well as logic: `build-web-apps:frontend-testing-debugging`.
- Recommended when browser reproduction is needed for a game-flow bug:
  `webapp-testing` or `playwright`.
- Do not load UI or writing skills for pure mechanics reviews.

## Review Checklist

### Telemetry-only state boundary (#1012)

Telemetry hooks are observation-only: no RNG calls, gameplay mutations,
save-schema additions, or control-flow decisions. Run and loot IDs are stable
within the active runtime run, lifecycle events are deduplicated at the
semantic boundary, and save/load does not replay a completed event as a new
gameplay action. Production object-loot ownership remains in
`src/state/run_loot.js`; telemetry mirrors it but never resolves ownership.

- Rules match the stated design goal.
- State mutations are localized and predictable.
- Existing save data shape is preserved or migration risk is explicitly handled.
- Random behavior is deterministic when seeded tests require it.
- Combat, inventory, equipment, run quest, and reward flows remain consistent.
- Facade files remain thin and do not hide divergent behavior from direct
  module imports.
- Shared rules such as inventory addition, equipment generation, and target
  selection are not duplicated with slightly different constraints.
- Edge cases are handled only where they can happen in the current game flow.
- Names and structure follow existing project style.
- The change does not introduce unnecessary generic systems.

## Required Verification

- `npm run test:unit`
- Targeted scratch test for new deterministic logic, if existing tests do not
  cover it.
- `npm run build` when module boundaries or imports change.

## Must Not Do

- Do not broaden mechanics beyond the requested feature.
- Do not introduce new abstractions for a single use case.
- Do not rewrite unrelated game systems while reviewing one mechanic.
- Do not accept hidden changes to item, enemy, or class balance without calling
  them out.

## Terminal return processing (#1011)

`src/systems/run_return.js` is the single boundary for terminal object
settlement plus Castle/Codex/Workshop records. Callers provide the resolved
outcome (`retreat`, `wing`, `death`, or `abandon`) and must not duplicate loot
ownership rules. Settlement happens before the result summary: unused Town
preparations and returned dungeon consumables go to storage, recovered equipment
remains terminal evidence, unbanked objects are lost on Death/Abandon, and
compact history facts never become combat state.

## Output

Use the repository review output format from `.agents/README.md`.
