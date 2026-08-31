# Game Design: Core Loop And Pillars

This document records the top-level design direction for the whole game: what
the core loop is, which pillars support it, and the pacing targets that keep it
playable in a mobile browser. Use it when evaluating any feature, ticket, or
balance change against the question "does this strengthen the loop or dilute
it?"

**Direction change (2026-07-18).** The party-based, fixed-labyrinth,
town-economy game was retired and replaced by a solo depth-attack roguelite.
This document is the durable design record for the pivot. Where an older
ticket or document assumes a 6-character party, a fixed map, or the town gold
economy, this document wins.

## Core Loop vNext Canonical Contract

**Canonical source:** [#973 comment 5479686603](https://github.com/y-krn/wiz-mobile-rpg/issues/973#issuecomment-5479686603).
That comment is the current design authority. Earlier issue comments and
measurements remain history; when they conflict with this section, this
section wins.

> Make an improvised build every run, expose it to a different resource trial
> in each depth band, and decide how much of the value earned in that run to
> risk before returning.

This is a **design target / vNext contract**, not a claim that every part is
implemented in the current game.

### Run loop

```text
town: choose class, starting options, and optional departure supplies
        ↓
descend and explore a generated floor
        ↓
fight, pay resources, identify or gamble on loot, and assemble the run build
        ↓
at each 5-floor band: face that band's resource trial and decide whether to
continue toward the next Portal
        ↓
Portal / Push / Wing / Death / Abandon resolves the run's stakes
        ↓
Castle records what happened; Codex records what was understood; Workshop
expands what may exist in future runs
        ↓
descend again with the resulting knowledge and meta progression
```

### Run outcome contract

- **Portal = safe victory.** Confirm all unconfirmed object loot, end the run,
  and return safely. There is no post-return danger, hidden tax, or extraction
  minigame.
- **Push = defer the confirmation decision.** Push does not destroy anything;
  it skips the current confirmation opportunity and keeps the unconfirmed
  results at stake until the next Portal.
- **Wing = controlled loss-cutting.** A Wing is a manually chosen, immediate
  safe escape. The candidate pool is the run's unconfirmed object loot,
  including dungeon equipment that was identified after acquisition but is
  currently equipped; the player selects only a small number to rescue. It
  never triggers automatically or kills the player after activation; the
  canonical starting value is `salvageCount = 2` (the number remains a tuning
  decision), the Wing is consumed, and at most one may be carried into a run.
- **Death = lose the gamble.** Unconfirmed object loot is lost by default.
  Basic progression, knowledge, and adventure records may persist under their
  own contracts.
- **Abandon = the same loot loss as Death, with a distinct outcome record.**
  Abandon is not a free Wing.

The vNext contract intentionally does not express Death or Retreat as a
percentage of banked materials. Material banking, if changed by an
implementation issue, must not be used as a substitute for the object-loot
outcome contract.

### Bag and value competition

The bag is fixed at 20 slots and is itself part of the push-your-luck design:

- equipped equipment is outside the bag; spare equipment, consumables,
  unknown items, curios, and Wings each use one ordinary slot and do not stack
  by default;
- town-brought consumables use the same 20 slots as dungeon finds;
- town-brought consumables are consumed only when used and unused stock returns
  after the run; dungeon-acquired consumables are unconfirmed run loot;
- there are no permanent capacity increases or Safety/Wing/treasure-only
  compartments;
- removing equipment returns it to the bag, so a full bag requires discarding
  something before the swap can complete.

The resulting roles are: equipped items provide power; spare equipment
provides adaptation; consumables provide safety; unknown items combine future
build potential, return value, and danger; curios provide return value and
information; Wings reduce loss and create room for one more risk.

### Five-floor bands and build meaning

Each five-floor band between Portals is a **resource-allocation chapter**, not
just a stronger copy of the previous floors. A run receives a band theme and a
sub-theme, and the band asks a different question about HP, MP, status,
information, actions, or inventory pressure. Strong enemies are temptations
and risks of greedy exploration, not a mandatory fixed encounter on every
floor.

Loot has three roles: **reinforcement** extends the current way of fighting;
**cost conversion** changes what the player pays (HP, MP, status, or another
resource); and **direction change** replaces the main way of fighting. The
initial tuning targets are 75/20/5% in B1–5, 60/30/10% in B6–10, 55/30/15%
in B11–15, 50/35/15% in B16–20, and 45/35/20% in B21+ (reinforcement /
cost conversion / direction change). These are vNext tuning targets, not
current-runtime guarantees.

### Town meta roles

- **Castle = what happened:** run outcome, depth, Portal/Wing/Death/Abandon,
  representative items, recovered/rescued/lost value, and meaningful item
  history.
- **Codex = what was understood:** observed facts and hypotheses. Unknown
  items progress from signs to observation to trial to full understanding;
  the Codex must not reveal the answer or an optimal build directly.
- **Workshop = what may exist:** it expands the horizontal possibility space
  for future runs. It does not target a specific build, raise that build's
  appearance rate, or provide permanent superior combat equipment. Small
  unlocks should generally come from adventure results rather than a farmable
  target path.

### Current implementation boundary

The current codebase contains partial and legacy implementations for Return
Wing, 20-slot inventory, unidentified equipment, workshop purchases, codex
records, and run outcomes. Those systems are useful implementation context but
are not evidence that the full contract above is live. Follow-up gameplay
issues must state which contract slice they implement and must not describe
unimplemented Portal confirmation, Wing salvage selection, or band-specific
resource trials as current behavior.

The current workshop UI/data still exposes a permanent-unlock tree and the
current loot code still has historical floor-pool assumptions. Those are
transition-state facts to be reconciled by implementation issues, not vNext
design decisions.

## Historical loop (superseded)

The following earlier loop is retained only as a record of the pre-vNext
contract and must not be used as implementation guidance.

**Historical decision: departure contracts are player-selected (Issue #694,
2026-08-25).**
The town's departure board presents three varied candidates: one depth goal, one
hunt goal, and one trapless-depth goal. The player may accept one or two before
class and starting-floor preparation; the selected templates resolve their
actual target from that run's starting floor. Candidates are bounded by the
highest unlocked milestone start, so early runs are not offered deep goals
outside the player's current preparation range. The board does not change
contract types, target values, or reward amounts. Entering the dungeon through
the ordinary "迷宮に入る" path keeps the existing random assignment of one or
two contracts.

An uncompleted contract expires with its run and is not carried into the next
descent. This keeps a contract a promise about the current push-your-luck run,
not a persistent checklist or a reason to farm shallow floors. Completed
contracts still award their existing materials during the run, and the active
contract list remains visible in the run HUD and result screen.

**Historical decision: the castle is a preparation loop, not only a record viewer**
(2026-08-16). The castle keeps structured death causes (floor, category, and
source) and presents them in descending frequency. The most frequent cause
must name an existing departure-preparation item or workshop node and link to
that preparation screen, so a death record immediately informs the next
descent. Legacy logs without classification remain unclassified and are not
reconstructed retroactively. This changes information flow only; it does not
change hazard, combat, reward, or material rules.

Depth is both the score and the progression axis. The personal best (deepest
floor, retreat and death recorded separately) is always visible on the title
screen, in town, and on the run result. Abandon is tracked as its own run
ending without entering death metrics.

**Historical decision: the castle is the player's adventure chronicle** (Issue #813,
2026-08-26). The castle presents recent runs as factual adventure entries,
then personal bests, first achievements, B5/B10 trends, and structured death
causes. Retreat, death, and abandon remain distinct outcomes, and the display
copy is generated from persisted facts rather than saved as prose. Recent run
history is capped at 20 entries; aggregate records and first achievements are
kept separately so the chronicle remains useful after older entries roll off.
This changes information presentation and record keeping only; it does not
change depth, combat, hazard, reward, or material rules.

