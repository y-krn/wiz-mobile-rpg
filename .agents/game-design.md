# Game Design: Meta Economy

This document records the economy design for the solo depth-attack roguelite:
materials as the only currency, the workshop unlock tree, milestone merchants,
and run quests. It is the economy-level refinement of
`.agents/game-design-core-loop.md` (core loop, pillars, pacing targets).
Resolve conflicts toward that document.

Exploration trap principles are canonical in the `Trap exploration design`
section of `.agents/game-design-core-loop.md` (Issue #931). This document owns
the trap-sustain and counterplay values recorded below; it does not redefine
route selection, map reachability, or Simulation responsibility boundaries.

## Combat damage model

Physical and offensive-spell formulas, their application order, measured
contribution breakdowns, and model-level decisions are canonical in
`.agents/game-design-combat-model.md`. This document remains canonical for
meta-economy, status-effect, and trap-sustain rules; numeric combat values and
execution remain in `src/`.

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

- Exploration poison is a finite exploration risk, not a permanent per-step
  tax: when poison is applied, its exploration duration is rolled once from
  7–12 steps. On each exploration step it has a 30% chance to deal 1–2 HP
  damage, then expires when the rolled window reaches zero. The canonical
  values live in `src/combat_logic/status_effects.js`; combat-round poison
  keeps its existing round timing and application rules.
- Antidote, Holy Water, Panacea, LATUMOFIS, and healing recovery remain valid
  immediate counterplay. The finite window lowers the chance that poison alone
  ends a run while preserving the decision to spend a cure when HP or the
  remaining route makes waiting unsafe. Existing legacy poison records without
  a timer remain readable and receive the finite exploration window lazily on
  their next exploration step.

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

- 戦士は `trapGuard=40`、魔術師は `trapGuard=60` をクラス固有passiveとして持つ。
  正本は `src/data/classes.js`、適用処理は
  `src/rules/trap_effect_rules.js` の `applyTrapGuardToEffect` とする。
- 軽減対象は床罠・宝箱罠・B5F限定の火炎の罠のHPダメージ成分だけで、正のダメージは
  最低1を維持する。床罠の発見・解除、MP drain、毒・盲目・転送などの非HP効果は変更しない。
  盗賊・僧侶と上級4職の既存passiveも変更しない。
- 火炎の罠はB5Fの通常歩行で5%発火し、発火時に「熱気の気配」をログ表示する。
  装備と職業パッシブの `trapBonus` の合算値（`getCharTrapBonus`）は、
  `src/rules/character_stats.js` の `getPartyFlameTrapWarningAvoidanceChance` で
  発動時に確率で罠を無効化する回避判定の確率へ変換する。式の正本は同関数（線形係数0.8、上限0.74）であり、
  発動時の回避判定に成功した場合は被弾しない。
- これは回復薬の常時供給ではなく、罠優位の浅層で戦士・魔術師が薬を使い切るまでの
  時間を延ばす設計である。期待されるプレイヤー影響は、罠を踏んだ際の即時HP損失と
  浅層の薬枯渇を緩和し、盗賊・僧侶の到達性を維持すること。
- Issue #516 の再現可能な測定値と採用候補の比較は
  `evidence/results/issue-516-class-sustain.md`、#461再基準線は
  `evidence/results/issue-461-baseline.md` を正本とする。

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
  `evidence/results/issue-528-class-sustain-phase2.md` を正本とする。

## 魔術師の死亡律速対策（Issue #534、#537で更新）

- #534の採用値は初期HP `21`、レベルアップ時のHP成長 `4..6`。#537で基礎HP順序を
  優先し、現行値は下記「基本4職HP順序（Issue #537）」へ更新した。
- #534では現行 Mage のB5死亡率15.8% [12.3,20.2; N=322]を通常戦闘・宝箱罠・床罠・
  bossの死亡直前source、`killHeal`発動実績、HP比で分解した。`killHeal`増量、
  `trapGuard`増量、戦闘短縮、非撃破回復も掃引したが、初期HP+2/成長+1がB5死亡
  10.3%、B10到達16.2%、平均floor6.11、素材EV/時間0.1755で最も妥当な採用点だった。
- `killHeal+10` はB10到達26.2% [22.5,30.2; N=500]まで伸ばす有効な候補であり、
  「効かない」理由で除外したわけではない。採用判定はB5死亡率を主endpoint、B10到達率
  10%を下限、素材EV/時間を経済制約とした。`killHeal+10`はB5死亡13.6%、平均floor
  7.06、戦闘55.39turn/run、素材EV/時間0.1588、採用点は順に10.3%、6.11、43.22、
  0.1755だった。前者は深く進むが戦闘時間と素材効率を悪化させ、死亡律速への直接対策
  としては後者が優位のため、`killHeal=4`を維持する。
- 当初の「`killHeal`増量では解けない」は限定的に修正する。死亡runの34.7%は撃破前に
  `killHeal`未発動で死ぬため、増量してもこの群は救えない。一方、残りのrunは撃破後の
  回復を利用でき、`killHeal+6/+8/+10`でB10到達率が14.8%/21.0%/26.2%と単調に伸びる。
  つまり増量は撃破前死亡を解消せず、撃破後の累積損耗と深度を改善する。
- `killHeal+10`は汎用supportの基準値2、現行Fighter+2/Mage+4に対して突出した
  class passive値（Mage現行の2.5倍）となり、将来職の同trigger設計にも新しい基準を
  要求する。初期HP+2/成長+1は撃破triggerを増幅せず、初回戦闘から全階層で効く静的耐久
  としてMageの脆さを残し、将来職にもHP成長軸で一貫して比較できる。両候補ともMageのみ
  の介入で他3職B10 entrant差は0.0pt。
- #534の候補比較・CI・再現条件は `evidence/results/issue-534-mage-death.md` を正本とする。

## 基本4職HP順序（Issue #537）

- 基礎HP・レベル成長の不変条件は `戦士 > 盗賊 > 僧侶 ≧ 魔術師`。
  僧侶と魔術師の同値は、僧侶が回復呪文を持つため許容する。
- 現行値は、戦士 `20 / 7..9`、盗賊 `15 / 5..7`、僧侶 `14 / 4..6`、魔術師
  `14 / 4..6`（基礎HP / レベル成長）。正本は `src/state/initial_state.js` と
  `src/systems/leveling.js`。
- 魔術師はHPを盛らず、#537時点では `trapGuard=70`、`mpWard=10`、`killHeal=10`で
  浅層の罠・MP・撃破後回復を補った。上位呪文導入後の採用値は下記「上位呪文と
  魔術師sustain（Issue #538）」へ更新した。正本は `src/data/classes.js`。
- Issue #537 focused sweep（上位呪文導入前、seed=461、各候補・職N=500、calibration
  N=100）では、`HP14 / trapGuard70 / mpWard10 / killHeal10`がB5死亡 **8.16%**、
  B10到達 **26.6%**、平均floor **7.39**、戦闘 **54.27turn/run**、被弾
  **46.27turn/run**、素材EV/時間 **0.1623**だった。この値は#538の上位呪文導入前
  基準線として保持する。
- 上位呪文導入前の最終 #461 N=3000 では、Mage B5死亡 **10.4% [9.2%, 11.7%]**、B10到達
  **28.0% [26.4%, 29.6%]**、平均floor **7.63 [7.45, 7.81]**、A1 **成立**。
  Fighter/Thief/PriestのB10到達は **27.9% / 19.2% / 27.5%**で、既存基準と同等。
- #534の`killHeal+6/+8/+10`単独掃引は再利用し、同じ条件を再測定しない。#537では
  HP順序候補、`mpWard`、罠軽減・撃破回復の併用だけ新規測定した。詳細な候補表・CI・
  実行条件は `evidence/results/issue-537-mage-hp-order.md` を正本とする。

## 上位呪文と魔術師sustain（Issue #538）

- 基本4職の戦闘自動選択は `src/combat_logic/auto_action.js` の共有関数を正本とする。
  魔術師は敵数・残HP・残MPに応じて単体/全体の上位呪文を選び、僧侶は回復要求時に
  `MADIOS`→`DIOS`を選ぶ。`DIOS`を持つ僧侶は攻撃呪文後にMP1を残す。
- 上位呪文導入後、魔術師passiveは `trapGuard=60`、`mpWard=8`、`killHeal=8`を採用する。
  罠軽減・MP障壁・撃破回復を同時に下げても、HP順序（戦士 > 盗賊 > 僧侶 ≧ 魔術師）を
  変えず、過剰な撃破回復5倍を是正する。正本は `src/data/classes.js`。
- seed=461、同一runner、各case・職N=3000、calibration N=1000の補正掃引では、
  現行70/10/10のMage B5死亡 **6.0% [5.1,7.0]**、B10到達 **37.2% [35.5,38.9]**に
  対し、採用60/8/8はB5死亡 **11.2% [9.9,12.5]**、B10到達 **28.2% [26.6,29.8]**。
  戦闘は **59.97→46.71turn/run**、被弾turnは **49.24→38.28**、素材EV/時間は
  **0.1664→0.1658**、他3職B10 entrant差は **0.0pt**。率はWilson 95% CI、平均は
  正規近似95% CIで、詳細と再現条件は `evidence/results/issue-538-upper-spells.md` を正本とする。
- 同測定でMageのMP枯渇率は採用値 **30.3% [28.7,32.0]**、PriestのreserveMp違反run率は
  **0.0% [0.0,0.1]**。上位呪文別の実使用・適用率も同結果ファイルに記録する。
- 採用後の#461 N=3000基準線はA1 **成立**。MageはB5死亡 **11.5% [10.2,12.8]**、
  B10到達 **27.3% [25.8,29.0]**、平均floor **7.35 [7.19,7.50]**。Fighter/Thief/Priestの
  B10到達は **28.1% / 19.2% / 27.2%**で、他3職を悪化させず、PriestのB5撤退は **0.0%**。

## MP障壁の浅層物理被弾調整（Issue #780、incoming scale は #966 で更新）

- 魔術師の `mpWard` は **1** を採用する。正本は `src/data/classes.js`、発動条件は
  `src/combat_logic/round.js` の `getMpWardDef`（MP>=1の間だけ有効）であり、敵通常攻撃と
  逃走追撃の共通 `finalDef` へ加算する。最低1ダメージ、ミス/回避0、incoming scale=4、
  `calculatePhysicalDefenseFormula` と `reduceIncomingDamage` の順序は変更しない。
- Ged相当の装備DEF=1、VIT=8、Mana Drain ATK=4を実 `runCombatRoundCalculation` で固定乱数測定した。
  現行8は `finalDef=11`、`defResistance=0.8462`、ATK4/5/6/7の通常被弾が
  `formulaDmg/finalDmg=1/1/1/1`。候補1は `finalDef=4`、`defResistance=0.6667`、
  `1/1/2/2`となり、MP0は `finalDef=3`、`defResistance=0.6`、`1/2/2/2`を維持した。
  候補0はMP0と同値で障壁の意味を失い、候補2は `finalDef=5`、`defResistance=0.7143`、
  `1/1/1/2`だったため、最小の正値である1を採用した。
- #966では、敵→プレイヤー通常攻撃と逃走追撃の共通曲線を
  `scratch/simulations/sim_physical_defense_curve.js` で比較した。Mageの浅層DEF4・深層DEF14、
  DEF15–20のtank、現行装備のFighterを、現行遭遇表の通常敵（各層low/typical/high、0..3乱数）で
  評価し、scale=4/8/10/12/16、単純減算、ATK/DEF比を候補にした。scale=8は深層の1ダメージ張り付きを解消するが、
  production-backed N=500 runでB5到達率と素材収入を大幅に損なったため不採用。scale=4は
  `defResistance=DEF/(DEF+4)` としてその回帰を抑え、workshop-completeのB5到達率を基準線比
  Fighter -2.0pt、Mage -5.4pt、Thief -0.6pt、Priest -3.0ptに収めた（同一seed/config、
  N=500、calibration N=100）。
- 同一seed/configの実run sim（`generateRunFloor`→実round、seed=780、N=300、calibration=100、
  `workshop-empty`/`workshop-complete`、B5/B10/B15/B20）を変更前後で比較する。MageのMP active/empty
  分布、Fighterを非対象controlとして追跡し、`mpWard` 以外の職・敵データ・共通式は変更しない。

## 回復呪文の梯子（Issue #590）

- `MADI` はlv5習得を維持し、対象を単体へ変更する。説明文と実装値は
  `src/data/spells.js`、効果の正本は `src/systems/spell_effects.js` とする。
- 数値とcostは未確定。seed=590、`workshop-complete`、各条件N=500・calibration N=100の
  回復量5段階×cost3段階掃引では、回復量を変えても同じcost内のB5/B10結果が
  ビット単位で一致した。CIの重なりではなく、回復量の差が結果へ伝わっていない。
- 原因はHP上限飽和。例として平均回復75、post=64、postHp=1391では、
  実効回復は `postHp / post = 21.7 HP/回`、上限飽和率は
  `1 - 21.7 / 75 = 71.0%`。量では `MADIOS` と区別できないため、採用値は
  オーナー判断まで決めない。詳細な生表と選択方針の監査はIssue #590のPR本文へ記録する。

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

Issue #413 Phase 1 adds two non-consumable meta key items. The first B5 and B10
milestone boss victories grant `FORGE_SEAL` and `ABYSS_SEAL`, respectively. Each
key reveals one new workshop branch and remains outside run inventory. The gated
node still costs 10 existing materials: `鉄片7 + 竜鱗3` for the B5 branch and
`黒角7 + 竜鱗3` for the B10 branch. The branches add one sidegrade core each;
they do not gate existing nodes, increase material income, raise stat caps, or
add a retreat guarantee. This phase intentionally does not change `SAVE_VERSION`.

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

After a milestone boss is defeated, an additional down stair opens at the
boss cell. It is an optional shortcut: the original stair remains available,
so the player can still visit the milestone merchant or return portal before
descending.

### Camp placement after milestone bosses

Camps are placed on the floor immediately after each milestone boss: floors 6,
11, 16, and 21. The former biome-band random placement is retired; the biome
supplies only the camp display name. Recovery remains 40%, the
`CORE_CAMP_MASTER` multiplier is unchanged, and milestone bosses still appear
every fifth floor.

Stock, priced in materials:

- Identify resources.
- Consumables (healing, counterplay items — keep counterplay cheap and
  available; accessibility outranks scarcity for this category). The milestone
  merchant stocks `EYE_DROPS` (目薬) at `霊粉` 1; it follows the normal
  affordability and 20-slot inventory checks. `PANACEA` is not merchant stock
  without an authoritative merchant price.
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
- The enemy codex records facts observed during adventures rather than exposing
  hidden data as a strategy guide. Combat actions, conditions, resistances,
  loot, and encounter floors are added only when observed; unknown information
  remains unknown without revealing its total or an optimal answer.

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
