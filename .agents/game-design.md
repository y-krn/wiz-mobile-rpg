# Game Design: Expedition Economy

This document records the current game design direction for progression,
economy, rewards, crafting, and post-clear flow. Use it when implementing or
reviewing changes that affect XP, gold, shops, loot, materials, contracts,
workshop actions, or B5F clear behavior.

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
- `TOWN_PORTAL`
- `MANA_POTION`

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
- Boss and midboss rewards.
- Low-probability normal combat drops.

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
materials: {}
```

Add run-summary tracking:

```js
currentRun.materialsFound = {}
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
- Review A-rank gold and equipment rewards carefully.
- Keep reward text short enough for mobile lists and result screens.

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
| Boss | Clear record, rare materials, high-tier unidentified gear |
| Contract | Identify ticket, materials, low gold |
| Shop | Baseline gear and supplies |
| Dungeon merchant | Expedition support: tickets, consumables, small materials |
| Workshop | Crafting and instance enhancement |

## Avoid

- Forced B5F or boss locks.
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
