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

この run の base は `origin/main` の `e605411`。ルール値と既存の式は変更していない。
呪文の内訳を測るため、後述の telemetry を既定オフの no-op として追加した。

## 設計判断の要約

この文書で確定するモデルの性質は次のとおり。具体的な係数変更は各 Issue で
実測してから行う。

1. 軽減は、物理と呪文で**有界な乗算モデルへ揃える**。物理 `def` を将来どの
   抵抗値へ変換するかは別 Issue で測る。
2. 呪文は、上位呪文の習得だけでなく、**装備・run 内ビルドで伸びる**。既存の
   `arcane` だけに隠すのではなく、共通の明示された spell-power 経路を持つ。
3. レベルは、ビルドを置き換えない小さな戦闘力として、**物理と呪文の両方に
   明示的に寄与する**。正確な曲線は別の測定で決める。
4. タグ特効は攻撃手段を問わず一度だけ適用する。呪文固有の BADIOS の対象倍率は
   共通タグ特効とは別の、明示された呪文固有項として扱う。
5. 表示される装備・ステータスの単位と実効の単位は**等価**にする。記録のない
   `weaponAtk + buffAtk` だけの `1.5` はモデルとして採用しない。
6. 会心は、職業データで確率を変えられる**共通機構**にする。Ninja だけが
   呼び出し側の条件分岐で持つ現状は、仕様として記録されるまでは欠陥と扱う。
7. 上限は原則として逓減にし、投資を無価値にしない。安全性のための硬い上限を
   置く場合も、超過分の変換または別の可視効果を決める。

この run では上の判断を実装しない。

## 1. 現状の式と適用順

### 1.1 記号

`floor`、`round`、`max` は JavaScript の現在の実装どおりである。

- `weaponAtk`: `getCharWeaponAtk(char)`。罠喰いの run 中攻撃ボーナス、武器、
  Ninja の武器なし攻撃 `2 * level`、武器以外の装備の `atk` を合算する。
- `firstTurnAttack`: 1 ラウンド目だけ `getCharAffixSum(char, "firstTurnAttack")`
  を `weaponAtk` に加える。
- `buffAtk`: `getBuffTotal(char, "atk") + getBuffTotal(char, "str")`。
- `str`: `getCharStr(char)`。基礎値、装備の `str`、all-stats 系を含む。
- `randRoll`: `floor(random * 5)`、すなわち 0, 1, 2, 3, 4。
- `def`: `getEffectiveDef(target)`。敵 `def` に `def` buff を加え、buff は
  -6〜+6 に clamp した後、0 未満にならないようにする。
- `meleeMod`: `getMeleeModifiers` の値。現行の 8 職はすべて `1.00`。
- `magicResist`: spell resolution が一時的に適用する
  `getEffectiveMagicResist` の値。敵の base と buff を合成し、-1〜0.9 に clamp
  する。

### 1.2 物理攻撃の全文

物理の通常攻撃は `src/combat_logic/round.js` が次の入力を作り、
`src/rules/character_stats.js` の `calculatePhysicalAttackFormula` を呼ぶ。

```text
weapon = getCharWeaponAtk(char)
       + (roundNumber == 1 ? getCharAffixSum(char, "firstTurnAttack") : 0)

buff = getBuffTotal(char, "atk") + getBuffTotal(char, "str")
str  = getCharStr(char)
roll = floor(random() * 5)                  // 0..4
def  = getEffectiveDef(target)
melee = getMeleeModifiers(char)              // 現行の全職は 1.00

formulaRaw = (
  floor((weapon + buff) * 1.5)
  + (str - 10)
  + roll
  - floor(def / 2)
) * melee

d0 = max(1, floor(formulaRaw))
```

その後の適用順は次のとおり。順序を変えると同じ項でも結果が変わる。

