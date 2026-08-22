# Game Design: Combat Damage Model

Issue #722 の考察成果物。物理攻撃と攻撃呪文の式、適用順、実測、設計判断を
ここに固定する。

## 正本の範囲

- この文書は、**式の構造・項の意味・適用順・モデルの性質**の正本である。
- 実行時の値、係数、職業データ、敵データ、affix の数値は引き続き
  `src/` が正本である。この文書は値を複製して別の正本にはしない。
- `.agents/game-design-core-loop.md` はソロ深度攻略、即興ビルド、職業の役割、
  レベルと装備の位置づけを定める上位正本である。
- `.agents/game-design.md` はメタ経済と状態異常・罠 sustain の正本である。
- `.agents/game-design-equipment-builds.md` は core/support affix の種類と
  取得・ビルド方針の正本である。
- `.agents/game-logic.md` はゲームルール変更時のレビュー・検証チェックリストである。
- `src/rules/character_stats.js`、`src/combat_logic/round.js`、
  `src/systems/spell_effects.js`、`src/combat_logic/spell_resolution.js` が
  実行経路の正本である。

初版の実測 base は `origin/main` の `e605411`。#731 の実装 base は
`origin/main` の `ad050fc`。#722 の既存式を土台に、決定 2 の共通項だけを追加する。
呪文の内訳を測るため、後述の telemetry を既定オフの no-op として追加した。

## 設計判断の要約

この文書で確定するモデルの性質は次のとおり。具体的な係数変更は各 Issue で
実測してから行う。

1. 軽減は、物理と呪文で**有界な乗算モデルへ揃える**。物理 `def` は
   `def / (def + k_direction)` の逓減抵抗へ変換し、`physResist` と加算プールへ統合する。
   合成後は -1〜0.9 に clamp し、100% 軽減を作らない。
2. 呪文は、上位呪文の習得だけでなく、**装備・run 内ビルドで伸びる**。共通項は
   プレイヤー表示「術力」、内部 ID `spellPower` とし、武器・鎧・盾と装身具の
   support pool から供給する。既存の `arcane` は攻撃呪文の明示入力、`devotion`
   は回復呪文の明示入力として共通項の上に残す。
3. レベルは、ビルドを置き換えない小さな戦闘力として、**物理と呪文の両方に
   明示的に寄与する**。正確な曲線は別の測定で決める。
4. タグ特効は攻撃手段を問わず共通プールへ集約し、一度だけ適用する。対象の
   `undead` / `dragon` / `demon` ごとに装備・職業の共通特効と呪文固有寄与を加算し、
   その合計を 1 回だけ乗算する。BADIOS の `spirit` 寄与は共通 3 タグ外のため、既存
   `antiSpirit` と同じ support pool に加算する。
5. 表示される装備・ステータスの単位と実効の単位は**等価**にする。記録のない
   `weaponAtk + buffAtk` だけの `1.5` はモデルとして採用しない。
6. 会心は、職業データで確率を変えられる**共通機構**にする。Ninja だけが
   呼び出し側の条件分岐で持つ現状は、仕様として記録されるまでは欠陥と扱う。
7. 上限は原則として逓減にし、投資を無価値にしない。安全性のための硬い上限を
   置く場合も、超過分の変換または別の可視効果を決める。

この更新では決定 2 を Issue #731 の配線変更として実装する。決定 4 のタグ特効は
#719 で確定済みであり、今回の変更では触れない。

Issue #730 では、非対称 9 の案 A（`magicBolt` 廃止）を採用する。#722 の
「未文書の職業補償を hidden fallback にしない」という判断と、#731/#722 決定 2 の
「呪文は装備・run 内ビルドで伸ばす」配線を適用順の前提とする。先に #731 の
`spellPower` を攻撃・回復呪文へ接続し、その後 #730 で Mage/Bishop の通常攻撃から
第 2 式と専用 telemetry を除去する。これにより通常攻撃は全職共通の物理式、命中判定、
最低 1、会心順序だけを通り、呪文の成長は明示された呪文行動と装備ビルドへ残る。

### Issue #728 PR4: 物理ヒット最低 1、ミス 0

物理攻撃は、命中判定を通ったヒットなら最終的に必ず 1 以上の damage を与える。
物理式出力と、そこから通常攻撃・追撃へ続く targeted affix、guard、会心、defend、
`reduceIncomingDamage` の各段階は 1 未満を 1 へ clamp する。これにより
高 DEF 相手への player→enemy 通常攻撃・追撃と enemy→player 通常攻撃・逃走追撃は
1 damage となり、負の入力が HP を回復させることはない。一方、盲目 miss と evasive
対象の回避は damage 式へ進まず、damage は 0 のままとする。攻撃力、DEF、耐性 pool、
乱数、命中/回避、targeted affix、guard、defend、incoming mitigation、会心の倍率・順序
は変更しない。

呪文は非対称のままにする。攻撃呪文の minimum と式、`spell_resolution` 経路、
spell 側の affix minimum も 1 のままとする。棘反撃やブレス等の PR4 対象外の特殊
damage も変更しない。

詰み・長期化への判断根拠は、現行実装の `scratch/sim_depth_material_ev.js` を
同一 seed/config で base と PR4 の各 N=500、calibration N=100、2反復で比較する。
平均到達 floor、B5/B10 pass rate、zero-damage、long-fight、retreat、death を確認し、
0 damage の発生が被ダメージの回復へ転じないことを focused test と telemetry で確認する。

## 1. 現状の式と適用順

### 1.1 記号

`floor`、`round`、`max` は JavaScript の現在の実装どおりである。

- `weaponAtk`: `getCharWeaponAtk(char)`。武器、Ninja の武器なし攻撃
  `2 * level`、武器以外の装備の `atk` を合算する。罠喰いは別項とする。
- `trapEaterBonus`: Thief / Ranger / Ninja が宝箱罠の解除に成功した回数に
  応じて +2、run 中は最大+20。床罠の解除・強行突破・破壊では発火しない。
- `firstTurnAttack`: 1 ラウンド目だけ `getCharAffixSum(char, "firstTurnAttack")`
  を `weaponAtk` に加える。
- `buffAtk`: `getBuffTotal(char, "atk") + getBuffTotal(char, "str")`。
- `str`: `getCharStr(char)`。基礎値、装備の `str`、all-stats 系を含む。
- `weaponRandRange`: `getCharWeaponPhysicalRandomRange(char)` が装備武器の
  inclusive `randRange` を返す。素手・武器 slot の非武器・不正な定義は `[0,4]`
  へ fallback する。
- `randRoll`: `min + floor(random * (max - min + 1))`。`weaponRandRange=[min,max]`
  の一様整数であり、旧来の既定値は `[0,4]`。
- `def`: `getEffectiveDef(target)`。敵 `def` に `def` buff を加え、buff は
  -6〜+6 に clamp した後、0 未満にならないようにする。物理攻撃では
  `getPhysicalDefenseResistance(def) = def / (def + k_out)` へ変換する。
  敵からプレイヤーへの物理攻撃は同じ逓減形を `k_in` で適用する。
- `physResist`: `def` 由来の抵抗と加算する対象の物理耐性。合成値は
  `combinePhysicalResistances` で -1〜0.9 に clamp する。
- `meleeMod`: `getMeleeModifiers` の値。現行の 8 職はすべて `1.00`。
- `evasionChance`: `evasive` trait を持つ敵データに明示する回避率。trait がない敵は
  0 とし、敵全体へ一律には配らない。対象は斥候・獣・コウモリ・暗殺者など、
  速さや身軽さを役割／種族で読める個体に限る。
- `hitChance`: `evasive` trait を持つ対象に対する物理攻撃の命中率。
  `clamp(0.50, 1.00, 1 - evasionChance + (getCharAgi(char) - 10) * 0.01)` とする。
  trait がない対象は 1.00 とし、AGI 10 を中立点にする。命中率の hard cap は 1.00、
  回避による下限は 0.50 とする。
- `physicalAccuracy`: `CORE_PHYSICAL_ACCURACY`（表示「必中」）が有効な装備者へ
  加える攻撃者側命中率ボーナス。core の `params.hitChanceBonus = 1` を 100
  percentage points として 1 回だけ加え、最終 `hitChance` を 1.00 に clamp
  する。同じ core を複数装備してもこの段階の効果は 1.00 を超えて積み上がらない。
- `magicResist`: spell resolution が一時的に適用する
  `getEffectiveMagicResist` の値。敵の base と buff を合成し、-1〜0.9 に clamp
  する。
- `spellPower`: `getCharAffixSum(caster, "spellPower")`。攻撃・回復呪文に共通する
  player-facing の「術力」。生成値は `AFFIX_BALANCE.spellPowerByRarity` から取り、
  floor は生成可否だけに使い、値の scaling には使わない。

### 1.2 物理攻撃の全文

物理の通常攻撃は `src/combat_logic/round.js` が次の入力を作り、
`src/rules/character_stats.js` の `calculatePhysicalAttackFormula` を呼ぶ。

```text
targetEvasion = target が `evasive` trait を持つ場合の target.evasionChance
                // trait がない敵は 0
hitChance = clamp(0.50, 1.00,
                  1 - targetEvasion + (getCharAgi(char) - 10) * 0.01
                  + physicalAccuracy)
                // targetEvasion == 0 の対象は hitChance = 1.00
physicalAccuracy = getCharCoreParams(char, "CORE_PHYSICAL_ACCURACY")?.hitChanceBonus || 0

weapon = getCharWeaponAtk(char)
       + (roundNumber == 1 ? getCharAffixSum(char, "firstTurnAttack") : 0)
trapEaterBonus = getCharTrapEaterBonus(char)
buff = getBuffTotal(char, "atk") + getBuffTotal(char, "str")
str  = getCharStr(char)
roll = floor(random() * 5)                  // 0..4
def  = getEffectiveDef(target)
defResistance = def / (def + k_out)
physicalResistance = clamp(defResistance + target.physResist, -1, 0.9)
melee = getMeleeModifiers(char)              // 現行の全職は 1.00

attackRaw = (
  floor(weapon + buff)
  + max(0, str - 10)
  + roll
) * melee
  + trapEaterBonus

formulaRaw = attackRaw
d0 = max(1, floor(attackRaw * (1 - physicalResistance)))
```

その後の適用順は次のとおり。順序を変えると同じ項でも結果が変わる。