**Historical decision: Return Wing is an independent special chest reward (Issue #791,
2026-08-22).** `TOWN_PORTAL` is not part of the ordinary chest main-reward
candidate pools. A chest first resolves its normal main reward, then performs a
separate Return Wing roll, so obtaining a Wing cannot consume the ordinary
reward slot. The explicit special-roll rates are B1 0%, B2 2%, B3 2%, B4 0%,
and B5+ 4% (the B5 rate is reused at deeper floors). These rates match the
base-run chest replacement opportunity measured on the real run path while
turning the Wing into a separate push-your-luck decision. The existing bank
rate, in-combat availability, craft cost, milestone merchant price/role, and
milestone return-portal behavior remain unchanged.

Measurement question/decision: does separating the Wing preserve ordinary
reward supply and avoid a material EV/depth regression? Adopted because the
matched after case passed that rule. Measurement basis: clean PR head
`287a32ee222506f97e224f8468c1399e638ff866`, base
`adc6631cb20f947a1f77667e0eb732d91d6b3647`, `originMainAncestor=true`,
`staleTreeAllowed=false`, seed 231, `balance-main`, `workshop-complete`,
N=500 per target depth, calibration N=100, Node v26.7.0, the real
`generateRunFloor`→exploration→round/reward path, current status-cure and
equipment scoring policies, and Return Wing use at HP≤35% with no recovery
potions remaining. The matched baseline reconstructed the pre-#791 B2/B3/B5
candidate pools in the measurement harness; the after case used the production
special roll for ordinary generated-floor chests. Combat-generated reward
chests (`fromDrop`) keep their existing behavior and are out of this
measurement scope; their legacy main-reward candidate pools and ordering are
preserved. At B5/B10/B20, baseline main-slot Wing replacements were
0.198/0.466/0.546 per run; after special offers, main-slot replacements were
0/0/0 and special chest acquisitions were 0.152/0.304/0.272 per run because
the inventory keeps at most one Wing. Total equipment per run was
10.374/15.048/14.726 before and 10.522/15.870/16.864 after. Banked-material
EV was 38.968/42.936/36.966 before and 39.136/44.678/49.130 after. B5 reach /
breakthrough was 39.8%/0.0%, 44.8%/15.4%, and 37.8%/10.6% before versus
40.2%/0.0%, 44.2%/16.2%, and 40.6%/16.0% after for the B5/B10/B20 target
series; B10 reach / breakthrough was 0.0%/0.0%, 10.2%/0.0%, and 6.6%/5.2%
before versus 0.0%/0.0%, 12.6%/0.0%, and 12.2%/8.8% after. Retreat/death
rates were 43.8%/56.2%, 22.6%/77.4%, and 16.2%/83.8% before versus
43.8%/56.2%, 24.6%/75.4%, and 17.4%/82.6% after. At B20, chest-special
Wing use was 0.158 per run after the change versus 0.156 ordinary chest Wing
use in baseline; use was concentrated in the 0-20% and 21-35% HP bands. The
sim records Wing source, acquisition, use floor, HP band, explicit
retreat/death outcome
counts and rates, bank EV, and main-slot replacement telemetry; the Issue #697
measurement now carries the same explicit retreat/death counts and rates;
raw run output
remains untracked.

