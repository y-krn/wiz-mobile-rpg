# Issue #629: 物理攻撃式の武器項整数化 — 深度sim before/after

## 修正内容

`src/rules/character_stats.js` の `calculatePhysicalAttackFormula` の武器+バフ項を
`Math.floor((weaponAtk + buffAtk) * 1.5)` へ変更（オーナー判断 2026-08-15 の指定通り）。
`atk` データ値・`* 1.5` 係数・`str - 10` 基準・`floor(def / 2)` は変更なし。

呼び出し元は最終的に `Math.max(1, Math.floor(...))` を通すため、`meleeMod = 1`
（通常攻撃・被弾経路の全職）ではこの変更で最終ダメージは不変（Codex実測: 105,903/105,903件で不変）。
`meleeMod = 0.7` の追撃経路（`src/combat_logic/round.js:406-415`）だけ `Math.max(1,
Math.floor(raw × 0.7))` が変化しうる。

## 前提の是正（本セッションで実施）

worktree `.claude/worktrees/issue-629-integer-attack-display` を `origin/main`
（`345efea`、#637/#638/#639/#640/#644/#645 込み）へリベースした。HEAD は `ea4fea3`
（rebase後）。#612 の基準線（戦士6.14/盗賊5.22/僧侶4.83/魔術師6.44）は、PR #645（#641）で
depth sim のキャンプ床判定が是正される前の値であり照合しない。

## 検証

- `npm run lint`: PASS
- `npm run test:unit`: PASS（94/94）
- `npm run test:browser`: PASS（172/172、360/390/430pxの奇偶武器交換テスト含む）
- `node --check scratch/simulations/sim_depth_material_ev.js`: OK
- `SIM_RUNS=1` スモーク: 正常終了

## 測定方法

同一worktree・同一env（デフォルト、`SIM_SEED=231`、`SIM_RUNS=500`、`SIM_PARALLEL`未指定）で、
before/afterをコード差し替えにより実行した（#641/#645と同じ方式）。

- **after**: rebase後のHEAD（`ea4fea3`）をそのまま実行。
- **before**: afterのコードから `calculatePhysicalAttackFormula` の武器項の
  `Math.floor` だけを一時的に除去した状態（他は無変更）で実行。

再現コマンド（このリポジトリの `character_stats.js:204` を該当行だけ差し替えて再現）:

```sh
# after（このIssueの修正後コード、そのまま）
node scratch/simulations/sim_depth_material_ev.js > after.log

# before（一時的に武器項のfloorだけ外す: return ((weaponAtk + buffAtk) * 1.5 + ...) * meleeMod;）
node scratch/simulations/sim_depth_material_ev.js > before.log
```

生ログは `evidence/results/` に置かない（AGENTS.mdの方針通りraw dumpは非コミット）。

## 結果: 6workshop状態中5つはbefore/after完全一致

`empty` / `stats` / `gear` / `blood-wand` / `blood-wand-spells` の5状態は、B5撤退〜B20撤退の
全戦略行が **bit-for-bit** で一致した（差分ゼロ）。武器項の整数化による乱数消費は変わらないため、
これらの状態では武器atk+バフの和が「odd × 1.5でfloorが効く」かつ「追撃が発火する」という条件に
十分に到達しないrunが大半であることを示す。

差分が現れたのは **`complete`（工房買い切り済み）の`B20撤退`戦略だけ**。最良装備を持つほど
weaponAtk+buffAtkが奇数になりやすく、かつfollowUp affix装備率も上がるため、この状態でだけ
追撃-1の影響が観測可能になったと考えられる。

## 到達階平均・生存率（workshop-complete, 全4職ラウンドロビンN=500、B20撤退戦略）

| 指標 | before | after | Δ |
|---|---:|---:|---:|
| 生還率(Wilson) | 11.0% [8.5,14.0] | 12.2% [9.6,15.4] | +1.2pt |
| 死亡率(Wilson) | 89.0% [86.0,91.5] | 87.8% [84.6,90.4] | -1.2pt |
| 平均到達階 | 3.25 | 3.22 | -0.03 |
| 素材EV/時間 | 0.1295 | 0.1447 | +0.0152 (+11.7%) |
| bank保持率 | 45.1% | 50.1% | +5.0pt |

生還率・死亡率のΔはいずれも95% CIが大きく重なり（例: 11.0[8.5,14.0] vs 12.2[9.6,15.4]）、
**N=500の測定ノイズの範囲内**。方向もむしろ生還率・EV/時間とも改善方向で、劣化ではない。
他5状態（empty/stats/gear/blood-wand/blood-wand-spells）は差分ゼロなので、これが全workshop状態を
通じた実質的な唯一の観測点になる。

## B5 / B10 到達率（同条件、全4職N=500）

| 指標 | before | after | Δpt |
|---|---:|---:|---:|
| B5 entrant | 24.4% [20.8,28.4] | 23.8% [20.3,27.7] | -0.6 |
| B10 entrant | 4.2% [2.8,6.3] | 3.8% [2.4,5.9] | -0.4 |
| B5突破（entrant内） | 20.5% [14.3,28.5; N=122] | 21.8% [15.4,30.1; N=119] | +1.3 |
| B5死亡（entrant内） | 61.5% [52.6,69.6; N=122] | 63.0% [54.1,71.2; N=119] | +1.5 |

すべてCIが重なり、ノイズの範囲内。他5workshop状態は差分ゼロのため、これも唯一の観測点。

## 追撃-1がどの職に効いたか（職業別、workshop-complete B20撤退、N=125/職）

`followUp`（追撃）はクラス固定ではなく `getCharAffixSum(char, "followUp")` によるアフィックス依存
（`src/rules/affix_rules.js:213`、`getFollowUpChance`）。装備が良いほど発火機会が増える。
最良装備状態（complete）でのみ差分が観測されたのはこの構造と整合する。

| 職 | 全run生還率 before→after | 全run死亡率 before→after | 平均到達階 before→after |
|---|---:|---:|---:|
| Fighter | 20.8%→16.8% (-4.0pt) | 79.2%→83.2% (+4.0pt) | 4.00→3.81 (-0.19) |
| Thief | 14.4%→20.0% (+5.6pt) | 85.6%→80.0% (-5.6pt) | 3.54→3.49 (-0.05) |
| Priest | 1.6%→4.8% (+3.2pt) | 98.4%→95.2% (-3.2pt) | 2.82→2.58 (-0.24) |
| Mage | 7.2%→7.2% (0pt) | 92.8%→92.8% (0pt) | 2.62→3.00 (+0.38) |

N=125/職のWilson CIは互いに大きく重なり（例: Fighter生還率 [14.6,28.7] vs [11.3,24.3]）、
4職間で方向も揃っていない（Fighter悪化・Thief/Priest改善・Mage不変〜微増）。追撃-1が
特定職を系統的に不利にしている証拠はなく、単一seedのシーケンシャルsimにおける
ラン分岐（あるrunでの-1が後続のRNG消費順を変え、以降の分岐が変わる）由来の
双方向ノイズと整合する。

## 判定

**DONE。** 6workshop状態中5つは完全に無変化、唯一差が出た`complete`状態も方向は
劣化ではなくノイズ内（生還率+1.2pt、EV/時間+11.7%）。職業別も方向が割れており、
系統的な職業間の有利・不利は観測されない。オーナー判断コメントが事前に許容した
「追撃経路の変化」は実測でも深度到達性に有意な影響を与えていない。