```text
0. 攻撃者が盲目で `random() < 0.5` の場合は MISS とし、以降の式へ進まない。

1. 対象が `evasive` trait を持ち、`random() >= hitChance` の場合は AVOID とし、
   以降の式へ進まない。`hitChance == 1.00` の通常対象は判定を省略する。
   `CORE_PHYSICAL_ACCURACY`（表示「必中」）はこの攻撃者側の命中率へ
   `hitChanceBonus = 1` を加算し、PR1 の evasive 対象に対して `hitChance = 1.00`
   を保証する。通常対象の 1.00 は PR1/PR2 とも変わらない。盲目 miss はこの
   別ステージであり、必中 core は PR3 の盲目仕様を変更しない。

2. 盲目の攻撃者は step 0 で 50% miss 判定を受ける。命中した場合は
   `d1 = d0` とし、命中時ダメージを半減しない。

4. `defResistance` と `target.physResist` は上の
   `physicalResistance` へ加算済みであり、物理耐性を別乗算しない。
   d3 = d2

5. コアが持つ攻撃前の状態異常 setup は、対象が生存していて既存状態が `ok`（または
   未設定）のときだけ、`getDamageAffixResult` の評価前に 1 回判定する。setup が
   成功した同じ攻撃でも、その状態異常は EXECUTIONER の条件へ直ちに入力される。
   既存の `poisonAtk` support は従来どおり命中後に判定し、setup と同じ攻撃で対象が
   すでに毒なら重複付与しない。KATINO の sleep 付与と被弾時 wake 判定はこの stage
   の対象外である。

6. `getDamageAffixResult` の共通 target-tag stage でタグ特効を加算して一度だけ
   適用する。
   ```text
   tagBonus = Σ (getCharAffixSum(char, anti<Tag>) + spellIntrinsicTagBonus(spell, tag))
              // 対象が持つ undead / dragon / demon のタグだけを合計
   d4 = round(d3 * (1 + tagBonus / 100))
   ```
   複数タグは加算プールへ合流するため、旧 `else-if` の優先順とは挙動が変わる。
   物理と攻撃呪文はこの stage を共有し、1攻撃につき一度だけ通る。

7. 同じ `getDamageAffixResult` 内で core / support / milestone exposure を適用する。

   core の順序:
   LAST_STAND -> GIANT_SLAYER -> EXECUTIONER
   -> MILESTONE_BREAKER -> THIN_ICE_PACT

   support の順序:
   deepAssault (B3 以降)、fullHpDamage (満 HP)、antiBeast (beast)、
   antiSpirit (spirit) の合計を 1 個の乗数にする。
   その後 milestone boss exposure を乗算する。
   物理呼び出しの戻り値は max(1, round(input * multiplier))。呪文呼び出しも
   既定の max(1, ...) を維持する。命中判定前の miss / avoid はこの stage を通らず 0。

7. 対象が guard 中なら d5 = max(1, round(d4 * guard.damageRate))。

8. 対象の `canReceiveCritical` が false でなく、職業データから解決した
   `criticalChance` が当選した時だけ
   `final = max(1, d5 * 3)` とする。それ以外は `final = d5`。
   `criticalChance` は `src/data/classes.js` の職業定義から共通 resolver で取得し、
   Ninja は `min(0.15, 0.05 + 0.01 * char.level)`、他職は0とする。通常対象の
   `canReceiveCritical` は true、既存ボスの property は false とし、段1では挙動を変えない。
   `physicalPlayerHits.criticalChance` は #611 の既存 consumer 互換性のため、
   実際に会心判定可能なヒットだけ数値を記録し、非Ninjaまたは会心不可対象は null とする。
```

`applyTargetedDamageBonus` は `getDamageAffixResult` を物理へ接続する薄い wrapper
である。会心判定は guard の**後**である。#611 の `preCriticalDmg` は guard まで適用した値で、
会心の 3 倍前である。攻撃前の `evasive` 回避と盲目 miss はこの式に入らず、
この文書の「1 ヒット」は命中判定を通って式へ到達した攻撃を指す。

命中・回避は新しい敵 `agi` ではなく、既存の `evasive` trait と敵データの
`evasionChance` を使う。敵全体へ一律の回避率を付けると敵の役割が数値上同じになるため、
「斥候」「獣・コウモリ」「暗殺者」「霧・影」のように、役割または種族から身軽さを
読める個体だけへ明示する。値は低層の通常個体を 0.15〜0.22、暗殺者・徘徊エリートを
0.25 とし、HP・攻撃力・防御力はこの変更で変えない。

プレイヤー側は回避対象に対して AGI を命中の基礎投資とする。通常対象は命中率 100% を
維持し、回避対象では AGI 10 を中立点、1 point あたり 1% とする。
命中率の下限を 50%、上限を 100% にする。これにより、回避対象には外れることが起こり、
AGI の差は同じ対象に対する命中率の差として残る。PR2 の必中 core は命中率へ
100 percentage points を加えて上限へ到達させるため、回避率の種類や AGI の値を
変更せず、同じ攻撃者側 stage でのみ回避を打ち消す。

### 1.2.1 敵からプレイヤーへの物理攻撃

敵の通常攻撃と逃走追撃は、`src/combat_logic/round.js` が `finalAtk` と
プレイヤーの `finalDef` を作り、同じ `defResistance` へ変換する。プレイヤー側に
`physResist` は無いため、この経路の合成値は `defResistance` だけである。

```text
finalAtk = getEffectiveAtk(mon) + floor(random() * 4)
          // 狙撃は baseAtk の 1.5 倍を先に round してから同じ乱数を加える
finalDef = calculatePhysicalDefenseFormula({
  baseDef: getCharDef(target),
  vit: getCharVit(target),
  bonusDef: buffs + frontGuard + firstStrikeDefense + getMpWardDef(target),
  tempDefDown: target.tempDefDown
})
defResistance = finalDef / (finalDef + k_in)
formulaRaw = finalAtk
d0 = max(1, floor(finalAtk * (1 - defResistance)))
```

その後、通常攻撃は `defend` の 0.5 倍、`reduceIncomingDamage`
（守りの薬・守護・竜殺しなど）の順に適用する。対象が盲目でも
敵の物理命中ダメージは補正しない。プレイヤー攻撃と同じく、盲目は
攻撃者側の 50% miss 判定だけで扱う。
逃走追撃は `d0` から `reduceIncomingDamage` へ進む。PR4後の両経路は各段階を
最低 1 で保持する。miss / avoid はこの経路に入らず 0 であり、負の入力も最終 damage
へ渡さないため、`target.hp = max(0, hp - damage)` が HP を回復させることはない。

### 1.3 攻撃呪文の全文

対象は damage を返す 6 呪文である。`KATINO` など状態異常だけの呪文はこの式に
含めない。

```text
statMultiplier(stat)
  = getSpellStatBonus(stat)
  = 1.0 + min(0.40, max(0, (stat - 10) * 0.02))

base = spell-specific dice
stat = caster INT (HALITO, LAHALITO, MAHALITO, MADALTO, TILTOWAIT)
       または caster PIE (BADIOS)
spellPower = 1 + getCharAffixSum(caster, "spellPower") / 100
arcane = 1 + getCharAffixSum(caster, "arcane") / 100
fire   = 1 + getCharAffixSum(caster, "fireRite") / 100
        // fireRite を使わない呪文では 1

preTarget = round(base * statMultiplier(stat) * spellPower * arcane * fire)
```

`spellPower` は全ての攻撃呪文に共通する項で、`arcane` は攻撃側だけの固有項、
`fireRite` は火系だけの固有項である。従って `arcane` を共通項の代用品にはしない。
回復呪文は同じ位置で次の式を使う。

```text
healPreClamp = round(heal-specific dice
                     * statMultiplier(caster PIE)
                     * spellPower
                     * devotion)
heal = getEffectiveHealAmount(target, healPreClamp)
target.hp = min(getCharMaxHp(target), target.hp + heal)
```

回復の `devotion` は DIOS / MADIOS / DIALMA / MADI の回復固有項であり、術力と
乗算する。状態異常解除・探索・防御呪文には、damage/heal の威力項がないため術力を
適用しない。

呪文ごとの `base` と固有項は次のとおり。範囲は両端を含む。

| 呪文 | 習得 level | 対象 | `base` | stat | `fireRite` | 固有項 |
| --- | ---: | --- | --- | --- | --- | --- |
| HALITO | 1 | 単体 | `floor(random * 11) + 12` (12–22) | INT | あり | なし |
| LAHALITO | 2 | 全体 | `floor(random * 21) + 15` (15–35) | INT | あり | なし |
| MAHALITO | 3 | 単体 | `floor(random * 21) + 30` (30–50) | INT | あり | なし |
| MADALTO | 6 | 全体 | `floor(random * 31) + 30` (30–60) | INT | なし | なし |
| TILTOWAIT | 8 | 全体 | `floor(random * 51) + 50` (50–100) | INT | なし | なし |
| BADIOS | 1 | 単体 | `floor(random * 11) + 8` (8–18) | PIE | なし | `intrinsicTagBonus`: undead +50 / spirit +30 / demon +30 |

`BADIOS` の固有寄与は別の乗算ではなく、`preTarget` を共通 affix pipeline へ渡す
際の加算入力である。undead / dragon / demon の共通 target-tag stage では、対象が
持つ各タグについて `anti<Tag>` と BADIOS 固有寄与を合計してから一度だけ乗算する。
`spirit` は共通 3 タグに含まれないため、既存の support 側 `antiSpirit` に BADIOS
固有 +30 を加算する。これにより `antiSpirit` と固有 +30 は同じ support pool の
一つの乗算になり、固有寄与を二重に適用しない。

```text
spellIntrinsicTagBonus(BADIOS, tag) = {
  undead: 50,
  spirit: 30,
  demon: 30
}[tag] || 0
```

呪文全体の残りの適用順は次のとおり。

```text
1. preTarget（BADIOS は上の固有寄与を別段で乗算しない）を
   applyOffensiveAffixes(caster, target, damage) に渡す。
   これは getDamageAffixResult であり、通常の攻撃呪文では共通の
   antiUndead / antiDragon / antiDemon stage を一度だけ適用する。各タグの
   common anti tag と spell intrinsic tag bonus はその stage の加算プールへ入る。
   BADIOS の spirit +30 は共通 3 タグ外なので、既存 antiSpirit と同じ support
   pool へ入る。したがって BADIOS の固有寄与と共通 anti tag は二重に乗らない。
   core、support、milestone exposure の順序と clamp は物理の 5 と同じ。

2. spell resolution が target.magicResist を一時的に
   getEffectiveMagicResist へ置き換える。
   単体はその target、全体は各 target ごとに同じ処理を行う。

3. 呪文効果内で
   final = max(0, round(postAffix * (1 - magicResist)))
   を適用する。物理と異なり、ここは最小 1 ではなく 0 である。

4. resolution が target.hp を max(0, hp - final) にする。
```

単体呪文は支払い後、反射判定を先に行う。反射された場合は上の damage 式へ
進まない。全体呪文は生存対象へ対象ごとの base roll と耐性を適用し、反射対象は
除外する。したがって、同じ呪文でも対象ごとに乱数・タグ・affix・耐性が異なる。

## 2. 各項の根拠

「コードにある」ことと「設計として理由が記録されている」ことを分ける。
下表の「根拠不明」は現行コードが間違いだという意味ではなく、係数・形を設計
として再利用できる根拠が既存の `.agents/*.md` に無いという意味である。