```text
1. Mage / Bishop のみ:
   magicBolt = max(1, floor(getCharInt(char) / 3)
                     + floor(random() * 3)
                     - floor(def / 4))
   d1 = max(d0, magicBolt)
   // magicBolt が d0 より大きい時だけ d1 の値を作る

2. 盲目なら d2 = max(1, floor(d1 / 2))、それ以外は d2 = d1

3. target.physResist が真なら
   d3 = max(1, round(d2 * (1 - target.physResist)))
   それ以外は d3 = d2

4. タグ特効を順番に適用する。
   undead  -> round(d3 * (1 + antiUndead / 100))
   dragon  -> round(previous * (1 + antiDragon / 100))
   demon   -> round(previous * (1 + antiDemon / 100))
   複数タグがあれば else-if ではなく全てを通る。

5. core / support / milestone exposure を
   getDamageAffixResult に渡す。

   core の順序:
   LAST_STAND -> GIANT_SLAYER -> EXECUTIONER
   -> MILESTONE_BREAKER -> THIN_ICE_PACT

   support の順序:
   deepAssault (B3 以降)、fullHpDamage (満 HP)、antiBeast (beast)、
   antiSpirit (spirit) の合計を 1 個の乗数にする。
   その後 milestone boss exposure を乗算する。
   戻り値は max(1, round(input * multiplier))。

6. 対象が guard 中なら d5 = max(1, round(d4 * guard.damageRate))。

7. Ninja かつ target.isBoss でない時だけ
   criticalChance = min(0.15, 0.05 + 0.01 * char.level)
   を作り、当選すれば final = max(1, d5 * 3)。それ以外は final = d5。
```

`applyTargetedDamageBonus` は 4 と 5 を合わせた呼び出し側である。会心判定は
guard の**後**である。#611 の `preCriticalDmg` は guard まで適用した値で、
会心の 3 倍前である。攻撃前の evasive、盲目 miss、通常 miss はこの式に入らず、
この文書の「1 ヒット」は式へ到達した攻撃を指す。

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
arcane = 1 + getCharAffixSum(caster, "arcane") / 100
fire   = 1 + getCharAffixSum(caster, "fireRite") / 100
        // fireRite を使わない呪文では 1

preTarget = round(base * statMultiplier(stat) * arcane * fire)
```

呪文ごとの `base` と固有項は次のとおり。範囲は両端を含む。

| 呪文 | 習得 level | 対象 | `base` | stat | `fireRite` | 固有項 |
| --- | ---: | --- | --- | --- | --- | --- |
| HALITO | 1 | 単体 | `floor(random * 11) + 12` (12–22) | INT | あり | なし |
| LAHALITO | 2 | 全体 | `floor(random * 21) + 15` (15–35) | INT | あり | なし |
| MAHALITO | 3 | 単体 | `floor(random * 21) + 30` (30–50) | INT | あり | なし |
| MADALTO | 6 | 全体 | `floor(random * 31) + 30` (30–60) | INT | なし | なし |
| TILTOWAIT | 8 | 全体 | `floor(random * 51) + 50` (50–100) | INT | なし | なし |
| BADIOS | 1 | 単体 | `floor(random * 11) + 8` (8–18) | PIE | なし | 対象タグ倍率 |

`BADIOS` だけは `preTarget` の後、共通 affix の前に次を一度だけ適用する。
優先順は undead、spirit、demon であり、`else if` なので複数タグを累積しない。

```text
badiosTargetMultiplier =
  target.tags includes undead ? 1.5 :
  target.tags includes spirit ? 1.3 :
  target.tags includes demon  ? 1.3 : 1.0

