# Game Design: Equipment Build System

This document owns the durable meaning of equipment builds: how a run acquires
power, how Core and Support effects differ, how uncertainty creates decisions,
and how future possibilities stay horizontal. It follows
`.agents/game-design-core-loop.md` and `.agents/game-design.md`.

The registry and executable parameters in `src/data/affixes.js` are the
authoritative data boundary. Rules, save shape, rendering, and test coverage
belong to source and tests; this document explains why those boundaries matter.

## Build contract

A build is improvised from unknown dungeon loot and tested by depth. A find may:

- reinforce the player's existing way of fighting;
- convert a cost such as HP, MP, status, time, or inventory space; or
- change the direction of the run.

Build quality is not a collection score or a count of equipped Cores. Equipment
slots, the fixed 20-slot ordinary bag, consumables, unknown information, and
resource timing create the competition that gives a build meaning.

Equipped items provide power while spare items provide adaptation. Recovered
dungeon equipment is terminal history and knowledge, not permanent next-run
battle gear. The Workshop may broaden what can appear in future runs, but it
does not target a chosen build, raise its appearance rate, or grant a superior
permanent tier.

# Core Types

Cores are rule-changing, meaning-changing, or resource-exchange effects. They
are sidegrades: a Core should make a different plan possible or change what the
player pays, not simply add an unconditional numeric tier. A single item holds
at most one Core, but Core count is not a completion test. Main and auxiliary
axes describe prioritization and resource competition, not a fixed activation
cap.

## Combat

| Name | id | Durable role |
| --- | --- | --- |
| 血杖 | `CORE_BLOOD_WAND` | When a spell lacks MP, convert the missing resource into an HP payment, keeping magic available at lethal risk. |
| 浄化の環 | `CORE_PURIFY_RING` | On an undead, spirit, or demon victory, recover MP when it is not full and recover HP when it is full. |
| 罠喰い | `CORE_TRAP_EATER` | Each successful chest-trap disarm accumulates temporary physical pressure for the run; floor traps and forced breakthroughs do not. |
| 呪飼いの鎖 | `CORE_CURSE_KEEPER` | Each equipped curse increases all stats, trading immediate power for the curse's binding and identification risk. |
| 反撃の棘 | `CORE_THORN_SHIELD` | After the wearer is hit, create a chance for a partial counterattack; the opportunity competes with the shield slot and Guard profile. |
| 執行人 | `CORE_EXECUTIONER` | Before an attack, set up poison on a valid target and reward attacking targets already carrying a combat status. |
| 薄氷の誓約 | `CORE_THIN_ICE_PACT` | At low HP, increase outgoing pressure while also increasing incoming danger, making survival itself the cost of power. |

## Economy / Exploration

| Name | id | Durable role |
| --- | --- | --- |
| 忍び足 | `CORE_SNEAK_STEP` | Reduce the cost of reading a dangerous route by narrowing gatekeeper/boss detection pressure and improving environmental signs. |
| 盗掘王 | `CORE_TOMB_RAIDER` | Increase chest-material opportunity while increasing trap intensity, turning greed into a route and resource trade-off. |
| 慧眼 | `CORE_KEEN_EYE` | Permit an unknown item to be equipped while its exact details remain hidden, preserving the trial gamble. |
| 野営の達人 | `CORE_CAMP_MASTER` | Increase the recovery returned by choosing to rest at camp, trading the opportunity to continue immediately. |
| 賞金稼ぎ | `CORE_BOUNTY_HUNTER` | Make selected run-objective target defeats count more, rewarding a deliberate hunt instead of passive depth. |
| 学者の眼 | `CORE_SCHOLAR_EYE` | Turn an enemy not yet understood into a material opportunity, linking knowledge to exploration without revealing an optimal route. |

The Core registry must preserve these pool meanings. A rule-changing effect
should not be copied as several numeric Supports merely to increase supply, and
a numeric/probability reinforcement should not be promoted into a Core merely
to give it a stronger label.

## Hands and Guard

The weapon slot is a shared two-hand resource rather than separate right- and
left-hand inventories. One-hand and two-hand choices create a visible trade-off:
a two-hand weapon can increase pressure while displacing a shield, and a shield
can add a defensive profile without becoming the only way to use Guard.

Guard is a universal defensive action. It is a common encounter-local stage
that changes incoming damage and, when a shield supplies a profile, may also
change the kinds of status or attack pressure it answers. Armor remains passive
defense. An equipment replacement must reject an invalid hands result with a
readable reason and must not silently remove an existing shield.

## Support Affixes

Support Affixes are bounded numeric, probability, conditional, trigger, or
economy reinforcements. Rarity should communicate magnitude; depth should
control when a possibility can enter the supply, not silently turn the same
Support into a larger number. Support creates an opportunity cost in a slot,
rarity, bag decision, or competing resource.

- basic: `atk`, `def`, `str`, `int`, `pie`, `vit`, `agi`, `luk`, `hp`, `mp`, `antiUndead`, `antiDragon`, `antiDemon`, `poisonWard`, `spellGuard`, `trapBonus`, `trapGuard`, `treasureSense`, `arcaneSense`, `hearRange`, `traceRead`, `followUp`, `spellPower`, `arcane`, `devotion`, `guardian`, `firstStrike`, `physicalAccuracy`
- conditional: `deepAssault`, `frontGuard`, `rearEvasion`, `fullHpDamage`, `firstTurnAttack`, `antiBeast`, `antiSpirit`, `firstStrikeDefense`, `lastSurvivorStats`, `statusResistance`, `spellAccuracy`, `lowHpDamage`, `highHpTargetDamage`, `bossDamage`
- trigger: `killHeal`, `followUpMp`, `hitFlinch`, `poisonAtk`, `bleedingAtk`, `victoryMaterial`, `stairsHeal`, `firstStrikeFollowUp`
- economy: `identifyDiscount`, `materialFind`, `contractReward`