### 2.1 物理

| 項 | 現在の形 | 確認できる根拠 | 設計上の扱い |
| --- | --- | --- | --- |
| `weaponAtk` | 武器・非武器装備・Ninja素手を実効単位で合算し、1ターン目補正を加える | `getCharWeaponAtk` と `round.js`。装備ビルド正本は `atk` と core を build 軸にする | 全入力源を同じ単位で扱い、個別 source を丸めずに `buffAtk` と合計してから floor する。罠喰いは weaponAtk へ混ぜない |
| `trapEaterBonus` | Thief / Ranger / Ninja の宝箱罠解除成功ごとに +2、run 中は最大+20 | `CORE_TRAP_EATER.params`、`getCharTrapEaterBonus`、`chest.js` の成功枝 | weaponAtk / meleeMod の外側で raw physical damage へ固定加算し、表示の内訳と同じ単位にする |
| `buffAtk` | `atk` buff と `str` buff を実効単位で合算 | `round.js` の呼び出し経路。`STR_POTION` は `atk +15` を 5 turn 付与する | `atk` / `str` の buff は同じ入力単位で扱う。`str` buff の live producer は未確認だが、将来の追加でも別単位にしない |
| `floor(weapon + buff)` | 実効単位の weapon / buff を合計してから切り捨て | `calculatePhysicalAttackFormula` と各 caller の入力組み立て | 0.5 単位を保持し、丸めは合計後に一度だけ行う。旧式の hidden coefficient は採用しない |
| `max(0, str - 10)` | STR 10 を基準にし、10 未満のペナルティを 0 にする | character stats の基礎値と関数の実装 | STR 10 を中立点とし、低 STR 職のペナルティだけを除く。STR 10 超の職差は残す |
| 負の呪い `atk` | `cursePower` 適用後の raw 値を丸めてから実効単位へ揃える | `getScaledCurseModifier` と `CURSE_EFFECTS` | 旧来の「raw を丸めてから物理式の1.5倍」を、保存値を実効単位にした後も同じ順序で保つ。呪いの閾値判定や他の負項は変更しない |
| `randRoll` | 武器の `randRange` による一様整数を加算。fallback は `[0,4]` | `getCharWeaponPhysicalRandomRange` / `rollCharWeaponPhysicalRandom` と `round.js` | 武器ごとの手触りを作る #727 の変更。全武器の端点平均は2.0に揃え、平均威力を変えず分散だけ変える。固定データで武器の authored identity を維持する |
| `evasionChance` / `hitChance` / `physicalAccuracy` | `evasive` trait を持つ敵だけが明示的な回避率を持ち、プレイヤー AGI で命中率を補正。`CORE_PHYSICAL_ACCURACY` は +1.00 を加えて上限へ到達させる | `src/data/monsters.js`、`getMonsterEvasionChance`、`getPhysicalHitChance`、`round.js` | 外れる軸を実データへ接続する PR1 と、同じ攻撃者側 stage で回避を打ち消す PR2。通常対象は常に 1.00、盲目は PR3、物理ヒット最低1 / ミス0は PR4 |
| `defResistance` | `def / (def + k_direction)` の逓減抵抗 | `getPhysicalDefenseResistance` と `getEffectiveDef` | 敵分布（中央値5、p75=8、最大18）を #716 の物理耐性段階へ接続し、有限値では100%に到達しない。`k_direction` は旧式の適用段階差を含めて実遭遇分布で校正する |
| `meleeMod` | 職業別 map、現行値は全て 1 | `getMeleeModifiers`。derived stats との共有を意図したコメント | 拡張点の存在は source の説明がある。現行の職業差を作る設計根拠はない |
| `max(1, floor(...))` | #728 PR4後の命中済み物理式出力 clamp | `applyPhysicalResistance` と player/enemy physical caller | 高 DEF でもヒットは1を保証する。盲目 miss / evasive avoid は式へ進まず0、呪文も最低1を維持する |
| `magicBolt` | Mage/Bishop の通常攻撃へ隠れていた第2式 | なし（#730で廃止） | #722 の未文書補償を採用しない判断と、#731/#722 決定2の明示的な呪文成長を適用したため、通常攻撃は共通物理式だけに戻す |
| 盲目 | 攻撃者側で 50% miss 判定のみ | `.agents/game-design.md` の combat disruption と本 Issue #728 PR3 | 命中時のダメージ補正は行わず、プレイヤー・敵の物理攻撃で同じ treatment policy を使う |
| `physResist` | `defResistance` と加算し、-1〜0.9へ clamp した最終 poolを一度だけ乗算 | `combinePhysicalResistances` と `getEffectivePhysicalResistance` | #719のタグ特効と同じ加算poolの前例を採用。順序依存の二重乗算を避け、表示は最終poolを段階化する |
| タグ特効 | 対象タグの `anti<Tag>` と呪文固有寄与を加算し、共通 stage で各攻撃1回 | `getDamageAffixResult`、support affix registry、`SPELLS.BADIOS.intrinsicTagBonus` | 特効という build input は equipment-builds 正本にある。物理・攻撃呪文を同じ stage へ接続し、同じタグの乗算を重ねない |
| core / support | core 5 種、条件 support、boss exposure を乗算 | `getDamageAffixResult` と equipment-builds の core/support 方針 | build の rule-changing effect である点は意図。物理と呪文の共通 hook から分けた理由は根拠不明 |
| guard | targeted bonus の後に `guard.damageRate` | `round.js` | encounter-local guard の軽減であることは source から分かる。順序の設計記録は根拠不明 |
| 会心 | guard 後、対象 `canReceiveCritical` が有効な時だけ、職業データの確率を level に適用、×3 | `src/data/classes.js`、`getClassCriticalChance`、`round.js`、`src/data/monsters.js` | 全職共通の解決段階。段1ではNinjaの既存確率・level依存・非ボス限定を、class data と target property へ移しただけで挙動を変えない。非Ninjaは確率0 |

### 2.2 呪文

| 項 | 現在の形 | 確認できる根拠 | 設計上の扱い |
| --- | --- | --- | --- |
| 呪文ごとの dice | 12–22、15–35、30–50、30–60、50–100、8–18 | `src/data/spells.js` の説明と `spell_effects.js` の roll | 呪文ごとに identity を持つことは source と description に明示。各幅を選んだ理由は根拠不明 |
| stat multiplier | `(stat - 10) * 0.02`、+40% cap | `getSpellStatBonus` | stat を spell power にする意図は読める。2% 刻みと int30 cap の根拠は根拠不明 |
| `spellPower`（術力） | 攻撃・回復の pre-target / pre-clamp 乗算 | `SUPPORT_AFFIXES`、`equipment_generation.js`、`AFFIX_BALANCE.spellPowerByRarity` | 共通の装備入力を明示する。武器・鎧・盾と装身具から供給し、値は rarity 軸のみ。hard cap は置かず、floor scaling はしない |
| `arcane` | pre-affix の乗算 | support affix registry と `spell_effects.js` | 装備で spell を伸ばす入力としては equipment-builds と接続する。係数・名称以外の成長設計は未記録 |
| `fireRite` | HALITO / LAHALITO / MAHALITO のみ乗算 | `spell_effects.js` と affix registry | 火系固有の入力として読めるが、なぜ 3 呪文だけかは根拠不明 |
| BADIOS 固有タグ | `intrinsicTagBonus` の undead +50 / spirit +30 / demon +30 を共通 pool へ加算 | `src/data/spells.js`、`getDamageAffixResult` | 現行倍率 1.5 / 1.3 / 1.3 の等価変換。spirit +30 は既存 `antiSpirit` support pool へ入り、同一寄与を二重に乗せない |
| core / support | `getDamageAffixResult` は通る | `applyOffensiveAffixes` | spell も build の一部として core/support が効く形は意図として採用する。物理タグ特効を落とす理由はない |
| magic resist | 共通 affix 後に割合乗算、最低 0 | `spell_resolution.js`、`getEffectiveMagicResist`、`spell_effects.js` | 魔法耐性の input は意図。物理 def と別の軽減形・0 clamp の理由は根拠不明 |
| `round` / `max(0)` | stat/affix/resist の各 stage で整数化、呪文は 0 可 | source | 整数表示と無効化の形は source で確定。どの段で丸めるかを選んだ設計記録はない |

## 3. 実測

### 3.1 条件と計装

既存の `state.combatFormulaTelemetry.physicalPlayerHits` と
`targetedBonuses` を使用した。物理の各入力・式前後・特殊分岐・対象 bonus は
#611 の既存計装である。

この run の開始時点では呪文には base roll、stat multiplier、各 affix stage、
magic resist 後の値を同じ 1 ヒットに束ねる計装が無かった。そのため、
`SPELL_EFFECTS` と `spell_resolution` の呼び出し経路に `telemetryEnabled` を
渡す no-op 計装だけを追加した。telemetry が無い通常 state では値・乱数消費・
分岐を変えない。呪文 trace の欠落は 0 件だった。

測定条件:

- base: `origin/main` = `e605411`
- `SIM_SEED=231`
- 8 職: Fighter / Thief / Priest / Mage / Samurai / Bishop / Ranger / Ninja
- 1 職あたり 5,000 runs、calibration 100 runs/scenario
- 目標深度 B11、出力は B1–B10
- `SIM_PARALLEL` は指定していない。runtime の解決値は 15
- 40,000 class × floor row
- シナリオ分布: empty 30、stats 74、gear 69、blood-wand 216、
  blood-wand-spells 47、complete 764（合計 1,200）
- `node --check` と N=1 試走を先に実行し、その後 full run を実行
- 既存の `scratch/sim_commit_depth_624.js` は変更していない。新しい計測 harness は
  実 sim の `simulateRun` / `runCombatRoundCalculation` / spell resolution を呼び、
  式を計測側へ写経していない

provenance helper の自動 `git fetch` は、共有 worktree の git metadata に
`FETCH_HEAD` を書けず sandbox で失敗した。そこで full run では
`SIM_SKIP_PROVENANCE=1` だけを指定し、事前に `git fetch origin main` を行って
`origin/main` が `e605411` であることを別途確認した。この環境変数は sim の
乱数・ゲーム状態・式を変えない。N=1 と full run は同じ条件で完走した。

### 3.2 1 ヒットの内訳

#### 物理の実例

Fighter / B1 の実測 1 ヒットは次の値だった。

| 項 | 値 | 最終 14 に対する説明 |
| --- | ---: | --- |
| `weaponAtk` | 9 | データ側で実効単位へ吸収済み。追加の係数なしで attack 項は 9 |
| `buffAtk` | 0 | このヒットでは無し |
| `str` | 15 | `str - 10 = 5` |
| `randRoll` | 0 | 0–4 のうち 0 |
| `def` | 1 | `floor(1 / 2) = 0`、減算なし |
| `meleeMod` | 1 | 現行 Fighter 値 |
| `formulaRaw` / `formulaDmg` | 14 / 14 | `9 + 5 + 0 - 0`、clamp 後も 14 |
| blind / phys resist / magic bolt / critical | false / false / false / false | このヒットでは後段の変化なし |
| final damage | 14 | 物理 hit の最終値 |

