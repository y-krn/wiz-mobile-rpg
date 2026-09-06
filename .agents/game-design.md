# Game Design: Economy and Resource Roles

This document owns the durable economy meaning of the solo depth-attack
roguelite: materials, resource exchange, status counterplay, milestone
merchants, run quests, and the relationship between a run's value and the next
descent. The core question and push-your-luck contract live in
`.agents/game-design-core-loop.md`; this document refines their economy-facing
implications.

Exact executable values, save shapes, and production wiring belong to source
and tests. Keep a number here only when it explains an intentional player
trade-off rather than a temporary calibration.

## Economy goal

One currency, one sink, one question:

```text
run ends → outcome determines what value is recovered →
Castle records what happened, Codex records what was understood, Workshop
expands what may exist in future runs → descend again
```

Every economic knob must support “descend again, deeper.” A loop that pays
better than descending—shallow farming, merchant arbitrage, or a target-build
lottery—is a failure of the economy.

Five-floor bands are resource-allocation chapters, not a second currency. A
band may make HP, MP, status, information, actions, or inventory pressure more
important, but it must not impose a build-specific loot guarantee or a
mandatory consumable tax. Player-facing clues communicate the kind of pressure
without exposing exact odds or hidden theme metadata.

## Materials are the only currency

Gold and a parallel shop currency do not belong in the economy. Materials are
used for meaningful in-run exchanges and for horizontal between-run
possibilities; they are not a substitute for the value competition inside the
bag.

The authored material families are:

| Creature or theme | Primary material | Secondary material |
| --- | --- | --- |
| beast, insect, small creature | 獣の牙 | 硬い皮 or 毒腺 |
| poison, spider, rot | 毒腺 | 硬い皮 |
| undead | 骨片 | 霊粉 or 呪布 |
| spirit, wisp | 霊粉 | 魔石片 |
| mage, caster | 魔石片 | 呪布 |
| armor, statue, golem, stone | 鉄片 | 魔石片 |
| demon | 黒角 | 魔石片 or 呪布 |
| dragon | 竜鱗 | 獣の牙 |
| rare or boss | the normal group material | an additional rare material |

The material species should vary with biome and depth so that “I need this
material, so I choose that route” is a real decision. Deeper floors may pay more,
but the increase must not make shallow farming dominate the descent. Materials
do not consume ordinary bag slots. Avoid a new material for every enemy and do
not introduce a material name that is easily confused with an item name.

Classification follows authored creature/theme meaning. Explicit domain tags
take precedence over fallback visual or rarity cues; the fallback must not
silently change the player-facing material role.

## Magic ownership

Every starting run has a small universal base of magical capacity. A weapon-slot
medium contributes additional capacity and Rune slots only while equipped. The
active spell set is the set of Runes socketed in that medium; a character label
or level does not grant magic and does not authorize a spell.

Socketed Runes are medium-side build state and do not consume ordinary bag
slots. Spare Runes are ordinary dungeon loot and compete for the same bag space
as other objects. Equipping, swapping, or removing a medium never acts as a
free recovery: if the derived capacity falls, spent capacity is clamped safely,
and the socketed Runes return to the ordinary bag. Magic supply is offered as
independent medium and Rune choices, not as an answer that pairs the two for the
player.

This ownership keeps magic inside the improvised build. It prevents a starting
identity or a level from bypassing the cost of finding, carrying, and choosing
the medium and Runes that make a spell plan possible.

## Status effects and counterplay

Status effects are finite pressures that create a decision, not permanent
per-step taxes or one-hit run failures.

- Exploration poison uses a single finite window. It can deal intermittent HP
  damage while the window lasts and then expires. A player may spend a cure or
  accept the risk while considering the remaining route. Combat poison keeps a
  separate round-based timing contract.
- Blind is a combat disruption: the affected character can act, but attacks
  may miss and incoming danger may be harder to manage. It clears after a
  surviving combat ends. Death is not a recovery event.
- Recovery items and spells should offer immediate counterplay, but a cure must
  compete with HP, MP, bag space, and the opportunity to carry another tool.

Treatment planning uses roles rather than one consumable for every possible
status:

- **Persistent-hazard preparation:** a stable antidote route for poison, with a
  rarer recovery-plus-poison emergency option.
- **Broad cleanse:** a scarce option for several disabling states.
- **Targeted fallback:** specialist responses for blind, paralysis, or sleep.

Adding a status does not automatically add a status-named item. Compare natural
expiry, spell cures, an existing broad cleanse, and the observed loss caused by
the status first. Generic status resistance is an equipment opportunity cost,
not a free replacement for carrying treatment.

## Exploration resource ownership

