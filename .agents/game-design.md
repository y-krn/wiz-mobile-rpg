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
- Other obvious boss-counter or high-end equipment.

Revisit price and availability for high-impact consumables:

- `ELIXIR`
- `SACRED_ASHES`
- `TOWN_PORTAL`
- `MANA_POTION`

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
| Workshop | Crafting and instance enhancement |

## Avoid

- Forced B5F or boss locks.
- Full HP/MP recovery on level-up.
- Best-in-slot shop gear.
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

Recommended simulations:

- B1F-B5F reward samples for 10, 20, and 30 fights.
- B1F-B5F chest samples for gold, materials, unidentified equipment, and rarity.
- B2F/B3F/B4F purchasing power and possible workshop upgrades.
- B3F+ survival comparisons for baseline gear, shop gear, and found/enhanced
  gear.
- Economy impact from repeated C/B/A contract completion.
