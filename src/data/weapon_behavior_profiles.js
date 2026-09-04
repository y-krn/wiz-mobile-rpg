// Weapon behavior is deliberately a small, data-owned vocabulary. The
// combat resolver consumes these profiles; item ids should not be inspected
// by combat code to decide how an attack behaves.
import { getEquippedItemData } from "../rules/item_rules.js";

export const WEAPON_BEHAVIOR_PROFILES = Object.freeze({
  light: Object.freeze({
    id: "light",
    label: "軽武器",
    description: "命中が安定",
    hitChanceBonus: 0.08,
    physicalDefenseScale: 40,
    rawDamageMultiplier: 1
  }),
  blade: Object.freeze({
    id: "blade",
    label: "標準武器",
    description: "標準的な攻撃",
    hitChanceBonus: 0,
    physicalDefenseScale: 40,
    rawDamageMultiplier: 1
  }),
  impact: Object.freeze({
    id: "impact",
    label: "打撃武器",
    description: "高防御に強い",
    hitChanceBonus: -0.04,
    physicalDefenseScale: 52,
    rawDamageMultiplier: 1
  }),
  heavy: Object.freeze({
    id: "heavy",
    label: "両手重武器",
    description: "一撃重視 / 盾不可",
    hitChanceBonus: -0.05,
    physicalDefenseScale: 40,
    rawDamageMultiplier: 1.1
  }),
  medium: Object.freeze({
    id: "medium",
    label: "媒体武器",
    description: "物理は控えめ / MPとRune枠",
    hitChanceBonus: 0,
    physicalDefenseScale: 40,
    rawDamageMultiplier: 0.85
  })
});

export const DEFAULT_WEAPON_BEHAVIOR_PROFILE_ID = "blade";

export function getWeaponBehaviorProfile(char) {
  const weapon = char?.type === "weapon"
    ? char
    : getEquippedItemData(char, char?.equipment?.weapon);
  const profileId = weapon?.type === "weapon"
    ? weapon.behaviorProfile
    : DEFAULT_WEAPON_BEHAVIOR_PROFILE_ID;
  return WEAPON_BEHAVIOR_PROFILES[profileId] || WEAPON_BEHAVIOR_PROFILES[DEFAULT_WEAPON_BEHAVIOR_PROFILE_ID];
}
