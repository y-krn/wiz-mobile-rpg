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

The run-local build is a primary power source. Starting Kit is an initial
condition, not a permanent class, and Preparation safety is not Build power.
Consumables can absorb early variance and buy time for formation, but they do
not universally substitute for equipment, affix, Rune, Core, or Support
decisions. Do not introduce a scalar "Build Power" as the design model; build
identity is a structural set of choices tested by depth and resource pressure.

Equipped items provide power while spare items provide adaptation. Recovered
dungeon equipment is terminal history and knowledge, not permanent next-run
battle gear. The Workshop may broaden what can appear in future runs, but it
does not target a chosen build, raise its appearance rate, or grant a superior
permanent tier.

## Build vNext contract (#1801, default run rules since #1815)

Since #1815 every new run uses the Phase 3 equipment rules together with the
Phase 4c v1 baseline and fixed 4j-B EXP. There is no run-mode selection and
no run profile: the legacy `normal` and `progression-exp` profiles were
removed, and saved in-progress runs continue under these rules. The rules below
still say "trial" where they name the historical profile. The contract resolves three structural problems found by play (#1799): finds did not make
the character stronger, combat had no verbs for "how to fight" to change, and
finding loot was not a choice. The contract is:

1. **Run-local power comes from equipment.** Found weapons, armor, and
   shields carry an enhancement grade that grows with depth (bounded), so a
   find can be a real upgrade over the +0 starting kit. Between-run growth
   stays horizontal; Level stays a small HP durability floor; the milestone
   baseline remains the floor for selected deep starts. Equipment owning
   run-local power supersedes the #1536 split "depth power = character,
   how to fight = equipment" for the trial.
2. **Each weapon family owns a technique.** A technique is a second combat
   verb next to the universal attack, keyed by the weapon behavior profile and
   gated by an encounter-local cooldown, so *when* to spend it is the
   decision. Techniques interact with enemy telegraphs, defense, and MP (see
   `.agents/game-design-combat-model.md`).
3. **Cores change verbs, not numbers.** Technique Cores hook the technique and
   Guard verbs: chaining a technique into the next attack, shortening the
   cooldown, turning Guard into a technique reset, or paying HP to act early.
   They are trial-only and live outside the production Core inventory audit.
4. **Finds are legible choices.** Ordinary trial finds arrive identified.
   Only the gamble tier (epic quality or a curse) stays unknown, so "unknown"
   means "strong or dangerous" rather than "every item". The first ordinary
   chest of a run offers three identified directions (weapon, defense,
   accessory), each with a rule-changing Core; the player keeps at most one.
   The offer is build-blind: it is drawn from a fixed authored table and never
   reads the loadout, kit, or shortage.
5. **Combat Cores are reachable in the First Band.** Cores can appear from B1
   in the trial, weighted toward combat over economy, and non-combat Supports
   (identification discount, material find, contract reward, victory
   material) stay possible but rare.

The executable values live in `src/data/techniques.js`,
`src/rules/technique_rules.js`, `src/rules/build_vnext_supply.js`,
`src/systems/build_vnext_seed.js`, and `BUILD_VNEXT_CORE_AFFIXES` in
`src/data/affixes.js`. Legacy normal-profile generation, identification, and
Core supply are kept only for saved in-progress runs.

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
| 罠喰い | `CORE_TRAP_EATER` | Each successful chest-trap disarm (automatic on opening, or with a kit) accumulates temporary physical pressure for the run; floor traps and forced breakthroughs do not. |
| 呪飼いの鎖 | `CORE_CURSE_KEEPER` | Each equipped curse increases all stats, trading immediate power for the curse's binding and identification risk. |
| 反撃の棘 | `CORE_THORN_SHIELD` | After the wearer is hit, create a chance for a partial counterattack; the opportunity competes with the shield slot and Guard profile. |
| 執行人 | `CORE_EXECUTIONER` | Before an attack, set up poison on a valid target and reward attacking targets already carrying a combat status. |
| 薄氷の誓約 | `CORE_THIN_ICE_PACT` | At low HP, increase outgoing pressure while also increasing incoming danger, making survival itself the cost of power. |

## Economy / Exploration

| Name | id | Durable role |
| --- | --- | --- |
| 忍び足 | `CORE_SNEAK_STEP` | Reduce the cost of reading a dangerous route by narrowing gatekeeper/boss detection pressure and improving environmental signs. |
| 盗掘王 | `CORE_TOMB_RAIDER` | Increase chest-material opportunity while increasing trap intensity, turning greed into a route and resource trade-off. |
| 慧眼 | `CORE_KEEN_EYE` | Retired: Build vNext finds are identified, so this Core has no activation path. |
| 野営の達人 | `CORE_CAMP_MASTER` | Increase the recovery returned by choosing to rest at camp, trading the opportunity to continue immediately. |
| 賞金稼ぎ | `CORE_BOUNTY_HUNTER` | Make selected run-objective target defeats count more, rewarding a deliberate hunt instead of passive depth. |
| 学者の眼 | `CORE_SCHOLAR_EYE` | Turn an enemy not yet understood into a material opportunity, linking knowledge to exploration without revealing an optimal route. |

## Technique Cores (Build vNext trial only)

| Name | id | Durable role |
| --- | --- | --- |
| 連環の型 | `CORE_TECH_CHAIN` | After a technique, the next universal attack is stronger, making the technique the opener of a two-turn rhythm. |
| 研ぎ澄まし | `CORE_TECH_HONE` | Shorten the technique cooldown and strengthen it, making the technique the main verb. |
| 返しの構え | `CORE_GUARD_RIPOSTE` | Guard resets the technique cooldown and primes the next attack or technique, turning Guard into offense. |
| 血の型 | `CORE_BLOOD_TECH` | During the cooldown, the technique can still be used by paying a share of max HP. |

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

- basic: `atk`, `def`, `hp`, `mp`, `antiUndead`, `antiDragon`, `antiDemon`, `poisonWard`, `spellGuard`, `trapBonus`, `trapGuard`, `treasureSense`, `arcaneSense`, `hearRange`, `traceRead`, `followUp`, `spellPower`, `arcane`, `devotion`, `guardian`, `firstStrike`, `physicalAccuracy`, `escapeChance`
- conditional: `deepAssault`, `frontGuard`, `rearEvasion`, `fullHpDamage`, `firstTurnAttack`, `antiBeast`, `antiSpirit`, `firstStrikeDefense`, `statusResistance`, `spellAccuracy`, `lowHpDamage`, `highHpTargetDamage`, `bossDamage`
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

In the Build vNext trial, ordinary finds skip straight to full understanding
and only the gamble tier (epic quality or a curse) uses the stages below; see
the Build vNext contract above. In the legacy normal profile, unknown equipment
follows four player-facing stages:

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

The First Band has an explicit formation sequence: B1-B2 expose a build seed,
B3-B4 begin to establish run identity, and B5 is the first compound test of
that build. B1-B5 does not require a finished build, but it is not a build-free
tutorial. B6+ should deepen transformation through cost conversion, direction
change, and counterplay rather than only increasing base values.
In the Build vNext trial, the enhancement grade of a find is the bounded
run-local power source; it is capped, never carried to the next run, and does
not replace direction changes as the reason to pick up an item.

Supply is build-blind. Candidate availability and weighting must not inspect the
equipped loadout, starting choice, current shortage, or desired build. The Build
vNext seed offer keeps this rule: it draws each direction from a fixed authored
table with the run RNG. Mediums
and Runes are separate choices; supply should not answer their pairing for the
player. A deep band may make a role more visible, but every meaningful role
must remain possible and depth must not become a base-stat treadmill.

### Build vNextの発動可能性

Build vNext供給はソロ戦闘との適合性で制限する。`rearEvasion`、`escapeChance`、`CORE_KEEN_EYE`は候補に含めない。`followUpMp`は追撃成功時に発動するため、MPを使えるMEDIUM武器だけに付与する。MEDIUM武器はWAND、SAGE_STAFF、ARCH_WAND、HOLY_STAFF。`devotion`はそのうちWANDとSAGE_STAFFのみ、武器の`spellAccuracy`と`CORE_BLOOD_WAND`はMEDIUM武器のみ候補にする。`CORE_TECH_CHAIN`はMEDIUM武器に付与しない。

`WAKE_POWDER`、`PARALYZE_CURE`、`RUNE_DIALKO`はBuild vNextの宝箱・Rune供給から除外し、Build vNextの商人は`WAKE_POWDER`と`PARALYZE_CURE`を販売しない。万能薬の説明は実効果（毒・盲目・麻痺・睡眠の治療）に合わせる。Workshopでは`pool_thorn_shield`、`pool_scholar_eye`、`pool_thin_ice_pact`の新規購入を禁止する。過去に解放済みのWorkshopランクは維持し、効果も適用する。これらの制約はBuild vNext専用。進行中の`normal`・`progression-exp`セーブは開始時の供給を維持する。

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

Each dungeon loadout edit is validated against a side-effect-free projection
and applied atomically when the player chooses it; there is no separate confirm
step. An invalid edit leaves live state unchanged. One equipment-screen visit
is one world-time boundary: a visit with any successful edit pays one
exploration turn when the screen closes, a visit without an edit pays nothing,
and each Trial pays its own turn because it is a committed world action. An opened chest resolves its object rewards as a
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

## Measurement identity

Build comparisons use the production Build Snapshot resolver rather than class
or derived-stat labels. A snapshot is a bounded structural identity: weapon
behavior and hands, Guard profile, Medium/Rune socket state, enabled Core axes,
and allowlisted Support values. HP/MP, bag, floor, and starting-kit context stay
outside the identity so a run outcome cannot silently become a build definition.
Canonical fixture personas are explicit loadouts and are ordered by registry or
socket order, never by save-object enumeration.

Measurement may compare build outcomes at equal Preparation, but it must keep
Preparation safety, run-local build formation, and B5's compound test as
separate observations. The comparison must not collapse them into a scalar
Build Power or treat starting supplies as a permanent combat identity.
