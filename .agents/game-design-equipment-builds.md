# Game Design: Equipment Build System (Core / Support Affixes)

Tracking issue: y-krn/wiz-mobile-rpg#120 (closed — all phases merged)

Implementation history: PR #126 (Phase 1), #127 (Phase 2), #128 (Phase 3),
#129 (Phase 4). The inscription and curse-sealing portions of Phase 4 were removed in #668 because they were unreachable from the current game screens; enhancement and polishing remain pending UI wiring after the #669 decision.

**Direction change (2026-07-18).** This document reflects the pivot to a solo
depth-attack roguelite. It is subordinate to the Core Loop vNext contract in
`.agents/game-design-core-loop.md` and to `.agents/game-design.md`; resolve
conflicts toward those documents.

## Core Loop vNext alignment

**Canonical source:** [#973 comment 5479686603](https://github.com/y-krn/wiz-mobile-rpg/issues/973#issuecomment-5479686603).
This section records the equipment/build implications of that source. It is a
**design target / vNext contract**, not a claim that the current generator,
Workshop, or result flow already implements every rule.

- A run's build is improvised from unknown dungeon loot. Loot can reinforce
  the current approach, convert its costs (HP, MP, status, or another
  resource), or change its direction. The build is evaluated by the depth and
  resource trial it survives, not by a collection score.
- The bag is fixed at 20 ordinary slots. Equipped items are outside it;
  spare equipment, consumables, unknown items, curios, and Wings compete for
  one slot each. There are no permanent capacity increases or dedicated
  safety/treasure/Wing compartments.
- Unknown equipment follows signs → observation → trial → full understanding.
  The Codex stores observed facts and hypotheses, but does not reveal an
  undiscovered answer, hidden totals, or an optimal build.
- Recovered dungeon equipment is not permanent combat equipment for the next
  run. Between-run Workshop progression may broaden what can exist, but does
  not provide a permanently superior item tier or target a specific build's
  appearance rate.

### Current implementation boundary

The current code implements core/support affix data, dungeon equipment
generation, unidentified-item handling, the fixed 20-slot bag, equipment
actions, and Workshop unlock data. These are implementation surfaces, not proof
that the vNext role model or all outcome handling is complete. In particular,
the current code's affix activation and floor-pool behavior must not be
described as the final vNext build contract until the relevant implementation
issue is complete.

Issue #1042 migration status: departure now uses four starting kits with
ordinary gear applied to a shared neutral character baseline and records
`startingKit` on the run. Equipment bases, affixes, Core eligibility, and
equipment actions no longer consult class restrictions; the registered
`Fighter` compatibility class is shared by every kit so existing progression
consumers retain their current rules, while progression, spell, trap, and
telemetry migration remain follow-ups listed by the issue.

## Hands and active Guard (Issue #1049)

The weapon slot is a shared two-hand resource; there are still no right-hand
or left-hand UI slots. Weapon and medium data carry `hands: 1 | 2`, shields
carry `hands: 1`, and a replacement is accepted only when the resulting
loadout uses at most two hands. The initial assignments are:

- 1H: DAGGER, WAND, SHORT_SWORD, FIGHTER_SABER, RAPIER, NINJA_DAGGER,
  VENOM_FANG, LONG_SWORD, NINJA_BLADE, FLAME_SWORD, MOONSHADOW, MACE,
  SACRED_MACE, HOLY_STAFF, and HOLY_BLADE.
- 2H: SAGE_STAFF, ARCH_WAND, CLAYMORE, KATANA, LEGENDARY_SWORD, and
  SEALED_EXCALIBUR.
- Every shield consumes 1H, including DRAGON_CHARM and LEGENDARY_SHIELD.

The equipment action boundary rejects an invalid replacement with a player-
visible reason and never removes the existing shield implicitly. `防御` is a
universal action even without a shield. Its mitigation and status-response
semantics come from the common Guard resolver; a shield adds a profile that
changes the active Guard's physical, spell, breath, special, or status scope.
Armor remains passive DEF and does not replace the active Guard identity owned
by shields.

# Overview

To address the lack of build diversity (effective build count ≈ only 8 class choices), equipment was
redesigned into a 2-tier affix system of “core” and “support.” The synergy system
(`SYNERGIES` / `getActiveSynergyMod`) was retired in Phase 1. The current design assumes 1 solo character,
and effects belong to the wearer.

Build-space goal: create many viable improvised builds through a main axis,
support configuration, and resource competition. Do not use a target count or
Core count as the definition of a completed build.

# Equipment Codex Direction (#826)

The equipment codex is not only a collection list. It is meta-progression that
stores equipment knowledge observed during expeditions and turns that knowledge
into hypotheses for the next exploration and build.

- Basic item facts (base attack/defense, usable classes, description, and type)
  remain visible once the item is found.
- Affix details and floor history describe only observed facts. The codex does
  not reveal undiscovered affix names, candidate totals, drop rates, or internal
  weights.
- Equipment tags are research knowledge, revealed after repeated observation;
  research notes suggest directions without declaring an optimal build.
- Personal records such as rarity, bonus, count, and first-found floor remain
  separate from research knowledge.

This direction changes presentation and codex persistence only. Equipment
generation, affix values, acquisition rates, and material economy are
unchanged.

Combat formula structure and application order are canonical in
`.agents/game-design-combat-model.md`. This document remains canonical for the
core/support registry, acquisition rules, and affix parameters; the source
files remain authoritative for current values.

# Overall Structure

- **Core types** (`CORE_AFFIXES`): Rule-changing effects. Dungeon-sourced
  only; milestone merchants do not sell equipment. One item has at most one
  Core, but the total number of Cores has no immediate hard cap.
- Core count alone is not the build contract. A run should have a discernible
  main axis and supporting axes, with equipment slots, the 20-slot bag, and
  consumables creating resource competition. Individual Core effects remain
  condition-driven; main/support describes the build's prioritization and
  resource competition, not a fixed activation cap. Do not use “Core 1+ plus
  filled slots” as a completion test.
- Equipment bases are independently rolled from the floor candidate table, and
  Core effects do not impose a class fit. Cross-slot and crossover outcomes are
  intentional build trade-offs (`src/systems/equipment_generation.js`).
- **Support count**: `SUPPORT_AFFIXES.length` (source of truth: `src/data/affixes.js`). Numeric and minor effects.
  The polishing implementation can overwrite them.
- No cores that are pure numeric upgrades. Every core is a sidegrade.
- Registry: `src/data/affixes.js` (data only). Rule and effect helpers:
  `src/rules/affix_rules.js`.

# Core Types

The actual value of each effect parameter is defined by `params` in `src/data/affixes.js`, the single source of truth.

## Combat (Phase 2)

| Name | id | Effect | Slot |
|------|----|------|------|
| 背水 | CORE_LAST_STAND | +40% damage dealt at HP ≤40% | Weapon |
| 先手必勝 | CORE_OPENER | On a successful first strike, a follow-up attack is guaranteed on the first hit | Accessory |
| 必中 | CORE_PHYSICAL_ACCURACY | Physical attacks against evasive targets always hit | Weapon |
| 血杖 | CORE_BLOOD_WAND | When MP is insufficient, a spell can be cast by paying HP (cost×2) (HP minimum 1) | Weapon |
| 浄化の環 | CORE_PURIFY_RING | For each undead・spirit・demon kill, recover MP1 when MP is not full, or HP2 when full | Accessory |
| 罠喰い | CORE_TRAP_EATER | Successful chest-trap disarm grants +2 fixed physical damage during the expedition (cap +20, reset on return) | Accessory |
| 呪飼いの鎖 | CORE_CURSE_KEEPER | +3 to all stats for each equipped curse | Accessory |
| 巨人殺し | CORE_GIANT_SLAYER | +30% damage dealt to enemies with higher maxHP than self | Weapon |
| 守護者殺し | CORE_MILESTONE_BREAKER | +25% damage dealt to milestone bosses | Weapon |
| 反撃の棘 | CORE_THORN_SHIELD | 30% chance to counterattack at 50% power when hit | Shield |
| 執行人 | CORE_EXECUTIONER | Before each attack, 35% chance to poison the target; 1.4× damage dealt to enemies with status ailments | Weapon |
| 薄氷の誓約 | CORE_THIN_ICE_PACT | At HP ≤50%, +35% damage dealt and +20% damage taken | Armor |

“First strike” in this game refers to speed-based preemptive action: only when acting before the enemy in round 1
does `combatFirstStrikeActive` become active, and it disappears at the end of the round.

## Economy / Exploration (Phase 3)

| Name | id | Effect | Slot |
|------|----|------|------|
| 忍び足 | CORE_SNEAK_STEP | Gatekeeper and boss detection range halved + aura detection +1 | Armor |
| 盗掘王 | CORE_TOMB_RAIDER | Chest materials +1, trap intensity +1 level | Accessory |
| 慧眼 | CORE_KEEN_EYE | Unidentified equipment can be equipped while its details remain hidden until identified | Accessory |
| 野営の達人 | CORE_CAMP_MASTER | 2× camp-rest recovery (self only) | Armor |
| 賞金稼ぎ | CORE_BOUNTY_HUNTER | Counts rank-quest target defeats 2× | Accessory |
| 学者の眼 | CORE_SCHOLAR_EYE | Guaranteed material drop from enemies not registered in the codex | Accessory |

The current design assumes 1 solo character. 忍び足・賞金稼ぎ・学者の眼 also refer to that character's equipment and survival state.
In implementation, existing helpers such as `getPartyCoreParams` / `partyHasCoreAffix` continue to be used,
and their effects are inactive when the wearer is hp0 / dead / ash.

Unknown equipment is evaluated at the mechanism layer while equipped: base
stats, support/core affixes, and both positive and negative curse modifiers
may apply while the UI masks their details. Each generated item persists a
`knowledgeStage` (`discovery`, `observation`, `trial`, or `full`) plus its
truthful observed hint tags. Carrying an item can advance observation, and
equipping it advances trial while leaving the exact affix list hidden. Full
identification sets the compatibility `identified` flag and records the
affixes in the Codex. This preserves the risk and return value of acting before
full understanding without turning a hint into a one-to-one hidden-tag
dictionary. Carrying causes the first observation near the start of a run;
additional carried signs are only checked at a low-frequency exploration pulse
(every eight exploration steps), so walking a few steps cannot mechanically
disclose the full tag set.
Equipping cursed unknown equipment and triggering its curse remains a valid
implementation path, but it must not silently reveal the answer in the Codex.

### Unknown Trial world action (#1064)

`試す` is the committed world action for unknown equipment, not a free preview.
The pre-action surface may show only qualitative signs and may be cancelled;
the committed result keeps the item equipped, advances `knowledgeStage` to
`trial`, increments `trialCount`, and locks any curse at the same atomic
boundary. A successful dungeon Trial consumes exactly one exploration turn and
cannot be undone inside the transaction. Bag capacity, displaced equipment,
hand count, curse locks, and current-MP clamping are validated on the projected
final state before the live state is replaced. Pending chest rewards connect
directly to this projection, so a Trial never creates a hidden 21st bag slot.
Known loadout edits remain a separate transaction, and combat cannot start a
Trial.

# Support Affixes (`SUPPORT_AFFIXES`)

- basic (migrated from existing effects in Phase 1): str/int/pie/vit/agi/luk, hp/mp, atk/def,
  antiUndead/antiDragon/antiDemon, poisonWard, spellGuard, trapBonus,
  treasureSense, arcaneSense, hearRange, traceRead, followUp, spellPower,
  arcane, devotion, guardian, firstStrike
- conditional (Phase 2): deepAssault (attack+ from B3F onward) / frontGuard /
  rearEvasion / fullHpDamage / firstTurnAttack / antiBeast / antiSpirit /
  firstStrikeDefense / lastSurvivorStats / statusResistance / spellAccuracy
- trigger (Phase 2/3): killHeal / followUpMp / hitFlinch / poisonAtk / bleedingAtk /
  victoryMaterial / stairsHeal
- economy (Phase 3): identifyDiscount / materialFind / contractReward

`materialFind` / `contractReward` obtain the equipment values of 1 solo character via
`getPartyMaxAffix`. The target of `contractReward` is rank-quest rewards.

`spellPower`（表示名「術力」）は攻撃・回復呪文に共通する basic support である。魔術系の
武器・鎧・盾と装身具から供給し、値は `AFFIX_BALANCE.spellPowerByRarity` の rarity 軸
だけで決まる。`arcane` は攻撃呪文、`devotion` は回復呪文の固有 support として術力の
上に重なる。floor は供給 pool の境界であって、術力値の scaling source ではない。

### Rarity-driven support values (#723)

Generated support values are determined by the item's `magic` / `rare` / `epic`
rarity, not by the floor where the item was found. The source of truth is
`AFFIX_BALANCE.supportValuesByRarity` in `src/data/affixes.js`; the generator's
floor checks only control pool availability and weighting. The three tiers keep
quality visible in the item rarity and allow value progression to continue as
rare/epic supply becomes more common beyond the old B5 value plateau. Values
use the former shallow/deep levels as anchors, with an explicit middle tier;
small integer values use the nearest useful integer rather than fractional UI
values.

| support group | magic | rare | epic |
| --- | ---: | ---: | ---: |
| atk / def | 1.5 / 1 | 4.5 / 2 | 9 / 4 |
| hp / mp | 3 / 1 | 6 / 2 | 9 / 4 |
| str / int / pie / vit / agi / luk | 1 | 2 | 3 |
| trapBonus | 5% | 10% | 15% |
| spellGuard | 10% | 15% | 20% |
| antiUndead / antiDragon / antiDemon | 15% | 20% | 25% |
| poisonWard | 20% | 35% | 50% |
| treasureSense | 5% | 7% | 8% |
| hearRange / arcaneSense / traceRead | 1 | 2 | 3 |
| deepAssault | 10% | 12% | 15% |
| frontGuard / firstStrikeDefense | 2 | 3 | 4 |
| rearEvasion | 6% | 8% | 10% |
| fullHpDamage | 10% | 12% | 15% |
| firstTurnAttack | 3 | 4 | 6 |
| firstStrike | 5% | 8% | 10% |
| antiBeast / antiSpirit | 15% | 20% | 25% |
| spellAccuracy / hitFlinch | 10% | 12% | 15% |
| poisonAtk | 8% | 10% | 12% |
| bleedingAtk | 8% | 10% | 12% |
| lastSurvivorStats | 2 | 3 | 3 |
| statusResistance | 12% | 16% | 20% |
| stairsHeal | 2 | 3 | 4 |

The three anti-* supports intentionally share one 15/20/25 rule; their
different enemy tags and floor gates remain their only generation differences.

`trapBonus` is the single support affix for floor/chest-trap disarm and the B5F
flame-trap avoidance roll. Each equipment generator now has one trapBonus
entry with weight 3, the combined weight of the former duplicate branches;
the old branch-specific floor values are replaced by the common rarity values
above. This removes ambiguous duplicate generation while retaining the
intended high-priority trap-support weight. The fixed `THIEF_EYE` accessory is
a separate source and is not part of this sweep. For the B5F flame trap,
`src/rules/character_stats.js` is the source of truth for conversion and cap.

All existing floor availability gates are intentionally kept. A gate such as
`minFloor` or `weight: floor >= N ? x : 0` answers “when may this support enter
the pool?”, not “how strong is the rolled support?”. Keeping these gates stops
late conditional/utility effects from diluting shallow pools and preserves
the authored discovery order; rarity now supplies the quality axis instead of
duplicating that ordering in the value. Since #1009, equipment and ordinary
chest base candidates are explicit through B30. B6+ keeps earlier bases and
adds horizontal candidates, while the role supply below provides soft
crossing between bands; there is no B5 fallback path for deep loot.

The original proposal, “half the fatigue penalty,” was shelved because the fatigue system is not implemented (consider
adding it as a conditional when implemented).

## Weapon physical variance (#727)

Every `type: "weapon"` entry in `src/data/items.js` defines an inclusive `randRange`
for physical damage. `src/rules/character_stats.js` is the source of truth for
resolving the equipped weapon range and for the `[0, 4]` fallback used by bare
hands or a non-weapon in the weapon slot.

The current fixed ranges are:

- `[2,2]` (fixed): `WAND`, `SAGE_STAFF`, `FIGHTER_SABER`, `HOLY_STAFF`
- `[1,3]` (narrow): `DAGGER`, `ARCH_WAND`, `SHORT_SWORD`, `RAPIER`, `NINJA_DAGGER`, `NINJA_BLADE`, `SACRED_MACE`, `HOLY_BLADE`
- `[0,4]` (wide): `VENOM_FANG`, `LONG_SWORD`, `FLAME_SWORD`, `CLAYMORE`, `MOONSHADOW`, `KATANA`, `MACE`, `LEGENDARY_SWORD`, `SEALED_EXCALIBUR`

Each range has mean 2.0, matching the former global 0–4 roll. The change is
therefore a variance/feel distinction, not an attack-value adjustment. Fixed
per-weapon data is used instead of an `atk` ratio or implicit weapon category so
that authored identity remains stable when attack affixes or enhancement change.
The physical follow-up path uses the same resolver as the main attack; it does
not have a second random-width rule. The old follow-up roll was `0..2` (mean
1), while #727 now uses the weapon range (mean 2). This intentional change
keeps weapon feel consistent between the main attack and follow-up. The #732 physical mitigation expression,
weapon atk, and spell dice remain unchanged.

## Weapon behavior profiles (#1052)

Every weapon also owns one `behaviorProfile` from the small registry in
`src/data/weapon_behavior_profiles.js`. `src/rules/character_stats.js` exposes
`resolveWeaponAttack`, while `src/data.js` exposes `getWeaponBehaviorProfile`,
as the shared source of truth used by player attacks, follow-ups, thorn counters,
auto-policy damage estimates, and production-backed simulations. The Combat Dock remains the one
universal `攻撃` action; the profile changes how that action pays its costs.

The authored assignments are:

- `light`: `DAGGER`, `RAPIER`, `NINJA_DAGGER`, `VENOM_FANG`, `NINJA_BLADE`, `MOONSHADOW`
- `blade`: `SHORT_SWORD`, `FIGHTER_SABER`, `LONG_SWORD`, `FLAME_SWORD`, `HOLY_BLADE`
- `impact`: `MACE`, `SACRED_MACE`
- `heavy`: `CLAYMORE`, `KATANA`, `LEGENDARY_SWORD`, `SEALED_EXCALIBUR`
- `medium`: `WAND`, `SAGE_STAFF`, `ARCH_WAND`, `HOLY_STAFF`

`light` improves hit stability against evasive targets. `blade` is the neutral
baseline. `impact` pays less of the target's physical DEF resistance, with a
small hit-stability trade-off, so it is relatively better against high DEF but
never makes other weapons invalid. `heavy` increases single-hit pressure with
a small hit-stability trade-off and is only available as a two-hand weapon, so
its shield loss remains part of the commitment. `medium` keeps physical output
modest while preserving its max-MP and Rune-slot ownership. These are behavior
sidegrades, not class or stat permissions, and profile differences are kept in
the resolver rather than duplicated in auto or simulation code.

# Generation and Acquisition Rules

- Rarity composition: Magic=support1 or core1 (configured by
  `AFFIX_BALANCE.rollComposition.magic.coreChance`) / Rare=support2 or core1
  (configured by `AFFIX_BALANCE.rollComposition.rare.coreChance`) /
  Epic=core1＋support2
- Point budget: support cost 1〜3, core flat 10. The budget is determined by rarity × floor
  depth (`AFFIX_BALANCE.budgetsByRarityAndFloor`)
- Equipment curse generation follows `IDENTIFICATION_BALANCE` in
  `src/rules/identification_rules.js`; core-bearing equipment receives the
  configured core bonus on top of the floor-scaled base chance.
- Floor pools are an implementation mechanism for the vNext five-floor
  resource chapters, not a promise that deeper floors only provide bigger
  combat numbers. B1–5 should establish and reinforce a build; B6+ should
  continue supplying counterplay, cost-conversion, and direction-change
  possibilities appropriate to the current band. Exact weights and rates are
  source/simulation values and must not be copied here as fixed canon.
- Core sources are dungeon-only. Milestone merchants do not sell equipment.

### Monster equipment rewards

Monster equipment is unidentified and generated by
`src/systems/equipment_generation.js`. Boss and midboss reward branches in
`src/combat_logic/rewards.js` select an explicit rarity and pass it as
`forceRarity`; the selected tier is therefore guaranteed for that drop rather
than being replaced by the floor-based `IDENTIFICATION_BALANCE` odds. Those
modules are the source of truth; rarity values are not duplicated here.

# Workshop and equipment actions

The **meta Workshop** and the **equipment action surface** must not be
conflated. The vNext meta Workshop expands what can exist in future runs; it
does not increase the appearance rate of a chosen build, create a permanent
superior combat tier, or preserve recovered dungeon equipment as next-run
gear. It is horizontal possibility expansion, not a targeted build shop.

The unreachable inscription and curse-sealing features from PR #129 were
removed in #668. The current enhancement/polishing rules and their UI wiring
are retained as implementation history and follow-up scope; they are not
evidence that the full vNext Workshop contract is complete.

For the current equipment-action rules, only support affixes can be polished;
cores cannot be created, granted, moved, or removed by that action surface.

- **Polishing**: Multiplies the value of 1 support affix by 1.5 (round up). 1 time per item
  (`polished` flag). Cores are excluded. Cost: `AFFIX_BALANCE.polishCost`

## Historical implementation decision: Issue #669 (2026-08-16)

The following records the current implementation boundary and the reasoning
behind deferred UI work. It does not override the vNext Workshop contract
above.

The three unreachable equipment actions are judged separately by depth impact
and core-build impact. Numeric changes do not add affix slots, so they are not
expected to move depth materially; they remain valuable as ways to finish an
improvised build from a drop.

- **Enhancement — wire in a follow-up UI issue.** One identified weapon may be
  enhanced once for `鉄片×2 + 魔石片×1`, adding `+2` attack. One identified
  shield or armor may be enhanced once for `鉄片×1 + 硬い皮×2`, adding `+1`
  defense. Accessories are excluded. The rule already lives in the
  `getEnhanceCost` / `executeEnhance` helpers in `src/craft.js`; #669 does not
  add the UI.
- **Polishing — wire in a follow-up UI issue.** One enabled support affix on an
  identified item may be polished once for `AFFIX_BALANCE.polishCost`
  (`魔石片×2`), changing its value to `ceil(value × 1.5)`. Cores,
  unidentified items, and already-polished items are excluded. The existing
  rule remains in `src/craft.js`; #669 does not add the UI.
- **Dismantling — removed from the current game.** The old mapping would have
  returned one to three materials from an identified non-core equipment item,
  but the action would add a second material-supply path without improving the
  in-run build structure. It is not a player-facing material source; the
  unreachable executor and result table were removed in #669. This is
  consistent with the economy canon's deferred dismantling rule.

The old in-run `executeCraft` path was also removed. `CRAFT_RECIPES` remains
the data source for departure craft through `src/systems/workshop.js` and
`src/rules/craft_rules.js`.

# Balance Framework

## Loot roles and current Core inventory audit (#1009)

Generated loot carries a selected `lootRole` target and `buildRole` /
`buildRoles` derived from the actual affix composition. The target softly
weights matching Core and Support candidates while retaining cross-over, so
`LOOT_ROLE_SUPPLY_BY_BAND` changes the effects players actually discover. It
is the source of truth for the B1–B30 role weights: 75/20/5, 60/30/10,
55/30/15, 50/35/15, and 45/35/20. Every band retains all three roles, so the
authored ratios are soft discovery bands rather than hard unlocks. Candidate
bases are also explicit through B30 and keep earlier items eligible at depth.

The current Core registry is intentionally not capped. Its role audit is:

- Reinforce: 背水, 先手必勝, 必中, 浄化の環.
- Convert: 血杖, 罠喰い, 呪飼いの鎖, 反撃の棘, 薄氷の誓約, 盗掘王, 野営の達人.
- Pivot: 巨人殺し, 守護者殺し, 執行人, 忍び足, 慧眼, 賞金稼ぎ, 学者の眼.

The current Core axis audit is explicit in each registry entry's `buildAxis`:

- Main axis: 背水, 先手必勝, 血杖, 罠喰い, 呪飼いの鎖, 巨人殺し, 反撃の棘,
  執行人, 薄氷の誓約, 忍び足, 盗掘王, 野営の達人.
- Auxiliary axis: 必中, 浄化の環, 守護者殺し, 慧眼, 賞金稼ぎ, 学者の眼.
- Support axis: every entry in `SUPPORT_AFFIXES`.

This is a role label for supply and observation, not an activation limit.
Loot generation never reads the current equipped loadout; a different main
axis is observed as a build transition only when an equipment decision changes
the explicit `main` Core set. Auxiliary Core and Support changes remain
ordinary equipment swaps.

Production telemetry exposes this distinction as `equipment_decision.buildDecision`
and emits a separate `build_shift` event only for the Main Core axis change.
The event is an observation boundary, not a new build rule.

- Core evaluation rule: **an unconditional +15% equivalent is the upper limit when converted by expected uptime**.
  Example: 背水 +40% × 20% uptime ≈ +8% effective.
- Only 1 tuning knob: `AFFIX_BALANCE` (cost / budget / role composition /
  curse rate / polish cost). Do not hardcode numbers
  on the hook side.
- Numeric changes go through the balance-simulation checklist.

## Core装備率の扱い（#471）

- core装備率は装備供給の監視値。35〜40%の目標帯を置かず、合否判定にも使わない。
- 完成ビルドは #470 の職内 `combatBuildScore` Q4。`core 1個以上 + スロット充足` は完成判定との二重定義として採用しない。
- 供給の十分性は #476 の A3（core個数軸）で判定する。
- 測定点、現行値、撤廃理由、過去記録の扱いは `.agents/balance-simulation.md` の「Issue #471 固定結論（core装備率の扱い）」を正本とする。

# UI and Visualization

- Equipment screen: Cores show as “◆名称: 条件文” on 1 line.
  Support affixes show numeric values (centralized in `formatAffixText`).
- Battle log: Always explicitly show core activation (`getCoreLogText` / `logCoreActivation`).
  Always-on effects appear only the first time in battle; trigger effects appear every time. Exploration effects appear in exploration logs.
- Equipment identified via 慧眼 hides its contents as “???”.

# Verification

- deterministic unit: `scratch/tests/unit/test_affixes.js` (registry consistency, budget, generation),
  `scratch/tests/unit/test_core_affixes.js` (all core effects, legacy-field removal, polishing restrictions)
- `npm run test:unit` / `npm run lint` / `npm run build` /
  `npm run test:browser`

# Future Work

- Measure expected core uptime → adjust `AFFIX_BALANCE` (pending live-play data).
- When implementing the fatigue system: consider adding the 「疲労中ペナルティ半減」 support affix.
- The codex core discovery record (17-type collection display) is not implemented — use a separate Issue if implementing it.

## Returned equipment is history, not next-run gear (#1011)

Dungeon equipment remains an in-run build decision. A Portal or Wing can
confirm the resolved object for the terminal result, but it does not enter Town
storage or the next departure's battle inventory. Death and Abandon can still
preserve a coarse Codex observation and Castle history for a lost item without
preserving its combat values.

Return processing may automatically expose one existing side-grade pool node
at a depth gate after equipment is recovered. The candidate is selected from
the recovered item's authored core, role, tag, type, and knowledge signals,
not from a fixed unlock chain or the current build. This is horizontal
possibility space only: it does not add a superior tier, increase a specific
item's drop rate, select a build, or dilute the authored candidate structure.
The generator uses a same-slot reserved replacement when the possibility
becomes eligible, keeping the authored core candidate count stable.

## Dungeon loadout commit (#1054)

In Dungeon, equipment and Medium/Rune edits are staged as one loadout draft.
The player may compare and revise the draft for free; only a successful,
non-empty commit consumes one exploration turn. The commit validates the
projected hands, Rune capacity, curse locks, MP clamp, and final 20-slot bag,
then applies placement atomically. A 2H weapon explicitly returns the displaced
shield to the same draft bag. Cancel, no-op close, and invalid commit do not
advance exploration time. The caller supplies the actual world turn cost, so
Town/Camp commits remain zero. Unknown gear remains a real trial only when the
committed loadout adopts it; preview does not disclose or simulate hidden
effects.

## Pickup staging (#1056)

An opened chest stages its main, special/Wing, and accessory object rewards as
one pending bundle before any bag mutation. The player resolves the complete
bundle against the current bag: take, leave, or explicitly discard existing
items. The final placement must be at most 20 ordinary slots, and a left
reward is never briefly inserted into the bag. Known equipment and Rune can be
included in the same #1054 loadout draft; unknown equipment may be carried or
left but is not offered a free equip/socket trial. Materials and identification
powder continue to resolve as non-object resources outside the bundle.