The player-facing exploration verbs are shared: inspect, detect, disarm, avoid,
and force a known risk when necessary. Exploration success and information
belong to the run-local equipment/support/tool build, not to a class label, raw
attribute, or level permission.

Tools and rule-changing build effects may exchange a resource for a condition
or a deterministic response. They must not silently grant a universal bypass,
plain-disarm success, or generic trap-damage immunity. HP-only trap mitigation
must remain separate from status, MP, teleport, alarm, discovery, and disarm
rules. The detailed route and information contract lives in the core-loop canon.

## Run value and object ownership

Materials and object loot have different economic roles:

- materials support resource exchange and horizontal future possibilities;
- dungeon equipment, consumables, curios, and Wings are unconfirmed object loot
  until a terminal outcome settles them;
- Portal confirms all unconfirmed object loot, Wing rescues a selected small
  subset, and Death/Abandon lose the unconfirmed subset;
- returned dungeon equipment is history and knowledge, not permanent next-run
  battle inventory;
- unused preparation supplies may return to Town, while used supplies have
  already paid for the run's decisions.

The fixed ordinary bag makes these roles compete. Do not add a hidden safety
compartment, a separate equipment bank, or a permanent capacity increase to
solve a local supply problem.

## Workshop and future possibilities

The Workshop expands what may exist in future runs. It is horizontal possibility
space, not a targeted build shop:

- do not raise the appearance rate of a chosen item, affix, or build;
- do not add a permanently superior combat tier;
- do not preserve recovered dungeon equipment as next-run gear;
- prefer small possibilities that arise from adventure results rather than a
  farmable target path;
- when a possibility is added, preserve the authored supply structure instead
  of diluting every existing candidate.

The Workshop should broaden combinations involving HP, MP, status, actions,
information, and curses while keeping resource competition and improvisation as
the source of power.

### Supply roles

Loot supply is build-blind: candidate availability and weighting must not read
the player's equipped loadout, starting choice, current shortage, or desired
build. A supply chapter may emphasize reinforcement, cost conversion, or
direction change, but all meaningful roles should remain possible. Earlier
horizontal bases remain eligible at greater depth so that deeper progression
adds possibilities rather than invalidating the collection.

The distinction between a rule-changing Core and a numeric/probability Support
is durable: a Core changes a resource exchange, path, target, or interpretation;
Support strengthens an axis within a bounded, readable opportunity cost. The
active registry and parameter values in `src/data/affixes.js` are the
authoritative data boundary; this document owns the meaning of the boundary,
not a snapshot of its counts.

## Milestone merchants and camps

Merchants appear at milestone chapters and support the descent; they never solve
it. Their useful stock includes identification resources, affordable
counterplay consumables, finite retreat items, and expensive curse removal.
Accessibility of basic counterplay is more important than scarcity, while a
retreat valve must still preserve the gap between retreat and death.

Merchants do not sell ordinary dungeon equipment. Equipment remains the main
source of improvised builds and the identify-or-gamble hook.

A guaranteed breather after a milestone offers recovery and preparation before
the next floor. Rest should be a choice about resources, not a replacement for
route risk or a second safe-return system.

## Run quests

Run-scoped contracts are optional supporting content, not a second progression
axis. They should point the player deeper or into meaningful risk, expire with
the run, and never make a shallow farming route optimal. Their rewards must
reinforce the material and depth question rather than create a separate
currency or permanent checklist.

## Castle, Codex, and knowledge

- Castle records factual outcome, depth, return route, representative value,
  and a bounded history of meaningful item decisions.
- Codex records what the player observed and inferred. Unknown equipment moves
  from signs to observation, trial, and full understanding; the Codex never
  answers exact hidden probabilities or declares an optimal build.
- Workshop may make an existing side-grade possibility eligible after a deep
  result, but it must not choose a build, guarantee a drop, or provide a
  vertical tier.

Presentation should be generated from facts rather than saved as a second
prose authority. Internal build and supply metadata may guide recording and
analysis, but it must not become an exact player-facing recommendation.

## Level and identity boundary

Level is a run-local durability floor that helps a character remain in the
conversation with deeper threats. It does not grant MP, spells, permission to
use equipment, critical scaling, melee scaling, or exploration authority. Power
should come from choices made in the run—equipment, Runes, Supports, Cores,
tools, and resource timing—not from a permanent class or level ladder.

## Avoid

- a second currency, gold reintroduction, or merchant arbitrage;
- uncapped permanent stats or income bonuses that make farming dominate;
- recovered equipment becoming permanent next-run combat gear;
- a Workshop path that targets a chosen build by increasing its supply;
- one status item per status without a demonstrated gameplay role;
- hidden bag compartments, arbitrary carry caps, or free universal trap bypasses;
- exact hidden mechanics presented as if they were player-facing knowledge.
