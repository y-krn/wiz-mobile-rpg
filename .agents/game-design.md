# Game Design: Meta Economy

This document records the economy design for the solo depth-attack roguelite:
materials as the only currency, the workshop unlock tree, milestone merchants,
and run quests. It is the economy-level refinement of
`.agents/game-design-core-loop.md` (core loop, pillars, pacing targets).
Resolve conflicts toward that document.

**Direction change (2026-07-18).** The former Expedition Economy (town shops,
gold, identification-in-town, crafting, contracts board, B5F clear flow) was
retired with the party-based game. This document defines the meta economy for
the replacement solo depth-attack roguelite.

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

## Status Effects And Counterplay

- Blind remains a combat disruption: the affected character can act, but may
  miss attacks and takes the existing incoming-damage penalty.
- Blind clears when combat ends through victory or retreat while the character
  survives. Death does not create a recovery event. The source of truth is the
  combat-round resolution in `src/combat_logic/round.js`.
- `EYE_DROPS` remains a cheap explicit countermeasure (`霊粉`1), but it is not
  required in the canonical departure kit. Departure craft choices trade it
  against recovery and utility items.
- Blind's chest-disarm penalty remains separate from combat duration. Evaluate
  chest disarm through attempts and route breakdown, not as a standalone
  balance target.

## 基本4職の罠sustain（Issue #516）

- 戦士は `trapGuard=40`、魔術師は `trapGuard=50` をクラス固有passiveとして持つ。
  正本は `src/data/classes.js`、適用処理は
  `src/rules/trap_effect_rules.js` の `applyTrapGuardToEffect` とする。
- 軽減対象は床罠・宝箱罠のHPダメージ成分だけで、正のダメージは最低1を維持する。
  罠の発見・解除、MP drain、毒・盲目・転送などの非HP効果は変更しない。
  盗賊・僧侶と上級4職の既存passiveも変更しない。
- これは回復薬の常時供給ではなく、罠優位の浅層で戦士・魔術師が薬を使い切るまでの
  時間を延ばす設計である。期待されるプレイヤー影響は、罠を踏んだ際の即時HP損失と
  浅層の薬枯渇を緩和し、盗賊・僧侶の到達性を維持すること。
- Issue #516 の再現可能な測定値と採用候補の比較は
  `scratch/results/issue-516-class-sustain.md`、#461再基準線は
  `scratch/results/issue-461-baseline.md` を正本とする。

## 基本4職の撃破sustain（Issue #528）

- 戦士は `killHeal=2`、魔術師は `killHeal=4` をクラス固有passiveとして持つ。
  正本は `src/data/classes.js`、適用処理は既存の
  `src/combat_logic/damage.js` の `applyKillAffixEffects` とする。
- `killHeal` は敵撃破時にHPを回復し、最大HPを上限とする。回復薬の供給数・回復薬の
  効果量・探索回復点は変更しない。盗賊・僧侶と上級4職の既存passiveも変更しない。
- #528フェーズ2では、戦士と魔術師を同じ値に揃えず別々に測定した。戦士は +2で
  B5撤退率31.8%、魔術師は +4でB5撤退率39.5%となるkneeを採用する。+6以上は
  平均到達階が深くなり素材EV/時間が悪化するため採用しない。
- 再現可能な測定値・条件・候補比較は
  `scratch/results/issue-528-class-sustain-phase2.md` を正本とする。

## 魔術師の死亡律速対策（Issue #534）

- 魔術師の初期HPは `21`、レベルアップ時のHP成長は `4..6` とする。正本は
  `src/state/initial_state.js` と `src/systems/leveling.js`。
- #534では現行 Mage のB5死亡率15.8% [12.3,20.2; N=322]を通常戦闘・宝箱罠・床罠・
  bossの死亡直前source、`killHeal`発動実績、HP比で分解した。`killHeal`増量、
  `trapGuard`増量、戦闘短縮、非撃破回復も掃引したが、初期HP+2/成長+1がB5死亡
  10.3%、B10到達16.2%、平均floor6.11、素材EV/時間0.1755で最も妥当な採用点だった。
- 回復薬の供給・効果量、罠耐性、`killHeal`、他職のHP/成長は変更しない。詳細な
  候補比較・CI・再現条件は `scratch/results/issue-534-mage-death.md` を正本とする。

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

Issue #380 classification correction keeps the default material allocation,
drop quantity, and rare/boss depth gate unchanged. Explicit monster tags take
precedence over sprite predicates, with `spell`, poison flags, and strong
armor-name predicates filling measured classification gaps. Chest and beast
secondary profiles remain available to the simulation as rejected comparison
profiles; they are not production defaults. Workshop node costs and
departure-craft costs are not part of this correction.

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

The workshop is the only material sink between runs, with two systems:
permanent unlocks and departure craft.

Permanent unlocks include:

1. New classes.
2. Starting-gear options (choices offered at run start, not carried gear).
3. Skill/spell and affix pool expansions (what can appear in a run).
4. Permanent stats with an explicit cap (e.g. +5 steps per stat line). The
   cap is a pillar-level rule; never raise it casually.
5. Convenience: +1 starting identify resource, a starting return item, and
   similar small run-start kits.

Current workshop expansion (issue #410) adds measured sidegrade cores
先手必勝・罠喰い・巨人殺し・反撃の棘・盗掘王・学者の眼, a Fighter starting-gear
option (FIGHTER_SABER, atk8), and one permanent convenience node that grants
+1 starting identify powder. The six pre-existing core IDs are workshop-gated at the
adopted 10-material total per first rank; the existing `pool_blood_wand` node
remains unchanged at 7 materials. This keeps the explicit early-run access
tradeoff while adding pure content. The identify-powder node is policy-sensitive
in simulations (`IDENTIFICATION_POLICY=powder`); departure craft still owns
starting consumables. No class roster or permanent-stat cap change is part of
this expansion. The node data and material costs are source-of-truth in
`src/data/workshop.js`; advanced classes remain deferred. Core measurement gaps
are tracked separately in issue #416.

Departure craft is the separate run-start path: choose quantities per recipe,
pay their material costs for that run, and carry the crafted consumables into
the run. There is no recipe-count or item-count cap; the available material
balance is the only purchase limit. Leaving without crafted items remains
valid.

Defer: dismantling, random-property crafting, and any feature that replaces
the in-run build system. Builds live inside the run.

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