badiosPreAffix = round(preTarget * badiosTargetMultiplier)
```

呪文全体の残りの適用順は次のとおり。

```text
1. preTarget（BADIOS は上の固有タグ倍率を含む）を
   applyOffensiveAffixes(caster, target, damage) に渡す。
   これは getDamageAffixResult であり、物理の
   antiUndead / antiDragon / antiDemon はここには呼ばれない。
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
| `weaponAtk` | 武器・非武器装備・Ninja素手・罠喰いを合算 | `getCharWeaponAtk`。装備ビルド正本は `atk` と core を build 軸にする | 合算自体はビルド入力として妥当。各入力の単位を同じにする根拠はあるが、最終係数は別項 |
| `buffAtk` | `atk` buff と `str` buff を合算 | `round.js` の呼び出し経路。`STR_POTION` は現行 source で `atk +10` を 5 turn 付与する | `atk` 経路は live。`str` buff の live producer は確認できない。二つを同じ入力へ寄せた設計理由は記録なし |
| `floor((weaponAtk + buffAtk) * 1.5)` | 装備・buff だけ 1.5 倍して切り捨て | `calculatePhysicalAttackFormula` のコードだけ。既存設計正本に根拠なし | **1.5 の由来は根拠不明**。表示と実効をずらすため、将来の正本には採用しない |
| `str - 10` | 10 を基準に 1 倍で加算 | character stats の基礎値と関数の実装 | 基準 10 の慣例以外の設計記録は根拠不明。stat を攻撃へ通す意図は読み取れるが、係数 1 の理由は未記録 |
| `randRoll` | 0–4 の一様整数を加算 | `round.js` の明示的な乱数 | bounded noise であることはコードから分かる。固定幅を選んだ理由は根拠不明 |
| `-floor(def / 2)` | 物理だけ flat 減算 | `calculatePhysicalAttackFormula` と `getEffectiveDef` | 物理防御を使う意図は分かるが、2 で割る理由、floor の位置は根拠不明 |
| `meleeMod` | 職業別 map、現行値は全て 1 | `getMeleeModifiers`。derived stats との共有を意図したコメント | 拡張点の存在は source の説明がある。現行の職業差を作る設計根拠はない |
| `max(1, floor(...))` | 物理式の出力を最低 1 | source の clamp | 0 ダメージを避ける形は読めるが、設計正本で理由は未記録 |
| `magicBolt` | Mage/Bishop の通常攻撃だけ `max(physical, int/3 + 0..2 - def/4)` | `round.js` の分岐のみ | **ゲーム内・設計正本に記載がなく根拠不明**。隠れた第2式として扱わない |
| 盲目 | 式の後に `floor(dmg / 2)` | `.agents/game-design.md` が「攻撃 miss と incoming-damage penalty」を明記。具体的な 1/2 は source | 盲目が combat disruption であることは意図。1/2 の係数は code が値の正本 |
| `physResist` | 式の後に割合乗算、最低 1 | source の分岐 | 物理耐性を持たせる意図は分かるが、def と別モデルにした理由は根拠不明 |
| タグ特効 | `antiUndead` → `antiDragon` → `antiDemon` を各 round | `applyTargetedDamageBonus`、support affix registry | 特効という build input は equipment-builds 正本にある。**物理だけへ接続する理由はない** |
| core / support | core 5 種、条件 support、boss exposure を乗算 | `getDamageAffixResult` と equipment-builds の core/support 方針 | build の rule-changing effect である点は意図。物理と呪文の共通 hook から分けた理由は根拠不明 |
| guard | targeted bonus の後に `guard.damageRate` | `round.js` | encounter-local guard の軽減であることは source から分かる。順序の設計記録は根拠不明 |
| Ninja 会心 | guard 後、非 boss のみ、level で確率、×3 | `round.js` | Ninja の class identity として記録された passive は `src/data/classes.js` では確認できない。現状の限定は根拠不明 |

### 2.2 呪文

| 項 | 現在の形 | 確認できる根拠 | 設計上の扱い |
| --- | --- | --- | --- |
| 呪文ごとの dice | 12–22、15–35、30–50、30–60、50–100、8–18 | `src/data/spells.js` の説明と `spell_effects.js` の roll | 呪文ごとに identity を持つことは source と description に明示。各幅を選んだ理由は根拠不明 |
| stat multiplier | `(stat - 10) * 0.02`、+40% cap | `getSpellStatBonus` | stat を spell power にする意図は読める。2% 刻みと int30 cap の根拠は根拠不明 |
| `arcane` | pre-affix の乗算 | support affix registry と `spell_effects.js` | 装備で spell を伸ばす入力としては equipment-builds と接続する。係数・名称以外の成長設計は未記録 |
| `fireRite` | HALITO / LAHALITO / MAHALITO のみ乗算 | `spell_effects.js` と affix registry | 火系固有の入力として読めるが、なぜ 3 呪文だけかは根拠不明 |
| BADIOS 固有タグ | undead 1.5、spirit/demon 1.3 を共通 affix 前に適用 | `BADIOS` の else-if | BADIOS の「不浄への一撃」という identity は description と整合するが、倍率と優先順は根拠不明 |
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
| `weaponAtk` | 6 | `floor(6 * 1.5)` により attack 項は 9。表示値 6 の 1.5 倍がここで入る |
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

#### 物理の支配項

