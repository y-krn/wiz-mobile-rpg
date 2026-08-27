# Issue #595 V8カバレッジ測定レポート

## 測定条件

- 正典sim: `scratch/simulations/sim_depth_material_ev.js`
- N: 500（各ケース）
- calibration N: 100
- 並列: SIM_PARALLEL未指定（既定worker並列）
- 所要時間: 31秒
- V8 coverage JSON: 9件（対象script entry 423件、block coverage function entry 4351件）
- coverage方式: `NODE_V8_COVERAGE` のNode標準V8 JSON。対象外の `src/renderer.js` / `src/ui/` は集計していない。
- 再現コマンド: `NODE_V8_COVERAGE=<coverage-dir> node scratch/simulations/sim_depth_material_ev.js`

## ディレクトリ別関数カバー率

| 対象 | 実行済み / 全関数 | カバー率 |
|---|---:|---:|
| `src/rules` | 156 / 215 | 72.6% |
| `src/systems` | 184 / 248 | 74.2% |
| `src/combat_logic` | 162 / 182 | 89.0% |
| `src/constants` | 0 / 0 | N/A |

## 一度も実行されなかった関数

V8の関数entryが存在しない未ロードファイルは、追加依存なしで既に利用可能なespreeで静的列挙し、全件を未実行として扱った。関数名はV8の `functionName`、または静的推定名。

### src/rules

- `src/rules/affix_rules.js`
  - halveMultiplier (L5)
  - halveConstant (L6)
  - CORE_LAST_STAND (L9)
  - CORE_OPENER (L10)
  - CORE_BLOOD_WAND (L11)
  - CORE_PURIFY_RING (L12)
  - CORE_TRAP_EATER (L13)
  - CORE_CURSE_KEEPER (L18)
  - CORE_GIANT_SLAYER (L19)
  - CORE_MILESTONE_BREAKER (L20)
  - CORE_REARGUARD (L21)
  - CORE_THORN_SHIELD (L22)
  - CORE_EXECUTIONER (L27)
  - CORE_THIN_ICE_PACT (L28)
  - CORE_SNEAK_STEP (L33)
  - CORE_TOMB_RAIDER (L38)
  - CORE_KEEN_EYE (L39)
  - CORE_CAMP_MASTER (L40)
  - CORE_BOUNTY_HUNTER (L41)
  - CORE_SCHOLAR_EYE (L42)
  - getSealedCoreParams (L45)
  - getCharCoreDefinition (L78)
  - partyHasCoreAffix (L89)
  - canEquipUnidentifiedItem (L106)
  - hasHiddenEquipmentEffects (L110)
- `src/rules/character_stats.js`
  - getCharLuk (L84)
  - getCharDerivedStats (L189)
- `src/rules/chest_rules.js`
  - calculateChestMainItemExpectedValue (L28)
  - <anonymous> (L144)
- `src/rules/class_rules.js`
  - canUsePriestSpells (L3)
  - canUseMageSpells (L10)
  - isSpellcaster (L17)
  - getClassJpName (L21)
- `src/rules/craft_rules.js`
  - normalizeAnyTotal (L10)
  - getCraftRecipeCategoryOrder (L14)
  - getSortedCraftRecipes (L19)
  - getDepartureCraftRecipePayment (L32)
  - <anonymous> (L47)
  - getDepartureCraftPaymentTotal (L60)
  - spendDepartureCraftRecipeInternal (L67)
  - getTypedSpent (L76)
  - spendDepartureCraftRecipe (L84)
  - <anonymous> (L92)
  - <anonymous> (L93)
  - <anonymous> (L100)
- `src/rules/equipment_slots.js`
  - getEquipmentSlot (L20)
  - getEquipmentSlotsForType (L24)
- `src/rules/item_inventory.js`
  - getCategoryOrder (L8)
  - getDefinitionOrder (L14)
  - getUsableInventoryItems (L18)
- `src/rules/item_rules.js`
  - <anonymous> (L163)
- `src/rules/material_rules.js`
  - getLegacyMonsterGroupClassification (L6)
  - getDepthMaterialQuantity (L190)
  - getTotalMaterialCount (L226)
  - spendAnyMaterials (L234)
- `src/rules/trap_effect_rules.js`
  - isLivingCharacter (L104)
  - uniformAtLeastProbability (L108)
  - calculateChestTrapExpectedRisk (L117)
- `src/rules/trap_rules.js`
  - calculateChestDisarmActionEv (L117)

### src/systems

- `src/systems/camp_rest.js`
  - getCampRestStatus (L4)
  - restAtCamp (L11)
  - <anonymous> (L18)
- `src/systems/identification.js`
  - revealEquipmentOnEquip (L24)
  - purifyEquipmentCurse (L33)
- `src/systems/item_effects.js`
  - NOISE_BALL (L7)
  - PARALYZE_CURE (L32)
  - MANA_POTION (L47)
  - ETHER (L54)
  - TOWN_PORTAL (L71)
  - ELIXIR (L82)
  - GUARD_POTION (L95)
- `src/systems/leveling.js`
  - <anonymous> (L147)
  - <anonymous> (L152)
  - <anonymous> (L157)
  - <anonymous> (L162)
  - <anonymous> (L170)
- `src/systems/milestone_merchant.js`
  - getCursedEquipment (L18)
  - purchaseMilestoneUncurse (L24)
- `src/systems/omens.js`
  - getOmenForFloor (L15)
  - checkFloorOmenMessage (L23)
- `src/systems/run_quests.js`
  - formatRunQuestProgress (L85)
