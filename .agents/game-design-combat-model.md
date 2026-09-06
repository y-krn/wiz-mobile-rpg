# Game Design: Combat Damage Model

This document owns the durable structure and meaning of combat damage: the
order of hit, mitigation, build, and counterplay decisions; the role of level
and equipment; and the information that combat should teach the player. It is
not a copy of runtime constants or a measurement archive.

Executable values and data are authoritative in the combat rules, character
data, enemy data, spell data, and equipment registry. The principal execution
boundaries are `src/rules/character_stats.js`, `src/combat_logic/round.js`,
`src/systems/spell_effects.js`, and
`src/combat_logic/spell_resolution.js`. Tests and balance evidence define the
present behavior and calibration; this document defines the model those
surfaces should preserve.

## Model decisions

1. **Mitigation is bounded and multiplicative.** Physical defense becomes a
   diminishing resistance, and physical resistance joins it in one bounded
   pool. Finite investment must not reach total immunity or make later defense
   meaningless.
2. **Spells grow through the run build.** Spell power is a visible shared
   concept supplied by equipment and Supports. Attack-specific and recovery-
   specific directions remain explicit additions rather than hidden class
   compensation.
3. **Level is a durability floor.** A level-up helps the character remain in
   the conversation with deeper threats, but does not grant spell permission,
   MP ownership, Core access, critical scaling, melee scaling, or exploration
   authority.
4. **Target tags use one shared stage.** Physical attacks and offensive spells
   pool matching tag bonuses once. A spell's intrinsic affinity joins that pool
   instead of becoming a second multiplier.
5. **Displayed and effective units agree.** A player-facing attack or spell
   contribution must use the same unit as the resolved calculation. Hidden
   coefficients are not a substitute for an explained build effect.
6. **Critical is a shared stage.** Whether a critical opportunity exists is
   resolved from the attacker's authored combat data and the target's ability to
   receive it, not from an undocumented caller-specific fallback.
7. **Caps protect meaning.** A hard safety cap is allowed for health, chance,
   or numerical stability, but excess investment must be converted into another
   readable effect or constrained before it becomes a deceptive dead stat.
8. **A hit and a miss are different contracts.** A physical hit that reaches
   damage resolution deals at least one damage; blind miss and evasive avoid
   resolve to zero. A spell's own resolution rule is explicit and is not
   silently replaced with the physical minimum.

## Shared notation

The following names describe the model, not a requirement that the UI expose
internal fields:

- `weaponPower` is the effective weapon and equipment attack contribution.
- `buildAttack` includes explicit Support/Core attack contributions, temporary
  attack contributions, and first-turn effects. Each contribution enters the
  physical source of truth once.
- `weaponRoll` comes from the authored weapon's inclusive variance range. A
  family may feel stable or volatile without changing its mean contribution.
- `defense` is the target's effective physical defense after temporary effects.
- `physicalResistance` is the bounded combination of defense resistance and
  authored physical resistance.
- `evasion` exists only on an explicitly evasive target. `hitChance` is
  `clamp(0.50, 1.00, 1 - evasion + accuracyBonus + behaviorBonus)` for such a
  target; ordinary targets have 1.00 hit chance.
- `spellPower` is the common attack/recovery spell contribution. Attack and
  recovery directions add their own explicit terms.
- `magicResistance` is a bounded target modifier that may represent weakness
  as well as resistance.

## Physical attack model

The attacker's action first resolves whether the damage formula is reached:

1. A blind attacker may miss. This is an attacker-side chance and does not
   halve the damage of a hit that lands.
2. An explicitly evasive target may avoid the attack using `hitChance`.
   Accuracy improves this chance only for evasive targets; it does not change
   ordinary targets or override blind miss.
3. The raw attack is assembled from the effective weapon, explicit build and
   temporary attack contributions, the weapon's random roll, and any authored
   behavior profile. A build effect that converts a successful chest-trap
   disarm into attack pressure remains a separate fixed contribution; it does
   not pretend to be weapon power or a class passive.

The intended raw shape is:

```text
attackRaw = (
  floor(weaponPower + buildAttack)
  + weaponRoll
) × behaviorModifier
  + separateBuildBonus

defenseResistance = defense / (defense + directionConstant)
physicalResistance = clamp(
  defenseResistance + targetPhysicalResistance,
  -1,
  0.9
)

resolvedPhysical = max(
  1,
  floor(attackRaw × (1 - physicalResistance))
)
```

The exact direction constants and data values belong to runtime data. The
important properties are a finite diminishing curve, one shared resistance
pool, one deliberate rounding point for displayed attack units, and no healing
from a negative damage input.

### Player attack application order

After a physical attack reaches the formula, preserve this order:

1. Apply the bounded physical resistance.
2. Resolve an attacker's pre-damage status setup when its condition is met. A
   status created by that setup may be eligible for the same attack's
   condition-dependent effect if the authored rule says so; unrelated spell
   status rules do not leak into this stage.
3. Add target-tag bonuses once. For each tag on the target, combine the
   matching equipment Support and any spell-specific contribution into one
   additive pool, then multiply once.
4. Apply rule-changing Cores, conditional Supports, and milestone exposure in
   their authored order. Cores own meaning-changing conditions; numeric or
   probability reinforcement remains Support.
5. Apply the target's Guard mitigation.
6. Resolve a critical only when the target can receive one and the attacker's
   authored critical chance succeeds. Apply the critical multiplier after
   Guard.

Miss and avoid exit before this sequence and remain zero. A resolved physical
hit is clamped to at least one at the stages that can reduce its damage.

### Enemy physical attack

Enemy attacks use the same bounded defense idea in the opposite direction. A
typical attack is an authored attack value plus a small random roll, reduced by
the player's effective defense, then by Guard/defend and other incoming damage
mitigation. An escape parting hit uses the same damage semantics without
pretending that fleeing was a normal attack exchange.

Blind affects the attacking side only; a blind target does not make an enemy's
successful physical hit weaker. Miss or avoid is zero, resolved damage cannot be
negative, and HP subtraction cannot increase HP.

## Guard and critical semantics

Guard is a universal action even without a shield. It is a common stage after
the attacker's build effects and before critical resolution. A shield supplies
an authored Guard profile that may change physical, spell, breath, special, or
status coverage; it does not replace the universal action.

Status setup and damage mitigation are separate questions. A Guard profile may
change status success without silently doubling or replacing the normal damage
mitigation. Poison resistance, magic resistance, guardian effects, and
consumable protection remain separate inputs so the player can understand which
cost each defense answers.

Critical is also a separate stage. A target may be immune to criticals, and a
character may have zero authored critical chance. The shared resolver keeps the
stage readable for all combatants while allowing a weapon, build, or identity
to supply a deliberate critical direction.

## Offensive spell model

An offensive spell begins with its authored dice, then applies the common and
spell-specific build terms:

```text
preTarget = round(
  spellBase
  × spellPower
  × attackDirection
  × elementDirection
)
```

`attackDirection` is the explicit offensive contribution and
`elementDirection` is only used by spells that own that affinity. Recovery
spells use their own recovery direction instead. Status-only, exploration, and
defensive spells have no damage/heal power term merely because they are spells.

The remaining offensive stages are:

1. pass `preTarget` through the same target-tag and Core/Support pipeline used
   by physical attacks;
2. resolve effective magic resistance per target;
3. apply the spell's explicit final clamp and resistance result;
4. apply HP change to each affected target, with separate base rolls when the
   spell is area-of-effect.

A spell-specific affinity such as an undead-focused spell contribution joins
the matching target-tag pool once. It is not a second multiplication layered
after the shared tag stage. Reflection, target loss, and recovery effects are
separate resolution branches and do not accidentally consume offensive stages.

## Weapon and enemy counterplay

Weapon families are behavior sidegrades. They may trade hit stability against
evasive targets, the amount of defense they pay, single-hit pressure, or
magical capacity. The universal attack action remains recognizable; a family
does not create a hidden second damage formula or a class permission.

