# Issue #1341 Visual Prototype Evidence

## Scope

このartifactは、Issue #1341の比較prototypeを記録する。production UI、gameplay rule、balance、ownership、loss semanticsは変更していない。

- Base SHA: `781be9e5234d3a3fa5462b2dc1f1664cfb7b9144`
- Prototype revision: `issue-1341-visual-prototype-v1`
- Route: `/visual-prototype.html?theme=<dark|modern|warm>&state=<state>`
- Fixture: B1F、HP `18 / 24`、MP `7 / 12`、bag `14 / 20`、敵 `黒曜の番兵`、戦果候補 `霧銀の短剣`
- Fixed across A/B/C: copy、information quantity、action order、action count、tap target contract、selected meaning、Portal choice semantics

## Tension ownership

Gameplay-owned tensionはfixture間で固定した。

- unknown / partial knowledge: `効果は未確認`
- HP / MP cost: `18 / 24`、`7 / 12`
- bag pressure: `14 / 20`
- irreversible loss: Result — Deathの未確定戦果喪失
- greed versus certainty: Portalの`帰還` / `Push`
- combat consequence: `攻撃`、`防御`、`逃走`と敵HP

変更したのはpresentation-owned layerだけ。

- shell / scene / event / decision surfaceのluminance
- type ownership、border、radius、elevation
- arcane motif、map grid、insignia
- selected / danger / lost / rewardの形状とstate label

## Directions

### A — Current Dark Archive

現行control。煤けた黒、青黒い鉄、鈍い真鍮、Minchoのlocation/result、monoのcompact valuesを維持。combatの敵枠、danger border、Portalの対等な二択は強く読める。第一印象の緊張は最も強いが、入口の心理的ハードルも最も高い。

### B — Bright Modern Arcane

鉱物色の明るいsurfaceと高彩度の魔術光。sans-led type、角を残した柔らかいshell、arcane diagramとscene insigniaでgeneric light theme化を避けた。明るいdecision surfaceでもcombatの`危険`、Portalの同一surface、Deathのloss copyが残る。

### C — Pop / Warm Adventure

暖色の地図、親しみあるradius、coral primary、treasure-like reward surface。Townの触りたさとloot/rewardの喜びを最も強くするstress test。Deathは暗黒画面や巨大`FAILED`を使わず、copy、dashed loss frame、red commitmentで重さを残す。

## State coverage

同一fixtureで次の8 stateを実装した。

1. Town Home
2. Preparation
3. Explore normal
4. Combat
5. Loot / equipment comparison
6. Portal
7. Result — Return
8. Result — Death

全stateのA/B/Cは390x844でscreenshotを生成した。Combat、Portal、Deathは320x568、390x844、430x932でも確認した。全screenshotはPlaywright artifact出力 `output/playwright/issue-1341-*.png` に生成される。

## Rendered inspection findings

実描画screenshotを確認した結果:

- AはDark Archiveのcontrolとして意図的に成立。darknessがdangerを補助するが、dangerそのものはtext、border、敵frame、cost表示でも成立。
- Bはsurfaceが明るくなっても、Combatの敵対、HP cost、`危険`、PortalのPushの再賭け、Deathのloss copyを維持。Portalの`帰還` / `Push`は同色・同shapeで、推奨色を置いていない。
- CはTownとRewardが最もapproachable。Deathでは`冒険者は倒れた`、`未確定の戦果は失われる`、`喪失`、dashed borderが残り、明るさだけでlossを軽くしていない。
- 390x844では3方向ともaction dock、event strip、vital footerが読める。320幅でも代表critical stateに横overflowなし。
- B/Cはwhite cardの積層、glassmorphism、SaaS dashboard、pastel-only paletteにはしていない。scene grid、insignia、event strip、fixed action grammarでwiz-mobile-rpgの構造を残した。

## Evaluation notes

単一winnerは決めない。

- Approachability: A < B < C。Bは明るさとarcane identityのバランス、Cは第一印象とTown/rewardの入口が強い。
- Clarity: Bが最も高い。shell、scene、event、decisionの階層分離が明るい面で読みやすい。Aは低輝度面で補助情報が沈みやすい。
- Tension: Aが最も即時的。Bはgameplay-owned factsとdanger/non-color cuesで維持可能。CはTown/rewardからCombat/Deathへの感情差が大きい一方、敵対の重さが弱く見えないか追加確認が必要。
- Reward / delight: C > B > A。Cはreward surfaceと暖色で喜びが伝わる。lootの未知情報は`効果は未確認`のまま。
- Distinctiveness: Aは既存identityが最も明確。Bはarcane diagram/insigniaがidentityを支える。Cはwarm map languageを増やすほど一般的mobile RPGへ寄るリスクがある。
- Comfort: B/Cの明るいsurfaceは長時間の可読性に有利な可能性がある。実機、dark-room、長時間利用は未検証。
- Accessibility: state label、copy、border、dashed frame、`aria-pressed`、focus-visible、44px以上のaction target、reduced-motionを維持。色だけでselected/danger/lost/unknownを判別しない。

## Verification

- `npm run check:repo` PASS
- `npm run lint:tests` PASS
- `npm run lint:css` PASS
- `npm run build` PASS
- `npx playwright test tests/ui-visual-prototype.spec.js --grep @visual` PASS
- actual screenshot inspection: A/B/CのTown、BのCombat/Portal、CのDeathを確認
- `npm run test:browser:full` は421件中402 PASS / 19 FAIL。失敗はtrap/dungeon/equipment/workshopの既存production経路に限定され、prototype変更ファイルは全てfocused suite PASS。production baselineとの差分原因はこのIssueのscope外として未解消。

## Unresolved risks

- prototypeはstatic fixture。production runtimeとのGolden Journey接続、real renderer、screen reader実機、text scaling全条件は未検証。
- CのwarmnessがCombat/Deathの重さをどこまで保てるかは、内部比較だけでは確定しない。
- B/Cの色contrastは代表文字とcontrolで確認したが、全組合せの自動WCAG監査は別作業。
- user-facing preference/comprehension studyは未実施。好みだけでproduction方向を決めない。

## Parent #1340への判断材料

このIssueでKEEP DARK ARCHIVE、EVOLVE DARK ARCHIVE、NEW VISUAL CANONを決定しない。次の判断では、Bを本命候補、Cを境界探索、Aをcontrolとして、同じfixtureを使ったcomprehension / tension / identity評価を追加する。production適用はchild Issueへ分割する。
