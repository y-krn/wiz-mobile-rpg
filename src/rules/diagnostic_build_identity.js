// balance-impact: none — vNext diagnostic identity only

import {
  getCanonicalBaseId,
  getNamedRuleId,
  getVNextCoreId,
  isVNextSupportId
} from "../data/equipment_vnext.js";
import { getEquippedMedium, getActiveRuneSpellKeys } from "./magic_rules.js";
import { getEquipmentHands } from "./equipment_hands.js";
import { getCharacterEquipmentLoad } from "./equipment_load.js";
import { getGuardProfileId } from "./guard_rules.js";
import { resolveCombatTier } from "./combat_tier.js";

export const DIAGNOSTIC_BUILD_IDENTITY_SCHEMA_VERSION = 2;

const IDENTITY_SLOT_ORDER = Object.freeze(["weapon", "armor", "shield", "accessory", "accessory2"]);

function getAffixId(affix) {
  if (!affix || typeof affix !== "object") return "";
  return affix.vNextId || affix.id || affix.type || "";
}

function stableUnique(values) {
  return [...new Set(values.filter(value => typeof value === "string" && value.length > 0))].sort();
}

function stableUniqueInOrder(values) {
  return [...new Set(values.filter(value => typeof value === "string" && value.length > 0))];
}

function getEquippedItems(character) {
  return IDENTITY_SLOT_ORDER.map(slot => character?.equipment?.[slot]).filter(Boolean);
}

function getVNextIds(character) {
  const supportIds = [];
  const coreIds = [];
  getEquippedItems(character).forEach(item => {
    if (!Array.isArray(item?.affixes)) return;
    item.affixes.forEach(affix => {
      const id = getAffixId(affix);
      const coreId = getVNextCoreId(id);
      if (coreId) coreIds.push(coreId);
      if (isVNextSupportId(id)) supportIds.push(id);
    });
  });
  return {
    vNextSupportIds: stableUnique(supportIds),
    vNextCoreIds: stableUnique(coreIds)
  };
}

function getNamedRuleIds(character) {
  return stableUniqueInOrder(getEquippedItems(character).map(getNamedRuleId));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function getDiagnosticBuildIdentity(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "build:v2:empty";
  const identity = { ...snapshot };
  delete identity.identity;
  return `build:v${identity.schemaVersion || DIAGNOSTIC_BUILD_IDENTITY_SCHEMA_VERSION}:${stableStringify(identity)}`;
}

export function resolveDiagnosticBuildIdentity(
  character,
  { startFloor = 1, defeatedMilestones = [], defeatedMilestone = null, milestoneBand = null } = {}
) {
  const equipment = character?.equipment || {};
  const weapon = equipment.weapon || null;
  const armor = equipment.armor || null;
  const shield = equipment.shield || null;
  const medium = getEquippedMedium(character);
  const namedRuleIds = getNamedRuleIds(character);
  const vNextIds = getVNextIds(character);
  const snapshot = {
    schemaVersion: DIAGNOSTIC_BUILD_IDENTITY_SCHEMA_VERSION,
    weaponBase: getCanonicalBaseId(weapon),
    armorBase: getCanonicalBaseId(armor),
    shieldBase: getCanonicalBaseId(shield),
    hands: getEquipmentHands(weapon),
    load: getCharacterEquipmentLoad(character).class,
    guardProfileId: getGuardProfileId(character),
    mediumId: medium?.id || null,
    runeSlotCapacity: Number(medium?.runeSlots) || 0,
    activeRuneIds: getActiveRuneSpellKeys(character),
    ...vNextIds,
    namedRuleIds,
    namedRuleId: namedRuleIds[0] || null,
    combatTier: resolveCombatTier({ startFloor, defeatedMilestones, defeatedMilestone, milestoneBand })
  };
  snapshot.identity = getDiagnosticBuildIdentity(snapshot);
  return snapshot;
}

export const resolveBuildSnapshotV2 = resolveDiagnosticBuildIdentity;
export const getBuildSnapshotV2Identity = getDiagnosticBuildIdentity;
