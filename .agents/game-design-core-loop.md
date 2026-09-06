# Game Design: Core Loop and Pillars

This is the top-level design canon for the solo depth-attack roguelite. It
defines what the game should mean and feel like: the core question, the
player-facing stakes, information flow, and the pacing qualities that support
short mobile sessions. Source and tests define the present implementation;
this document defines the durable intent.

When another design note conflicts with this contract, preserve the question
of depth, the push-your-luck stakes, and the value of an improvised run build.

## Core Loop Contract

> Make an improvised build every run, expose it to a different resource trial
> in each depth band, and decide how much of the value earned in that run to
> risk before returning.

```text
town: choose a starting kit and optional departure supplies
        ↓
descend and explore a generated floor
        ↓
fight, spend resources, identify or gamble on loot, and assemble the build
        ↓
at each five-floor band: face that band's resource trial and choose whether
to continue toward the next Portal
        ↓
Portal / Push / Wing / Death / Abandon resolves the run's stakes
        ↓
Castle records what happened; Codex records what was understood; Workshop
expands what may exist in future runs
        ↓
descend again with the resulting knowledge and possibility space
```

### Run outcome contract

- **Portal is safe victory.** It confirms all unconfirmed object loot and ends
  the run safely. There is no hidden post-return tax or extraction minigame.
- **Push defers confirmation.** It does not destroy anything; it keeps the
  unconfirmed results at risk until the next confirmation opportunity.
- **Wing is controlled loss-cutting.** It is a manually chosen immediate safe
  escape. The player selects only a small subset of unconfirmed object loot to
  rescue, including equipment that is currently equipped. It never activates
  automatically and at most one Wing is carried into a run.
- **Death loses the gamble.** Unconfirmed object loot is lost by default, while
  knowledge and records follow their own contracts.
- **Abandon has the same object-loot loss as Death but remains a distinct
  outcome.** It is not a free Wing.

These are object-loot ownership rules, not percentages of banked materials.
Material recovery and progression may have their own rules, but they must not
replace the player's explicit object-loot risk decision.

### Bag and value competition

The 20-slot ordinary bag is part of the push-your-luck design:

- equipped equipment is outside the bag;
- spare equipment, consumables, unknown items, curios, and Wings compete for
  ordinary slots and do not gain special safety or treasure compartments;
- preparation supplies and dungeon finds use the same capacity;
- preparation supplies are consumed only when used, while dungeon-acquired
  objects remain run loot until settlement;
- removing equipment into a full bag requires an explicit discard decision;
- permanent capacity expansion is not part of the contract.

The roles are intentionally different: equipped items provide power, spare
equipment provides adaptation, consumables provide safety, unknown items carry
future build potential and danger, curios provide value and information, and a
Wing reduces loss while consuming capacity.

## Five-floor bands and build meaning

Each five-floor band is a resource-allocation chapter, not merely a stronger
copy of the previous floors. A band asks a different question about HP, MP,
status, information, actions, or inventory pressure. The theme should be
readable through encounters and clues without becoming an exact probability or
threat label.

Loot has three durable roles:

- **Reinforcement** extends the player's current way of fighting.
- **Cost conversion** changes what the player pays, such as HP, MP, status,
  time, or inventory space.
- **Direction change** replaces the main way of fighting.

Shallow bands should make reinforcement common enough for a build to form.
Deeper bands should increase the meaningful opportunities for cost conversion
and direction change while retaining earlier possibilities. Depth should expand
choices, not turn the collection into obsolete filler or a simple base-stat
treadmill.

Strong enemies are temptations and risks of greedy exploration, not a mandatory
fixed encounter on every floor. The player should understand the pressure and
have a meaningful response before the threat becomes decisive.

## Town meta roles

- **Castle = what happened.** Record outcome, depth, Portal/Wing/Death/Abandon,
  representative items, recovered/rescued/lost value, and meaningful item
  history as structured facts.
- **Codex = what was understood.** Store observed facts and hypotheses. Unknown
  items progress from signs to observation to trial to full understanding; the
  Codex does not reveal an undiscovered answer or an optimal build.
- **Workshop = what may exist.** Expand the horizontal possibility space for
  future runs. It must not target a chosen build, raise that build's appearance
  rate, provide a permanently superior combat tier, or turn shallow farming
  into the best route.

