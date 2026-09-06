# Game Logic Checklist

## Role and ownership

Review game mechanics for correctness, maintainability, and compatibility with
existing state and data structures.

This checklist owns domain invariants: what must remain true about mechanics,
state, transitions, ownership, and persistence. `.agents/qa-regression.md` owns
the verification strategy for proving those invariants. Source and tests own
the concrete state shapes, transition tables, field allowlists, selectors,
module names, and exact scenario inventories.

## Scope

- Combat, movement, map generation, state transitions, and flow wiring
- Deterministic resolution, random behavior, save/state compatibility, and
  data/rule/system boundaries
- Ownership, inventory, rewards, terminal outcomes, and observation boundaries
- Facade-to-concrete module behavior for mechanics

## Durable invariants

### Action and transition integrity

- Every player action resolves against the current valid state. Invalid,
  stale, or repeated input is rejected without applying a partial effect.
- A mechanic has an explicit legal transition path. Navigation-only back or
  cancel before commitment returns to the prior choice without consuming or
  mutating the pending outcome.
- A committed action settles its gameplay effects and terminal transition at
  most once. Input guards and idempotent boundaries prevent duplicate rewards,
  traps, mutations, navigation, or other observable effects.
- Interrupted, lethal, abandoned, and recovery paths preserve the player's
  visible intent and leave the system at a valid next boundary.
- A grouped player action has one defined world-time boundary. The cost is
  applied at that boundary, not once per internal sub-change; invalid, no-op,
  and canceled actions do not advance time unless the mechanic explicitly
  requires it.

### State and persistence boundaries

- Runtime interaction state, overlays, guards, and session-only counters do not
  cross a persistence boundary unless resuming that exact state is an explicit
  part of the mechanic.
- Persisted interactions resume at a safe, normalized boundary. A transient
  event that can be reconstructed returns to a stable screen instead of
  serializing implementation phases; an event with no reconstruction path is
  persisted only through its explicit resumable record.
- Persistence is an allowlist, not a snapshot of live state. Unknown runtime
  data is excluded, and compatibility changes are additive or deliberately
  migrated.
- Normalization and migration validate a complete candidate before mutating
  live state. They operate on isolated input data, repair only supported
  structures, and fail safely on malformed or incompatible input.
- Safe failure preserves valid progress or routes it to an explicit recovery
  path; it does not silently regenerate, partially apply, reroll, or replay a
  completed outcome.

### Rule ownership and atomicity

- Each shared mechanic has one authoritative rule path. Callers compose that
  rule and must not reimplement a second version with subtly different
  constraints, mitigation, targeting, generation, or settlement behavior.
- Multi-part changes validate a side-effect-free projection before committing.
  If any constraint fails, live state remains unchanged; a valid commit applies
  its complete result atomically.
- Previews, inspection, and projected comparisons are observation-only.
  Discovery, knowledge, or progression changes occur only in the committed
  action that owns them.
- Capacity, compatibility, lock, and placement constraints are checked against
  the projected result. Rejecting a replacement never silently discards the
  existing valid placement.
- Ownership, placement, reward generation, reward settlement, and persistence
  are separate concerns. A transition may coordinate them, but no concern is
  implicitly completed merely because another one changed.

### Ownership and reward settlement

- Preparation items, items acquired during an active run, unresolved rewards,
  placed items, and terminal evidence have explicit ownership semantics. A
  placed item is not automatically banked, and terminal evidence is not
  automatically permanent inventory.
- An unresolved multi-choice outcome remains separate from final inventory
  until the player explicitly takes or leaves each applicable entry. Only the
  chosen outcome is placed or settled; an unchosen entry does not pass through
  an unrelated inventory path.
- Intermediate checkpoints and terminal outcomes settle ownership according
  to their declared rules. Terminal settlement has one authority, and callers
  do not duplicate or bypass it.