Measurement scope: modeled behavior includes generated floors, the production
chest reward order and inventory limits, Return Wing use, configured
status-cure decisions, and equipment scoring. Omitted behavior includes live
UI timing and manual choices, visual/audio chest presentation, live analytics
transport, and policies outside the configured simulator. Retreat/death fields
are therefore simulated outcomes, not production telemetry, and do not claim
to measure player behavior.

**Decided: smash can destroy ordinary chest rewards (Issue #808,
2026-08-22).** The chest action order is fixed: smash, trigger the weakened
trap if present, stop without awarding rewards when the party is dead, resolve
independent reward-loss rolls, award the remaining rewards, then mark the chest
processed. Smash-only loss rates are weapon 25%, armor 25%, shield 25%,
accessory 25%, and usable 50%. Special rewards, quest items, and
progression-required items are protected at 0%; Return Wing remains an explicit
special reward and is never destroyed. Ordinary opening, successful disarm,
and TRAP_KIT paths do not roll reward loss. Destroyed rewards are omitted from
inventory and current-run reward records, while chest materials and existing
Return Wing/fromDrop scope remain unchanged.

The real-run simulator's existing `force` chest branch models the weakened
trap/smash path and now consumes the shared role-aware loss rule for its main,
special, and accessory rewards. Live manual choice timing, UI presentation,
and combat-generated `fromDrop` smash choices remain outside simulator scope;
the focused chest formula/transition tests cover those omitted choices and
protect the existing fromDrop behavior.