このヒットの raw 項シェアは attack 9/14 = 64.3%、STR 5/14 = 35.7%、
random 0%、def 0%。`weaponAtk` の表示 6 が式内で 9 になったことは、
`1.5` を推定せずに telemetry で確認できる。

#### 呪文の実例

Mage / B1 / HALITO の実測 1 ヒットは次の値だった。

| 項 | 値 | 最終 27 に対する説明 |
| --- | ---: | --- |
| base roll | 18 | 固定範囲 12–22 の base |
| INT | 17 | `getSpellStatBonus = 1.14`、stage 差分は 2.52 |
| arcane | 1.30 | stage 差分は 6.156 |
| fireRite | 1.00 | このヒットでは無し |
| pre-affix | 27 | `round(18 * 1.14 * 1.30) = 27` |
| post-affix | 27 | core/support の発動なし |
| magicResist | 0 | resist 後も 27 |
| final damage | 27 | `max(0, round(27 * (1 - 0)))` |

丸め前の stage 差分を final 27 で割ると、base 66.7%、stat 9.3%、arcane
22.8%（残りは丸め）である。これは式を計測 harness で再計算した値ではなく、
実際の spell effect が返した telemetry の stage を差分表示したもの。

#### 物理の支配項（#732前の旧式 telemetry snapshot）

次は #732 の乗算化前に保存した class × B1–B10 の全 physical hit を、`formulaRaw`
の重みで平均した値である。現行式の仕様・検証値ではなく、旧式との比較用の履歴である。
`attack` は `floor(weaponAtk + buffAtk)`、`str` は `max(0, str - 10)`、
`rand` は roll、`def` は `-floor(def/2)`。share は各平均を raw 平均で割った値で、
def は減算なので負になる。後段の耐性・特効・guard・会心は raw share とは別に
下の特殊率で示す。

| 職 | physical N | weapon 平均 | buff 平均 | raw 平均 | attack (share) | str (share) | rand (share) | def (share) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fighter | 86,804 | 11.184 | 0.033 | 29.224 | 16.767 (57.4%) | 10.931 (37.4%) | 2.003 (6.9%) | -0.476 (-1.6%) |
| Thief | 232,464 | 11.832 | 0.018 | 24.782 | 17.641 (71.2%) | 5.633 (22.7%) | 2.002 (8.1%) | -0.494 (-2.0%) |
| Priest | 20,065 | 8.591 | 0.059 | 18.613 | 12.641 (67.9%) | 4.832 (26.0%) | 1.998 (10.7%) | -0.859 (-4.6%) |
| Mage | 1,265 | 19.024 | 0.055 | 33.072 | 28.397 (85.9%) | 4.021 (12.2%) | 1.993 (6.0%) | -1.339 (-4.0%) |
| Samurai | 20,730 | 6.609 | 0 | 20.694 | 9.894 (47.8%) | 9.054 (43.8%) | 1.991 (9.6%) | -0.245 (-1.2%) |
| Bishop | 16,263 | 8.692 | 0 | 19.122 | 13.006 (68.0%) | 4.291 (22.4%) | 1.999 (10.5%) | -0.174 (-0.9%) |
| Ranger | 49,839 | 10.192 | 0.006 | 23.218 | 15.251 (65.7%) | 6.295 (27.1%) | 1.997 (8.6%) | -0.325 (-1.4%) |
| Ninja | 47,572 | 9.741 | 0 | 23.476 | 14.542 (61.9%) | 7.217 (30.7%) | 1.995 (8.5%) | -0.278 (-1.2%) |

全 8 職で attack 項が最大で、Fighter は 57.4%、Thief は 71.2%、Mage は
85.9%だった。Samurai だけは STR 項が 43.8%まで近づく。`rand` の実測平均は
1.99–2.01であり、固定 0–4 のため raw が大きいほど相対的な寄与は下がる。

Issue 本文の「`buffAtk` は死んでいる」は、現行 base ではそのままではない。
`src/systems/item_effects.js` の `STR_POTION` が `addCharBuff(char, "atk", 15, 5)`
を行うため、実測平均は Fighter 0.033、Priest 0.059、Mage 0.055 など非ゼロ
だった。一方、`getBuffTotal(char, "str")` の live producer はこの経路では確認
できない。従って #722-6 の非対称は「同じ str が現在二つの live 値で違う」のではなく、
**将来 str buff が入った時にも同じ実効単位で扱えるよう、入力単位を統一した経路**として記録する。

#### 物理の後段分岐の実測率（#730以前の historical evidence）

この節の `magicBolt` 列と以下の値は、#730で案Aを採用して廃止する前の
旧実装を対象にした historical evidence である。旧実装の挙動を記録するために
残すが、現行仕様の発火率・現行コードの挙動・案Aの受入判定として解釈しない。
旧記録の率の分母は各職の `physicalPlayerHits`。魔法の矢は旧実装における
Mage/Bishop の通常攻撃で、会心は最終的に 3 倍になった hit の率である。

現行仕様では、#722/#731の明示的な `spellPower` 成長を前提に #730の案Aを
適用済みであり、`magicBolt` は廃止済みである。Mage/Bishop の通常攻撃も
他職と同じ物理式・命中判定・最低1・会心順序だけを通る。従って現行の
`physicalPlayerHits` に `magicBolt` の発火率を記録する列はなく、下表を
現行コードから再現することはできない。

| 職 | magic bolt（historical） | blind 適用 | phys resist 適用 | critical |
| --- | ---: | ---: | ---: | ---: |
| Fighter | 0% | 7.152% | 14.941% | 0% |
| Thief | 0% | 2.591% | 14.833% | 0% |
| Priest | 0% | 4.082% | 9.370% | 0% |
| Mage | 4.111% | 1.344% | 2.213% | 0% |
| Samurai | 0% | 9.740% | 13.444% | 0% |
| Bishop | 0.172% | 6.106% | 13.171% | 0% |
| Ranger | 0% | 8.088% | 14.786% | 0% |
| Ninja | 0% | 6.052% | 14.242% | 6.760% |

このため、旧計測では Mage 1,265 hit の 4.111%、Bishop 16,263 hit の 0.172%で
旧 `magicBolt` が実際に値を採用したが、これは案Aによる廃止前の historical
evidence である。現行の存廃判断はこの旧発火率ではなく、#722/#731の明示的な
呪文成長経路と、#730実装後の正典simで評価する。

#### 呪文の支配項

下表の stage 差分は、実際の telemetry の各 stage を同じ hit ごとに差し引いた
平均である。括弧内は最終 damage 平均に対する比率。`magic resist` は符号付きで、
正は弱点（negative resist）側、負は軽減側である。丸めと乗算の差分のため、
比率の合計は厳密に 100% にはならない。

| 呪文 | N | 最終平均 | p10 / p50 / p90 | CV | base | stat | arcane | fireRite | target tag | affix | magic resist |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BADIOS | 49,780 | 17.36 | 11 / 17 / 24 | 0.313 | 13.00 (74.9%) | 2.55 (14.7%) | 0.18 (1.0%) | 0 (0%) | 0.71 (4.1%) | 0.14 (0.8%) | +0.74 (+4.3%) |
| HALITO | 8,067 | 27.02 | 19 / 26 / 34 | 0.246 | 17.05 (63.1%) | 4.04 (14.9%) | 4.65 (17.2%) | 0.18 (0.7%) | 0 (0%) | 0.42 (1.6%) | +0.72 (+2.7%) |
| LAHALITO | 2,342 | 42.82 | 26 / 41 / 58.9 | 0.360 | 25.12 (58.7%) | 5.94 (13.9%) | 7.22 (16.9%) | 0.39 (0.9%) | 0 (0%) | 2.37 (5.5%) | +1.78 (+4.2%) |
| MAHALITO | 899 | 65.67 | 48 / 64 / 84 | 0.229 | 39.69 (60.4%) | 9.73 (14.8%) | 11.37 (17.3%) | 0.82 (1.2%) | 0 (0%) | 1.34 (2.0%) | +2.73 (+4.2%) |
| MADALTO | 139 | 76.71 | 53 / 75 / 98.2 | 0.249 | 45.15 (58.9%) | 13.02 (17.0%) | 12.66 (16.5%) | 0 (0%) | 0 (0%) | 3.75 (4.9%) | +2.18 (+2.8%) |
| TILTOWAIT | 0 | — | — | — | — | — | — | — | — | — | — |

呪文では、観測された全 5 呪文で base が最大項だった。HALITO は base 63.1%、
arcane 17.2%、LAHALITO は base 58.7%、arcane 16.9%。MADALTO は N=139 で
あり、数字は観測事実として残すが、職業間の結論には使わない。TILTOWAIT は
この 40,000 run では使用されなかったため、range 50–100 が実際の run でどう
分布するかは未測定であり、推定しない。

#### 特効と core の実測

既存の physical `targetedBonuses` は、変更前後の値を記録した。

| 発動 | N | before 平均 | after 平均 | delta 平均 |
| --- | ---: | ---: | ---: | ---: |
| `antiUndead` | 2,218 | 18.289 | 21.990 | +3.701 |
| `coreAffix` | 11,504 | 27.001 | 36.666 | +9.666 |

`antiUndead` は物理 2,218 hit で実際に +3.701 の平均差を作った。この段落の
物理・呪文値は #719 実装前（#722 base `e605411`）の基準測定であり、呪文の
共通 target-tag stage が未接続だった状態を記録する。BADIOS 自体の target-tag
stage は 49,780 hit で平均 +0.710だった。#719 では通常の攻撃呪文を共通 stage
へ接続し、BADIOS の固有寄与も同じ加算プールへ移した。

### 3.3 職 × 階のダメージ分布

各セルは同じ測定の hit 分布。`N / mean / p10 / p50 / p90 / CV` の順で、
physical と spell を別列にした。`N < 30` のセルは観測値を記録するだけで、
結論の比較には使わない。0 はその職・階でその攻撃種類の hit が無かったことを
示す。

