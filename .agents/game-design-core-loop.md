# Game Design: Core Loop And Pillars

This document records the top-level design direction for the whole game: what
the core loop is, which pillars support it, and the pacing targets that keep it
playable in a mobile browser. Use it when evaluating any feature, ticket, or
balance change against the question "does this strengthen the loop or dilute
it?"

**Direction change (2026-07-18).** The party-based, fixed-labyrinth,
town-economy game was retired and replaced by a solo depth-attack roguelite.
The approved pivot design lives in
`docs/superpowers/specs/2026-07-18-solo-depth-roguelite-design.md`; this
document is the durable distillation of it. Where an older ticket or document
assumes a 6-character party, a fixed map, or the town gold economy, this
document wins.

## Core Loop

```text
town (meta screen): pick class and starting gear
        ↓
descend from B1F at Lv1 (or an unlocked milestone start)
        ↓
explore generated floors, fight, pick up unidentified gear,
build the character within the run
        ↓
every 5th floor: milestone (boss, return portal, merchant)
        ↓
"retreat with everything, or push one more floor?"
        ↓
retreat = keep 100% of materials; death = keep 30%
        ↓
spend materials on permanent unlocks in the workshop
        ↓
descend again, deeper than before
```

Depth is both the score and the progression axis. The personal best (deepest
floor, retreat and death recorded separately) is always visible on the title
screen, in town, and on the run result.

## Design Pillars

1. **Depth as the question.** The game asks one thing: "how deep can you go
   this run?" Every system must either help the player descend, make the
   descent decision harder, or record it. A system that creates a separate
   goal (farming loops, side economies) competes with the question and should
   be redesigned or cut.
2. **Push-your-luck with real stakes.** Retreat (via milestone portal or a
   finite return item) banks everything; death forfeits 70% of materials.
   The recurring decision "bank now or push one more floor?" must never be
   fully purchasable away, and must stay a decision — never a die roll the
   player cannot influence.
3. **In-run builds from unknown loot.** The character is assembled during the
   run from found equipment and skills. Loot is unidentified by default:
   spend a scarce identify resource, or equip it blind and risk a curse. The
   identify-or-gamble moment is this game's signature hook; protect its
   frequency and its stakes.

**Decided: floors are generated per run** (2026-07-18). This supersedes the
2026-07-10 fixed-labyrinth decision, which belonged to the retired game.
Repeated runs over known ground are dead time in a depth-attack loop, so maps
reseed every run (`src/map_generator.js` + `src/seed_rng.js`), with floor
templates (size, room count, gimmick density) selected by depth. Generation
quality is the top v1 risk and is verified first in the implementation order.

**Decided: solo character, hybrid meta progression** (2026-07-18). One
character per run, Lv1 each run. Between runs the player buys unlocks
(classes, starting-gear options, skill/affix pools) and small permanent stats
with an explicit cap. Depth reached must be a function of judgment and build,
not run count — the stat cap is the levee.

## Run Structure

- Floors are one-way: the only exits are down stairs, a milestone portal, or
  a return item. No backtracking to earlier floors within a run.
- Milestones every 5 floors: a boss, then a breather with a permanent return
  portal and a merchant (identify resources, consumables, return items,
  curse removal — priced in materials).
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

Unidentified equipment sits on the same ladder: presence (a drop),
identification (base type visible), detail (identified affixes). Pillar 3's
gamble is the choice to act from the identification rung without paying for
detail.

## Combat

Combat paces the descent; it is not the goal. Turn-based menu combat is
retained (mobile one-handed play, existing `combat_logic` assets), rebalanced
for one character:

- Enemy groups of 1–3. The 6-member-party encounter tables are retired.
- Enemy roles: aggressor (damage), disruptor (status/hindrance), amplifier
  (buffs other enemies). The solo-combat skill axis is kill order.
- Status effects must never be "one hit = run over": paralysis/sleep last at
  most 1 turn and break on hit; instant death is removed (deep-floor bosses
  use heavy damage that resistance builds mitigate instead).
- Fleeing always succeeds, with a cost (fall back one tile, take one parting
  hit). A solo character's escape judgment is never killed by RNG.
- Healing: consumables, a small heal on floor transition, and healing
  affixes. In-combat healing is priced high so it does not dominate.

## Floor Density Targets

Short mobile sessions still rule. These are generation-tuning targets, not
validation rules; a floor far outside them needs a stated reason.

- Critical path (entry to down stairs): 20–30 steps.
- Fights per floor: ~4–6 on the natural path; a floor must be clearable
  without visiting every room.
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

## Relationship To Other Documents

- `docs/superpowers/specs/2026-07-18-solo-depth-roguelite-design.md`: the
  approved pivot design this document distills, including the module
  survival map and implementation order.
- `.agents/game-design.md`: meta-economy rules (materials as the only
  currency, workshop unlock tree, milestone merchants, run quests).
- `.agents/game-design-equipment-builds.md`: affix system (cores/supports);
  now the backbone of pillar 3's in-run builds.
- `.agents/balance-simulation.md`: checklist for tuning any number
  referenced here (encounter counts, scaling curves, material income).
- `.agents/game-logic.md`: checklist for implementing generation, combat,
  and run-state changes.
