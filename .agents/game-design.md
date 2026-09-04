# Game Design: Meta Economy

This document records the economy design for the solo depth-attack roguelite:
materials as the only currency, the workshop unlock tree, milestone merchants,
and run quests. It is the economy-level refinement of
`.agents/game-design-core-loop.md` (core loop, pillars, pacing targets).
Resolve conflicts toward that document.

**Canonical vNext source:** [#973 comment 5479686603](https://github.com/y-krn/wiz-mobile-rpg/issues/973#issuecomment-5479686603).
The Core Loop vNext contract is the design target for Town, Castle, Codex,
Workshop, inventory, and run outcomes. Older economy decisions and measured
values remain historical evidence when explicitly labeled; they are not
current vNext behavior.

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

**Build vNext migration status (Issue #1042, 2026-09-03).** The departure
screen chooses a named `startingKit` built from ordinary equipment bases. Class
labels no longer authorize equipment, prune Loot candidates, or gate Core
generation/effects. The legacy `class` field and its passive, level-growth,
spell, MP-item, trap, and telemetry consumers remain explicit follow-up
dependencies; this document's older class-balance sections are historical until
those responsibilities are migrated.

## Goal

One currency, one sink, one question:

Five-floor trial implementation (#1010) is a run-pacing layer, not a new
economy or currency. A deterministic main/sub theme pair changes the soft
weight of existing encounter costs and the fourth-floor opportunity rate;
Portal signals describe the already-resolved next band without exposing exact
odds. It must not create a build-specific loot guarantee or a mandatory
consumable tax.

```text
run ends -> outcome determines what value is recovered ->
Castle records what happened, Codex records what was understood, Workshop
expands what may exist in future runs ->
descend again
```

Every economic knob must serve "descend again, deeper." Any loop that pays
better than descending (farming a shallow biome forever, merchant arbitrage)
is a bug in the economy.

## Magic ownership (Issue #1046)

Starting-kit runs use a universal base `maxMP=1` and `currentMP=1`; level and
the compatibility `char.class` do not grant magic. A medium is an ordinary
weapon-slot item. The current medium contributes its own max-MP capacity and
Rune slots only while equipped. The structural medium defaults are WAND +2/1,
SAGE_STAFF +3/2, ARCH_WAND +4/3, and HOLY_STAFF +2/1 (max MP / Rune slots).

The active spell set is exactly the Rune spell keys socketed in the equipped
medium. `char.spells[]` remains readable only for legacy character fixtures;
it is not a starting-kit truth source. Socketed Runes are medium-side build
state and do not consume bag slots. Spare `RUNE_<spell>` objects are ordinary
one-slot dungeon loot. Equipping a medium never restores current MP; when the
derived max MP falls, current MP is clamped to the new maximum. Swapping or
unequipping a medium safely returns its socketed Runes to the ordinary bag.

The arcana starting kit uses the regular WAND medium and the regular HALITO
Rune (cost 1), which provides the minimum one-cast magic trial without a
class/origin passive. Rune supply is added to ordinary chest candidate pools
without reading the current build or pairing a medium with a Rune.

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

### Role-based treatment inventory (Issue #961)

Treatment planning uses three role groups rather than adding one consumable for
each future status:

- persistent hazard: `ANTIDOTE` is the stable preparation route for poison;
  `HOLY_WATER` is a rare recovery-plus-poison emergency item and is not
  departure-craftable.
- broad cleanse: `PANACEA` is the rare multi-status option for poison, blind,
  paralysis, and sleep; `ELIXIR` is cataloged as an unreachable legacy
  broad-cure definition because it has no current supply route.
- targeted fallback: `EYE_DROPS`, `PARALYZE_CURE`, and `WAKE_POWDER` remain
  legacy specialist countermeasures while their measured use is reviewed;
  they are not a template for adding more status-named items.

The role catalog is `src/data/status_treatments.js`. Adding a new status does
not imply adding a new cure item. First compare natural expiry, spell cure,
existing broad cleanse, and the status's observed loss. `poisonWard` and
generic `statusResistance` equipment are an inventory-neutral alternative:
they trade an equipment affix opportunity against carrying treatment items, so
they must be included in future supply comparisons. The 20-slot inventory
capacity is unchanged.

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
- #780時点の scale=2 固定乱数測定では、Ged相当の装備DEF=1、VIT=8、Mana Drain ATK=4に対し、
  mpWard有効時 `finalDef=11` / `defResistance=0.8462` / `1/1/1/1`、無効時
  `finalDef=3` / `defResistance=0.6` / `1/2/2/2`だった。これらは旧式の履歴値であり、
  現行 scale=4 の正本値ではない。
- #966後の同条件では、mpWard有効時 `finalDef=4` / `defResistance=4/8=0.5` /
  ATK4/5/6/7の `formulaDmg/finalDmg=2/2/3/3`、無効時 `finalDef=3` /
  `defResistance=3/7≈0.4286` / `2/2/3/4`となる。障壁の +1 DEF と最低1ダメージ、
  ミス/回避0、適用順序は維持され、scaleだけを更新した。
- #966では、敵→プレイヤー通常攻撃と逃走追撃の共通曲線を
  `scratch/simulations/sim_physical_defense_curve.js` で比較した。Mageの浅層DEF4・深層DEF14、
  DEF15–20のtank、現行装備のFighterを、現行遭遇表の通常敵（各層low/typical/high、0..3乱数）で
  評価し、scale=4/8/10/12/16、単純減算、ATK/DEF比を候補にした。scale=8は深層の1ダメージ張り付きを解消するが、
  production-backed N=500 runでB5到達率と素材収入を大幅に損なったため不採用。scale=4は
  `defResistance=DEF/(DEF+4)` としてその回帰を抑え、workshop-completeのB5到達率を基準線比
  Fighter -2.0pt、Mage -5.4pt、Thief -0.6pt、Priest -3.0ptに収めた（同一seed/config、
  N=500、calibration N=100）。これはscale=4を暫定再校正として採用する根拠であり、最適値の確定ではない。
  深層DEF14–20で残る1ダメージ率はPostHog実測で再評価する。formula anchorのFighterはB1初期装備のみのため、
  深層Fighterの安全性はproduction-backed runの結果を根拠とし、formula anchorからは推定しない。
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

## Run outcome and inventory contract

The object-loot outcome contract is canonical in
`.agents/game-design-core-loop.md` and supersedes the old percentage-only
banking description:

- Portal confirms all unconfirmed object loot and ends the run safely.
- Push confirms nothing and destroys nothing; it keeps unconfirmed loot at
  risk until the next Portal.
- Wing is a manually activated, immediately safe escape. Its candidate pool is
  the run's unconfirmed object loot, including dungeon equipment that was
  identified after acquisition but is currently equipped; only a small
  selected number is rescued. It is consumed and at most one is carried into
  a run.
- Death loses unconfirmed object loot by default.
- Abandon has the same unconfirmed-loot loss as Death but remains a distinct
  run outcome and is not a free Wing.

The bag is fixed at 20 ordinary slots. Equipped items are outside the bag;
spare equipment, consumables, unknown items, curios, and Wings compete for
one slot each. Town supplies use the same bag, items do not gain special
Safety/Wing/treasure compartments, and removing equipment into a full bag
requires discarding something. Town-brought consumables are consumed only when
used and unused stock returns after the run; dungeon-acquired consumables are
unconfirmed run loot. No permanent bag expansion is part of vNext.

**Current implementation status:** the repository implements the Return Wing,
run-outcome, material-banking, and fixed 20-slot inventory slices. Remaining
vNext work must identify its own contract boundary rather than reopening these
ownership or capacity rules.

Unknown equipment now persists its information state per item: discovery,
observation, trial, or full understanding. Dungeon carrying and equipment use
may disclose truthful signs and the main function, while complete
identification remains the exact-detail path. The compatibility `identified`
flag, hidden affixes, and curse binding continue to survive save/load.

### vNext object-loot ownership (Issue #1006)

Materials keep the rules above. Separately, dungeon-acquired equipment,
consumables, Return Wings, and valuable objects are unbanked object loot until
the run ends. A milestone Portal confirms all of it for the terminal result; a
Return Wing consumes itself and confirms only the selected small subset
(initial count 2); death and abandon lose the unbanked subset. Unused Town
preparation consumables are returned to
Town storage at every run terminal, while consumed Town items are not restored.
Returned dungeon consumables and Return Wings become Town preparation stock;
returned dungeon equipment remains terminal-result evidence only and does not
enter Town storage or the next run. Equipped state does not imply banked
ownership.

## Workshop (Between Runs)

### Design target / vNext contract

The Workshop expands what may exist in future runs. It is horizontal
possibility expansion, not a targeted build shop:

- do not increase the appearance rate of a chosen item, affix, or build;
- do not add a permanently superior combat tier;
- do not preserve recovered dungeon equipment as next-run combat gear;
- prefer small unlocks that come automatically from adventure results rather
  than a farmable target path;
- adding candidates must not simply dilute the existing candidate supply.

The Workshop should broaden combinations involving HP, MP, status, actions,
and curses while keeping the run's improvised build and resource competition
as the source of power.

Automatic pool unlocks use reserved same-slot side-grade slots: an unlocked
possibility replaces its authored baseline slot rather than adding a new
weighted candidate and diluting the existing supply.

Issue #1009 implements the loot-side boundary of that rule. `lootRole` selects
a soft supply target, which weights matching affix/Core candidates while
retaining crossover; `buildRole` and `buildRoles` describe the resulting
affix composition. The B1–B30 candidate tables widen deep supply without
removing old bases, and `LOOT_ROLE_SUPPLY_BY_BAND` keeps every role available
with increasing deep-role weight. Generation does not inspect current
equipment or fill missing slots. Core entries explicitly classify their
`buildAxis` as `main` or `auxiliary`, while Support entries use `support`.
An equipment decision that changes the `main` Core axis is observable as a
build transition; auxiliary Core and Support changes remain ordinary swaps.
This is lightweight observation, not full telemetry analysis.

### Current implementation boundary

The current repository still exposes a material-funded permanent-unlock tree
for classes, starting options, spell/affix pools, convenience, and capped
stats, plus separate departure craft. Those nodes and costs are retained as
implementation history and compatibility context. They must not be described
as the final vNext contract until the corresponding implementation issues
reconcile them with the horizontal possibility model.

Historical workshop categories include:

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

Departure craft remains a separate current run-start path: choose quantities
per recipe, pay their material costs for that run, and carry the crafted
consumables into the run. Its vNext boundary is the shared 20-slot bag; do not
hide a capacity problem by inventing arbitrary per-item carry caps.

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

Run-scoped contracts/quests are optional supporting content, not a second
progression axis. They must point the player deeper or into meaningful risk,
expire with the run, and never create a shallow farming loop. The current
departure-board selection flow and its reward values are implementation
history; any future contract change must preserve the depth question.

## Records And Codex

Core Loop vNext observation events are specified separately in
`.agents/game-design-telemetry.md`. They measure Castle/Codex-relevant facts
such as object-loot ownership and meaningful build shifts, but do not change
the persistence contract or define balance targets.

- **Castle = what happened:** record outcome, depth, Portal/Wing/Death/Abandon,
  representative items, recovered/rescued/lost value, and meaningful item
  history. Generate display copy from persisted facts; do not save prose as a
  substitute for facts.
- **Codex = what was understood:** record observed facts and hypotheses about
  equipment and enemies. Unknown items progress from signs to observation to
  trial to full understanding. Do not reveal undiscovered affixes, hidden
  totals, or an optimal build.
- Existing first-kill and split-spawn rules remain implementation details and
  historical evidence until rechecked against the vNext information contract.

## Avoid

- A second currency, or any gold reintroduction.
- Merchant arbitrage: nothing a merchant sells may be bankable or resellable
  at profit.
- Uncapped permanent stats, or unlocks that raise material income enough to
  make farming dominate descending.
- Recovered dungeon equipment becoming permanent next-run combat gear.
- Workshop paths that target a chosen build by increasing its appearance rate
  or by exposing a permanently superior tier.
- Permanent bag expansion or dedicated loot/safety compartments.
- Making identify resources cheap enough that the identify-or-gamble choice
  disappears (see pillar 3).

## Castle / Codex / Workshop return processing (#1011)

Castle records the run outcome and its evidence: depth, return route,
representative item, recovered/rescued/lost object counts, and a bounded list
of meaningful individual facts. Codex stores finite coarse insights from
encountered equipment; it never answers exact probabilities, hidden candidate
totals, or the optimal build. Workshop can unlock an existing side-grade
possibility automatically after a deep equipment return, but never grants a
vertical tier or a target-build/drop-rate advantage.

All ordinary dungeon objects are processed automatically at the result
boundary. Returned dungeon consumables become Town preparation stock, while
returned equipment is converted to terminal evidence only and is excluded from
Town storage and the next run's starting battle inventory. Death and Abandon
discard unbanked dungeon objects while retaining only their permitted history
and knowledge.

## Build vNext level boundary (#1044)

Starting kits share one compatibility character baseline. Level is a run-local
minimum floor: every successful level-up uses the common EXP table and adds a
fixed `+5 max HP` baseline, restoring the same HP amount. It does not add MP,
base stats, spells, critical chance, melee scaling, Core permission, or Rune
permission. The value is intentionally provisional until universal MP and
medium/Rune ownership are implemented.

`CLASS_PASSIVES` and the legacy class critical/melee tables are retained only
as compatibility surfaces; production resolvers return neutral values. Active
run UI identifies the adventurer by name, level, and current equipment rather
than displaying the compatibility class. Historical class fields in saves,
telemetry, and old records remain readable until their ownership is migrated.

Deferred ownership: universal MP, spell/Rune ownership, mana-item permission,
and any useful former class passive become medium, Rune, Core, or Support
systems in the follow-up issues. Base stats remain compatibility fields and are
not permission gates.
