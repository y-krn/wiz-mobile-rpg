// balance-impact: none — death-result facts only (#2003).
//
// Collect what was true at the moment the run ended in death: how far the
// enemies had been worn down, how close the record and the next Portal were,
// and which rescue tools were still in the bag. These are facts for the
// result screen. They never change a rule, a reward, or the next run.

import { getEnemyHpState } from "./enemy_hp_state.js";
import { getItemBaseId } from "./item_rules.js";
import { STATUS_TREATMENT_ROLE_LIST } from "../data/status_treatments.js";
import { normalizeRunNearMiss } from "../state/run_near_miss.js";

const MILESTONE_INTERVAL = 5;
const RETURN_WING_ITEM_ID = "TOWN_PORTAL";
/** Consumables that restore HP when used on the adventurer. */
const HP_RECOVERY_ITEM_IDS = Object.freeze(["HEAL_POTION", "GREATER_HEAL", "HOLY_WATER", "ELIXIR"]);
/** Death-log status sources mapped to the status id the treatment catalog uses. */
const STATUS_DEATH_SOURCE_TO_STATUS_ID = Object.freeze({ "毒": "poisoned" });
const ENEMY_KIND_ORDER = Object.freeze({ guardian: 0, elite: 1, normal: 2 });

function stripEncounterSuffix(name) {
  return String(name || "").replace(/\s[A-Z]$/, "");
}

function getEncounterKind(combat) {
  if (combat?.isBoss) return "guardian";
  if (combat?.isMidboss || combat?.isRoamingFlack || combat?.elite) return "elite";
  return "normal";
}

function collectEnemies(combat) {
  const monsters = Array.isArray(combat?.monsters) ? combat.monsters : [];
  const encounterKind = getEncounterKind(combat);
  const alive = monsters.filter(monster => monster && !monster.fled && Number(monster.hp) > 0);
  const defeatedInBattle = monsters.filter(monster => monster && !monster.fled && Number(monster.hp) <= 0).length;
  const enemies = alive
    .map((monster, index) => ({
      name: stripEncounterSuffix(monster.name),
      kind: encounterKind === "normal" && monster.isRare ? "elite" : encounterKind,
      state: getEnemyHpState(monster),
      index
    }))
    .filter(enemy => enemy.name)
    .sort((left, right) => ENEMY_KIND_ORDER[left.kind] - ENEMY_KIND_ORDER[right.kind] || left.index - right.index)
    .map(({ name, kind, state }) => ({ name, kind, state }));
  return { enemies, defeatedInBattle: alive.length > 0 ? defeatedInBattle : 0 };
}

function getBestDepthFact(deepestFloor, previousBestFloor) {
  const best = Math.floor(Number(previousBestFloor) || 0);
  const reached = Math.floor(Number(deepestFloor) || 0);
  if (best < 1 || reached < 1 || reached > best) return null;
  return { best, gap: best - reached };
}

function getPortalFact(floor, defeatedMilestones) {
  const current = Math.floor(Number(floor) || 0);
  if (current < 1) return null;
  if (current % MILESTONE_INTERVAL === 0) {
    const defeated = Array.isArray(defeatedMilestones) && defeatedMilestones.includes(current);
    return { kind: defeated ? "guardian_defeated" : "guardian_ahead", floor: current, gap: 0 };
  }
  const next = Math.ceil(current / MILESTONE_INTERVAL) * MILESTONE_INTERVAL;
  return { kind: "ahead", floor: next, gap: next - current };
}

function getStatusCureItemIds(deathLog) {
  if (deathLog?.type !== "status") return [];
  const statusId = STATUS_DEATH_SOURCE_TO_STATUS_ID[deathLog.source];
  if (!statusId) return [];
  return STATUS_TREATMENT_ROLE_LIST
    .filter(role => role.statusIds.includes(statusId))
    .flatMap(role => role.itemIds);
}

function collectUnusedItems(inventory, deathLog) {
  const counts = new Map();
  (Array.isArray(inventory) ? inventory : []).forEach(item => {
    const itemId = getItemBaseId(item);
    if (typeof itemId === "string") counts.set(itemId, (counts.get(itemId) || 0) + 1);
  });
  const orderedIds = [...new Set([
    RETURN_WING_ITEM_ID,
    ...HP_RECOVERY_ITEM_IDS,
    ...getStatusCureItemIds(deathLog)
  ])];
  return orderedIds
    .filter(itemId => (counts.get(itemId) || 0) > 0)
    .map(itemId => ({ itemId, count: counts.get(itemId) }));
}

/**
 * Build the near-miss record for a run that ended in death. Returns `null`
 * when no fact applies, so the caller can store the value as-is.
 *
 * `previousBestFloor` must be the personal best from before this run was
 * recorded; a run that sets a new record reports no depth gap.
 */
export function buildDeathNearMiss({
  floor,
  deepestFloor,
  previousBestFloor = 0,
  defeatedMilestones = [],
  deathLog = null,
  combat = null,
  inventory = []
} = {}) {
  const { enemies, defeatedInBattle } = collectEnemies(combat);
  return normalizeRunNearMiss({
    enemies,
    defeatedInBattle,
    bestDepth: getBestDepthFact(deepestFloor, previousBestFloor),
    portal: getPortalFact(floor, defeatedMilestones),
    unused: collectUnusedItems(inventory, deathLog)
  });
}
