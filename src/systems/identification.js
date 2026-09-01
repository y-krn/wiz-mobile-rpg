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

export function identifyEquipment(stateLike, item, character = null, rng = Math.random) {
  if (!item || typeof item !== "object" || item.identified) {
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
    stateLike.identifyTickets -= IDENTIFICATION_BALANCE.identifyCost;
  }
  setKnowledgeStage(item, KNOWLEDGE_STAGES.FULL);
  recordEquipmentAffixDiscovery(item, stateLike);
  return { ok: true, cursed: Boolean(item.curseEffectId) };
}

export function observeEquipment(item) {
  if (!item || typeof item !== "object") return { changed: false, stage: KNOWLEDGE_STAGES.FULL };
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

export function observeCarriedEquipment(stateLike) {
  if (!stateLike || typeof stateLike !== "object") return 0;
  const items = [
    ...(Array.isArray(stateLike.inventory) ? stateLike.inventory : []),
    ...(Array.isArray(stateLike.party) ? stateLike.party.flatMap(char => Object.values(char?.equipment || {})) : [])
  ];
  return items.reduce((count, item) => count + (observeEquipment(item).changed ? 1 : 0), 0);
}

export function revealEquipmentOnEquip(item) {
  if (!item || typeof item !== "object") return { revealed: false, cursed: false };
  if (getKnowledgeStage(item) !== KNOWLEDGE_STAGES.FULL) {
    setKnowledgeStage(item, KNOWLEDGE_STAGES.TRIAL);
    item.trialCount = Math.max(0, Number(item.trialCount) || 0) + 1;
  }
  if (item.curseEffectId) item.curseLocked = true;
  return { revealed: false, cursed: isCurseLocked(item) };
}

export function purifyEquipmentCurse(item) {
  if (!isCurseLocked(item)) return { ok: false, reason: "not_cursed" };
  item.curseEffectId = null;
  item.curseLocked = false;
  item.curseSuspected = false;
  item.tags = (item.tags || []).filter(tag => tag !== "curse");
  return { ok: true };
}
