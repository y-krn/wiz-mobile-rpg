# Game Design: Meta Economy

This document records the economy design for the solo depth-attack roguelite:
materials as the only currency, the workshop unlock tree, milestone merchants,
and run quests. It is the economy-level refinement of
`.agents/game-design-core-loop.md` (core loop, pillars, pacing targets).
Resolve conflicts toward that document.

**Direction change (2026-07-18).** The former Expedition Economy (town shops,
gold, identification-in-town, crafting, contracts board, B5F clear flow) was
retired with the party-based game. The approved pivot design lives in
`docs/superpowers/specs/2026-07-18-solo-depth-roguelite-design.md`.

## Goal

One currency, one sink, one question:

```text
run ends -> materials banked (100% retreat / 30% death) ->
workshop unlocks make the next run start slightly stronger or smarter ->
descend again
```

Every economic knob must serve "descend again, deeper." Any loop that pays
better than descending (farming a shallow biome forever, merchant arbitrage)
is a bug in the economy.

## Currency: Materials Only

Gold is removed. Materials are the single currency, used both by the
milestone merchants inside a run and by the workshop between runs.

- Material set: the existing ten types (獣の牙, 硬い皮, 毒腺, 骨片, 霊粉,
  魔石片, 鉄片, 呪布, 黒角, 竜鱗). Do not add one material per enemy.
- Do not use `霊灰` as a material name (too close to the item `聖灰`).
- Materials do not consume inventory slots.
- Drop classification: prefer explicit `tags`; use `spriteType`, level,
  `isRare`, `isBoss` as fallbacks.

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

- Material species vary by biome and depth, so "I need 黒角, so I dive to the
  demon biome" is a real routing decision.
- Deeper floors pay more of everything; a milestone-start run applies a
  material-income penalty so record runs and material runs stay distinct.

## Banking Rule

- Retreat (milestone portal or return item): bank 100% of run materials.
- Death: bank 30%.
- Materials spent at a milestone merchant during the run are gone either
  way — spending mid-run is itself a push-your-luck decision.
- No other leakage or bonus paths. Keep the rule explainable in one line.

## Workshop (Between Runs)

The workshop is the only material sink between runs: an unlock tree, not a
crafting bench. First version stays narrow.

Purchasable categories:

1. New classes.
2. Starting-gear options (choices offered at run start, not carried gear).
3. Skill/spell and affix pool expansions (what can appear in a run).
4. Permanent stats with an explicit cap (e.g. +5 steps per stat line). The
   cap is a pillar-level rule; never raise it casually.
5. Convenience: +1 starting identify resource, a starting return item, and
   similar small run-start kits.

Defer: recipe trees, dismantling, random-property crafting, anything that
turns the workshop into a second build system. Builds live inside the run.

## Milestone Merchants (Inside A Run)

Merchants appear only on milestone floors (every 5th). They support the
descent; they never solve it.

Stock, priced in materials:

- Identify resources.
- Consumables (healing, counterplay items — keep counterplay cheap and
  available; accessibility outranks scarcity for this category).
- Return items (finite; this is the retreat valve, price it seriously).
- Curse removal (expensive; the gamble must keep its teeth).
- No equipment sales. Equipment comes from the dungeon (pillar 3); a
  merchant selling gear would bypass the identify-or-gamble hook.

## Run Quests

The old contracts board is retired. Each run starts with 1–2 auto-assigned
quests ("reach B10", "defeat 3 disruptors"), paying a material bonus on
completion. Quests must point the player deeper or into risk, never into
farming loops on known ground.

## Records And Codex

- Records: deepest floor (retreat and death separately), per-class deepest,
  total runs.
- Codex is kept; first-kill rewards pay a one-time material bonus.
- Split-spawned enemies stay excluded from codex and first-kill rewards.

## Avoid

- A second currency, or any gold reintroduction.
- Merchant arbitrage: nothing a merchant sells may be bankable or resellable
  at profit.
- Uncapped permanent stats, or unlocks that raise material income enough to
  make farming dominate descending.
- Equipment persistence across runs (rejected approach C; v2 decision at
  the earliest).
- Making identify resources cheap enough that the identify-or-gamble choice
  disappears (see pillar 3).
