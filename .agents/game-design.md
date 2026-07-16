# Game Design: Expedition Economy

This document records the current game design direction for progression,
economy, rewards, crafting, and post-clear flow. Use it when implementing or
reviewing changes that affect XP, gold, shops, loot, materials, contracts,
workshop actions, or B5F clear behavior.

This is the economy-level refinement of `.agents/game-design-core-loop.md`
(core loop, pillars, pacing targets). Resolve conflicts toward that document.

## Goal

Move the game away from:

```text
grind levels -> gain gold -> buy strong shop gear -> clear B5F -> reset
```

Toward:

```text
enter dungeon -> bring back materials and unidentified gear -> choose
identification, crafting, enhancement, and supplies -> plan the next expedition
```

B5F completion must not be blocked artificially. If the player can clear it,
that success should stand. The clear flow should become a milestone that keeps
the save alive, not an endpoint that deletes progress.

## Success Criteria

- Level-up does not fully restore HP/MP.
- Gold does not buy a complete solution to B5F.
- Shops provide baseline gear, gap filling, and supplies, not best-in-slot
  answers.
- Combat and chests primarily feed materials and unidentified equipment.
- Strong gear comes from unidentified drops, dangerous fights, chests, and
  limited workshop enhancement.
- B5F clear preserves the party, inventory, materials, codex, contracts, and
  records.

## Level Progression

Level should be a supporting source of stability, not the main solution.

Implementation requirements:

- Remove full HP/MP restoration from `checkCharLevelUp()`.
- When max HP/MP increases, add only the max-value delta to current HP/MP.
- Calculate the delta from max values before and after the stat change, because
  max HP/MP can include equipment affixes.
- Tune enemy XP, rare enemy XP, boss XP, and first-kill bonus together.
- Reduce or redesign the current first-kill EXP/GOLD bonus so it does not make
  fast leveling the dominant strategy.
- Warden XP stays at same-floor level even though wardens fight at +2-floor
  strength (TICKET-078); paying strength-tier XP would make warden hunting
  the dominant leveling strategy.

## Gold Economy

Gold should be expedition maintenance, not universal power.

Tune all major gold sources together:

- Combat rewards.
- Chest rewards.
- Contract rewards.
- Tablet or event rewards.
- Boss and midboss rewards.

Gold sinks should matter:

- Identification.
- Healing.
- Resurrection.
- Supplies.
- Workshop fees.

Avoid lowering combat/chest gold while leaving contracts or events as a large
gold workaround.

## Shops And Merchants

Shops should prepare the expedition, not solve it.

Shop stock should focus on:

- Baseline gear.
- Replacement gear.
- Basic supplies.
- Limited safety items.

Remove or move these from normal shops and dungeon merchants unless they are
post-clear or special rewards:

- `LEGENDARY_SWORD`
- `LEGENDARY_SHIELD`
- `DRAGON_CHARM`
- `HOLY_BLADE`
- `DRAGON_SCALE`
- `MOONSHADOW`
- Other obvious boss-counter or high-end equipment.

Revisit price and availability for high-impact consumables:

- `ELIXIR`
- `SACRED_ASHES`
- `TOWN_PORTAL` — since TICKET-075 it is a pure emergency escape (no
  floor-resume value), so its effective worth dropped; reprice together with
  the TICKET-042 scarcity work.
- `MANA_POTION`

Counterplay consumables (the noise lure from TICKET-079) belong in baseline
shop stock, cheap and available before B1F: counterplay accessibility
(TICKET-016) outranks scarcity for this category.

Dungeon merchants are expedition support, not loot vendors. Their stock should
focus on identify tickets, small material quantities, consumables, return
support, and low-floor replacement gear. Do not make dungeon merchants a
reliable source of unidentified equipment.

If unidentified equipment is ever sold by a merchant, apply all restrictions:

- B1F-B2F equivalent `magic` equipment only.
- At most one per expedition.
- Price must be above the expected identify-and-sell return.
- No `rare` or `epic` unidentified equipment.
- No high-end bases such as `KATANA`, `MOONSHADOW`, `DRAGON_SCALE`, `HOLY_BLADE`,
  or `DRAGON_CHARM`. Keep this list in sync with `RESTRICTED_CHEST_BASES` in
  `src/data/equipment_tables.js`.

Normal shop stock and dungeon merchant stock must not create a "buy unidentified
gear -> identify -> sell for profit" loop.

