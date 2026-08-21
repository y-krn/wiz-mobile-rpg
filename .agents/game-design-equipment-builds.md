# Game Design: Equipment Build System (Core / Support Affixes)

Tracking issue: y-krn/wiz-mobile-rpg#120 (closed — all phases merged)

Implementation history: PR #126 (Phase 1), #127 (Phase 2), #128 (Phase 3),
#129 (Phase 4). The inscription and curse-sealing portions of Phase 4 were removed in #668 because they were unreachable from the current game screens; enhancement and polishing remain pending UI wiring after the #669 decision.

**Direction change (2026-07-18).** This document reflects the pivot to a solo
depth-attack roguelite. It is subordinate to `.agents/game-design-core-loop.md`
and `.agents/game-design.md`; resolve conflicts toward those documents.

# Overview

To address the lack of build diversity (effective build count ≈ only 8 class choices), equipment was
redesigned into a 2-tier affix system of “core” and “support.” The synergy system
(`SYNERGIES` / `getActiveSynergyMod`) was retired in Phase 1. The current design assumes 1 solo character,
and effects belong to the wearer.

Goal: effective build space ≈ `CORE_AFFIXES.length` cores × 2〜3 class fits × support configurations ≈ 60〜80.

Combat formula structure and application order are canonical in
`.agents/game-design-combat-model.md`. This document remains canonical for the
core/support registry, acquisition rules, and affix parameters; the source
files remain authoritative for current values.

# Overall Structure

- **Core types** (`CORE_AFFIXES`): Rule-changing effects. Dungeon-sourced only. Milestone merchants do not sell equipment.
  For 1 item, at most 1 core (enforced during generation). A 1-character loadout has no upper limit on the number of equipped items,
  and all cores are active simultaneously as long as the slots allow (#311 removed the 1-core limit; it accounted for 50% of unequipped reasons,
  and was the main reason lower-tier cores could not compete).
- Equipment with a core has its base shifted during generation toward a same-slot candidate the party can equip
  (`src/systems/equipment_generation.js`). Class equipment restrictions themselves remain as part of class identity,
  so the core itself is not wasted. If a shield core is generated for a class that cannot equip shields, it
  remains a dead card because there is no replacement candidate.
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
| 罠喰い | CORE_TRAP_EATER | Thief / Ranger / Ninja: successful chest-trap disarm grants +2 fixed physical damage during the expedition (cap +20, reset on return) | Accessory |
| 呪飼いの鎖 | CORE_CURSE_KEEPER | +3 to all stats for each equipped curse | Accessory |
| 巨人殺し | CORE_GIANT_SLAYER | +30% damage dealt to enemies with higher maxHP than self | Weapon |
| 守護者殺し | CORE_MILESTONE_BREAKER | +25% damage dealt to milestone bosses | Weapon |
| 反撃の棘 | CORE_THORN_SHIELD | 30% chance to counterattack at 50% power when hit | Shield |
| 執行人 | CORE_EXECUTIONER | 2× damage dealt to enemies with status ailments | Weapon |
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

Unidentified equipment is now evaluated at the mechanism layer while equipped:
base stats, support/core affixes, and both positive and negative curse modifiers
apply to derived stats and combat, while `getItemData()` and equipment detail UI
continue to mask the corresponding information until identification. The
慧眼 registry entry remains for save/content compatibility; Issue #775 changes
no affix values, material costs, drop rates, or other economy constants.
Equipping cursed unidentified equipment and triggering its curse is intended
behavior. The item remains unidentified, but `curseLocked` exposes only the
existence of the curse and prevents ordinary removal.

# Support Affixes (`SUPPORT_AFFIXES`)

- basic (migrated from existing effects in Phase 1): str/int/pie/vit/agi/luk, hp/mp, atk/def,
  antiUndead/antiDragon/antiDemon, poisonWard, spellGuard, trapBonus,
  treasureSense, arcaneSense, hearRange, traceRead, followUp, spellPower,
  arcane, devotion, guardian, firstStrike
- conditional (Phase 2): deepAssault (attack+ from B3F onward) / frontGuard /
  rearEvasion / fullHpDamage / firstTurnAttack / antiBeast / antiSpirit /
  firstStrikeDefense / lastSurvivorStats / statusResistance / spellAccuracy
- trigger (Phase 2/3): killHeal / followUpMp / hitFlinch / poisonAtk /
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
duplicating that ordering in the value. The fixed equipment base candidate
tables still reuse the B5 table for deeper floors; extending those tables is
separate scope for a future issue.

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
- Floor-specific core pool weights: B1-B2=mostly economy, B3+=mostly combat
- Core sources are dungeon-only. Milestone merchants do not sell equipment.

### Monster equipment rewards

Monster equipment is unidentified and generated by
`src/systems/equipment_generation.js`. Boss and midboss reward branches in
`src/combat_logic/rewards.js` select an explicit rarity and pass it as
`forceRarity`; the selected tier is therefore guaranteed for that drop rather
than being replaced by the floor-based `IDENTIFICATION_BALANCE` odds. Those
modules are the source of truth; rarity values are not duplicated here.

# Workshop (Phase 4)

The unreachable inscription and curse-sealing features from PR #129 were removed in #668.
This “Workshop” is distinct from the permanent unlock tree in `.agents/game-design.md`.
The remaining polishing implementation is also unreachable from current screens and is tracked by #669.

Boundary: **only support affixes can be polished**. Cores cannot be created, granted, moved, or removed in
the Workshop.

- **Polishing**: Multiplies the value of 1 support affix by 1.5 (round up). 1 time per item
  (`polished` flag). Cores are excluded. Cost: `AFFIX_BALANCE.polishCost`

## Issue #669 Decision (2026-08-16)

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

- deterministic unit: `scratch/test_affixes.js` (registry consistency, budget, generation),
  `scratch/test_core_affixes.js` (all core effects, legacy-field removal, polishing restrictions)
- `npm run test:unit` / `npm run lint` / `npm run build` /
  `npm run test:browser`

# Future Work

- Measure expected core uptime → adjust `AFFIX_BALANCE` (pending live-play data).
- When implementing the fatigue system: consider adding the 「疲労中ペナルティ半減」 support affix.
- The codex core discovery record (17-type collection display) is not implemented — use a separate Issue if implementing it.