| 階 | 職 | 物理N | 物理平均 | p10 | p50 | p90 | CV | 呪文N | 呪文平均 | p10 | p50 | p90 | CV |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B1 | Fighter | 27024 | 20.45 | 12 | 22 | 26 | 0.29 | 0 | — | — | — | — | — |
| B1 | Thief | 36713 | 17.45 | 11 | 18 | 21 | 0.28 | 0 | — | — | — | — | — |
| B1 | Priest | 84 | 11.56 | 7 | 12 | 15 | 0.30 | 18816 | 16.70 | 11 | 17 | 22 | 0.29 |
| B1 | Mage | 0 | — | — | — | — | — | 1830 | 25.58 | 19 | 25 | 32 | 0.22 |
| B1 | Samurai | 17431 | 18.06 | 11 | 19 | 22 | 0.29 | 0 | — | — | — | — | — |
| B1 | Bishop | 9890 | 16.81 | 10 | 17 | 20 | 0.27 | 0 | — | — | — | — | — |
| B1 | Ranger | 22973 | 17.88 | 11 | 19 | 22 | 0.29 | 0 | — | — | — | — | — |
| B1 | Ninja | 20807 | 21.13 | 11 | 20 | 23 | 0.52 | 0 | — | — | — | — | — |
| B2 | Fighter | 18263 | 22.26 | 13 | 23 | 27 | 0.32 | 0 | — | — | — | — | — |
| B2 | Thief | 38789 | 18.31 | 11 | 18 | 22 | 0.33 | 0 | — | — | — | — | — |
| B2 | Priest | 1200 | 13.50 | 8 | 13 | 17 | 0.45 | 11341 | 16.97 | 11 | 17 | 23 | 0.30 |
| B2 | Mage | 0 | — | — | — | — | — | 1433 | 28.90 | 19 | 27 | 42 | 0.36 |
| B2 | Samurai | 2721 | 20.42 | 12 | 20 | 24 | 0.35 | 0 | — | — | — | — | — |
| B2 | Bishop | 4011 | 17.62 | 10 | 18 | 21 | 0.36 | 0 | — | — | — | — | — |
| B2 | Ranger | 10873 | 19.28 | 11 | 19 | 23 | 0.36 | 0 | — | — | — | — | — |
| B2 | Ninja | 11562 | 23.18 | 13 | 21 | 39 | 0.56 | 0 | — | — | — | — | — |
| B3 | Fighter | 12799 | 24.44 | 14 | 24 | 35 | 0.37 | 0 | — | — | — | — | — |
| B3 | Thief | 41576 | 19.78 | 11 | 19 | 26 | 0.41 | 0 | — | — | — | — | — |
| B3 | Priest | 3225 | 15.18 | 9 | 14 | 20 | 0.52 | 6824 | 17.23 | 11 | 17 | 23 | 0.30 |
| B3 | Mage | 1 | 27 | 27 | 27 | 27 | 0 | 1281 | 33.52 | 20 | 30 | 51 | 0.42 |
| B3 | Samurai | 415 | 25.11 | 13 | 21 | 43 | 0.52 | 0 | — | — | — | — | — |
| B3 | Bishop | 1512 | 20.49 | 12 | 19 | 37 | 0.43 | 0 | — | — | — | — | — |
| B3 | Ranger | 6313 | 21.09 | 11 | 20 | 34 | 0.43 | 0 | — | — | — | — | — |
| B3 | Ninja | 6733 | 25.86 | 13 | 21 | 45 | 0.64 | 0 | — | — | — | — | — |
| B4 | Fighter | 8989 | 30.15 | 16 | 27 | 47 | 0.42 | 0 | — | — | — | — | — |
| B4 | Thief | 40231 | 23.26 | 13 | 20 | 42 | 0.47 | 0 | — | — | — | — | — |
| B4 | Priest | 4282 | 16.67 | 9 | 14 | 33 | 0.56 | 4323 | 17.56 | 11 | 17 | 24 | 0.31 |
| B4 | Mage | 29 | 30.76 | 18.40 | 30 | 38.80 | 0.34 | 1414 | 35.68 | 21 | 31 | 55 | 0.43 |
| B4 | Samurai | 110 | 28.57 | 18 | 22 | 41.10 | 0.56 | 0 | — | — | — | — | — |
| B4 | Bishop | 637 | 22.24 | 13 | 19 | 40 | 0.47 | 0 | — | — | — | — | — |
| B4 | Ranger | 4307 | 27.25 | 13 | 24 | 47 | 0.47 | 0 | — | — | — | — | — |
| B4 | Ninja | 4709 | 31.05 | 15 | 23 | 54 | 0.66 | 0 | — | — | — | — | — |
| B5 | Fighter | 10264 | 36.55 | 20 | 34 | 57 | 0.43 | 0 | — | — | — | — | — |
| B5 | Thief | 45702 | 28.01 | 15 | 23 | 49 | 0.50 | 0 | — | — | — | — | — |
| B5 | Priest | 4829 | 17.89 | 10 | 15 | 36 | 0.58 | 3612 | 18.06 | 11 | 17 | 26 | 0.33 |
| B5 | Mage | 179 | 33.06 | 20 | 31 | 51.40 | 0.34 | 2106 | 36.47 | 21 | 31 | 57 | 0.47 |
| B5 | Samurai | 40 | 30.98 | 18.30 | 31.50 | 44.10 | 0.33 | 0 | — | — | — | — | — |
| B5 | Bishop | 157 | 22.31 | 16 | 20 | 40 | 0.41 | 0 | — | — | — | — | — |
| B5 | Ranger | 3733 | 32.61 | 16 | 29 | 53 | 0.47 | 0 | — | — | — | — | — |
| B5 | Ninja | 3264 | 35.85 | 18 | 28 | 63 | 0.70 | 0 | — | — | — | — | — |
| B6 | Fighter | 1749 | 40.22 | 22 | 38 | 62 | 0.38 | 0 | — | — | — | — | — |
| B6 | Thief | 4739 | 32.81 | 18 | 28 | 52 | 0.47 | 0 | — | — | — | — | — |
| B6 | Priest | 1554 | 18.71 | 9 | 15 | 37 | 0.63 | 509 | 19.89 | 12 | 20 | 28 | 0.31 |
| B6 | Mage | 123 | 32.73 | 25 | 31 | 49 | 0.35 | 600 | 39.71 | 21.90 | 32.50 | 69 | 0.48 |
| B6 | Samurai | 4 | 39.25 | 39 | 39 | 39.70 | 0.01 | 0 | — | — | — | — | — |
| B6 | Bishop | 12 | 22.50 | 18 | 20 | 24.80 | 0.35 | 0 | — | — | — | — | — |
| B6 | Ranger | 268 | 34.80 | 24 | 30 | 53 | 0.38 | 0 | — | — | — | — | — |
| B6 | Ninja | 134 | 42.42 | 20 | 31 | 66 | 0.68 | 0 | — | — | — | — | — |
| B7 | Fighter | 1969 | 41.60 | 27 | 40 | 61 | 0.32 | 0 | — | — | — | — | — |
| B7 | Thief | 5248 | 33.47 | 18 | 29 | 54 | 0.45 | 0 | — | — | — | — | — |
| B7 | Priest | 285 | 18.40 | 10.40 | 15 | 36 | 0.59 | 1790 | 20.15 | 12 | 20 | 29 | 0.32 |
| B7 | Mage | 29 | 30.83 | 10.60 | 30 | 51.80 | 0.49 | 544 | 51.79 | 24.30 | 51 | 78 | 0.43 |
| B7 | Samurai | 9 | 22.67 | 17.80 | 19 | 37.20 | 0.35 | 0 | — | — | — | — | — |
| B7 | Bishop | 0 | — | — | — | — | — | 0 | — | — | — | — | — |
| B7 | Ranger | 314 | 37.29 | 21 | 31 | 59 | 0.44 | 0 | — | — | — | — | — |
| B7 | Ninja | 138 | 40.51 | 20 | 32 | 64 | 0.64 | 0 | — | — | — | — | — |
| B8 | Fighter | 1883 | 44.92 | 30 | 41 | 64 | 0.33 | 0 | — | — | — | — | — |
| B8 | Thief | 5390 | 35.60 | 19 | 30 | 57 | 0.44 | 0 | — | — | — | — | — |
| B8 | Priest | 1003 | 22.49 | 10 | 16 | 42 | 0.64 | 1085 | 19.94 | 12 | 19 | 29 | 0.35 |
| B8 | Mage | 134 | 36.40 | 27 | 32 | 52.70 | 0.34 | 587 | 39.66 | 21 | 32 | 69 | 0.51 |
| B8 | Samurai | 0 | — | — | — | — | — | 0 | — | — | — | — | — |
| B8 | Bishop | 17 | 17.76 | 14.60 | 18 | 20.80 | 0.14 | 0 | — | — | — | — | — |
| B8 | Ranger | 347 | 37.77 | 24 | 33 | 58 | 0.42 | 0 | — | — | — | — | — |
| B8 | Ninja | 100 | 48.01 | 20.90 | 39.50 | 81 | 0.65 | 0 | — | — | — | — | — |
| B9 | Fighter | 1463 | 47.77 | 33 | 43 | 66 | 0.31 | 0 | — | — | — | — | — |
| B9 | Thief | 5244 | 37.44 | 20 | 32 | 60 | 0.44 | 0 | — | — | — | — | — |
| B9 | Priest | 1089 | 24.93 | 11 | 18 | 44 | 0.59 | 502 | 21.21 | 13 | 20 | 31 | 0.36 |
| B9 | Mage | 270 | 34.61 | 25 | 32 | 53 | 0.36 | 584 | 34.10 | 20 | 30 | 55 | 0.49 |
| B9 | Samurai | 0 | — | — | — | — | — | 0 | — | — | — | — | — |
| B9 | Bishop | 16 | 19.75 | 17 | 20 | 22.50 | 0.12 | 0 | — | — | — | — | — |
| B9 | Ranger | 265 | 40.26 | 23 | 32 | 69 | 0.45 | 0 | — | — | — | — | — |
| B9 | Ninja | 87 | 41.33 | 18 | 32 | 64.80 | 0.66 | 0 | — | — | — | — | — |
| B10 | Fighter | 2401 | 51.70 | 35 | 50 | 72 | 0.29 | 0 | — | — | — | — | — |
| B10 | Thief | 8832 | 38.11 | 18.10 | 34 | 62 | 0.46 | 0 | — | — | — | — | — |
| B10 | Priest | 2514 | 23.37 | 10 | 17 | 44 | 0.61 | 978 | 20.59 | 12 | 20 | 30 | 0.36 |
| B10 | Mage | 500 | 33.59 | 11 | 32 | 52 | 0.41 | 1068 | 32.19 | 20 | 29 | 47 | 0.41 |
| B10 | Samurai | 0 | — | — | — | — | — | 0 | — | — | — | — | — |
| B10 | Bishop | 11 | 18.36 | 17 | 18 | 20 | 0.08 | 0 | — | — | — | — | — |
| B10 | Ranger | 446 | 38.54 | 24 | 30 | 62 | 0.45 | 0 | — | — | — | — | — |
| B10 | Ninja | 38 | 52.66 | 21.70 | 44.50 | 79.20 | 0.64 | 0 | — | — | — | — | — |