## Materials

Materials are a separate resource from normal inventory. They must not consume
the 20-slot bag.

Initial material set:

| Material | Main purpose |
| --- | --- |
| 獣の牙 | Weapon enhancement and physical consumables |
| 硬い皮 | Light armor and basic consumables |
| 毒腺 | Antidote and poison-related recipes |
| 骨片 | Undead counters and mace/holy recipes |
| 霊粉 | Identification support and holy recipes |
| 魔石片 | MP and magical equipment recipes |
| 鉄片 | Basic weapon, shield, and armor enhancement |
| 呪布 | Robes and magic-resistance recipes |
| 黒角 | Demon counters and advanced enhancement |
| 竜鱗 | Dragon counters and late-game enhancement |

Do not use `霊灰` as a material name because it is too close to the existing
revival item `聖灰`.

### Drop Classification

Prefer explicit `tags` when available. Use `spriteType`, level, `isRare`, and
`isBoss` only as fallbacks or modifiers.

| Enemy group | Primary material | Secondary material |
| --- | --- | --- |
| Beast, insect, small creature | 獣の牙 | 硬い皮, 毒腺 |
| Poison, spider, rot | 毒腺 | 硬い皮 |
| `undead` | 骨片 | 霊粉, 呪布 |
| `spirit`, wisp | 霊粉 | 魔石片 |
| Mage, caster | 魔石片 | 呪布 |
| Armor, statue, golem, stone | 鉄片 | 魔石片 |
| `demon` | 黒角 | 魔石片, 呪布 |
| `dragon` | 竜鱗 | 獣の牙 |
| Rare or boss | Normal group material | Extra rare material |

Avoid adding one unique material per enemy. That will create unnecessary data,
UI, and balance load.

## Workshop

Add a town workshop, but keep the first version narrow.

Initial scope:

1. Basic consumable crafting.
2. Equipment +1 enhancement.

Defer:

- Identification assistance.
- Material delivery contracts.
- Material codex.
- Large recipe trees.
- Random-property crafting.
- Broad dismantling systems.

### Consumable Crafting

Example recipes:

| Output | Materials | Gold |
| --- | --- | --- |
| 毒消し | 毒腺 x1 | Low |
| 聖水 | 霊粉 x1, 骨片 x1 | Low |
| マナポーション | 魔石片 x2, 呪布 x1 | Medium |
| 回復薬 | 硬い皮 x1, 獣の牙 x1 | Low |

Do not make `ELIXIR`, `SACRED_ASHES`, or `TOWN_PORTAL` easy workshop outputs.
Those items strongly affect expedition risk.

### Equipment Enhancement

Do not mutate `ITEMS` base definitions. Base items are shared by shop stock,
string equipment IDs, generated drops, and display code.

Enhancement must live on the item instance. Use fields such as:

```js
{
  enhanceLevel: 1,
  atkBonus: 1,
  defBonus: 0
}
```

If a string equipment ID must be enhanced, convert it into an equipment
instance first. Do not globally edit the base item.

Initial enhancement cap should be `+1`. Future cap can be `+3`, but only after
checking affix and deep-floor drop inflation.

### Dismantling

Dismantling is a cleanup and consolation path, not a primary material source.
If included, it should start with identified equipment only.

Rules:

- Do not allow unidentified equipment to be dismantled in the initial version.
- Keep material returns low enough that combat and chests remain the main
  material sources.
- Watch `黒角` and `竜鱗` especially; high-end equipment supply can make rare
  materials overflow if dismantling is too generous.
- Dismantling should not be more attractive than identifying and evaluating the
  item.

## Unidentified Equipment

Unidentified equipment should remain a main progression reward.

Guidelines:

- Long-term value should exceed baseline shop gear.
- B4/B5 high-end bases and high rarity rates must be reviewed together with
  shop nerfs.
- `KATANA`, `CLAYMORE`, `PLATE_MAIL`, `DRAGON_SCALE`, and similar high-end
  bases should have explicit floor, rarity, and source rules.
- Boss and midboss guaranteed legendary rewards should be reviewed as part of
  the same economy pass.

Primary sources:

- Chests.
- Rare enemies.
- Elite fights.
- Wardens (one-time sealed-gate guardians; one rare unidentified item each).
- Boss and midboss rewards.
- Low-probability normal combat drops.