Recovered dungeon equipment is terminal evidence, not permanent next-run
combat equipment. Returned consumables may replenish preparation supplies when
their economy contract permits it; this does not make recovered equipment a
second inventory.

## Design pillars

1. **Depth is the question.** Every system must help the player descend, make
   the descent decision harder, or record the result. A system that creates a
   separate dominant goal, such as farming or arbitrage, competes with the
   question and should be redesigned or cut.
2. **Push your luck has explicit outcomes.** Portal, Push, Wing, Death, and
   Abandon must remain legible player-facing contracts. Do not replace the
   decision with an automatic escape or a percentage-only reward rule.
3. **Builds come from unknown loot.** The character is assembled during the
   run from found equipment and skills. The player chooses between spending
   scarce identification resources and acting on partial information. The
   identify-or-gamble moment is the signature hook; protect its frequency and
   stakes.

## Run structure

- Floors are one-way. The meaningful exits are down stairs, a milestone Portal,
  or a return item; earlier floors are not a farming route within the same run.
- Down stairs are an explicit choice. Staying on the stair leaves the player
  able to reconsider before descending.
- Milestones occur every five floors. A defeated milestone guardian opens an
  optional shortcut, while the original route remains available so the player
  can visit the merchant or Portal.
- The floor after a milestone provides a guaranteed breather before normal
  exploration. Rest is a resource choice, not a free replacement for the
  descent decision.
- Biomes rotate on a five-floor rhythm. Their enemy themes, hazards, landmarks,
  and atmosphere answer “where am I?” while depth supplies the pressure axis.
- Starting deeper may be a useful record-oriented option, but it must carry a
  meaningful material or preparation trade-off so it cannot replace B1 runs for
  every purpose.
- Autosave and resume support multi-session mobile play. A terminal outcome
  replaces the active run so reloading cannot erase a decision.

## Information disclosure

The smallest unit of exploration is the information a step discloses:

```text
take a step → new information appears → re-evaluate the plan →
advance, retreat, or prepare → take another step
```

The reveal ladder is **unknown → presence → identification → detail**. A new
reveal mechanic must state which rung it serves and which decision changes when
the player climbs to it. Information should have a cost such as exposure,
light, steps, or a resource; maximum visibility must not be the only correct
build.

A survey spell may report the current location and facing in its cast result,
then give coarse hints about unexplored space, the direction and rough distance
of the stairs, or a nearby spatial anomaly. It must not persist a map reveal or
turn hidden events, traps, secret doors, or exact coordinates into navigation
answers. Exploration should still be required to gain identification and detail.

### Trap exploration

Traps are terrain and exploration information. They change the value of routes
and the willingness to spend steps, exposure, or HP; they are not a separate
trap-only minigame.

- **Disarm** resolves a known trap before entering its cell. Every character
  shares the same verbs; success belongs to the run-local equipment, support,
  and tool build rather than to a class label or raw character statistic.
- **Forced breakthrough** enters a known trapped cell and accepts a weakened
  effect. It remains possible even when the trap lies on a choke point.
- **Ordinary movement** chooses another available direction. A detour is not a
  special trap action and carries the route's ordinary steps, encounters, and
  other risks.

Map generation owns connectivity, reachability, placement, density, and private
route diagnostics. It does not promise a safe detour, a trap-free shortest
route, or universal avoidance. Trap rules own discovery, resolution, damage,
status, and mitigation. The run-local build owns information, disarm success,
and HP-damage mitigation. Tools and resource systems own availability and
explicit spending conditions. Movement and UI expose facts and available
responses, not hidden route labels. Simulation measures these layers separately
and follows the game rules; it does not define new rules to fit a metric.

The player-facing surface shows facts, signs, success, risk, and resource state.
Internal route diagnostics never become answer choices or trap attributes.
Chest traps retain a meaningful risk/reward branch: inspect, leave, accept a
weakened smash path, or spend a tool. The opportunity costs are bag space,
equipment slots, affix slots, and consumables.

### Unknown equipment

Unknown equipment has four knowledge stages:

1. **Discovery:** type/quality and one or two truthful sensory signs.
2. **Observation:** carrying it or encountering a related situation can add a
   sign, without revealing a complete hidden tag list.