The categories describe ownership, not a promise that every Support is useful
in every band. Values and availability remain data-owned, while the following
semantic boundaries are durable:

- `spellPower` is the shared visible concept for attack and recovery spell
  scaling. `arcane` and `devotion` remain explicit attack and recovery
  directions rather than interchangeable copies of the shared concept.
- `trapBonus` is the build's disarm and flame-trap expertise. `trapGuard` only
  mitigates the HP-damage part of a trap. Neither grants a class permission or
  changes status, MP, teleport, alarm, discovery, or disarm ownership.
- `treasureSense`, `hearRange`, `traceRead`, and `arcaneSense` provide facts or
  signs. Information does not grant permission to perform an action and does
  not change reward candidate lists.
- Numeric target, boss, low-HP, first-strike, and accuracy effects remain
  bounded Supports. Their value must not become an exact player-facing promise
  about a hidden supply role.

## Equipment knowledge

Unknown equipment follows four player-facing stages:

1. **Discovery:** type, quality, and one or two truthful sensory signs.
2. **Observation:** carrying it or encountering a related situation may add a
   sign without revealing every hidden tag.
3. **Trial:** equipping or using it makes the main function judgeable while
   hidden details and curses remain consequential.
4. **Full understanding:** Town recovery or deliberate identification exposes
   the exact stored detail.

Trial is a committed world action, not a free preview. It must consume the
appropriate exploration opportunity, preserve bag and hands validity, and keep
the projected loadout atomic. A preview may compare known consequences but may
not disclose or apply hidden effects. Acting on partial information is a
legitimate build decision; a hint must remain evidence rather than an exact
answer key.

The Codex stores observed facts and hypotheses. It must not reveal undiscovered
affix names, candidate totals, drop rates, or a recommended build merely
because an internal registry knows them.

## Generation and acquisition

Equipment is dungeon-sourced. Milestone merchants provide resources and
counterplay, not ordinary gear, so the identify-or-gamble hook remains attached
to exploration.

Rarity may change composition and budget, but exact composition and numeric
parameters belong to the data source. Floor bands should establish and
reinforce a build before offering more cost-conversion and direction-change
possibilities. Earlier horizontal bases remain eligible as depth increases.

Supply is build-blind. Candidate availability and weighting must not inspect the
equipped loadout, starting choice, current shortage, or desired build. Mediums
and Runes are separate choices; supply should not answer their pairing for the
player. A deep band may make a role more visible, but every meaningful role
must remain possible and depth must not become a base-stat treadmill.

Weapon families may trade hit stability, defense payment, single-hit pressure,
and magical capacity. Those are authored feel differences using the shared
combat model, not class permissions or duplicate formulas. A behavior label is
useful only when the player can learn its consequence through play or a truthful
description.

## Workshop and equipment actions

The meta Workshop expands horizontal possibility space. It must not increase a
chosen build's appearance rate, preserve recovered equipment as next-run gear,
or grant a permanently superior combat tier. New possibilities should occupy an
authored place in the supply structure rather than diluting every existing
choice.

Equipment actions are separate from meta Workshop progression. A numeric
refinement may improve a bounded Support value, but it must not create, move, or
remove a rule-changing Core as a hidden way to target a build. Any refinement
must preserve the identify state, bag capacity, hands validity, curse risk, and
the opportunity cost that made the equipment meaningful.

Dungeon loadout edits are staged and committed atomically. A no-op, cancelled,
or invalid edit does not consume a dungeon opportunity. A successful non-empty
edit pays its world cost once. An opened chest resolves its object rewards as a
single pending choice against the final bag: take, leave, or explicitly discard
something. A reward must never be inserted briefly into a hidden twenty-first
slot.

## Build and economy guardrails

- A build has a discernible axis and supporting choices, but no fixed Core-count
  completion condition.
- Numeric reinforcement should be bounded by rarity, opportunity cost, and
  diminishing returns; it must not make a sidegrade a universal answer.
- Rule-changing effects own resource exchange, path, target, or interpretation.
  Numeric and probability reinforcement belongs to Support.
- Loot generation is independent of the player's current loadout. A successful
  run may reveal a possibility without guaranteeing that possibility next time.
- Identification and equipment decisions should preserve uncertainty until the
  player deliberately pays for full detail.
- The player-facing UI may show known Core conditions and Support values, but it
  must not expose internal supply weights, exact hidden candidate totals, or an
  optimal role recommendation.

## Relationship to other documents

- `.agents/game-design-core-loop.md` owns the depth question, object-loot
  stakes, information ladder, and route-level trap contract.
- `.agents/game-design.md` owns materials, status-counterplay economy, merchants,
  run quests, and the relationship between value and future possibility.
- `.agents/game-design-combat-model.md` owns formula structure and application
  order for combat effects.
- `.agents/game-design-telemetry.md` owns observable build decisions and privacy
  boundaries; telemetry must not become a build rule.
- `.agents/balance-simulation.md` owns evidence quality for numeric tuning.
