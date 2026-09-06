// balance-impact: none — telemetry/simulation identity resolver only

import { CORE_AFFIXES, SUPPORT_AFFIXES, getAffixDefinition, getAffixKind } from "../data/affixes.js";
import { MEDIUMS } from "../data/magic.js";
import { EQUIPMENT_SLOTS } from "./equipment_slots.js";
import { getEquipmentHands } from "./equipment_hands.js";
import { getPartyMaxAffix } from "./item_rules.js";
import { getActiveRuneSpellKeys, getEquippedMedium } from "./magic_rules.js";
import { getGuardProfileId } from "./guard_rules.js";
import { getWeaponBehaviorProfile, WEAPON_BEHAVIOR_PROFILES } from "../data/weapon_behavior_profiles.js";

export const BUILD_SNAPSHOT_SCHEMA_VERSION = 1;
export const BUILD_SNAPSHOT_SUPPORT_VALUE_LIMIT = 100;

const WEAPON_PROFILES = new Set(["none", ...Object.keys(WEAPON_BEHAVIOR_PROFILES)]);
const CORE_ORDER = new Map(
  CORE_AFFIXES.map((affix, index) => [affix.id, index])
);
const ENABLED_CORE_IDS = new Set(
  CORE_AFFIXES.filter(affix => affix.enabled).map(affix => affix.id)
);
const ENABLED_SUPPORT_IDS = new Set(
  SUPPORT_AFFIXES.filter(affix => affix.enabled).map(affix => affix.id)
);
const SUPPORT_SNAPSHOT_IDS = Object.freeze([
  "atk", "def", "hp", "mp", "spellPower", "arcane", "devotion",
  "spellGuard", "poisonWard", "firstStrike", "physicalAccuracy", "guardian",
  "statusResistance", "trapBonus", "trapGuard", "treasureSense", "arcaneSense",
  "hearRange", "traceRead", "followUp", "killHeal", "followUpMp", "stairsHeal",
  "materialFind", "identifyDiscount", "contractReward"
].filter(id => ENABLED_SUPPORT_IDS.has(id)));
const EXPLORATION_SUPPORT_IDS = Object.freeze([
  "trapBonus", "trapGuard", "treasureSense", "arcaneSense", "hearRange", "traceRead",
  "materialFind", "identifyDiscount"
].filter(id => ENABLED_SUPPORT_IDS.has(id)));
const SAFE_GUARD_PROFILE_IDS = new Set([
  "universal_brace", "light", "physical", "arcane", "dragon", "aegis"
]);
const SAFE_MEDIUM_IDS = new Set(Object.keys(MEDIUMS));

function boundedSupportValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(BUILD_SNAPSHOT_SUPPORT_VALUE_LIMIT, Math.max(-BUILD_SNAPSHOT_SUPPORT_VALUE_LIMIT, numeric));
}

function stableUniqueSorted(values, order) {
  return [...new Set(values)].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.localeCompare(right);
  });
}

function getEnabledEquippedCoreIds(character, axis) {
  const ids = [];
  EQUIPMENT_SLOTS.forEach(({ id: slot }) => {
    const item = character?.equipment?.[slot];
    if (!item || typeof item !== "object" || !Array.isArray(item.affixes)) return;
    item.affixes.forEach(affix => {
      const definition = getAffixDefinition(affix);
      const id = definition?.id || affix?.id || affix?.type;
      if (
        getAffixKind(affix) === "core" &&
        ENABLED_CORE_IDS.has(id) &&
        definition?.buildAxis === axis
      ) {
        ids.push(id);
      }
    });
  });
  return stableUniqueSorted(ids, CORE_ORDER);
}

function getWeaponProfile(character) {
  try {
    if (!character?.equipment?.weapon) return "none";
    const profile = getWeaponBehaviorProfile(character)?.id;
    return WEAPON_PROFILES.has(profile) ? profile : "other";
  } catch {
    return "other";
  }
}

function getActiveRuneIds(character) {
  if (!character?.startingKit) return [];
  try {
    return getActiveRuneSpellKeys(character)
      .filter(spellKey => typeof spellKey === "string" && spellKey.length > 0);
  } catch {
    return [];
  }
}

function getSupportValues(character, party) {
  const supportValues = Object.fromEntries(
    SUPPORT_SNAPSHOT_IDS.map(id => [id, boundedSupportValue(getPartyMaxAffix([character], id))])
  );
  const explorationSupportValues = Object.fromEntries(
    EXPLORATION_SUPPORT_IDS.map(id => [id, boundedSupportValue(getPartyMaxAffix(party || [character], id))])
  );
  return { supportValues, explorationSupportValues };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function getBuildSnapshotIdentity(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "build:v1:empty";
  const schemaVersion = snapshot.schemaVersion;
  const identity = { ...snapshot };
  delete identity.schemaVersion;
  delete identity.identity;
  return `build:v${schemaVersion || BUILD_SNAPSHOT_SCHEMA_VERSION}:${stableStringify(identity)}`;
}

export function resolveBuildSnapshot(character, { party = null } = {}) {
  const medium = getEquippedMedium(character);
  const mediumId = medium?.id && SAFE_MEDIUM_IDS.has(medium.id) ? medium.id : null;
  const activeRuneSpellIds = getActiveRuneIds(character);
  const { supportValues, explorationSupportValues } = getSupportValues(character, party);
  let guardProfileId = "other";
  try {
    const resolvedGuardProfileId = getGuardProfileId(character);
    guardProfileId = SAFE_GUARD_PROFILE_IDS.has(resolvedGuardProfileId)
      ? resolvedGuardProfileId
      : "other";
  } catch {
    // Malformed optional state cannot affect gameplay or telemetry.
  }
  const snapshot = {
    schemaVersion: BUILD_SNAPSHOT_SCHEMA_VERSION,
    weaponProfile: getWeaponProfile(character),
    weaponHands: getEquipmentHands(character?.equipment?.weapon),
    guardProfileId,
    mediumId,
    runeSlotCapacity: Math.max(0, Math.min(8, Number(medium?.runeSlots) || 0)),
    activeRuneSpellIds,
    mainCoreIds: getEnabledEquippedCoreIds(character, "main"),
    auxiliaryCoreIds: getEnabledEquippedCoreIds(character, "auxiliary"),
    supportValues,
    explorationSupportValues
  };
  snapshot.identity = getBuildSnapshotIdentity(snapshot);
  return snapshot;
}

export function isEnabledBuildCoreId(id) {
  return ENABLED_CORE_IDS.has(id);
}

export function isEnabledBuildSupportId(id) {
  return ENABLED_SUPPORT_IDS.has(id);
}