この表から、今回の条件で物理は Fighter B1 20.45 → B10 51.70、Thief B1
17.45 → B10 38.11 と上がる一方、Mage の呪文は B1 25.58 → B10 32.19
（Mage の spell hit）で、同じ系統の単純な floor scaling ではないことが分かる。
これは生存した run の hit 分布であり、敵の強さや build の選別を除いた理論曲線
ではない。式の支配項を決める根拠には使うが、値の調整根拠には使わない。

## 4. 非対称 10 件の判定

判定基準は、既存の設計正本または source に「この差を意図した」という記録が
あるかどうかである。値が強い・弱いという印象では判定していない。**10 件を
全て判定し、飛ばした項目はない。**

| # | 非対称 | 判定 | 理由と実測・経路根拠 | 対応する決定 |
| ---: | --- | --- | --- | --- |
| 1 | 物理は旧来 `-floor(def/2)`、呪文は `×(1-magicResist)` | **結論（#732で変更）** | 旧式は `def` と `magicResist` が別 input・別順序で、同じ低 damage 帯に別の clamp を持っていた。現行は `defResistance = def/(def+k_direction)` とし、`physResist` と -1〜0.9 の加算poolへ統合する。実遭遇分布を再校正した公式値はプレイヤー→敵 `k_out=40`、敵→プレイヤー `k_in=2`。#732で一度測定した `100/3` は、EV/fallbackを実戦poolへ接続して再測定した後に Mage の paired CI が0を含まなかったため不採用とした。#716の段階表示は active DEF buff/debuff を含む `getEffectiveDef` から求めた最終physical poolを読む。 | 決定 1 |
| 2 | 物理は装備で伸び、呪文は固定 dice と +40% stat cap | **結論（#731で修正）** | core-loop 正本は run 内 loot build を depth の評価軸にする。physical は B1→B10 で Fighter 20.45→51.70、spell は観測 Mage B1→B10 25.58→32.19で、呪文の伸びが上位呪文の習得と偶然の build に依存していた。#731 で共通の `spellPower`（術力）を導入し、`arcane` / `devotion` / `fireRite` は固有項として残した。 | 決定 2 |
| 3 | レベルはほぼ damage に寄与せず、呪文だけ level gate を持つ | **結論（#733）** | `str`/`int` の base はレベルで自動増加せず、spell learn は lv2/3/6/8に固定されていた。レベルアップ時はダメージ式へ level 項を追加せず、職業の主能力値を3レベルごとに確定で+1する。主能力値は `src/data/classes.js` を正本とし、Fighter=STR、Thief=AGI、Priest=PIE、Mage=INT、Samurai=STR、Bishop=INT、Ranger=AGI、Ninja=AGI とする。STRは物理攻撃、AGIは回避対象への命中と盗賊/野伏/忍者の身軽さ、INTは攻撃呪文、PIEは回復呪文の実際の入力軸に対応する。2レベルごとの成長や別の直接level項は、Lv3.77帯で強く、Ninjaの既存level依存weaponAtk/criticalと二重になるため採用しない。 | 決定 3、#733 |
| 4 | `antiUndead` / `antiDragon` / `antiDemon` は物理のみ | **欠陥（配線漏れ）。共通 stage へ集約して修正** | #719 実装前は `applyTargetedDamageBonus` の物理経路だけがタグ特効を持ち、攻撃呪文は `getDamageAffixResult` を直接呼んで stage を飛ばしていた。結論としてタグ特効を `getDamageAffixResult` の共通 stage へ移し、BADIOS の +50/+30/+30 も同じ加算プールへ入れる。共通 anti tag と固有寄与を合計して一度だけ乗算するため、攻撃手段非依存・同一タグの二重乗算なしとなる。 | 決定 4、#719 |
| 5 | raw の `weaponAtk + buffAtk` を物理入力単位へ 1.5 倍 | **#720で解消** | 旧式は設計根拠のない hidden weight で、表示の `+20` が実効 `+30`になっていた。#720 で各 data source を実効値へ吸収し、0.5 を保持した合計を floor する。`str` の下限は別判断として `max(0, str - 10)` を採用した。 | 決定 5、#718、#720 |
| 6 | raw `atk` / `str` buff を同じ物理入力単位へ変換 | **#720で整理** | `STR_POTION` は実効 `atk +15` として付与する。将来の `str` buff も同じ入力単位で扱い、同じ意味の buff を別単位にしない。 | 決定 5 |
| 7 | physical は武器ごとの `randRange`、spell は呪文ごとの幅 | **変更した（#727）** | `src/data/items.js` の全 weapon が inclusive な `randRange` を持ち、`rollCharWeaponPhysicalRandom` が本体と追撃へ同じ幅を供給する。狭い `[1,3]` / 固定 `[2,2]` と広い `[0,4]` を使うが、全範囲の平均は 2.0 に揃え、武器 atk・式の他項・spell range は変えない。物理を一律 0–4 として spell と別 identity にするだけでは、同じ atk の武器を区別できないため、#727 でこの判定を覆した。 | 決定 2、#727、分散方針 |
| 8 | 会心は Ninja の非 boss のみ | **欠陥（未文書化）** | source は `char.class === "Ninja" && !target.isBoss` の呼び出し側分岐だけで、class data と既存設計正本に会心 passive の記録がない。実測 critical は Ninja 6.760%、他 7 職 0%。boss 除外の理由も正本にない。 | 決定 6 |
| 9 | Mage/Bishop に undocumented `magicBolt` fallback | **案A: 廃止（#730で結論）** | #722 は未文書の職業補償を使わないと定め、#731/#722 決定2は呪文を `spellPower` と装備・run 内ビルドで明示的に成長させた。通常攻撃へ隠れた第2式を残す理由はなく、Mage/Bishopも他職と同じ物理式・命中・最低1・会心順序へ戻す。適用順は #731 の呪文成長配線を先に行い、#730 で fallback と専用 telemetry を削除する。 | #722 決定2、#731、#730 |
| 10 | spell stat +40%、trap disarm 90など上限配置に共通方針がない | **#713 trap 部分を適用、spell は監査のみ** | `calculateDisarmRate` の適性職 cap は90→100へ変更し、確率の安全上限だけを残して trapBonus を無価値にしない。`getSpellStatBonus` はレビュー対象として確認したが、global spell scaling の変更は trap calibration と別 concern のため本 Issue では変更しない。`getPartyFlameTrapWarningAvoidanceChance` の0.74は別の発動回避効果の確率 clampで、trapBonus全体を無価値にはしないため変更しない。その他の `Math.min` は HP/MP、配列・確率・状態値の安全 clamp、または別 system の投資上限であり、#713の trapBonus floor value の測定対象外。 |
を通るため、本体と追撃で幅が分岐しない。旧 follow-up は `0..2`（平均1）だったが、
#727後は武器幅（全武器平均2）を使う。これは本体と追撃で武器の手触りを一致させる
ための意図した変更であり、平均ダメージが変わる影響は depth sim の結果とともにPRへ記録する。
telemetry は既存の 4.1 #7 を「変更した」とした理由

以前の #7 判定は、spell が個別 range、physical が固定 0–4 という差の存在だけを
根拠に「意図」としていた。しかし、その固定幅は武器データを参照せず、同じ atk の
武器を同じ手触りにする。#727 では武器ごとの固定 `randRange` を source に明示し、
狭い武器・固定武器・広い武器を作った。全範囲の平均を 2.0 に保つため期待値は
変えず、ばらつきだけを武器 identity として変更した。

素手・武器 slot にない装備の既定値は `[0,4]`。忍者を含む follow-up も同じ helper
を通るため、本体と追撃で幅が分岐しない。telemetry は既存の
`state.combatFormulaTelemetry.physicalPlayerHits` を使い、既定オフのまま
`randRoll` を実測する。

## 5. 決めるべきこと 7 項目の結論

### 1. 軽減は減算か乗算か

**乗算で揃える。** 敵・プレイヤー双方の physical `def` を、プレイヤーが意思決定に
使う「何割残るか」に変換可能な bounded resistance として扱う。変換は
`defResistance = def / (def + k_direction)` とし、defの追加投資は逓減する。#732 の
再校正後の公式値は、プレイヤー→敵を `k_out=40`、敵→プレイヤーを `k_in=2` とする。
いずれも `PHYSICAL_DEF_RESISTANCE_SCALE` 系の source constant が正本である。`physResist` は
`defResistance` との加算poolへ統合し、合成後を -1〜0.9 に clamp するため完全無敵は
発生しない。`k_direction` は #716 の表示段階だけでなく、変換前後の実遭遇分布に対する
到達階平均を paired 比較して決める。旧PRの `k=10` は根拠なしとして採用しない。

物理通常攻撃は raw damage の後に最終poolを一度だけ適用する。敵→プレイヤーの通常攻撃・逃走追撃も
同じ `defResistance` を使う。プレイヤー側に既存の守りの薬・守護・竜殺しなどの
割合軽減があるが、それらは物理defとは別の戦闘中 mitigation stage であり、物理defを
減算のまま残す理由にはしない。#716の表示は内部数値を出さず、適用される最終
physical resistance poolを5段階へ変換して示す。表示と実効値は同じ
`getEffectiveDef(monster)`（戦闘中のDEF buff/debuffを含む）を入力にする。呪文と
命中済みの通常物理攻撃は最低1を維持し、盲目 miss / evasive avoid は0とする。

### 2. 呪文は装備で伸びるべきか

**伸びるべき。** core-loop の主軸は run 内 build であり、攻撃呪文だけが固定
dice と習得 level に閉じると、loot の判断対象から外れる。採用する共通項は
プレイヤー表示「術力」、内部 ID `spellPower` である。武器・鎧・盾の魔術系装備と
装身具の 2 枠から供給し、値は `AFFIX_BALANCE.spellPowerByRarity` の rarity 軸だけで
決める。floor は供給可能な pool の境界に使っても、値の scaling には使わない。

適用位置は `getSpellStatBonus` の直後、`arcane` / `devotion` / `fireRite` などの
固有項と同じ pre-target（回復は pre-clamp）乗算である。既存 `arcane` は攻撃側の
明示入力として残し、それだけで全 spell の成長を暗黙に担わせない。火・神聖などの
固有 affix は術力の上に別の明示項として重ねる。術力に hard cap は置かない。供給量
が限定される現段階で投資を無効化する cap を増やさず、将来上限が必要になった場合は
決定 7 に従い逓減を先に検討する。上位 spell の range 値はこの Issue で変えない。

### 2a. 回復呪文の扱い

**術力を回復にも適用する。** 攻撃だけに適用すると、同じ spell build を選んだ
僧侶の回復だけが固定 dice に残り、`devotion` を回復側の `arcane` 相当としている
職業軸と装備投資の意味が分離する。術力は DIOS / MADIOS / DIALMA / MADI の全回復
威力に共通適用し、既存の `devotion` はその上に重なる回復固有項として残す。
これにより僧侶の回復役割は維持しつつ、攻撃呪文を選ぶ職だけに新しい装備入力を
独占させない。回復量の上限 clamp と anti-heal は従来どおり後段に残す。