## Design Pillars

1. **Depth as the question.** The game asks one thing: "how deep can you go
   this run?" Every system must either help the player descend, make the
   descent decision harder, or record it. A system that creates a separate
   goal (farming loops, side economies) competes with the question and should
   be redesigned or cut.
2. **Push-your-luck with explicit outcomes.** Portal, Push, Wing, Death, and
   Abandon are distinct player-facing contracts. Their meaning is defined in
   the vNext outcome section above; do not replace those object-loot stakes
   with a percentage-only banking rule or an automatic escape.
3. **In-run builds from unknown loot.** The character is assembled during the
   run from found equipment and skills. Loot is unidentified by default:
   spend a scarce identify resource, or act from the partial-information rung
   and risk a curse. The identify-or-gamble moment is this game's signature
   hook; protect its frequency and its stakes.

**Historical measurement: the core experience is improvised build completion**
(2026-07-24). The vNext contract above supersedes its percentage and phase
assumptions, while the build-first motive remains valid.
Pillar 3 is the game's primary motive:
the player improvises a build from what drops (not a planned collection), and
**depth is the arena that tests that build's quality** — the floor reached is
the build's answer key. This implies a two-phase run with a continuous
transition centered on ~B10: an early **build-up phase** (loot-rich, survivable,
where the improvised build comes together) and a **deep evaluation phase**
(weak improvisations die, well-matched builds pass). The player should die from
build quality, not from raw stat/level deficit. Lever priority under this
motive: **build supply first** (drop frequency, core-affix availability — the
lifeblood of the build-up phase), then deep-difficulty made build-dependent,
then the unidentified gamble as the core improvisation decision; growth speed
is a support lever and material time-efficiency (the "B5 retreat is optimal"
finding) is orthogonal and low priority.

**Decided: floors are generated per run** (2026-07-18). This supersedes the
2026-07-10 fixed-labyrinth decision, which belonged to the retired game.
Repeated runs over known ground are dead time in a depth-attack loop, so maps
reseed every run (orchestrated by `src/run_map_generator.js` over
`src/map_generator.js` + `src/seed_rng.js`), with floor templates (size, room
count, gimmick density) selected by depth. Generation quality is the top v1
risk and is verified first in the implementation order.