次は class × B1–B10 の全 physical hit を、`formulaRaw` の重みで平均した値。
`attack` は `floor((weaponAtk + buffAtk) * 1.5)`、`str` は `str - 10`、
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
`src/systems/item_effects.js` の `STR_POTION` が `addCharBuff(char, "atk", 10, 5)`
を行うため、実測平均は Fighter 0.033、Priest 0.059、Mage 0.055 など非ゼロ
だった。一方、`getBuffTotal(char, "str")` の live producer はこの経路では確認
できない。従って #722-6 の非対称は「同じ str が現在二つの live 値で違う」のではなく、
**将来 str buff が入った時に 1.5 と 1.0 の重みが衝突する未整理の経路**として判定する。

#### 物理の後段分岐の実測率

率の分母は各職の `physicalPlayerHits`。魔法の矢は Mage/Bishop の全通常攻撃、
会心は最終的に 3 倍になった hit の率である。

| 職 | magic bolt | blind 適用 | phys resist 適用 | critical |
| --- | ---: | ---: | ---: | ---: |
| Fighter | 0% | 7.152% | 14.941% | 0% |
| Thief | 0% | 2.591% | 14.833% | 0% |
| Priest | 0% | 4.082% | 9.370% | 0% |
| Mage | 4.111% | 1.344% | 2.213% | 0% |
| Samurai | 0% | 9.740% | 13.444% | 0% |
| Bishop | 0.172% | 6.106% | 13.171% | 0% |
| Ranger | 0% | 8.088% | 14.786% | 0% |
| Ninja | 0% | 6.052% | 14.242% | 6.760% |

したがって「魔法の矢は存在する」という経路確認だけでなく、今回の run では
Mage 1,265 hit の 4.111%、Bishop 16,263 hit の 0.172%で実際に値を採用した。

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

