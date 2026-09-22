// balance-impact: none — identification state ownership only; costs, curses,
// knowledge stages, and disclosure behavior remain unchanged.

import {
  IDENTIFICATION_BALANCE,
  KNOWLEDGE_STAGES,
  getKnowledgeHintTags,
  getKnowledgeStage,
  isCurseLocked,
  setKnowledgeStage
} from "../rules/identification_rules.js";
import { getCharAffixSum } from "../rules/item_rules.js";
import { recordEquipmentAffixDiscovery } from "../state/codex_state.js";

export interface IdentificationStateLike {
  identifyTickets?: number;
  inventory?: unknown;
  party?: unknown;
  codex?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface IdentificationCharacterLike {
  equipment?: unknown;
  [key: string]: unknown;
}

export type IdentificationItem = Record<string, unknown>;

export type IdentificationResult =
  | { ok: true; cursed: boolean }
  | { ok: false; reason: "already_identified" | "insufficient_powder" };

export type ObservationResult =
  | { changed: false; stage: string }
  | { changed: true; stage: string; hintTag: unknown };

export type EquipmentRevealResult = { revealed: false; cursed: boolean };

export type PurifyResult =
  | { ok: true }
  | { ok: false; reason: "not_cursed" };

function isIdentificationItem(value: unknown): value is IdentificationItem {
  return value !== null && typeof value === "object";
}

function getEquipmentValues(value: unknown): unknown[] {
  if (value === null || typeof value !== "object") return [];
  return Object.values(value);
}

export function identifyEquipment(
  stateLike: IdentificationStateLike,
  item: unknown,
  character: IdentificationCharacterLike | null = null,
  rng: () => number = Math.random
): IdentificationResult {
  if (!isIdentificationItem(item) || item.identified) {
    return { ok: false, reason: "already_identified" };
  }
  // 所持チェックは割引ロールより前。粉0では100%割引でも鑑定不可。
  if ((stateLike.identifyTickets || 0) < IDENTIFICATION_BALANCE.identifyCost) {
    return { ok: false, reason: "insufficient_powder" };
  }
  const identifyDiscount = Math.max(0, getCharAffixSum(character, "identifyDiscount"));
  const consumesPowder = identifyDiscount <= 0 || (
    identifyDiscount < 100 && rng() >= identifyDiscount / 100
  );
  if (consumesPowder) {
    stateLike.identifyTickets = (stateLike.identifyTickets || 0) - IDENTIFICATION_BALANCE.identifyCost;
  }
  setKnowledgeStage(item, KNOWLEDGE_STAGES.FULL);
  recordEquipmentAffixDiscovery(item, stateLike);
  return { ok: true, cursed: Boolean(item.curseEffectId) };
}

export function observeEquipment(item: unknown): ObservationResult {
  if (!isIdentificationItem(item)) return { changed: false, stage: KNOWLEDGE_STAGES.FULL };
  const currentStage = getKnowledgeStage(item);
  if (currentStage === KNOWLEDGE_STAGES.FULL || currentStage === KNOWLEDGE_STAGES.TRIAL) {
    return { changed: false, stage: currentStage };
  }

  const knownTags = new Set(getKnowledgeHintTags(item));
  const actualTags = Array.isArray(item.tags) ? item.tags : [];
  const nextHint = actualTags.find(tag => !knownTags.has(tag));
  const stageChanged = currentStage === KNOWLEDGE_STAGES.DISCOVERY;
  if (!stageChanged && !nextHint) {
    return { changed: false, stage: currentStage };
  }
  if (nextHint) item.observedHintTags = [...knownTags, nextHint];
  if (stageChanged) setKnowledgeStage(item, KNOWLEDGE_STAGES.OBSERVATION);
  item.observationCount = Math.max(0, Number(item.observationCount) || 0) + 1;
  return {
    changed: true,
    stage: KNOWLEDGE_STAGES.OBSERVATION,
    hintTag: nextHint || null
  };
}

export function observeCarriedEquipment(stateLike: IdentificationStateLike | null | undefined): number {
  if (!stateLike || typeof stateLike !== "object") return 0;
  const inventory = Array.isArray(stateLike.inventory) ? stateLike.inventory : [];
  const party = Array.isArray(stateLike.party) ? stateLike.party : [];
  const items = [
    ...inventory,
    ...party.flatMap(character => {
      if (!character || typeof character !== "object") return [];
      return getEquipmentValues((character as { equipment?: unknown }).equipment);
    })
  ];
  return items.reduce((count, item) => count + (observeEquipment(item).changed ? 1 : 0), 0);
}

export function revealEquipmentOnEquip(item: unknown): EquipmentRevealResult {
  if (!isIdentificationItem(item)) return { revealed: false, cursed: false };
  const currentStage = getKnowledgeStage(item);
  const shouldTrial = currentStage === KNOWLEDGE_STAGES.DISCOVERY
    || currentStage === KNOWLEDGE_STAGES.OBSERVATION;
  if (shouldTrial) {
    setKnowledgeStage(item, KNOWLEDGE_STAGES.TRIAL);
    item.trialCount = Math.max(0, Number(item.trialCount) || 0) + 1;
  }
  if (item.curseEffectId && currentStage !== KNOWLEDGE_STAGES.TRIAL) item.curseLocked = true;
  return { revealed: false, cursed: isCurseLocked(item) };
}

export function purifyEquipmentCurse(item: unknown): PurifyResult {
  if (!isIdentificationItem(item) || !isCurseLocked(item)) {
    return { ok: false, reason: "not_cursed" };
  }
  item.curseEffectId = null;
  item.curseLocked = false;
  item.curseSuspected = false;
  item.tags = (Array.isArray(item.tags) ? item.tags : []).filter(tag => tag !== "curse");
  return { ok: true };
}
