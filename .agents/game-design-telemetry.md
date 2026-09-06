# Telemetry Contract

Telemetry observes the core loop; it does not define the player's optimal
strategy, change game rules, or replace Castle and Codex records. The telemetry
normalizer in `src/telemetry.js` owns the serialized allowlist and safety
limits. Events should be bounded, deduplicated, and free of unrestricted prose
or identifiers that are not needed for the observation.

## Events

| Event | Purpose | Durable observation |
| --- | --- | --- |
| `run_start` / `run_end` | Run boundaries and outcomes | depth, outcome, return reason, HP/MP band, object value summary |
| `stairs_discovered` / `floor_exploration` | Exploration before and after the exit is known | floor, steps at discovery, before/after exploration cost, resource band |
| `valuable_location` | Discovery and choice at a valuable place | location kind, discovered/opened/skipped, floor, source |
| `loot_lifecycle` | Object loot from discovery to settlement | lifecycle stage, category, source, floor, ownership, rarity band, coarse role, value proxy |
| `loot_stake_snapshot` | Production-backed unconfirmed object-loot stake at decision boundaries | snapshot point, count, location/category composition, Rune supply-band composition, Core/Support, bag pressure |
| `equipment_decision` / `build_shift` | Ordinary equipment changes versus meaningful direction changes | action, old/new category, decision kind, role transition |
| `portal_decision` | Push, return, or Wing choice | portal kind, decision, resource band, free slots, unconfirmed count, rescued subset |
| `elite_decision` | Approach, avoidance, contact, and result of optional threats | decision, contact mode, distance band, detection state, floor, unconfirmed count |
| `trap_resolution` | Trap observation, response, and resource exchange | source kind, trap kind, outcome, action, success/risk, build capability band, tool/resource use |

The event names are stable domain observations. Exact property names and
normalization limits remain owned by the telemetry source so a data-shape
change does not become a design change.

`loot_lifecycle` is keyed to the production `lootId`: `found` means the player attempted to take the object, `bagged` means it entered `currentRun.unbankedObjectLoot`, and `tried`/`identified`/`adopted`/`discarded`/`consumed` remain attached to that same sequence. Portal, Wing, Death, and Abandon settle it as `banked`, `salvaged`, or `lost`; Town-owned duplicate item use is not a dungeon lifecycle event. `loot_stake_snapshot` rereads production `unbankedObjectLoot` at each boundary and does not create a second ledger.

## Ownership and lifecycle

`loot_lifecycle` records a single object sequence through meaningful stages:

- `found` means the player attempted to take the object;
- `bagged` means the object entered the bag and gained unconfirmed run
  ownership;
- `tried`, `identified`, `adopted`, `left`, and `discarded` describe player
  decisions attached to that same sequence;
- Portal settles the object as `banked`, Wing settles a selected subset as
  `salvaged`, and Death/Abandon settle unconfirmed objects as `lost`.

An equipped object remains unconfirmed until the terminal route settles it.
Full bags may therefore produce `found` followed by `rejected` without a
`bagged` event. Telemetry must not turn a rejected find into a free inventory
slot or a player-facing reward.

The canonical simulator does not model the production object-loot ownership
ledger; loot and death-loss values therefore remain `not_modeled`, not zero.
Issue #1098 schema and lifecycle provenance are recorded in the measurement
report event schema.

The same run, loot sequence, lifecycle stage, location/action pair, or floor
summary is emitted at most once. Save/load replay does not invent a new
gameplay event. Delivery failure must not stop the game; only a bounded startup
buffer is allowed while the analytics client is unavailable.

## Hidden information and build snapshots

Telemetry may record coarse internal supply or build roles for analysis, but
those fields are not player-facing recommendations. It must not expose exact
drop weights, candidate totals, hidden affix names, or an optimal build through
logs, UI, or Codex copy.

Exploration snapshots record the capabilities that own the decision: equipment
and Support-derived trap expertise, information signs, HP-damage mitigation,
available tools, rule-changing effects, and resource state. They do not use a
character label, progression level, or raw attribute as an exploration
permission. Private route diagnostics such as choke-point or avoidability
labels are never player-facing event properties.

Combat snapshots may retain the combat inputs needed to explain damage, but the
combat identity boundary must not be used to infer exploration authority. A
Core dimension accepts only the active Core definitions; numeric or probability
reinforcements remain Support observations.

### Build Snapshot v1

Telemetry and canonical simulation share `src/rules/build_snapshot.js` as the
production resolver. Its bounded identity contains the weapon behavior profile
(`none`, `light`, `blade`, `impact`, `heavy`, or `medium`), hands, resolved Guard
profile (including universal guard), equipped Medium, Rune capacity, active Rune
spell IDs from socket state, enabled Main/Auxiliary Core IDs, and a fixed
allowlist of bounded combat and exploration Support values. The schema version
and stable identity are part of the measurement record.

HP, MP, bag contents, floor, and run ownership are event context rather than
build identity. Starting kit is a separate fixture/context field. The resolver
does not derive a role label from class or stats, does not inspect save/object
ordering, and never admits free-form unknown dimensions.

Current vNext telemetry omits `playerClass`. Combat callers pass the character
only where the resolver needs production equipment/socket state; they do not
pass class labels into telemetry or formula observations. Legacy class fields
may remain in historical scratch reports solely for compatibility and are not a
current build axis.

## Deterministic measurement

Deterministic measurements should use the production resolution semantics and
record source identity, runner identity, seed/configuration, sample size,
scenario, and schema version. A simulator must declare which terminal object
ownership or player interaction behavior it does not model; an omitted value is
`not_modeled`, not zero.

Measurement may compare exploration before/after stairs, Portal/Wing choices,
equipment decisions, trap outcomes, and optional elite contact. It is evidence
about the loop, not a new rule and not a player-facing optimal-role selector.
Forced calibration that makes an affix or event fire must be reported as such
and kept separate from natural selection.

### Build payment vector measurement (#1096)

The #1096 measurement runner records the resource and decision vectors paid by
each resolved Build Snapshot across the standard six fixtures and workshop
states. It uses the same canonical run-floor, combat, recovery, reward,
equipment scoring, level-up, and settlement paths as the balance runner. JSON
records retain means, quantiles, counts, outcome/death distributions, and
provenance; Markdown is a durable review summary.

Portal events carry HP/MP rate, inventory occupancy/free slots, carried
materials, source, and explicit null placeholders for unconfirmed object loot.
Those nulls mean the production object-loot lifecycle is not modeled by the
canonical simulator, not that the run had no unconfirmed loot. Rune object-loot
and Core/Support object-loot adoption therefore remain `not_modeled`; the
equipment-affix exposure/adoption/firing fields are bounded observation
proxies, including Support ids with exposure but no observed firing. Status
mitigation events come from the production status-resistance and Guard chance
resolvers when combat telemetry is enabled. The measurement is observation-only and cannot change combat, drop,
ownership, or Wing rules.
Build payment action mix uses the production combat verbs: `defend` is Guard,
while `GUARD_POTION` remains an item action.

## Boundaries

- Telemetry does not change clear rate, drop rate, combat formula, resource
  ownership, or Wing rescue rules.
- An equipment `build_shift` is a meaningful change in the authored main build
  direction; an auxiliary or numeric Support swap remains an ordinary decision.
- Castle stores what happened, Codex stores what was understood, and telemetry
  observes both without becoming a persistence or prose authority.
- Allowlisted, bounded facts are preferred to free text. Identifiers are sent
  only when required to join an observation and are normalized at the source.
