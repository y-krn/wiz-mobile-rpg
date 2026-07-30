# Issue #271: `atk` / `def` support affix 調査・実測

## 2026-07-30 Phase 1 途中経過

- 作業ブランチ: `fix/atk-def-affix-unread`
- 起点: `origin/main` `39a0b04`
- `generateRandomEquipment` の `addAffix` 登録は、固定38種と動的6能力値を合わせて44種。
- 最新 `origin/main` では、装備インスタンスの `affixes[].atk` / `affixes[].def` は
  `getItemData()` が `atkBonus` / `defBonus` へ加算している
  (`src/rules/item_rules.js` の `aff.type === "atk"` / `"def"` 分岐)。
- `getCharWeaponAtk()` / `getCharDef()` は `getEquippedItemData()` 経由で上記加算済み値を読む。
  したがって、生成された鑑定済み装備の `atk` / `def` support affix は現状でも有効。
- 手動確認:
  - `SHORT_SWORD`（基礎攻撃6）+ `atk:4` → `getCharWeaponAtk() === 10`
  - `LEATHER_ARMOR`（基礎防御4）+ `def:3` → `getCharDef() === 7`
- この状態で getter に `getCharAffixSum(char, "atk" / "def")` を追加すると、
  同じ `affixes[]` を `getItemData()` と `getCharAffixSum()` の両方が読み、二重計上になる。
- 同じ経路で `hp` / `mp` / `str` / `int` / `pie` / `vit` / `agi` / `luk` /
  `trapBonus` も `getItemData()` にマージ済み。
- 刻印は別経路 (`eqKey.inscription`) で、`getCharAffixSum()` だけが読む。
  `src/data/tags.js` の `fire` (`atk:3`) / `iron` (`def:3`) は、
  現行 `getCharWeaponAtk()` / `getCharDef()` には反映されない。
- クラスパッシブに `atk` / `def` 付与なし。
- 44種の生成supportのうち、完全未消費候補は `identifyDiscount`。
  現行鑑定は固定の鑑定粉1個を消費し、割引値を参照しない。
- `trapBonus` は宝箱罠解除で消費される一方、フロア罠は既知Issue #222の
  `disarmBonus` 読み違いがあり、フロア罠側では無効。

次: 44種の消費表を確定し、修正対象を「生成affix」ではなく「刻印経路」とするか、
実src before測定も含めて差分の意味を検証する。

## Phase 1 消費監査

`addAffix` の固定登録は38種。`stats.forEach()` の6能力値を含む実生成typeは44種。

### `getItemData()` で装備実効値へマージ後、個別getterが消費（11種）

- `atk` → `atkBonus` → `getCharWeaponAtk`
- `def` → `defBonus` → `getCharDef`
- `hp` → `hpBonus` → `getCharMaxHp`
- `mp` → `mpBonus` → `getCharMaxMp`
- `str` / `int` / `pie` / `vit` / `agi` / `luk` → `statsBonus` → 各能力getter
- `trapBonus` → `trapBonus` → `getCharTrapBonus`

### `getCharAffixSum()` / `getPartyMaxAffix()` 経由で消費（32種）

- 戦闘攻撃: `followUp`, `arcane`, `devotion`, `deepAssault`,
  `fullHpDamage`, `firstTurnAttack`, `antiUndead`, `antiDragon`,
  `antiBeast`, `antiSpirit`, `antiDemon`, `spellAccuracy`, `killHeal`,
  `followUpMp`, `hitFlinch`
- 戦闘防御: `guardian`, `spellGuard`, `poisonWard`, `firstStrike`,
  `frontGuard`, `rearEvasion`, `firstStrikeDefense`, `lastSurvivorStats`,
  `statusResistance`
- 探索・経済: `treasureSense`, `hearRange`, `arcaneSense`, `traceRead`,
  `victoryMaterial`, `stairsHeal`, `materialFind`, `contractReward`

### 完全未消費（1種）

- `identifyDiscount`
  - B1から生成される。
  - Bishopクラスパッシブと`appraisal`刻印も同じtypeを与える。
  - 現行鑑定処理は固定で鑑定粉1個を消費し、割引値を一度も参照しない。
  - `atk` / `def`修正とは別 concern。別Issue対象。

### 部分不整合

- `trapBonus` は宝箱罠解除では有効。
- フロア罠解除は `disarmBonus` を読むため無効（既知Issue #222）。

### `atk` / `def` の二重計上リスク

装備インスタンスには以下が別々に存在する。

- ベース装備値: `ITEMS[baseId].atk` / `.def`
- support affix: `item.affixes[].type === "atk" / "def"`
- 刻印: `item.inscription.type === "atk" / "def"`
- 呪い補正: `CURSE_EFFECTS[*].mod.atk / .def`
- 強化値: `enhanceLevel`

現行 `getItemData()` はベース、support affix、呪い、強化を合算する。
現行 `getCharAffixSum()` はsupport affix、刻印、呪い、クラスパッシブを合算する。
したがって `getCharWeaponAtk()` / `getCharDef()` へ単純に
`getCharAffixSum("atk" / "def")` を加えると、support affixと呪いが二重計上される。