**Decided: terrain structures are explicit generation primitives** (Issues #934
and #948, 2026-08-29). Biomes provide a deterministic
`terrain.structureProfile` that weights four graph-level primitives: Corridor
(narrow route and retreat choice), Loop (alternative route), Hub (concentrated
branch choice), and Open area (multi-cell sight/route choice). The profile first
selects the floor's dominant `structureType`; that type then drives the maze
straightness, loop openings, and room-carving strategy strongly enough to create
a visible route-graph difference. This extends the existing generator rather
than replacing it and does not introduce player-facing `choke`/`avoidable`
terrain flags. Each generated map exposes `structureMetrics` for diagnostics:
**Decided: terrain structures are explicit generation primitives** (Issues #934,
#948, and layout grammar follow-up #952, 2026-08-29). Biomes provide a
deterministic `terrain.structureProfile` that weights four graph-level
primitives: Corridor (narrow route and retreat choice), Loop (alternative
route), Hub (concentrated branch choice), and Open area (multi-cell sight/route
choice). The profile first selects the floor's dominant `structureType`; the
selected type then enters a type-specific skeleton-first layout: long backbone,
ring, hub-and-spokes, or plaza-and-exits respectively. This extends the
existing generator and does not introduce player-facing `choke`/`avoidable`
terrain flags. Shared post-processing keeps events, traps, one-way passages,
secret doors, and validation compatible. Each generated map exposes
`structureMetrics` for diagnostics:
`junctionCount`, `cycleCount`, `deadEndCount`, `corridorRatio`,
`alternativePathRate`, and open-area counts. These metrics are measured on the
connected graph before a route is considered complete, while one-way passages
and secret doors continue to be validated by the existing reachability checks.
The same run seed and floor always produce the same structure profile, map, and
metrics.

**Decided: solo character, hybrid meta progression** (2026-07-18). One
character per run, Lv1 each run. Between runs the player buys unlocks
(classes, starting-gear options, skill/affix pools) and small permanent stats
with an explicit cap. Depth reached must be a function of judgment and build,
not run count — the stat cap is the levee.

## Run Structure

- Floors are one-way: the only exits are down stairs, a milestone portal, or
  a return item. No backtracking to earlier floors within a run.
- Down stairs are an explicit choice: entering offers descend or continue;
  staying leaves the character on the stair, and leaving then re-entering asks
  again. Milestone stairs remain locked until that floor's boss is defeated.
- Defeating a milestone boss opens an additional down stair at the boss cell.
  This shortcut is optional; the original stair remains so the player can
  return to the milestone merchant or portal before descending.
- Milestones every 5 floors: a boss, then a breather with a permanent return
  portal and a merchant (identify resources, consumables, return items,
  curse removal — priced in materials).
- **Camp entry breather (B6/B11/B16/B21).** After the preceding milestone boss
  is defeated, entering the next floor opens Camp before exploration begins.
  Camp is not a generated map cell, so the breather is guaranteed and does not
  require route luck. The existing rest choice, 40% HP/MP recovery, and
  `CORE_CAMP_MASTER` multiplier remain unchanged; choosing to rest or continue
  closes the entry event and starts normal exploration. The entry floor and
  completion are persisted so autosave/resume cannot repeat the same Camp.
- Biomes rotate every 5 floors: enemy pool, gimmicks, and visual theme
  change. v1 ships ~6 handcrafted biomes (~30 floors) and recycles them at
  higher scaling beyond that.
- Milestone starts: defeating a milestone boss unlocks starting future runs
  from that milestone, with a material-income penalty. Record runs start
  deep; material runs start at B1F.
- Suspend/resume anywhere via autosave (multi-session runs are expected on
  mobile). Autosave overwrites on outcome so reload-scumming is not possible.

## Information Disclosure

The smallest unit of exploration is not the step — it is **the information a
step discloses**. Generated maps make this stronger, not weaker: nothing is
known from a previous run, so every reveal is live.

```text
take a step -> new information appears -> re-evaluate the plan ->
advance, retreat, or prepare -> take another step
```

The four-rung ladder still governs reveal mechanics (unknown → presence →
identification → detail). A new reveal mechanic should state which rung it
serves and what decision changes when the player climbs to it. Gaining
information must cost something (exposure, light, steps), or
maximum-visibility gear becomes the only correct build.

At milestone floors, the down-stairs decision now discloses the floor structure:
the guardian, deep merchant, and return portal are present, with each facility's
visit state and guardian-gated availability shown. Entering a milestone floor
also shows this structure in the entry stinger. This is display-only and does
not reveal map positions or change movement costs.

### DUMAPIC survey design (Issue #951)

`MILWA` and `LOMILWA` define the visible map range. `DUMAPIC` is instead an
instant survey: it reports the current floor, facing, and exact X/Y only in the
cast result, then gives non-positional hints for the direction of unexplored
space, the direction and coarse distance of the down stairs, and the presence
of a nearby one-way spatial anomaly. It never persists a reveal, changes
visited or fragment state, or exposes event, trap, secret-door, enemy, or exact
map coordinates as a navigation target. This keeps the spell at the
presence/inference rung of the information ladder while leaving identification
and detail to sight, equipment, and player exploration.

### Trap exploration design (Issue #931)

Traps are terrain and exploration information, not an isolated event that asks
the player to choose a trap-specific escape command. A trap changes the value
of the available routes and the player's willingness to spend steps, exposure,
or HP to continue. The design is governed by these three responses:

- **Disarm** resolves a known trap before entering its cell. It is a
  class-sensitive and equipment-sensitive way to make the route safer; the
  Thief's exploration identity is discovery, identification, and disarm, with
  safe breakthrough as the resulting advantage.
- **Forced breakthrough** enters a known trapped cell and accepts the trap's
  effect. It must remain possible even when the trap is on a choke point, with
  the existing weakened-effect rules providing the cost of taking this route.
- **Ordinary movement to another route** means choosing another available
  direction and continuing map exploration. `迂回` is not a trap-only action or
  player-facing trap attribute; a detour costs the ordinary movement risks of
  the route, including extra steps and possible encounters.

Map generation guarantees that the floor is **攻略可能** under the game's
available traversal rules. It does not guarantee that every trap has a safe
detour, that all traps can be avoided, or that the shortest route is trap-free.
Choke-point analysis and any `choke`/`avoidable` values are generation and
balance diagnostics, not player-facing trap properties. Choke placement may be
capped as a tuning measure, but that cap must not become a promise of a safe
route.

Information changes the decision: an undiscovered trap carries surprise risk;
once discovered, its cell becomes map information that can be used to choose a
route or prepare a direct response. Discovery and identification are separate
rungs of the information ladder, and neither reveals whether the cell is a
choke point or has an "avoidable" label.

Responsibilities are separated as follows:

| Layer | Owns | Does not own |
| --- | --- | --- |
| Map generation | Connectivity, floor reachability, trap placement, density, and internal route diagnostics | A guarantee of a safe or trap-free route; class balance |
| Trap rules/effects | Discovery state, disarm/forced-traversal resolution, damage, status, and mitigation rules | The player's route preference |
| Class and equipment | Discovery/identification advantages, disarm success, and safe-breakthrough advantages | Map connectivity or a universal trap bypass |
| Movement/UI | Ordinary directional movement, map information, and available direct responses | A dedicated `迂回` action or fixed `choke`/`avoidable` display |
| Balance Simulation | A measurable approximation of route choice and disarm/force decisions, plus outcome telemetry | Defining new gameplay rules or making the game conform to a simulation shortcut |

Before balance changes, measure the layers separately: map structure and route
cost; trap type, intensity, and effect; class/equipment discovery,
identification, disarm, and mitigation; then Simulation policy choices and
outcomes. A change in one layer must not be attributed to another layer merely
because the aggregate run result moved. The Simulation follows the game's
rules and source helpers; the game rules do not change to fit a Simulation
policy.

The game implementation presents discovered floor traps as map information and
offers only `disarm` or `force` when the player attempts to enter one. A player
who wants to avoid the trap chooses another direction through ordinary movement
before entering the trapped cell. The canonical Simulation uses the same
ordinary route model: unknown traps remain traversable route cells, while a
discovered trap contributes its expected response cost to route selection.
Choosing another route advances through ordinary movement and therefore carries
its own steps, encounters, and other trap effects. Simulation alignment must
preserve the meaningful disarm and forced-breakthrough choices.

`trapBonus` remains the single support affix for floor/chest trap disarm and
existing equipment/class passive bonuses. On B5F, the automatic flame trap uses
the same floor-trap success roll and partial-success band as a `damage` floor
trap, without exposing a trap encounter menu. Its effect uses the ordinary
floor-dependent damage range and the same weakened, scout, and `trapGuard`
mitigations. Chest traps keep a risk/reward branch: every class can leave,
smash for a weaker trap effect with possible consumable loss, or use a kit,
while specialist classes retain safer disarm rates.

Unidentified equipment sits on the same ladder: presence (a drop),
identification (base type visible), detail (identified affixes). Pillar 3's
gamble is the choice to act from the identification rung without paying for
detail.

## Combat

Combat paces the descent; it is not the goal. Turn-based menu combat is
retained (mobile one-handed play, existing `combat_logic` assets), rebalanced
for one character:

- Enemy groups of 1–3. The 6-member-party encounter tables are retired.
- Shallow encounters lean toward one enemy while two-enemy kill-order choices
  remain part of the solo skill axis.
- Enemy roles: aggressor (damage), disruptor (status/hindrance), amplifier
  (buffs other enemies). The solo-combat skill axis is kill order.
- Status effects must never be "one hit = run over": paralysis/sleep last at
  most 1 turn and break on hit; instant death is removed (deep-floor bosses
  use heavy damage that resistance builds mitigate instead).
- Fleeing always succeeds, with a cost (fall back one tile, take one parting
  hit). A solo character's escape judgment is never killed by RNG.
- Healing: consumables, a small heal on floor transition, and healing
  affixes. In-combat healing is priced high so it does not dominate.
- Auto-combat action selection, including offensive spells, is shared by the
  live game and the simulation. Simulation-only policies such as flee and
  recovery thresholds stay separate from the shared action-selection logic.
- Milestone bosses may expose a telegraphed, build-dependent counter window.
  The B5 Demon Guard implementation interrupts only its active LAHALITO
  telegraph after sufficient encounter damage, then grants a short encounter-
  local exposure window; it does not alter depth, rewards, materials, banking,
  or non-milestone floors. Source of truth: `src/rules/boss_rules.js`.

## Floor Density Targets

Short mobile sessions still rule. These are generation-tuning targets, not
validation rules; a floor far outside them needs a stated reason.

- Critical path (entry to down stairs): 20–30 steps.
- Fights per floor: ~4–6 on the natural path; a floor must be clearable
  without visiting every room.
- v1 floor templates use 24×24 / 27×27 / 30×30 grids; regular chest placement
  is randomized to 8–12, and chest presence is not revealed by minimap aura.
- New gimmick concepts: at most 1–2 per biome, introduced on its first floor.
- At most one roaming avoid-for-now threat per floor; milestone bosses are
  destination fights and do not count.

The old fixed-map amortization arguments (total-tile capacity across runs,
revisit beelines) are retired with the fixed map. Every floor is a first
visit now; density targets are per-run costs.

## Avoid

- Anything that makes depth a function of run count: uncapped permanent
  stats, stacking meta bonuses, or farm-to-win unlocks.
- Free, reliable, or purchasable-at-will retreat. The gap between retreat
  and death is the game.
- Making unidentified gear common enough (or identify resources cheap
  enough) that the identify-or-gamble choice stops being an event.
- Reintroducing a town economy: gold, shops with baseline gear, or any
  between-run system that competes with "descend again."
- Carrying equipment between runs. Rejected as approach C in the pivot
  design; revisit only as an explicit v2 decision.
- Adding a fourth pillar. New systems must serve depth, push-your-luck, or
  in-run builds; a system serving none of them is out of scope.

## Tactical Consumables (Issue #412)

Consumables are tactical resources rather than stock used only to fill a
shortage. Limited inventory space and use opportunities should temporarily
change a run's risk, information, or encounter pattern. New consumables must
have both a situation where using them is attractive and a situation where
holding them is better; they should not be permanent or universal upgrades.

Phase 1 exploration candidates:

- 鳴らし玉 calls a normal encounter within the next few steps, but never a
  boss or fixed event. It is useful for experience, drops, or run quests when
  the party can afford the fight, and wasteful when conserving HP/MP is the
  goal.
- 静寂の香 greatly lowers normal encounter chance for a short window. It is
  useful for reaching depth or preserving resources, but costs experience and
  drop opportunities.
- 探知石 reveals nearby floor traps without improving disarm rate. It is
  useful before committing to a risky corridor, but is wasteful where no trap
  is nearby and does not replace class or equipment trap advantages.

Supply is intentional: 鳴らし玉 and 静寂の香 are departure-craft choices;
探知石 is an in-run chest/deep-merchant adaptation item. They must remain
separate from recovery, retreat, and trap-kit roles.

## Relationship To Other Documents

- `.agents/game-design.md`: meta-economy rules (materials as the only
  currency, workshop unlock tree, milestone merchants, run quests).
- `.agents/game-design-equipment-builds.md`: affix system (cores/supports);
  now the backbone of pillar 3's in-run builds.
- `.agents/game-design-combat-model.md`: physical and offensive-spell formulas,
  application order, and model-level combat decisions; source values remain in
  `src/`.
- `.agents/balance-simulation.md`: checklist for tuning any number
  referenced here (encounter counts, scaling curves, material income).
- `.agents/game-logic.md`: checklist for implementing generation, combat,
  and run-state changes.