### 2b. `fireRite` の扱い

**この Issue では触らない。** `fireRite` は `SUPPORT_AFFIXES` に無く、現状の供給は
`curse_purging_flame` の `mod` だけである。これを術力の固有項として support pool
へ追加すると、呪いの副産物を意図した build 経路へ変えてしまうため、今回の共通項
導入とは分離する。火系固有項として式に残すが、供給追加や registry 化は別 Issue の
明示的な判断対象とする。

### 3. レベルはダメージに寄与すべきか

**寄与すべき。物理と呪文の両方へ小さく寄与させる。** レベルは build を置き
換える主役ではなく、同じ build の到達感を作る補助軸にする。呪文だけが level
を要求し、damage power は level に無関係という現在の組み合わせは採用しない。
level contribution の exact curve と、spell learn level を到達 3.77 帯でどう
扱うかは #599/#653 の実測で別に決める。hidden fallback を level contribution の
代わりに残さない。

### 4. 特効は攻撃手段を問わないか

**問わない。共通プールへ加算し、乗算は一度だけ行う。** `antiUndead`、
`antiDragon`、`antiDemon` は `getDamageAffixResult` の共通 target-tag stage へ
集約する。対象タグごとに装備・職業の共通値と呪文固有値を足してから一度だけ
乗算する。BADIOS の固有寄与は undead +50 / spirit +30 / demon +30 とし、
`spirit` +30 は共通 3 タグ外のため既存 `antiSpirit` の support pool へ加算する。
これで BADIOS の固有寄与と同じタグの共通特効を二重に乗算しない。複数タグは
旧 `else-if` と異なり加算プールで合流する。#719 でこの結論を実装した。

### 5. 装備とステータスの重みは等価か

**表示単位と実効単位を等価にする。** weapon / `atk` source は同じ実効単位で扱い、
0.5 単位を許したまま全 source の合計後に一度だけ floorする。罠喰いだけは
`weaponAtk` へ混ぜず、`meleeMod` の影響を受けない固定 damage 項として raw physical
damage へ加算する。表示（基礎・装備・罠喰い・合計）と telemetry の
`trapEaterBonus` はこの同じ単位を使う。CORE_TRAP_EATER は Thief / Ranger / Ninja
だけに有効で、宝箱罠の解除成功ごとに +2、run 中の上限は +20、帰還で0へ戻す。

**STR は `max(0, str - 10)` を採用する。** STR 10 を中立点として、STR 10 未満の
ペナルティだけを除き、STR 10 超の職差は残す。全職の素の STR（レベルでは増えない）
は Fighter 15 / Thief 10 / Priest 9 / Mage 7 / Samurai 14 / Bishop 9 /
Ranger 11 / Ninja 12。したがって案(a)で 0 になるのは Priest / Mage / Bishop。
これは係数除去と異なり基準線を動かす判断であり、コミット2へ分離した。
`str`、`atk`、weapon の各入力を将来異なる重みにするなら、その重みを明示的な項
として UI・設計正本・telemetry に出す。

### 6. 会心は職業限定か、全職の機構か

**機構は全職共通、確率は職業データで変えられるものとする。** Ninja の identity
として高い確率を持たせ、他職を0とする段1の値は `src/data/classes.js` に明示する。
round caller は職業名や `isBoss` を判定せず、共通 resolver と対象の
`canReceiveCritical` property を使う。既存ボスは property を false とし、段1では
会心確率・倍率・ボス適用可否を変えない。対象 property は将来の段階で適用可否を
測定・変更できる拡張点である。

### 7. 上限をどこに置くか

**damage / spell power / affix 投資は逓減を基本とする。** `int 30 = +40%`の
ような hard cap を置いて投資をゼロにするのは許可しない。安全判定のための
disarm cap のように hard cap が必要なものは、超過分を別の可視効果へ変換するか、
過剰分を明示して別の投資先を作る。#713 の thief 解除率90張り付きはこの方針に
反するため、現行 cap を維持したまま「完成」とはしない。具体的な逓減曲線は
値の調整 Issue で測る。

## 6. 既存正本・配下 Issue との接続

### 6.1 既存設計正本との接続

- `game-design-core-loop.md` の「in-run builds」「player should die from build
  quality, not raw stat/level deficit」を、決定 2・3・5 の上位根拠とする。
  level は補助軸、装備は主軸であり、装飾 1 枠で職の主軸が反転する hidden weight
  は許容しない。
- `game-design-core-loop.md` の Combat 節は、ソロ戦闘、職業の役割、heavy damage と
  resistance build の関係を定める。式の詳細と順序は本書へ委譲する。
- `game-design.md` の blind は combat disruption であり、物理攻撃者の 50% miss
  を維持する。#728 PR3 で命中時の半減・1.5倍という二重罰を廃止し、
  プレイヤー・敵の物理攻撃を同じ treatment policy に揃える。
- `game-design.md` の Mage `trapGuard=60` / Fighter `trapGuard=40` は罠 sustain
  の正本であり、damage power と同じ単位ではない。#558 の職業主軸は、罠・戦闘・
  resource を別軸で評価することで本書の hidden damage fallback と分離する。
- `game-design-equipment-builds.md` の core/support は in-run build の rule-changing
  input であり、`getDamageAffixResult` の順序・値は source が正本。本書はその
  effect を物理だけに閉じないという決定を追加する。
- 数値の sweep は `balance-simulation.md` のチェックリストに従う。本書の分布は
  現状固定用であり、値の採否を直接決めない。

### 6.2 Issue 対応表

| Issue | 対応する本書の判断 | この run での扱い |
| --- | --- | --- |
| #719 タグ特効が呪文に乗らない | 非対称 #4、決定 4 | 配線漏れと確定。`getDamageAffixResult` の共通 target-tag stage へ集約し、BADIOS の +50/+30/+30 も共通値へ加算する。`spirit` +30 は既存 `antiSpirit` の support pool へ加算する。 |
| #720 物理式の ×1.5 と `(str - 10)` | 非対称 #5・#6、決定 5 | hidden weight を data source へ吸収し、0.5 単位を許して表示と実効を揃える。STR は `max(0, str - 10)` とし、STR 10 未満のペナルティだけを除く。係数除去と基準線変更はコミットを分けて検証する。 |
| #718 罠喰いの表示・実効不一致 | 非対称 #5・#6、決定 5 | `weaponAtk` から分離し、Thief / Ranger / Ninja の宝箱罠解除成功ごとに固定 +2、上限+20を加算する。装備画面へ基礎・装備・罠喰い・合計のrun内訳を表示する。 |
| #716 敵の耐性が表示されない | 非対称 #1、決定 1 | 軽減率を player decision と一致させる。表示文言と耐性値の調査・UI変更は #716。 |
| #713 盗賊の解除率が90に張り付く | 非対称 #10、決定 7 | hard cap で投資を無価値にしない。逓減または超過変換を #713 で測る。 |
| #599 lv5以上の呪文が到達帯に届かない | 非対称 #2・#3、決定 2・3 | spell growth と level gate を同じ到達分布で再設計する。到達値・習得値の変更は #599。 |
| #558 Mage `trapGuard=60` が Fighter `40` を上回る | 非対称 #9、決定 3 と職業軸 | 罠 sustain を damage compensation に使わず、職業軸を罠・戦闘・resource に分けて評価する。#558 の passive 値は変更しない。 |
| #731 攻撃呪文の装備成長 | 非対称 #2、決定 2 | 「術力」`spellPower` を武器・鎧・盾と装身具から供給し、stat 直後の pre-target / pre-clamp に適用する。攻撃・回復の両方へ適用し、`arcane` / `devotion` / `fireRite` は固有項として残す。 |
| #728 PR4 物理ヒット最低1 / ミス0 | 非対称 #1、決定 1 | 命中判定後の `applyPhysicalResistance` から player→enemy 通常/追撃、enemy→player 通常/逃走追撃へ続く各物理段階を `max(1, ...)` にする。盲目 miss / evasive avoid は式へ進まず0。targeted affix、guard、defend、incoming mitigation、会心の倍率・順序、spell minimum は維持し、負値が HP を回復させないことを focused test で確認する。 |
| #721 monster drop の旧 positional API | 本書の範囲外 | ダメージモデルの判断対象ではない。配下の配線欠陥として記録だけし、コードを変更しない。 |
| #717 Mage physical が成立しない | 非対称 #1・#2・#3・#9 | #722/#731 の呪文成長を先に適用し、#730で hidden fallback を廃止した。#717の通常攻撃は共通物理式で扱い、値変更は行わない。 |

### 6.3 満たすべき性質

今後の各実装 Issue は、少なくとも次を確認する。

- 職業の主軸が、装飾 1 枠や undocumented fallback で反転しない。
- UI の説明値、telemetry の入力、実効 damage が同じ単位で読める。
- 到達レベル 3.77 の run でも、有効な攻撃呪文と build choice が残る。
- B5 以降も、装備・spell power・level のどれかが明示的に伸びる余地を持つ。
- hard cap に到達した投資が黙って無価値にならない。
- physical と spell の差がある場合、呪文固有 identity と共通 combat model のどちら
  に属する差かを本文と source で判別できる。

### 6.4 Issue #716: 耐性の開示

耐性は source に値と計算式があるだけでは、プレイヤーが攻撃手段を切り替える
機構として成立しない。**プレイヤーに開示されて初めて機構として成立する。**

- 開示条件は、敵の種族へ物理攻撃または攻撃呪文を一度実行した時点で、その属性を
  記録庫へ記録することとする。物理と呪文は別々に記録し、片方を試しただけで
  もう片方の未知情報を開示しない。選択だけで開示せず、反射された呪文は対象の
  耐性を観測していないため開示しない。
- 記録庫の記録は次回以降の戦闘前に敵選択 UI と敵情報表示へ反映する。未開示の
  属性は「未判明」とし、既存セーブに開示フィールドが無くても未知状態として
  扱う。`DUMAPIC` には紐づけない。地図探知呪文へ戦闘鑑定を混ぜず、攻撃を試して
  学ぶという探索・資源判断の経路を保つためである。
- 表示は内部の `magicResist` / `physResist` の数値を直接出さず、弱点・通常通り・
  やや効きにくい・効きにくい・ほとんど効かないの段階で出す。段階名は色に依存
  せず、モノクロでも弱点と軽減を読める文言にする。
- 決定 1 の「軽減を乗算へ揃える」と同じく、表示はプレイヤーが判断する軽減の
  向き（弱点か、通常か、効きにくいか）を示す。#732後の物理表示は
  `defResistance + physResist` の最終poolを入力にする。既存の `def` / `physResist`
  の値は変更せず、表示段階と実効式を同じ変換へ接続する。

## 7. 判定漏れ・測定限界