`antiUndead` は物理 2,218 hit で実際に +3.701 の平均差を作った。一方、呪文の
共通 target-tag stage は BADIOS 固有倍率だけで、`antiUndead` / `antiDragon` /
`antiDemon` の共通 hook は通っていない。BADIOS 自体の target-tag stage は
49,780 hit で平均 +0.710だった。これが #719 の配線漏れと、呪文固有倍率を
共通特効へ二重適用してはいけない根拠である。

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
| 1 | 物理は `-floor(def/2)`、呪文は `×(1-magicResist)` | **欠陥** | `def` と `magicResist` が別 input・別順序で、同じ低 damage 帯で別の clamp を持つ理由が正本にない。physical raw の def 項は 8 職で平均 -0.174〜-1.339、spell の resist stage は呪文ごとに符号付きで平均 +0.72〜+2.73だった。異なる軽減を採るなら、敵表示と player decision まで含む理由が必要だが未記録。 | 決定 1 |
| 2 | 物理は装備で伸び、呪文は固定 dice と +40% stat cap | **欠陥** | core-loop 正本は run 内 loot build を depth の評価軸にする。physical は B1→B10 で Fighter 20.45→51.70、spell は観測 Mage B1→B10 25.58→32.19で、呪文の伸びが上位呪文の習得と偶然の build に依存する。`arcane` は存在するが、共通 spell-power の設計がない。 | 決定 2 |
| 3 | レベルはほぼ damage に寄与せず、呪文だけ level gate を持つ | **欠陥** | `str`/`int` の base はレベルで自動増加せず、spell learn は lv2/3/6/8に固定。今回 MADALTO は N=139、TILTOWAIT は N=0で、到達した run だけで上位呪文を評価する構造になっている。level gate と level power の対応が正本にない。 | 決定 3 |
| 4 | `antiUndead` / `antiDragon` / `antiDemon` は物理のみ | **欠陥（配線漏れ）** | `applyTargetedDamageBonus` の呼び出し元は physical。physical `antiUndead` 2,218 hit は before 18.289→after 21.990（+3.701）だが、spell の共通 target-tag stage は 0で、BADIOS 固有倍率だけが別にある。equipment-builds 正本は anti tag を support affix として扱うが、攻撃手段限定の記録はない。 | 決定 4、#719 |
| 5 | `weaponAtk + buffAtk` だけ 1.5 倍 | **欠陥** | `calculatePhysicalAttackFormula` に係数はあるが、設計正本・balance 判断・source comment に由来がない。physical の raw share は全職で attack 47.8〜85.9%と最大項で、Fighter の実例でも表示 weapon 6 が attack 9になる。表示の `+20` が実効 `+30`になるため、#718/#720 の表示と実効を壊す。 | 決定 5、#718、#720 |
| 6 | buff 経由の `str` は 1.5、素の `str` は 1.0 | **欠陥（未整理の潜在経路）** | 現行 run では `STR_POTION` の `atk` buff が live で、`buffAtk` 平均は 0〜0.059。`getBuffTotal("str")` の producer は未確認なので、Issue本文の「全 buffAtk が dead」は現行 source と一致しない。ただし将来 str buff を追加すると同じ意味の stat が別単位になる。意図の記録はない。 | 決定 5 |
| 7 | physical は固定幅 0–4、spell は呪文ごとの比例的な幅 | **意図（ただし理由の記録不足）** | 物理の 0–4 は全職で rand 平均 1.99〜2.01、spell は source の呪文 description に 12–22〜50–100という個別 range が明記されている。攻撃と呪文の identity を分ける形そのものは明示的で、配線漏れではない。一方、固定幅・比例幅を選んだ設計理由と相対 CV の目標は根拠不明なので、将来の tune では「意図」としてこの文書を参照する。 | 決定 2、分散方針 |
| 8 | 会心は Ninja の非 boss のみ | **欠陥（未文書化）** | source は `char.class === "Ninja" && !target.isBoss` の呼び出し側分岐だけで、class data と既存設計正本に会心 passive の記録がない。実測 critical は Ninja 6.760%、他 7 職 0%。boss 除外の理由も正本にない。 | 決定 6 |
| 9 | Mage/Bishop に undocumented `magicBolt` fallback | **欠陥（未文書化の第2式）** | source では physical formula の後に `max(d0, int/3 + 0..2 - def/4)`を実行し、実測採用率は Mage 4.111%、Bishop 0.172%。ゲーム内 description、`game-design*.md`、class passive に記載がない。職業の主軸を hidden fallback で補う理由はなく、#558 の trapGuard と damage role の比較をさらに曖昧にする。 | 決定 3、職業軸 |
| 10 | spell stat +40%、trap disarm 90など上限配置に共通方針がない | **欠陥（方針欠落）** | `getSpellStatBonus` は int30で+40%固定、`calculateDisarmRate` は適性職90 cap。cap の存在は source で確認できるが、超過投資をどう扱うかの共通方針がない。B1–B10分布でも affix/core の stage は常時発動ではなく、hard capで investment が dead になるかを測らずに判断できない。 | 決定 7、#713 |

### 4.1 #7 を「意図」とした範囲

「physical と spell は同じ乱数分布でなければならない」という要求は現行正本に
ない。呪文は各 spell の range を player-facing description に載せ、physical は
式に固定幅を埋め込んでいるため、差の**存在**は明示されている。よって #7 の
判定は意図とする。ただし、なぜ physical が固定幅で spell が比例幅なのか、どの
CV を目標にしたのかは根拠不明であり、意図を過去のバランス判断として捏造しない。

## 5. 決めるべきこと 7 項目の結論

### 1. 軽減は減算か乗算か

**乗算で揃える。** 敵の physical defense も、プレイヤーが意思決定に使う
「何割残るか」に変換可能な bounded resistance として扱う。def をそのまま
`-floor(def/2)` に残す理由はない。物理耐性・魔法耐性の表示は、適用される
最終的な軽減率と一致させる。変換係数や現行値は #716 の実測で決め、#722 では
変更しない。

### 2. 呪文は装備で伸びるべきか

**伸びるべき。** core-loop の主軸は run 内 build であり、攻撃呪文だけが固定
dice と習得 level に閉じると、loot の判断対象から外れる。既存 `arcane` は
一つの明示された装備入力として残すが、それだけで全 spell の成長を暗黙に
担わせない。共通の spell-power（名称と供給 source を明記したもの）を用意し、
火・神聖などの固有 affix はその上に別の明示項として重ねる。上位 spell の
range 値はこの Issue で変えない。

### 3. レベルはダメージに寄与すべきか

