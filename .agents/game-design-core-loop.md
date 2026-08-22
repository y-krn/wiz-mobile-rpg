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
"retreat with everything, abandon with the same loss as death, or push one more floor?"
        ↓
retreat = keep 100% of materials; death/abandon = keep 30%
        ↓
spend materials on permanent unlocks in the workshop
        ↓
descend again, deeper than before
```

**Decided: the castle is a preparation loop, not only a record viewer**
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

**Decided: Return Wing is an independent special chest reward (Issue #791,
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
matched after case passed that rule. Measurement basis: runner-recorded source
commit `6e9d26e33fa5d2f93db670b1ba0bbef6fea33c15` plus the uncommitted
review-fix working tree, seed 231, `balance-main`, `workshop-complete`, N=500
per target depth, calibration N=100, Node v26.7.0, the real
`generateRunFloor`→exploration→round/reward path, current status-cure and
equipment scoring policies, and Return Wing use at HP≤35% with no recovery
potions remaining. The matched baseline reconstructed the pre-#791 B2/B3/B5
candidate pools in the measurement harness; the after case used the production
special roll. At B5/B10/B20, baseline main-slot Wing replacements were
0.172/0.462/0.522 per run and after special offers were 0.172/0.448/0.558;
after chest acquisitions were 0.152/0.304/0.272 per run because the inventory
keeps at most one Wing. Total equipment per run was
10.428/15.652/14.968 before and 10.522/15.870/16.864 after. Banked-material
EV was 39.076/45.692/38.950 before and 39.136/44.678/49.130 after. B5 reach /
breakthrough was 39.4%/0.0%, 45.4%/15.8%, and 39.2%/11.2% before versus
40.2%/0.0%, 44.2%/16.2%, and 40.6%/16.0% after for the B5/B10/B20 target
series; B10 reach / breakthrough was 0.0%/0.0%, 10.8%/0.0%, and 7.4%/4.6%
before versus 0.0%/0.0%, 12.6%/0.0%, and 12.2%/8.8% after. Retreat/death
rates were 44.2%/55.8%, 24.4%/75.6%, and 16.2%/83.8% before versus
43.8%/56.2%, 24.6%/75.4%, and 17.4%/82.6% after. At B20, chest-special
Wing use was 0.158 per run after the change (baseline 0); use was concentrated
in the 0-20% and 21-35% HP bands. The sim records
Wing source, acquisition, use floor, HP band, explicit retreat/death outcome
counts and rates, bank EV, and main-slot replacement telemetry; raw run output
remains untracked.

Measurement scope: modeled behavior includes generated floors, the production
chest reward order and inventory limits, Return Wing use, configured
status-cure decisions, and equipment scoring. Omitted behavior includes live
UI timing and manual choices, visual/audio chest presentation, live analytics
transport, and policies outside the configured simulator. Retreat/death fields
are therefore simulated outcomes, not production telemetry, and do not claim
to measure player behavior.

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

**Decided: the core experience is improvised build completion** (2026-07-24).
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

Floor traps are route-choice obstacles: adjacent floor-trap detection is certain,
disarm is class-sensitive, forced traversal always passes with reduced damage, and
choke placement is capped so avoidance remains meaningful. `trapBonus` is the
single support affix for floor/chest trap disarm and existing equipment/class passive bonuses. On B5F, the `trapBonus` investment also contributes to the
automatic flame-trap on-trigger avoidance roll through the character-stats helper. Chest traps keep a
risk/reward branch: every class can leave, smash for a weaker trap effect with
possible consumable loss, or use a kit, while specialist classes retain safer
disarm rates.

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