Information affixes (`hearRange`, `arcaneSense`, `traceRead` — TICKET-080)
are drop-only: they never appear in shop or merchant stock. Exploration power
is "strong gear" even at zero combat stats, so it follows the same
best-in-slot-comes-from-the-dungeon rule.

Avoid these sources:

- Normal shop stock.
- Reliable dungeon merchant stock.
- Cheap purchase gacha.

Identification should be a meaningful gold sink. Avoid fixed appraisal prices
that are low compared to the identified sell value. Prefer a value-linked
formula such as:

```text
appraisal cost = base item price * rarity coefficient
```

The exact coefficient should be tuned so that:

- Identifying useful equipment feels worthwhile.
- Identifying only to sell is not a stable profit strategy.
- High-floor and high-rarity items create a real spending decision.
- Identify tickets remain useful as occasional cost relief.

Chest and combat supply must be balanced with appraisal cost, sell value, and
dismantling returns. In particular, B4F/B5F normal chests should not flood the
economy with high-end bases. Move `KATANA`, `DRAGON_SCALE`, and similar
late-game answers toward dangerous chests, rare enemies, elites, bosses, or very
low-probability sources.

## Equipment Affix System (Core / Support)

The tag-synergy system (`SYNERGIES`, TICKET-069) was **removed** (issue #120,
PR #126). Party-wide tag bonuses no longer exist; all equipment power is
attributed to the individual wearer. Detailed design and balance rules live in
`.agents/game-design-equipment-builds.md` — treat that document as canonical
for cores, supports, inscriptions, polish, and seal behavior. Summary:

- Equipment affixes are two-tier: **cores** (16 rule-changing effects, drop-only,
  one per character) and **supports** (47 numeric/small effects, workshop-
  inscribable). Registry: `src/data/affixes.js`; per-core logic:
  `src/rules/affix_rules.js`.
- Generation is point-budget based (`AFFIX_BALANCE`): common = 1 support,
  rare = 2 supports or 1 core, epic = 1 core + 2 supports. Core drops are 30%
  cursed. Shops, roaming merchants, and contract rewards never produce cores
  (`allowCores: false`).
- Floor pools weight economy cores toward B1-B2 and combat cores toward B3+.
- The workshop can inscribe/polish **supports only**; sealing a curse halves
  the item's core (`CORE_SEAL_RULES`; boolean-style cores are disabled
  instead). Cores cannot be created, moved, or removed by the workshop.
- Balance knobs live in exactly two places: `AFFIX_BALANCE` (costs, budgets,
  roll composition, curse rate, polish cost) and `CORE_SEAL_RULES` (seal
  penalties). Tune there, not at hook sites.
- Power budget rule carried over from the synergy era: value a core by
  **expected uptime**, capped at roughly an unconditional +15% equivalent.
  `guardian` still only triggers at HP <= 25% and ignores negative values.

## B5F Clear Flow

B5F clear should preserve the save.

Implementation requirements:

- Change `ANTIGRAVITY_CRYSTAL` from an end-of-game reset trigger into a
  first-clear milestone item or record.
- When the crystal is brought to the castle:
  - Set `cleared = true`.
  - Record first clear.
  - Consume the crystal or mark it recorded.
  - Return to town or show a result screen that returns to town.
  - Save the game.
  - Do not call `clearSaveData()`.
- `DRAGON_KEY` should not become a heavy progression lock. Keep it as light
  progression flavor, a route marker, or a record item unless a later design
  explicitly changes that.

This change must cover the castle delivery path, not only the B5F boss reward
path.

## Save Shape

Add persistent fields:

```js
cleared: false,
materials: {},
openedGates: []   // sealed-gate ids, SAVE_VERSION 6 (TICKET-078)
```

`openedGates` is the single source of truth for warden defeat, gate state,
and camp availability (TICKET-082 derives camps from it — no separate camp
field). Gate openings survive gameover rollback by design: an opened gate
never closes.

Add run-summary tracking:

```js
currentRun.materialsFound = {}
currentRun.campRested = {}   // per-floor once-per-run rest flags (TICKET-082)
```

Update every save path:

- Default state.
- New game initialization.
- Existing save load with default fallback.
- Save payload creation.
- Autosave.
- Gameover rollback.
- Result screen data.

Existing saves must load without losing materials, clear state, contracts, or
codex data.

## Contracts

Contracts should provide goals and supplemental rewards. They must not lock
core progression.

Adjust contract rewards:

- Reduce raw gold.
- Prefer materials, identify tickets, and workshop support.
- Information rewards (map fragments, warden intel — TICKET-083) are the
  preferred way to make a contract more attractive without adding gold.
- Review A-rank gold and equipment rewards carefully.
- Keep reward text short enough for mobile lists and result screens.

Contracts are also an information channel (TICKET-083): accepting a warden
contract buys the identification rung for that warden (existence, rough
location, danger) and its text carries a perception hint in observational
language. Warden contracts are issued only while the target warden is alive,
so unfulfillable contracts cannot exist; kill-contract candidate lists must
never contain one-time enemies (the フラック regression fixed in 083).

Future contract types:

- Material delivery.
- Species hunt.
- Unidentified equipment recovery.
- B5F re-clear.
- No-death return.
- Trap-safe expedition.

## Reward Roles

| Source | Primary reward |
| --- | --- |
| Normal combat | Low XP, low gold, materials |
| Rare enemy | Rare materials, possible unidentified gear |
| Chest | Unidentified gear, material bundle, low gold |
| Elite | Rare materials, rare unidentified gear |
| Warden (one-time, TICKET-078/079) | Sealed-gate opening (spatial: shortcut, camp access), Elite-tier materials and one rare unidentified item, same-floor XP only |
| Boss | Clear record, rare materials, high-tier unidentified gear |
| Contract | Identify ticket, materials, low gold, information (map fragments, warden intel — TICKET-083) |
| Camp (B2/B4, TICKET-082) | Not a loot source: partial in-run recovery, once per run, unlocked by that floor's warden defeat |
| Shop | Baseline gear and supplies (including counterplay consumables such as the noise lure) |
| Dungeon merchant | Expedition support: tickets, consumables, small materials |
| Workshop | Crafting and instance enhancement |

Wardens never respawn, so they cannot be farmed; their XP is deliberately
same-floor (not strength-tier) so warden hunting is never the fastest
leveling route. Information rewards pay in disclosure instead of gold, which
keeps contract value attractive without inflating the economy.

## Avoid

- Forced B5F or boss locks.
- Warden respawns or any repeatable warden reward (they are one-time by
  design; farming must stay impossible).
- Strength-tier XP on wardens (same-floor only).
- Camps that fully heal, revive, cure, sell, or serve as exits (partial rest
  once per run is the whole offer).
- Sealed gates on required paths (gates are shortcut-only; every objective
  must be reachable with all gates closed — guarded by
  `scratch/test_reachability_loop.js`).
- Information affixes or other exploration-power gear in shop stock.
- One-time enemies in repeatable kill-contract candidate lists.
- Full HP/MP recovery on level-up.
- Best-in-slot shop gear.
- Reliable merchant unidentified-equipment sales.
- Identify-and-sell profit loops.
- Large gold payouts.
- Large material lists.
- Large recipe trees.
- Mutating `ITEMS` base definitions for enhancement.
- Deleting the save after clear.
- Required contracts for normal progression.

## Required Verification

Run:

- `npm run test:unit`
- `npm run build`
- `npm run test:browser` when workshop/material UI or reward text changes.

Manual or targeted checks:

- Existing saves load and initialize `materials` and `cleared`.
- Gameover rollback preserves `materials`, `cleared`, contracts, and codex.
- Level-up increases max HP/MP without full recovery.
- Combat and chests add materials without consuming bag slots.
- Crystal delivery at the castle preserves the save and allows return to town.
- Material, recipe, combat log, result, and contract text fit on mobile.
- Dungeon merchant unidentified-equipment purchases cannot produce stable
  identify-and-sell profit if that stock exists at all.
- Identified sell value, appraisal cost, and dismantling returns do not make
  equipment farming stronger than expedition progression.

Recommended simulations:

- B1F-B5F reward samples for 10, 20, and 30 fights.
- B1F-B5F chest samples for gold, materials, unidentified equipment, and rarity.
- B2F/B3F/B4F purchasing power and possible workshop upgrades.
- B3F+ survival comparisons for baseline gear, shop gear, and found/enhanced
  gear.
- Economy impact from repeated C/B/A contract completion.
- B1F-B5F samples for 1000 chests or equivalent deterministic trials covering
  unidentified equipment count, appraisal cost, sell value, material gains, and
  net gold.
- Merchant stock trials by floor, including any unidentified-equipment purchase
  path, to prove the expected value is not profitable.