**寄与すべき。物理と呪文の両方へ小さく寄与させる。** レベルは build を置き
換える主役ではなく、同じ build の到達感を作る補助軸にする。呪文だけが level
を要求し、damage power は level に無関係という現在の組み合わせは採用しない。
level contribution の exact curve と、spell learn level を到達 3.77 帯でどう
扱うかは #599/#653 の実測で別に決める。`magicBolt` のような hidden fallback
を level contribution の代わりに残さない。

### 4. 特効は攻撃手段を問わないか

**問わない。攻撃手段非依存で一度だけ適用する。** `antiUndead`、`antiDragon`、
`antiDemon` は物理・攻撃呪文の共通 target-tag stage へ移す。BADIOS の 1.5/1.3
は spell identity の intrinsic stage として残す余地があるが、共通 anti tag と
同じタグを二重に掛けない。#719 はこの結論を実装する配線 Issue であり、#722
ではコードを直さない。

### 5. 装備とステータスの重みは等価か

**表示単位と実効単位を等価にする。** `weaponAtk` や `atk` の表示 +1が、記録の
ない係数によって +1.5 になるモデルは採用しない。`str`、`atk`、weapon の各
入力を将来異なる重みにするなら、その重みを明示的な項として UI・設計正本・
telemetry に出す。#718 の「罠喰い +20」と #720 の式はこの決定に従うが、値の
変更はそれぞれの Issue で行う。

### 6. 会心は職業限定か、全職の機構か

**機構は全職共通、確率は職業データで変えられるものとする。** Ninja の identity
として高い確率を持つこと自体は別途採用できるが、round caller の Ninja-only
隠し分岐と boss-only exclusion を設計正本にしない。非 Ninja の確率を 0 にする
なら、それも class data と player-facing description で明示する。boss 無効化は
対象 property として明示し、理由を記録する。

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
- `game-design.md` の blind は combat disruption であり、盲目の incoming damage
  penalty は意図として維持する。本書はその 1/2 の実行順を記録する。
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
| #719 タグ特効が呪文に乗らない | 非対称 #4、決定 4 | 配線漏れと確定。共通 target-tag stage へ一度だけ適用する。コード変更は #719。 |
| #720 物理式の ×1.5 | 非対称 #5、決定 5 | 根拠不明の hidden weight と確定。表示単位と実効単位を揃える。コード変更は #720。 |
| #718 罠喰いの表示 +20 / 実効 +30 | 非対称 #5・#6、決定 5 | `weaponAtk` の 1.5 が原因。表示 +1 を実効 +1 とする。個別値の変更は #718。 |
| #716 敵の耐性が表示されない | 非対称 #1、決定 1 | 軽減率を player decision と一致させる。表示文言と耐性値の調査・UI変更は #716。 |
| #713 盗賊の解除率が90に張り付く | 非対称 #10、決定 7 | hard cap で投資を無価値にしない。逓減または超過変換を #713 で測る。 |
| #599 lv5以上の呪文が到達帯に届かない | 非対称 #2・#3、決定 2・3 | spell growth と level gate を同じ到達分布で再設計する。到達値・習得値の変更は #599。 |
| #558 Mage `trapGuard=60` が Fighter `40` を上回る | 非対称 #9、決定 3 と職業軸 | 罠 sustain を damage compensation に使わず、職業軸を罠・戦闘・resource に分けて評価する。#558 の passive 値は変更しない。 |
| #721 monster drop の旧 positional API | 本書の範囲外 | ダメージモデルの判断対象ではない。配下の配線欠陥として記録だけし、コードを変更しない。 |
| #717 Mage physical が成立しない | 非対称 #1・#2・#3・#9 | #716後の実測で A/B/C を判断する前提を維持する。本書は hidden magicBolt を正当化せず、#717 の値変更は行わない。 |

### 6.3 満たすべき性質

今後の各実装 Issue は、少なくとも次を確認する。

- 職業の主軸が、装飾 1 枠や undocumented fallback で反転しない。
- UI の説明値、telemetry の入力、実効 damage が同じ単位で読める。
- 到達レベル 3.77 の run でも、有効な攻撃呪文と build choice が残る。
- B5 以降も、装備・spell power・level のどれかが明示的に伸びる余地を持つ。
- hard cap に到達した投資が黙って無価値にならない。
- physical と spell の差がある場合、呪文固有 identity と共通 combat model のどちら
  に属する差かを本文と source で判別できる。

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
