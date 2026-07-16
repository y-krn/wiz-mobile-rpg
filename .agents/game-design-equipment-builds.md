# Game Design: Equipment Build System (Core / Support Affixes)

Tracking issue: y-krn/wiz-mobile-rpg#120 (closed — all phases merged)

Status: **implemented** via PR #126 (Phase 1), #127 (Phase 2), #128 (Phase 3),
#129 (Phase 4). This document is the canonical reference for the system's
design intent and its tuning surfaces. Numbers below reflect the merged
implementation; when code and this document disagree, fix whichever is wrong
against the design intent stated here.

# 概要

ビルド多様性の欠如（実効ビルド数 ≈ 職業選択8通りのみ）を解消するため、装備を
「コア」「サポート」の2階層アフィックスに再設計した。シナジーシステム
（`SYNERGIES` / `getActiveSynergyMod`）は Phase 1 で廃止済み。パーティ横断の
自動発動ボーナスは存在せず、効果はすべて装備者個人に帰属する（例外は明示的な
パーティ効果型コア3種のみ）。

目標: 実効ビルド空間 ≈ 16コア × 職業適性2〜3 × サポート構成 ≈ 60〜80。

# 全体構造

- **コア16種**: ルールを変える効果。ドロップ限定。商店・行商・契約報酬からは
  出ない（生成APIの `allowCores: false`）。1キャラにつきコア装備は1個まで
  （装備UIで強制）。1アイテムにつきコアは1個まで（生成側で強制）。
- **サポート47種**: 数値・小効果。刻印（工房）で付与・上書き可能。
  内訳: basic 25 / conditional 11 / trigger 6 / economy 5。
- 純粋な数値上位のコアは作らない。全コアはサイドグレード。
- レジストリ: `src/data/affixes.js`（データのみ）。判定・効果ヘルパー:
  `src/rules/affix_rules.js`。

# コア16種

各効果パラメータの実値は `src/data/affixes.js` の `params` が単一の参照元。

## 戦闘系（Phase 2）

| 名称 | id | 効果 | 部位 |
|------|----|------|------|
| 背水 | CORE_LAST_STAND | HP25%以下で与ダメ+40% | 武器 |
| 先手必勝 | CORE_OPENER | 先制成功時、初撃に追撃確定 | 装飾 |
| 血杖 | CORE_BLOOD_WAND | MP不足時、呪文をHP(コスト×2)で発動可(HP下限1) | 武器 |
| 浄化の環 | CORE_PURIFY_RING | undead・demonキル毎にMP1回復 | 装飾 |
| 罠喰い | CORE_TRAP_EATER | 罠解除毎に遠征中攻+2累積(上限+20、帰還でリセット) | 装飾 |
| 呪飼いの鎖 | CORE_CURSE_KEEPER | 装備中の呪い1個毎に全ステ+3 | 装飾 |
| 巨人殺し | CORE_GIANT_SLAYER | 自分よりmaxHPの高い敵へ与ダメ+30% | 武器 |
| 殿の構え | CORE_REARGUARD | 後列の近接倍率ペナルティ無効 | 武器 |
| 反撃の棘 | CORE_THORN_SHIELD | 被弾時30%で威力50%の反撃 | 盾 |
| 執行人 | CORE_EXECUTIONER | 状態異常中の敵へ与ダメ2倍 | 武器 |

「先制」は本作では速度先行行動を指す: round 1 で敵より先に行動した場合のみ
`combatFirstStrikeActive` が立ち、round終了で消える。

## 経済・探索系（Phase 3）

| 名称 | id | 効果 | 部位 |
|------|----|------|------|
| 忍び足 | CORE_SNEAK_STEP | 門番・ボス感知範囲半減＋オーラ検知+1 | 鎧 |
| 盗掘王 | CORE_TOMB_RAIDER | 宝箱素材+1個、罠強度+1段階 | 装飾 |
| 慧眼 | CORE_KEEN_EYE | 未鑑定装備を装備可能(効果適用・表示は鑑定まで隠匿) | 装飾 |
| 野営の達人 | CORE_CAMP_MASTER | キャンプ休息の回復量2倍(本人のみ) | 鎧 |
| 賞金稼ぎ | CORE_BOUNTY_HUNTER | 契約対象のキル・納品を2倍カウント | 装飾 |
| 学者の眼 | CORE_SCHOLAR_EYE | 図鑑未登録の敵から素材確定ドロップ | 装飾 |

パーティ効果型（忍び足・賞金稼ぎ・学者の眼）は装備者1人で有効。判定は必ず
`getPartyCoreParams`（封印を考慮する）経由で行い、`partyHasCoreAffix` を
効果判定に直接使わない。装備者が hp0 / dead / ash のときは無効。