- `src/systems/spell_effects.js`
  - getCompassDirection (L16)
  - findNearestCell (L27)
  - getNearbyEventHints (L42)
  - getDangerHint (L68)
  - DUMAPIC (L140)
  - MASFEAL (L170)
  - DIURCO (L250)
  - MILWA (L289)
  - DIALKO (L297)
  - LATUMOFIS (L320)
  - LOMILWA (L328)
  - DIALMA (L336)
  - MADI (L351)
  - MABARRIER (L385)
  - MONTINO (L393)
  - MORLIS (L412)
  - WEAKEN (L421)
- `src/systems/traps.js`
  - increaseChestTrapTier (L21)
  - getActiveCharacter (L27)
  - recordTrapCodex (L33)
  - calculateSuccessRate (L42)
  - getExpectedEffectText (L57)
  - getTrapRevealLevel (L72)
  - startTrapEncounter (L78)
  - detectAdjacentTraps (L95)
  - triggerPitfall (L130)
  - triggerTrap (L229)
  - completePendingMove (L295)
  - endTrapEncounter (L303)
  - handleTrapAction (L310)
- `src/systems/workshop.js`
  - createDefaultWorkshopState (L12)
  - getWorkshopNodeCost (L20)
  - isWorkshopNodeUnlocked (L24)
  - purchaseWorkshopNode (L29)
  - <anonymous> (L54)
  - canAffordDepartureCraft (L65)
  - getDepartureCraftBalance (L76)
  - getAdditionalCraftableCount (L86)
  - <anonymous> (L100)
  - <anonymous> (L120)
  - <anonymous> (L121)
  - <anonymous> (L123)

### src/combat_logic

- `src/combat_logic/auto_action.js`
  - canCastSpell (L62)
  - canCastSpell (L92)
- `src/combat_logic/boss_actions.js`
  - <anonymous> (L65)
  - <anonymous> (L85)
  - <anonymous> (L123)
  - <anonymous> (L147)
  - <anonymous> (L147)
  - <anonymous> (L151)
  - <anonymous> (L199)
  - <anonymous> (L229)
  - <anonymous> (L260)
- `src/combat_logic/rewards.js`
  - <anonymous> (L304)
- `src/combat_logic/round.js`
  - <anonymous> (L535)
  - <anonymous> (L537)
  - <anonymous> (L588)
  - <anonymous> (L588)
  - <anonymous> (L726)
  - <anonymous> (L770)
- `src/combat_logic/spell_resolution.js`
  - <anonymous> (L53)
- `src/combat_logic/targeting.js`
  - <anonymous> (L24)

### src/constants

- なし

## TRAP_TYPES別発火回数

`src/rules/trap_effect_rules.js:resolveFloorTrapEffect` のblock coverageを合算した。DAMAGE/MP_DRAIN/PITFALLは各分岐body、ALARMは同関数総呼出数から3分岐を引いた残差。したがって4種の合計は同関数の実発動呼出数になる。

| TRAP_TYPES | 発火回数 | 分岐行 |
|---|---:|---:|
| DAMAGE (`damage`) | 20086 | L248 |
| MP_DRAIN (`mpDrain`) | 9847 | L256 |
| ALARM (`alarm`) | 14521 | 残差 |
| PITFALL (`pitfall`) | 653 | L265 |
| 合計 | 45107 | resolveFloorTrapEffect総呼出数 |

0件の種別: なし

## 到達深度の補足

simログの深度表に出た平均到達階（分布そのものではなく、正典simが出力する代表値）:

- B5撤退: 2.42階
- B10撤退: 2.60階
- B15撤退: 2.60階
- B20撤退: 2.57階
- B5撤退: 7.10階
- B10撤退: 8.24階
- B15撤退: 8.66階
- B20撤退: 8.45階
- B5撤退: 2.49階
- B10撤退: 2.71階
- B15撤退: 2.84階
- B20撤退: 2.83階
- B5撤退: 7.42階
- B10撤退: 9.08階
- B15撤退: 9.83階
- B20撤退: 9.97階
- B5撤退: 2.87階
- B10撤退: 3.08階
- B15撤退: 3.06階
- B20撤退: 2.99階
- B5撤退: 8.93階
- B10撤退: 10.75階
- B15撤退: 10.68階
- B20撤退: 10.58階
- B5撤退: 2.76階
- B10撤退: 2.97階
- B15撤退: 3.07階
- B20撤退: 3.18階
- B5撤退: 8.37階
- B10撤退: 10.38階
- B15撤退: 10.95階
- B20撤退: 11.50階
- B5撤退: 2.88階
- B10撤退: 3.27階
- B15撤退: 3.26階
- B20撤退: 3.34階
- B5撤退: 8.72階
- B10撤退: 11.27階
- B15撤退: 11.61階
- B20撤退: 12.27階
- B5撤退: 2.82階
- B10撤退: 3.19階
- B15撤退: 2.94階
- B20撤退: 3.08階
- B5撤退: 8.56階
- B10撤退: 11.21階
- B15撤退: 10.27階
- B20撤退: 11.03階
- B5撤退: 2.96階
- B10撤退: 3.34階
- B15撤退: 3.33階
- B20撤退: 3.65階
- B5撤退: 8.96階
- B10撤退: 11.96階
- B15撤退: 12.01階
- B20撤退: 13.62階
- B10→B15: 10.47階
- B1→B15: 2.58階
- B10→B15: 5.20階
- B1→B15: 8.44階

PITFALLはmap_generator.jsの通常trap抽選と別条件で選ばれるため、0件なら対象階への到達不足または発動経路未到達を疑う。本計測では全scenarioのB1開始系列とマイルストーン系列の平均到達階を上記に記録した。