Enemy roles are readable through behavior and counterplay rather than uniform
stat inflation. An aggressor creates direct damage pressure, a disruptor creates
status or action pressure, and an amplifier changes the priority of other
enemies. A roaming elite is an optional risk attached to value-seeking
exploration, not a mandatory flat-stat tax. Its trait should be explained in
the encounter and recognizable through behavior.

Milestone guardians may telegraph a counter window that rewards the build or
resource choice the band has been teaching. A counter window must not silently
rewrite ordinary floor damage, rewards, or the meaning of depth.

## Status-effect grammar

Status effects are finite combat contracts, not an invitation to add a generic
stacking engine for every new idea. Each status should declare its producer,
duration, stacking/refresh behavior, qualifying payoff, cure, and clear reasons.

- Poison is a timed pressure with explicit exploration and combat timing. It
  can be cured or waited out at a resource cost.
- Blind disrupts attack reliability and has a readable end after a surviving
  encounter; it is not an incoming-damage multiplier for the target's enemies.
- A bleeding-style effect is created only by a qualifying direct hit, refreshes
  within a finite window, and pays off on the next qualifying direct hit. DoT,
  reflection, counters, and environment damage do not accidentally consume it.
- A vulnerability-style effect creates a burst-timing decision: a qualifying
  direct hit consumes it once, while damage-over-time, reflection, counters, and
  environment damage do not.
- Enemy status attacks are setup-plus-payoff patterns. A successful setup should
  telegraph the coming cost and allow cure, defend, kill, or flee responses; it
  must not be an unconditional “damage plus random ailment” roll.

Durations, producers, and numerical effects are data-owned. Save/load may retain
the status information required for a safe continuation, but the persistence
shape is not a second design authority.

## Resistance information is a combat tool

Resistance is only a meaningful build decision when the player can learn enough
to choose an attack method:

- physical and magical observations are recorded separately;
- selecting an action without resolving it does not reveal the target's hidden
  resistance, and a reflected spell does not count as an observation;
- the player sees coarse labels such as weak, normal, resistant, or highly
  resistant rather than internal numbers;
- wording, iconography, and layout must communicate the distinction without
  relying on color alone;
- the displayed category and effective final resistance must use the same
  conceptual conversion.

This preserves uncertainty while making experimentation meaningful. Exact
resistance values, internal tags, and candidate weights remain hidden unless a
separate player-facing discovery rule explicitly reveals them.

## Evidence and ownership boundary

Balance measurements may estimate how a combat model affects depth, but they do
not redefine the model. A trustworthy measurement should:

- use the same production resolution path for live and simulated combat;
- record source and runner identity, seed/configuration, sample size, and
  omitted behavior;
- separate forced calibration from natural loot or action selection;
- report uncertainty and not turn a small sample into a permanent canon value;
- keep player behavior, presentation timing, and analytics transport separate
  when they are not modeled.

The balance-simulation guidance owns the measurement workflow. This document
records the durable combat properties that a measurement is allowed to test.

## Relationship to other documents

- `.agents/game-design-core-loop.md` owns the depth question, combat's role in
  pacing, information ladder, and route-level trap semantics.
- `.agents/game-design.md` owns resource economy and status-counterplay roles.
- `.agents/game-design-equipment-builds.md` owns the Core/Support registry
  meaning and equipment build decisions.
- `.agents/game-design-telemetry.md` owns observable combat/build facts without
  changing resolution or exposing hidden player information.
- `.agents/balance-simulation.md` owns numeric evidence and calibration quality.
- `.agents/game-logic.md` owns implementation and invariant review questions.

## Avoid

- hidden class-specific damage formulas or undocumented fallback attacks;
- defense or resistance curves that reach total immunity at finite investment;
- a damage stage that applies the same tag, Core, or Support multiplier twice;
- status effects that remove agency without a readable response window;
- criticals, Guard, or weapon behavior that only one caller understands;
- player-facing exact probabilities, resistance numbers, or optimal-build
  recommendations when the design depends on discovery.
