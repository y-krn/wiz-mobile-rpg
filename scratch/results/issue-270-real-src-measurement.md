# Issue #270 実src再測定

## 条件

- 起点: `origin/main` `d9b2063`
- N=500 / scenario
- calibration N=500
- seed=231
- target=B20
- 全floorを `generateRunFloor` 経由で生成
- 戦闘報酬は `runCombatRoundCalculation` 内から1回だけ適用

## Before（実装前）

工房解放済み（帰還の翼あり）:

- 前半core遭遇: 44.2%
- 前半core装備: 36.2%
- core定着: 81.9%
- 装備: 20.18/run
- 前半換装: 5.87/run
- 深層core遭遇: 3.0%
- rarity: magic 52.2% / rare 19.2% / epic 5.0% / 固定base 23.6%
- 未鑑定ギャンブル: 15.41/run
- 呪い: 17.6% / core呪い 31.2%
- support: 0.879/装備
- 平均到達: B4.95
- 生還: 73.2%
- EV/時間: 0.2447

参考:

- 工房未解放: core遭遇 64.8% / core装備 57.0% / 前半換装 7.24 / 平均到達 B6.86 / 生還 47.2%
- 翼不使用: core遭遇 68.4% / core装備 62.8% / 前半換装 7.92 / 平均到達 B8.91 / 生還 10.4%

再現コマンド（変更前src状態）: `node scratch/sim_depth_material_ev.js`

## After（実装後）

変更:

- `AFFIX_BALANCE.budgetsByRarityAndFloor.rare`: `[0, 6, 7, 8, 9, 10]` → `[0, 10, 10, 10, 10, 10]`
- `AFFIX_BALANCE.rollComposition.rare.coreChance`: `0.5` → `0.75`

工房解放済み（帰還の翼あり）:

- 前半core遭遇: 65.4%（before 44.2%、+21.2pt）
- 前半core装備: 58.2%（before 36.2%、+22.0pt）
- core定着: 89.0%（before 81.9%、+7.1pt）
- 装備: 19.22/run（before 20.18、-0.96）
- 前半換装: 5.51/run（before 5.87、-0.36）
- 深層core遭遇: 2.6%（before 3.0%、-0.4pt）
- rarity: magic 52.8% / rare 19.5% / epic 5.2% / 固定base 22.5%
- 未鑑定ギャンブル: 14.90/run（before 15.41、-3.3%）
- 呪い: 18.3% / core呪い 27.8%
- support: 0.790/装備（before 0.879、-0.089）
- 平均到達: B4.77（before B4.95、-0.18）
- 生還: 74.0%（before 73.2%、+0.8pt）
- EV/時間: 0.2386（before 0.2447、-0.0061、-2.5%）

参考:

- 工房未解放: core遭遇 78.4% / core装備 71.2% / 前半換装 7.10 / 平均到達 B6.78 / 生還 51.2%
- 翼不使用: core遭遇 76.8% / core装備 74.6% / 前半換装 7.55 / 平均到達 B8.40 / 生還 9.0%

再現コマンド（変更後src状態）: `node scratch/sim_depth_material_ev.js`

## 試算値との差

主軸条件:

- 前半core遭遇: 試算 67.6% → 実src 65.4%（-2.2pt）
- 前半core装備: 試算 61.8% → 実src 58.2%（-3.6pt）
- core定着: 試算 91.4% → 実src 89.0%（-2.4pt）
- 前半換装: 試算 6.08 → 実src 5.51（-0.57）
- 深層core遭遇: 試算 2.8% → 実src 2.6%（-0.2pt）
- 固定base: 試算 22.7% → 実src 22.5%（-0.2pt）
- 未鑑定ギャンブル: 試算 16.54 → 実src 14.90（-1.64）
- support/装備: 試算 0.780 → 実src 0.790（+0.010）
- 平均到達: 試算 B5.17 → 実src B4.77（-0.40）
- 生還: 試算 74.4% → 実src 74.0%（-0.4pt）
- EV/時間: 試算 0.2463 → 実src 0.2386（-0.0077）

## Acceptance 判定

- 前半core遭遇 67〜71%: **未達**（65.4%）
- core装備率 / 定着率: 改善したが試算未達（58.2% / 89.0%）
- 前半換装 4〜5回以上: **達成**（5.51）
- 深層core遭遇を大きく動かさない: **達成**（3.0%→2.6%）
- rarity実出現比・固定base維持: **達成**（固定base 23.6%→22.5%）
- 未鑑定ギャンブル増加を小幅に抑制: **達成**（実際は15.41→14.90へ減少）
- 平均到達・生還・EV/時間を悪化させない: **一部未達**（平均到達とEV/時間が悪化、生還は改善）
- support/装備の減少幅確認: 0.879→0.790（試算0.780）

目標値へ合わせる追加パラメータ調整は実施しない。

## 波及確認

- support 0 の rare-core:
  - 実src after の3 scenarioすべてで `support rare-core分布: 0=100.0%`。
  - 装備UIは core/support を個別にfilterし、0件のsupport sectionを省略するため表示可能。
  - 装備プレビューは派生値とcore評価を別経路で加算し、support配列の先頭や1件以上を前提にしない。
  - アイテム説明は全affixをmapするためcore 1件だけでも表示可能。
- 呪い:
  - `IDENTIFICATION_BALANCE.coreCurseBonus` は `hasCoreAffix` の真偽へ加算され、support件数に非依存。
  - 主軸実測は全装備呪い 17.6%→18.3%、core呪い 31.2%→27.8%。
- core 1個制限:
  - `canEquipCoreAffix` は装備中全slotの `hasCoreAffix` を検査し、候補のsupport件数に非依存。
  - 同slot交換を許可し、別slotの2個目coreを拒否する既存unit testが通過。
- テスト期待値:
  - 旧rare予算配列または `coreChance=0.5` のハードコードなし。
  - `allowCores=false` のlegacy support件数期待値は今回変更の対象外で、そのまま通過。
  - テスト削除・期待値変更なし。

## Review checklist

- 適用: balance-simulation
- 採用 findings:
  - 前半供給、rarity、未鑑定、呪い、support、到達、生還、EV/時間を同一seedで比較。
  - deterministic seed と実src generatorを使用。
  - 目標未達と副作用悪化をそのまま記録。
- 不採用 findings:
  - rarity前傾、epic予算、drop、経済、翼の追加調整。Issue境界外かつ明示禁止。
- verdict: fail with evidence（前半core遭遇率と平均到達・EV/時間 Acceptance未達）

## 検証

- `npm run lint`: exit 0
- `npm run test:unit`: exit 0（55本、skip 0）
- `node scratch/sim_depth_material_ev.js`: exit 0
- `node scratch/sim_workshop_progression.js`: exit 0
- iOSシミュレータ: 未実施。リポジトリにXcode project/workspace、Capacitor、`ios/`構成なし。

検証コマンド:

- `npm run lint`
- `npm run test:unit`
- `node scratch/sim_depth_material_ev.js`
- `node scratch/sim_workshop_progression.js`
