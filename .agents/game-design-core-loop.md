# Game Design: Core Loop And Pillars

This document records the top-level design direction for the whole game: what
the core loop is, which pillars support it, and the pacing targets that keep it
playable in a mobile browser. Use it when evaluating any feature, ticket, or
balance change against the question "does this strengthen the loop or dilute
it?"

`.agents/game-design.md` (Expedition Economy) is the economy-level refinement
of this document. When the two conflict, resolve toward this document's loop
and pillars, then update the economy document.

## Core Loop

```text
explore an unknown dungeon
        ↓
survive on limited resources
        ↓
find unknown (unidentified) equipment
        ↓
return, identify, and study it
        ↓
a new strategy or build emerges
        ↓
re-challenge places that previously blocked you
```

Every major system must feed this loop. A system that creates its own separate
goal (level grinding, gold farming, identify-and-sell profit) competes with the
loop and should be redesigned or cut.

## Design Pillars

The game deliberately combines three lineages. Each contributes one pillar, and
each pillar covers a weakness of the others.

1. **Dungeon as puzzle** (Etrian Odyssey lineage). The floor itself is the
   content: layout, shortcuts, gimmicks, one-way passages, hidden doors, and
   avoid-for-now enemies. The question the player answers is "how do I crack
   this labyrinth?"
2. **Survival as decision** (Torneko / roguelike lineage). Resources inside the
   dungeon are finite: healing, identification support, return means, and
   supplies. Each step is a small judgment; the recurring big judgment is
   "return now, or push one more floor?" This tension must never be fully
   purchasable away.
3. **Unknown loot as motivation** (Diablo lineage). Unidentified equipment is
   the primary long-term reward. The moment of identifying a find and having it
   change your build is a peak experience; protect its rarity and its impact.

**Decided: the labyrinth is fixed, not regenerated per run** (2026-07-10).
Per-run map regeneration (full roguelike / Torneko-style dungeons) was
considered and rejected. The map stays fixed within a save (TICKET-054);
mastery, shortcuts, and "come back for that enemy later" depend on it. The
Torneko lineage contributes resource management and push-your-luck decisions
(pillar 2), not map randomness. Unknownness comes from unexplored floors and
unidentified loot (pillars 1 and 3), not from reshuffling known ground.

## Information Disclosure

The smallest unit of the exploration pillar is not the step — it is **the
information a step discloses**. A step is interesting when what it reveals
forces the player to re-evaluate the current plan:

```text
take a step -> new information appears -> re-evaluate the plan ->
advance, retreat, or prepare -> take another step
```

Darkness and hidden things are not the point; the *process of coming into
view* is. Never add opacity for its own sake — a corridor where nothing is
revealed step by step is dead space, however dark it is.

### The four-rung ladder

Information about any entity (enemy, trap, door, treasure) moves through
stages, and reveal mechanics should land on a rung rather than jump from
nothing to everything:

1. **Unknown** — nothing.
2. **Presence** — something exists: a sound, a glow, an aura, a trace.
3. **Identification** — what kind of thing: a large shadow, an iron door,
   a chest-like light.
4. **Detail** — exact type and state: the specific enemy, the trap type,
   the threat rating.

Existing systems already sit on this ladder: the proximity/sensory aura is
presence; trap traces (TICKET-037) are presence-to-identification; the danger
telegraph (TICKET-015) and the warden threat display (TICKET-078) are
identification-to-detail. A new reveal mechanic should state which rung it
serves and what decision changes when the player climbs to it. The gap
between rungs is where decisions live: "do I get closer to identify it,
knowing it may notice me?"

### Information vs exposure

Gaining information must have a price, or maximum-visibility gear becomes the
only correct build. The trade is information against exposure and resources:
approaching to identify risks being noticed; light costs fuel. Today light is
pure upside (encounter rate 0.10 -> 0.07 -> 0.05); that is an accepted
simplification, already flagged as a watch item under Combat pacing. Any
future light rebalance should consider pricing light with exposure, not just
supply.

The same logic bounds caution: checking must cost something (light duration,
the step budget that TICKET-077 pacing implies), so the ideal state is
"checking makes you safe, but you cannot afford to check everything."

### Growth along this axis

Level-less growth lives here: perception (identify from further away),
interpretation (read traces into predictions), options (more actions to take
on information), and equipment (hearing range, wall sense, trace reading).
Information-gathering gear is a first-class reward category alongside combat
stats, and feeds pillar 3's build variety.

Design test for any new exploration feature: **what does a step disclose,
and what decision does that change?** If the answer is "nothing" or "none",
the feature is scenery.

## Combat Is Subordinate To Exploration

Combat exists to gate and pace exploration, not as the goal.

- The desired chain is: explore -> a fight blocks progress -> want better gear
  or a build change -> loot and identify -> explore further.
- The rejected chain is: fight to get gear -> use gear to fight more, with
  exploration reduced to a corridor between fights.
- When a change makes fighting the most efficient way to progress on its own
  (XP or gold farming loops), it violates this principle. See the level and
  gold rules in `.agents/game-design.md`.

## Floor Density Targets

Browser and mobile play means short sessions. Long, sparse floors kill the
game. Targets below were calibrated against the TICKET-076 audit
(`scratch/sim_floor_density.js`, 100 seeds x B1F-B5F); measured means in
parentheses.