### 刻印・クラス

- `src/data/tags.js`
  - `fire`（火印）: `atk +3`
  - `iron`（鉄印）: `def +3`
  - 現行getterでは刻印分だけ未反映。
- `src/data/classes.js`
  - `atk` / `def` を与えるクラスパッシブなし。

## Phase 2 実装

- `src/rules/item_rules.js`
  - `getItemData()` の既存support affix合算を維持。
  - 火印 (`inscription.type === "atk"`) を `atkBonus` へ1回加算。
  - 鉄印 (`inscription.type === "def"`) を `defBonus` へ1回加算。
  - `getCharAffixSum()` の単純加算は採用せず、生成supportと呪いの二重計上を回避。
- `scratch/test_core_affixes.js`
  - 基礎値 + support + 刻印 + `runTrapAttackBonus` の正確な合算を追加。
  - Ninja素手 `2 * level` の回帰テストを追加。
  - 新規期待値を一時的に反転し、exit 1を確認後に復元。
  - focused test exit 0。

## Phase 3 修正前 N=2,000

条件: 工房解放済み（帰還の翼あり）、seed=2715、`SIM_PARALLEL=15`、
calibration N=500。`scratch/sim_issue_271_resistance_integrity.js`。

- run 2,000、B5 event 645、attempt 846
- B5勝率: event 4.2%、attempt 3.2%
- 職別event:
  - Fighter 27/59 = 45.8%
  - Thief 0/198 = 0.0%
  - Priest 0/159 = 0.0%
  - Mage 0/107 = 0.0%
- damage/combat turn 12.92、HP230理論 17.80 turn
- 物理平均 6.82/hit、LAHALITO平均 16.52/hit

残KPIと`atk`/`def`装備率・実効寄与はrows解析で追記する。

## Phase 3 before / after N=2,000

解析: `scratch/analyze_issue_271_atk_def_affix.js`（exit 0）。
詳細: `scratch/results/issue-271-atk-def-comparison.md`。

- before/after rows: byte完全一致
- B5勝率: event 4.2% → 4.2%、attempt 3.2% → 3.2%
- 職別event:
  - Fighter 27/157 = 17.2% → 同一
  - Thief 0/214 = 0.0% → 同一
  - Priest 0/166 = 0.0% → 同一
  - Mage 0/108 = 0.0% → 同一
- 火力: 12.92 damage/combat turn、HP230へ17.80 turn → 同一
- 耐久: 8.54 damage/hit、死亡attempt平均1.81 hit → 同一
- `atk` support:
  - B5 event装備 52/645 = 8.1%
  - 装備時平均 +2.92、全event平均 +0.24、装備者ATK比27.9%
- `def` support:
  - B5 event装備 134/645 = 20.8%
  - 装備時平均 +2.01、全event平均 +0.42、装備者DEF比18.3%
- 平均到達 B3.99 → B3.99
- 生還 51.1% → 51.1%
- EV/時間 0.14705 → 0.14705
- 前半core遭遇 70.8% → 70.8%
- B5 boss到達 32.3% → 32.3%
- boss死/全死 50.7% → 50.7%

判定:

- 生成`atk` / `def` supportは修正前から実効寄与あり。
- 実修正対象の火印/鉄印は現行ゲームから到達不能な旧工房機能のため、run simに出現せずKPI差なし。
- event 20–35%目標未達。
- 職業格差不変。Fighterのみ17.2%、他3職0%。

## 検証

- `npm run lint`: exit 0
- `npm run test:unit`: 56/56、skip 0、exit 0
- `node scratch/test_core_affixes.js`: exit 0
- `node scratch/test_sim_reward_paths.js`: 23 sim file PASS、exit 0
- `node scratch/sim_depth_material_ev.js`
  - `SIM_PARALLEL=1`: exit 0
  - `SIM_PARALLEL=15`: exit 0
  - stdout byte完全一致
- `node scratch/sim_workshop_progression.js`: exit 0
- `node scratch/analyze_issue_271_atk_def_affix.js`: exit 0
- B5 before/after:
  - N=2,000、`SIM_PARALLEL=15`、両方exit 0
  - rows byte完全一致

## チェックリスト

### game-logic

- 採用:
  - ベース、support、刻印、呪い、強化の各入力を1回だけ合算。
  - `runTrapAttackBonus` とNinja素手分岐を回帰テスト。
  - save shape、乱数、戦闘式、バランス値は変更なし。
- 棄却:
  - `getCharAffixSum("atk" / "def")` の単純加算。
    supportと呪いを二重計上するため。

### balance-simulation

- 採用:
  - `generateRunFloor`、実combat round、報酬単一路を確認。
  - before/after同seed実測でKPI非悪化と職業格差不変を確認。
- 棄却:
  - 目標勝率へ合わせる追加調整。バグ修正外のため。

## 別Issue

- #300: `identifyDiscount` support affix が生成・刻印・Bishopパッシブから未消費。
- #222: `trapBonus` / `disarmBonus` の既知不整合。本PR対象外。