3. **Trial:** equipping or using it makes the main function judgeable while
   preserving the risk of hidden details.
4. **Full understanding:** recovery or deliberate identification exposes the
   exact stored detail.

The player may act from a partial-information stage, but exact hidden values,
probabilities, and undiscovered affix names remain masked. A hint is evidence,
not a one-to-one answer key.

## Combat

Combat paces the descent; it is not the goal. Turn-based menu combat should
support one-handed mobile play and a solo skill axis based on target priority,
resource timing, and build counterplay.

- Encounters are small enough that kill order and target choice matter.
- Enemy roles communicate pressure: aggressors deal damage, disruptors create
  status or action problems, and amplifiers improve other enemies.
- Status effects must not make one unlucky hit equal an unavoidable run loss.
  Short durations, readable counterplay, and meaningful cures preserve agency.
- Fleeing is reliable but costly: the player pays position, time, resources, or
  a parting hit rather than losing to an opaque escape roll.
- Healing exists through consumables, safe transitions, and build effects, but
  in-combat healing must compete with the resources and actions needed to
  descend.
- Live combat and deterministic simulation share action-selection and combat
  resolution semantics. Simulation-only policies such as retreat thresholds
  remain measurement policy, not hidden game rules.
- A milestone guardian may telegraph a build-dependent counter window. The
  window should reward recognizing and paying the right cost without changing
  the rules of ordinary floors.

## Mobile pacing targets

These are experience targets for short sessions, not a substitute for source-
level validation:

- the natural route to stairs usually takes roughly 20–30 meaningful steps;
- a natural route usually presents about 4–6 fights and remains clearable
  without visiting every room;
- a biome introduces at most one or two new gimmicks, with a readable first
  encounter before heavy repetition;
- at most one roaming avoid-for-now threat pressures a floor, while a milestone
  guardian remains a destination fight.

## Tactical consumables

Consumables should temporarily change risk, information, or encounter pattern.
Each must have a situation where using it is attractive and another where
holding it is better; it must not become a permanent universal upgrade.

- An encounter-calling item trades HP, MP, or time for experience, drops, or a
  quest opportunity.
- An encounter-suppressing item trades experience and drop opportunities for a
  safer route to depth.
- A detection item reveals nearby trap information without improving disarm
  success, so it competes with equipment support and other tools.

Supply roles should remain distinct from recovery, retreat, and deterministic
trap-kit roles. Preparation choices are part of the run's first risk decision,
not a second meta-game.

## Relationship to other documents

- `.agents/game-design.md` owns durable economy, resource, status-counterplay,
  merchant, and run-quest semantics.
- `.agents/game-design-equipment-builds.md` owns the Core/Support build model,
  equipment knowledge, and horizontal equipment possibility space.
- `.agents/game-design-combat-model.md` owns combat formula structure,
  application order, and combat information disclosure.
- `.agents/game-design-telemetry.md` owns what can be observed without changing
  gameplay or exposing hidden information.
- `.agents/balance-simulation.md` owns evidence quality for numeric tuning.
- `.agents/game-logic.md` owns implementation and invariant review questions.
- `.agents/mobile-ui-ux.md` owns interaction, layout, reachability, and
  presentation usability.

## Castle return contract

Every terminal route is resolved before the result view: Portal returns all
unbanked dungeon objects, Wing rescues its selected small subset, and
Death/Abandon return none of those objects. The next run starts from Town
preparations, never from recovered dungeon equipment.

Castle keeps one representative item and a small bounded set of meaningful
facts per run. Those facts describe what happened—returned, rescued, lost, or
observed—rather than preserving a full item as a combat bonus. Codex stores
finite coarse observations, and Workshop rewards broaden existing side-grade
possibilities without granting a superior tier, a target-build advantage, or
exact drop information.

## Avoid

- systems that make depth a function of run count rather than judgment and
  build quality;
- free, reliable, or purchasable-at-will retreat;
- unidentified gear or identification resources tuned so the gamble disappears;
- a second town currency or a between-run economy that competes with descent;
- permanent equipment carryover, bag expansion, or dedicated safety storage;
- systems that serve none of depth, push-your-luck, or improvised builds.