慧眼の効果適用は表示レイヤーでなく機構レイヤー
（`getCharAffixSum` 内 `canApplyUnidentifiedEquipmentEffects`）で行う。
慧眼コア自体は鑑定済み装備でのみ有効（循環なし）。呪い付き未鑑定を装備した
場合に呪いが発動するのは仕様（このコアのリスク）。

# サポート47種

- basic 25（Phase 1 で既存移行）: str/int/pie/vit/agi/luk, hp/mp, atk/def,
  antiUndead/antiDragon/antiDemon, poisonWard, spellGuard, trapBonus,
  treasureSense, arcaneSense, hearRange, traceRead, followUp, arcane,
  devotion, guardian, firstStrike
- conditional 11（Phase 2）: deepAssault(B3F以深攻+) / frontGuard /
  rearEvasion / fullHpDamage / firstTurnAttack / antiBeast / antiSpirit /
  firstStrikeDefense / lastSurvivorStats / statusResistance / spellAccuracy
- trigger 6（Phase 2/3）: killHeal / followUpMp / hitFlinch / trapGold /
  victoryMaterial / stairsHeal
- economy 5（Phase 3）: identifyDiscount / materialFind / goldBonus /
  contractReward / merchantDiscount

倍率系経済サポート（goldBonus / materialFind / contractReward）はパーティ内
**最大値1人分**（`getPartyMaxAffix`）で適用し、積み重ねインフレを防ぐ。

当初案の「疲労中ペナルティ半減」は疲労システム未実装のため見送り（実装時に
conditional として追加を検討）。

# 生成・入手規則

- レアリティ構成: コモン=サポート1 / レア=サポート2 or コア1(50%) /
  エピック=コア1＋サポート2
- ポイント予算制: サポート cost 1〜3、コア一律10。予算はレアリティ×フロア
  深度（`AFFIX_BALANCE.budgetsByRarityAndFloor`）
- コア付きドロップの30%は呪い付き（`AFFIX_BALANCE.coreCurseChance`）
- フロア別コアプール重み: B1-B2=経済系中心、B3+=戦闘系中心
- コア入手源は迷宮由来のみ。商店・行商・契約報酬の生成呼び出しは
  `allowCores: false`

# 工房（Phase 4）

境界: **工房で扱えるのはサポートのみ**。コアは工房で作成・付与・移動・削除
できない。唯一の例外は封印によるコア弱体化。

- **刻印20種**（`TAG_EFFECT_MAP`）: 既存12種＋経済系4種（素材探し/金運/
  契約巧者/商談）＋条件数値系4種（深層攻勢/無傷の猛攻/不屈/精唱）
- **研磨**: サポートアフィックス1つを value 1.5倍（切り上げ）。1装備1回
  （`polished` フラグ）。コアは対象外。コスト: `AFFIX_BALANCE.polishCost`
- **封印のコア半減**: 呪い封印時に `coreSealed: true` を付与。半減規則は
  `CORE_SEAL_RULES`（`src/rules/affix_rules.js`）に一元化 —
  倍率系は「1+(x-1)/2」、確率・定数系は半分（切り捨て）、boolean系
  （浄化の環/殿の構え/盗掘王/慧眼/賞金稼ぎ/学者の眼）は無効。血杖は
  HPコスト2倍→4倍。装備表示は「◆(封)名称」

# バランス枠組み

- コアの評価規則: **期待稼働率換算で無条件+15%相当を上限**。
  例: 背水+40%×稼働20%≒実効+8%
- 調整つまみは2箇所のみ: `AFFIX_BALANCE`（cost / 予算 / ロール構成 /
  呪い率 / 研磨費）と `CORE_SEAL_RULES`（封印弱体）。フック側に数値を
  直書きしない
- 数値変更は balance-simulation チェックリストを通す

# UI・可視化

- 装備画面: コアは「◆名称: 条件文」1行、封印済みは「◆(封)名称」。
  サポートは数値表示（`formatAffixText` に一元化）
- 戦闘ログ: コア発動を必ず明示（`getCoreLogText` / `logCoreActivation`）。
  常時系は戦闘中初回のみ、トリガー系は毎回。探索系は探索ログに出す
- 慧眼で装備した未鑑定品は内容を「???」で隠す

# 検証

- deterministic unit: `scratch/test_affixes.js`（レジストリ整合・予算・生成）、
  `scratch/test_core_affixes.js`（全コアの効果・封印半減・研磨制限）
- `npm run test:unit` / `npm run lint` / `npm run build` /
  `npm run test:browser`

# 今後の課題

- コア期待稼働率の実測 → `AFFIX_BALANCE` 調整（実プレイデータ待ち）
- 疲労システム実装時: 「疲労中ペナルティ半減」サポートの追加検討
- 図鑑のコア発見録（16種コレクション表示）は未実装 — 実装する場合は別Issue