- **Critical path** (entry to down stairs; B3/B5 also to boss): 20-30 steps
  (measured 22-28 — on target). This, not total tile count, is the per-run
  pacing metric.
- **Full-loot route** (all normal chests, then stairs): 80-110 steps
  (measured 92-99). A first-visit cost; revisits should beeline.
- **Total reachable tiles** (~320 per floor) are exploration capacity
  amortized across runs under the fixed labyrinth, not a per-run cost. There
  is no per-run tile cap; do not shrink the map to chase one (TICKET-076 kept
  map size, plan A on hold).
- **Combat pacing**: ~5-6 fights on the frontier floor being explored; 2-3 on
  known transit floors is acceptable and desirable. Implemented via per-floor
  step decay (TICKET-077): encounter rate 0.10 for the first 30 steps on a
  floor this run, 0.04 after (measured: full-loot 5.4-5.7 fights, beeline
  2.0-2.6 — both on target). Light spells still subtract flat (-0.03 / -0.05),
  which means past 30 steps LOMILWA reaches a 0% encounter rate. Light supply,
  MP cost, and duration are therefore the real balance valve on frontier
  combat — a cheap LOMILWA collapses the 5-6 target to ~1.5. Watch this when
  touching light-spell cost or availability.
- **Gimmick learning load**: introduce at most 1-2 *new gimmick concepts* per
  floor. Instance counts (one-way 2-5, secret doors 1-2, pitfalls 0-1) are
  balance tuning numbers, not capped at 1-2; with a fixed labyrinth they
  amortize into route knowledge.
- **Avoid-for-now threats**: at most 1 *roaming* threat per floor. Bosses and
  midbosses are destination fights, not avoid targets, and do not count.
  B1-B3 currently have 0 — a gap owned by the FOE design track.

These are pacing targets, not hard validation rules. Use them when reviewing
map generation, encounter rates, and gimmick placement. A floor far outside
these ranges needs a stated reason.

## Push-Your-Luck Structure

The "return now or go deeper?" decision is a core pillar, and it only exists
while returning is constrained and in-dungeon resources are finite.

- Free or trivial return to town destroys the decision. Existing direction:
  no free full heal at the castle (TICKET-040), scarce town-portal supply
  (TICKET-042).
- Recovery scarcity inside the dungeon is part of the same budget
  (TICKET-018).
- **Every expedition starts at B1F.** There is no save-state resume from a
  deeper floor. The return-mark resume introduced by TICKET-041 is retired
  (TICKET-075); TOWN_PORTAL is a pure emergency escape — it brings the party
  and its loot home safely, nothing more. Depth must be re-earned each run.
- Depth persistence is spatial, not save-state: opened shortcuts, one-way
  routes, hidden doors (TICKET-045/046), and the persistent map seed
  (TICKET-054) are what make re-descending faster. If re-descent still feels
  like padding, fix it with more shortcuts or floor density, not by
  reintroducing resume.
- Camps (TICKET-082) are **in-run waypoints, not cross-run resume points**:
  a partial rest once per run at B2/B4, unlocked permanently by defeating
  that floor's warden. They segment the run ("push to the next camp?")
  without banking depth between runs — TICKET-075's B1F start is untouched.
  Session interruption is already covered by autosave; camps owe it nothing.

## FOE-Like Enemies (Designed: TICKET-078)

Visible, avoidable, clearly-unwinnable-for-now enemies give exploration a
mid-term goal that pure floor progression lacks. The concrete design is
TICKET-078 ("warden" enemies guarding sealed gates; defeating one permanently
opens a shortcut on that floor). This section stays as the design intent the
ticket must satisfy.

Intended cycle:

```text
encounter -> cannot win -> route around it -> gear/build improves ->
defeat it -> a new route, shortcut, or reward opens
```

Requirements when this is designed:

- The threat must be telegraphed before commitment (extends TICKET-015/016;
  the player must be able to read "do not fight this yet" at a glance).
- Defeating one must open something spatial (route, shortcut, camp access),
  not just drop loot; otherwise it is only an elite fight.
- At most one per floor (see Floor Density Targets).

Implementation scope, phasing, and data shape live in TICKET-078; this
section records only the intent it must satisfy.

## Avoid

- Level grinding as the dominant progression strategy.
- Combat loops that are self-justifying (fight to gear up to fight).
- Long sparse floors and corridor padding.
- Free, reliable, or purchasable-at-will return to safety.
- Making unidentified gear common enough that identification stops being an
  event.
- Adding a fourth pillar. New systems must serve exploration, survival, or
  unknown loot; a system serving none of them is out of scope.
- Per-run map regeneration. See the fixed-labyrinth decision under Design
  Pillars; do not reintroduce it as a feature, difficulty mode, or "fresh
  content" fix without revisiting that decision explicitly.

## Relationship To Other Documents

- `.agents/game-design.md`: economy-level rules (XP, gold, shops, materials,
  workshop, rewards, contracts, clear flow). It implements pillars 2 and 3 at
  the numbers level.
- `.agents/balance-simulation.md`: use its checklist when tuning any number
  referenced here (encounter counts, recovery budgets, loot rates).
- `.agents/game-logic.md`: use its checklist when implementing gimmicks,
  camps, or FOE-like enemy behavior.