- 非対称 10 件はすべて判定した。飛ばしたものはない。
- 決めるべきこと 7 項目もすべて結論を出した。保留項目は「値」や「曲線」であり、
  モデルの性質そのものではない。
- TILTOWAIT は 0 hit だった。range の live 分布を推定していない。
- N<30 の class × floor cell は表に残したが、職業間の結論には使っていない。
- spell stage の `magicResist` は符号付き delta であり、軽減と弱点を一つの平均に
  混ぜている。耐性種類別の値を決める測定では、次回は resist / weakness を分ける。
- 外部の記事、他ゲーム、Web検索は根拠にしていない。根拠はこのリポジトリの source、
  `.agents/*.md`、および上記条件の実測だけである。

## 8. #793 状態異常モデル境界（Phase 0）

状態異常の拡張に先立ち、既存実装を壊さずに観測・保存できる最小のモデル境界を
`src/combat_logic/status_effects.js` に置く。これは新しいゲーム効果を追加する
モデルではなく、既存の legacy projection を正本として扱う互換アダプターである。

### 8.1 canonical shape

戦闘参加者の additive な `statusEffects` は、安定した内部 ID をキーとする次の
オブジェクトである。未設定の旧セーブは `{}` へ正規化する。

```js
statusEffects: {
  [id]: {
    id: string,
    remainingTurns: number | null,
    stacks: number,
    source: string | null
  }
}
```

Phase 0 で既存表現に対応する ID は `poisoned`、`blind`、`sleep`、`paralyzed`、
`silence` であり、Phase 1 で combat-only の `bleeding` を追加した。`dead` と `ok` は状態異常 ID ではない。`remainingTurns`
が `null` の既存状態は期限を持たない legacy 表現、`stacks` は既存挙動を変えない
ため常に最低 1、`source` は既存の付与元を再判定するための値ではなく記録用の
任意メタデータである。Phase 0 は stack、consume、refresh、耐性計算、ダメージ、
行動不能を新設しない。

### 8.2 compatibility and lifecycle contract

- `status`、`sleepTurns`、`silenceTurns`（および既存の `paralyzeTurns`）は
  境界で保持し、既存の直接 consumer がそのまま読める。
- `status` が `poisoned` / `blind` / `sleep` / `paralyzed` のときは同じ ID を
  `statusEffects` へ投影する。`silenceTurns > 0` は独立した `silence` として
  投影するため、睡眠・毒などの legacy string を上書きしない。
- legacy string の付与は従来どおり相互排他的であり、KATINO、敵の睡眠・毒・盲目・
  麻痺、poisonAtk、CORE_EXECUTIONER の付与順・確率・値・耐性判定は変更しない。
- 睡眠の tick、被弾 wake、味方の行動消費 wake、MONTINO/沈黙の tick、敵 cleanse、
  cure、戦闘終了時の盲目解除は legacy fields を更新すると同時に adapter を同期
  する。戦闘終了時の cleanup は既存どおり combatState/buff を対象とし、今回の
  collection は save の round-trip を壊さない。
- save normalization は party と combatState.monsters の旧レコードへ
  `statusEffects` を補完する。既存の legacy fields は削除・改名しない。
- `CORE_EXECUTIONER` の predicate と damage multiplier は adapter を読むが、
  #313 の攻撃前 poison setup、35%、1.4 倍、同一攻撃への入力、KATINO sleep 保持は
  固定する。

### 8.3 #793 Phase 1 bleeding vertical slice

`bleeding`（プレイヤー表示「出血」）だけを Phase 1 の新規状態として採用した。
`Vulnerable`、行動不能、ラウンド終了ダメージ、汎用 status engine は追加しない。

#### Rule and stage

- Producer は weapon-only support `bleedingAtk`（magic/rare/epic = 8%/10%/12%）。
  `poisonAtk` は既存の判定・値・付与順をそのまま維持する。
- `round.js` の命中判定、物理式、targeted affix、guard、会心を通過した
  **通常の直接物理ヒット**の後にだけ producer を判定する。DoT、反射、呪文、
  follow-up/secondary hit は producer にならず、payoff も消費しない。
- 初回付与は生存対象へ成功ヒット後に行う。再付与は
  `remainingTurns = 3` へ refresh するだけで、`stacks` は常に 1。各 combat
  round transition で 1 減り、0 で expiry。敵撃破時、combat cleanup、save/load は
  canonical adapter entry を対象にする。
- 既に出血中の後続通常ヒットは、直接ヒットの後に固定 `+1` damage を加える。
  低 HP の overkill は実際に減った HP だけを contribution として記録する。
  これは次の通常攻撃にだけ反応し、action lock や round-end tick ではない。
- `CORE_EXECUTIONER` の predicate は legacy status のみを読むため、出血だけでは
  発動しない。既存の攻撃前 poison 35%、1.4x、KATINO sleep 互換境界は不変である。

#### Numeric decision and measurement

候補は payoff `+1/+2/+3` の小 sweep とし、`bleedingAtk=100%` の calibration build
を用いて candidate 側の producer/consumer 実経路を必ず発火させた。`+1` を選択した
理由は、実際の application/trigger/damage contribution が観測でき、base の B5/B10
突破率を下げずに build choice の差を作る、最小の候補だったためである。`+3` の
到達階点推定は高かったが 95% mean CI が広く base と重なり、`+2` は B5/B10 突破率
を下げたため、より大きい値を採用する根拠にはしなかった。

- source code base: `f076e89fa759968c10e2d1e847945dddfcf9be24`
- candidate source/runner commit: `59f8eabb6f604d2f20e6c06bf4ad5ec54bbb64a4`
- runner: Node `v26.7.0`, `scratch/sim_issue_793_bleeding.js`
- provenance: base case `sourceCommit=f076e89fa759968c10e2d1e847945dddfcf9be24`,
  candidate cases `sourceCommit=59f8eabb6f604d2f20e6c06bf4ad5ec54bbb64a4`; both record
  `originMainAncestor=true`, `staleTreeAllowed=false`, and the same runner commit
  `59f8eabb6f604d2f20e6c06bf4ad5ec54bbb64a4`
- provenance output also records the resolved `provenanceBaseRef` and commit. Production
  measurements use the required `origin/main` ref. The unit-side CI compatibility check
  uses the explicit test-only fixture
  `scratch/fixtures/issue-793-measurement-provenance.json`, which resolves local `HEAD`
  and records `provenanceBaseRefReason=issue-793-ci-shallow`; this fixture is not
  measurement evidence and does not make a missing ref valid. An unknown ref fails before
  simulation starts.
- seed policy: `SIM_INDEPENDENT_RUN_RANDOM=1`, `SIM_SEED=793`; class、runIndex、seriesId
  を base/candidate で一致
- dataset/preset: current `src` data、`generateRunFloor` 経由の solo real-run、
  `targetDepth=20`、base/candidate N=100、calibration N=50
- reproduction (raw JSON remains untracked in `scratch/results/`):

  ```sh
  git worktree add --detach /private/tmp/issue-793-bleed-base-clean f076e89fa759968c10e2d1e847945dddfcf9be24
  cp /private/tmp/issue-793-bleed-vertical-slice/scratch/sim_issue_793_bleeding.js /private/tmp/issue-793-bleed-base-clean/scratch/sim_issue_793_bleeding.js
  cd /private/tmp/issue-793-bleed-base-clean
  SIM_SEED=793 BLEEDING_MEASUREMENT_SIDE=base BLEEDING_SOURCE_CODE_SHA=f076e89fa759968c10e2d1e847945dddfcf9be24 BLEEDING_RUNNER_COMMIT=59f8eabb6f604d2f20e6c06bf4ad5ec54bbb64a4 BLEEDING_SIM_N=100 BLEEDING_CALIBRATION_N=50 node scratch/sim_issue_793_bleeding.js
  cd /private/tmp/issue-793-bleed-vertical-slice
  SIM_SEED=793 BLEEDING_MEASUREMENT_SIDE=candidate BLEEDING_SOURCE_CODE_SHA=59f8eabb6f604d2f20e6c06bf4ad5ec54bbb64a4 BLEEDING_RUNNER_COMMIT=59f8eabb6f604d2f20e6c06bf4ad5ec54bbb64a4 BLEEDING_SIM_N=100 BLEEDING_CALIBRATION_N=50 node scratch/sim_issue_793_bleeding.js
  ```
- matched base (base, no bleeding route): reached floor `2.82 ± 0.37` (95% mean
  CI), B5 reach/breakthrough `28%/3%`, B10 `1%/1%`, survival `0%`, final combat
  build score `27.12 ± 3.84`, final core count `0.63 ± 0.19`, and natural source
  selection observed `0/100` runs
- candidate `+1` forced calibration: reached floor `2.85 ± 0.45`, B5 `24%/4%`,
  B10 `3%/2%`, survival `0%`; 372 applications, 238 refreshes, 573 triggers,
  260 damage contribution, 15 expiries, 340 clears (clear reasons: defeat 335,
  self-destruct 5). Build snapshots observed the forced producer in `100/100` runs,
  `69/100` at the final snapshot, with final combat build score `27.02 ± 3.74`
  and final core count `0.60 ± 0.18`. Natural source selection is explicitly
  `unexecuted/omitted` for this forced case.
- candidate `+2`: reached floor `2.76 ± 0.40`, B5 `27%/2%`, B10 `1%/1%`, survival
  `0%`, contribution `327`; candidate `+3`: reached `3.03 ± 0.57`, B5 `27%/3%`,
  B10 `3%/3%`, survival `0%`, contribution `391`. The larger candidates are not
  selected by the smallest-meaningful-effect rule.
- candidate natural-loot reachability was measured separately at N=50: source
  selection was observed in `1/50` runs (`0.02` per run), with 9 applications,
  1 refresh, 12 triggers, and 10 damage contribution. This is a measured result,
  not a theoretical probability; forced calibration bypasses natural selection.

Modeled: real floor generation/traversal, existing equipment scoring/build snapshots,
round combat, rewards, retreat and status-cure policy, and the normal direct-hit path.
Omitted: manual UI timing/live analytics transport, natural loot choice in the forced
calibration, and all other new statuses. Required telemetry fields are recorded in
the simulation result and production `bleeding_*` events: application, failed roll,
resisted (0; no enemy resistance rule exists), refresh, qualifying trigger, damage
contribution, expiry/clear with reason, boss/midboss flags, and source/build key.

#### Compatibility boundary

The adapter retains legacy string/duration fields and accepts `bleeding` as an additive
canonical entry. `createSavePayload`/`applySavePayload` preserve remaining duration and
source metadata. `hasStatusEffectForDamage` intentionally remains legacy-only for
`CORE_EXECUTIONER`; adding a future status must not silently widen that predicate.

### 8.4 future owner decisions (not selected)

Vulnerable、追加の producer/source、敵側耐性・免疫、出血の cure item、出血を
`CORE_EXECUTIONER` 対象へ広げること、追加の status stacking、action-denial mechanics
は未決定である。