- Stable object identity is preferred when resolving duplicate-looking items;
  any legacy fallback is deterministic and preserves the declared ownership
  priority.

### Determinism and derived behavior

- Seeded behavior is reproducible wherever repeatability is part of the
  contract. Save/load, inspection, or telemetry must not consume gameplay RNG
  or reroll an already resolved result.
- Generated content uses declared context such as depth, role, or band rather
  than incidental current placement. Candidate pools retain the intended
  earlier possibilities when expanding into deeper content; accidental generic
  fallbacks are not a substitute for an explicit pool.
- Derived selections that span turns or persistence boundaries are cached or
  reconstructed from stable inputs. Repetition, weighting, and hard exclusion
  are distinct policies and must not be conflated.
- Contextual content changes the intended composition or pressure by reusing
  authoritative existing rules. It must not create a shadow rule that silently
  disables a player action.
- Player-facing clues preserve intended information boundaries: unresolved
  internal weights, exact probabilities, and hidden meters are not exposed
  unless the mechanic explicitly makes them visible.

### Observation boundaries

- Telemetry and other observation hooks are side-effect free: they do not call
  gameplay RNG, mutate gameplay state, extend the save schema, or decide
  control flow.
- Runtime and loot identifiers remain stable for the active run. Events are
  deduplicated at the semantic boundary, and loading a save does not replay a
  completed gameplay action as a new event.

## Initial File Routing

Before searching broadly, read `.agents/file-map.md` and start with the row for
the request. Follow its facade-to-concrete-module mapping when present. Expand
to state, data/rules, systems, and direct callers only when the state shape,
formulas, random behavior, or flow wiring is affected.

## Inputs

- Intended rule or mechanic change
- Changed files or planned diff
- Existing save/state shape, when relevant
- Test output or reproduction seed, when relevant

## Agent Skills

- No skill is mandatory by default; prioritize direct source and test review.
- Use a frontend-testing or browser skill when the change also affects rendered
  game flow or requires browser reproduction.
- Do not load browser-focused skills for a pure mechanics or data review.

## Review Checklist

- The relevant invariant and player-visible intent are explicit.
- State mutations are localized, predictable, and atomic at their action
  boundary.
- Existing save compatibility and transient/persistent boundaries are
  preserved or deliberately migrated.
- Seeded random behavior remains deterministic where required.
- Combat, inventory, equipment, run, reward, and terminal flows use the same
  authoritative rules across callers.
- Facades remain thin and do not hide divergent behavior from direct imports.
- Observation hooks remain separate from gameplay decisions and mutations.
- Edge cases are handled only where they can happen in the current game flow.
- Names and structure follow existing project style without adding a generic
  system for a single mechanic.

## Must Not Do

- Do not broaden mechanics beyond the requested feature.
- Do not replace executable safeguards with prose or remove tests because a
  checklist was generalized.
- Do not rewrite unrelated game systems while reviewing one mechanic.
- Do not accept hidden changes to item, enemy, class, or economy behavior
  without calling them out.
- Do not prescribe implementation details when the invariant can stand alone.

## Output

Use the repository review output format from `.agents/README.md`.

## Classless current-run contract (#1102)

The current run has no character class, learned-spell list, class growth, or
class permission. The six base abilities (`str`, `int`, `pie`, `vit`, `agi`,
`luk`) and level growth are universal inputs. Build identity and specialization
come from equipped gear, Core/Support affixes, the equipped medium, and
socketed Runes.

Active spells are derived only from the equipped medium and its socketed Runes.
Mana items are available to any character with positive maximum MP. Trap
detection, disarm, chest inspection, critical, barehanded attack, and evasion
use universal rules plus equipment/affixes; they do not branch on a class name.

Save normalization drops legacy `class` and `spells` fields from current
characters and never reconstructs learned spells. Historical run records may
retain a legacy class field as archive evidence, but it is not loaded into the
current party or used by gameplay. See `.agents/legacy-class-model.md`.
