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
game. Target per floor:

- Roughly 20-30 walkable tiles of meaningful space.
- 1-2 gimmicks (one-way passage, hidden door, pitfall, shortcut, etc.).
- Around 5-6 combats.
- At most 1 avoid-for-now threat (see FOE-like enemies below).

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
- Planned direction, not yet ticketed: designated mid-dungeon camps as the
  only checkpoint mechanism, so "reach the next camp" becomes a goal in
  itself. Camp design must not reintroduce free depth-banking; reconcile it
  with TICKET-040/042/075 rather than layering on top of them.

## FOE-Like Enemies (Planned Direction)

Visible, avoidable, clearly-unwinnable-for-now enemies give exploration a
mid-term goal that pure floor progression lacks.

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

Not yet ticketed; this section records intent, not implementation scope.

## Avoid

- Level grinding as the dominant progression strategy.
- Combat loops that are self-justifying (fight to gear up to fight).
- Long sparse floors and corridor padding.
- Free, reliable, or purchasable-at-will return to safety.
- Making unidentified gear common enough that identification stops being an
  event.
- Adding a fourth pillar. New systems must serve exploration, survival, or
  unknown loot; a system serving none of them is out of scope.

## Relationship To Other Documents

- `.agents/game-design.md`: economy-level rules (XP, gold, shops, materials,
  workshop, rewards, contracts, clear flow). It implements pillars 2 and 3 at
  the numbers level.
- `.agents/balance-simulation.md`: use its checklist when tuning any number
  referenced here (encounter counts, recovery budgets, loot rates).
- `.agents/game-logic.md`: use its checklist when implementing gimmicks,
  camps, or FOE-like enemy behavior.
