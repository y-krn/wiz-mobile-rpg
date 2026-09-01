// balance-impact: none — this change records information disclosure state;
// curse generation, affix values, and identification costs remain unchanged.
export const IDENTIFICATION_BALANCE = {
  startingPowder: 2,
  identifyCost: 1,
  chestPowderChance: 0.18,
  baseCurseChance: 0.10,
  curseChancePerFloor: 0.0225,
  maxCurseChance: 0.42,
  baseCurseDetect: 0.9,
  curseDetectDecayPerFloor: 0.05,
  minCurseDetect: 0.4,
  coreCurseBonus: 0.08,
  cursePowerPerFloor: 0.15,
  maxCursePower: 2.5,
  heavyCurseSharePerFloor: 0.05,
  maxHeavyCurseShare: 0.6,
  qualityPerFloor: 0.06,
  maxQualityMultiplier: 1.75
};

export const KNOWLEDGE_STAGES = Object.freeze({
  DISCOVERY: "discovery",
  OBSERVATION: "observation",
  TRIAL: "trial",
  FULL: "full"
});

const KNOWLEDGE_STAGE_SET = new Set(Object.values(KNOWLEDGE_STAGES));

export const KNOWLEDGE_STAGE_LABELS = Object.freeze({
  discovery: "発見",
  observation: "観察",
  trial: "試用",
  full: "完全理解"
});

export const SENSORY_HINT_LABELS = Object.freeze({
  fire_rite: "火葬", holy: "聖", spirit: "霊", poison: "毒",
  dragon: "竜", iron: "鉄", blood: "血", curse: "呪",
  ward: "守勢", appraisal: "鑑定", beast: "獣", ambush: "奇襲",
  blade: "刃", trap: "罠", search: "探索", exorcism: "退魔",
  analysis: "解析", follow_up: "連撃", record: "記録", evasion: "回避",
  decay: "衰"
});

export function getKnowledgeStage(item) {
  if (!item || typeof item !== "object") return KNOWLEDGE_STAGES.FULL;
  // `identified` is the compatibility flag used by all existing stat and UI
  // callers. It always wins over a missing or stale additive stage field.
  if (item.identified === true) return KNOWLEDGE_STAGES.FULL;
  if (KNOWLEDGE_STAGE_SET.has(item.knowledgeStage)) return item.knowledgeStage;
  // Older saves used halfIdentified for the intermediate disclosure state.
  if (item.halfIdentified === true) return KNOWLEDGE_STAGES.OBSERVATION;
  return KNOWLEDGE_STAGES.DISCOVERY;
}

export function getKnowledgeStageLabel(itemOrStage) {
  const stage = typeof itemOrStage === "string"
    ? itemOrStage
    : getKnowledgeStage(itemOrStage);
  return KNOWLEDGE_STAGE_LABELS[stage] || KNOWLEDGE_STAGE_LABELS.discovery;
}

export function getKnowledgeHintTags(item) {
  if (!item || typeof item !== "object") return [];
  const actualTags = new Set(Array.isArray(item.tags) ? item.tags : []);
  return [...new Set([
    ...(Array.isArray(item.hintTags) ? item.hintTags : []),
    ...(Array.isArray(item.observedHintTags) ? item.observedHintTags : [])
  ])].filter(tag => actualTags.has(tag));
}

export function setKnowledgeStage(item, stage) {
  if (!item || typeof item !== "object" || !KNOWLEDGE_STAGE_SET.has(stage)) return false;
  item.knowledgeStage = stage;
  if (stage === KNOWLEDGE_STAGES.FULL) {
    item.identified = true;
    item.halfIdentified = true;
  } else {
    item.identified = false;
  }
  return true;
}

export function getIdentificationGambleProfile(floor = 1) {
  const depth = Math.max(1, Number(floor) || 1);
  const steps = depth - 1;
  return {
    floor: depth,
    curseChance: Math.min(
      IDENTIFICATION_BALANCE.maxCurseChance,
      IDENTIFICATION_BALANCE.baseCurseChance + steps * IDENTIFICATION_BALANCE.curseChancePerFloor
    ),
    curseDetectChance: Math.max(
      IDENTIFICATION_BALANCE.minCurseDetect,
      IDENTIFICATION_BALANCE.baseCurseDetect - steps * IDENTIFICATION_BALANCE.curseDetectDecayPerFloor
    ),
    cursePower: Math.min(
      IDENTIFICATION_BALANCE.maxCursePower,
      1 + steps * IDENTIFICATION_BALANCE.cursePowerPerFloor
    ),
    heavyCurseShare: Math.min(
      IDENTIFICATION_BALANCE.maxHeavyCurseShare,
      steps * IDENTIFICATION_BALANCE.heavyCurseSharePerFloor
    ),
    qualityMultiplier: Math.min(
      IDENTIFICATION_BALANCE.maxQualityMultiplier,
      1 + steps * IDENTIFICATION_BALANCE.qualityPerFloor
    ),
    epicChance: Math.min(0.20, 0.02 + steps * 0.015),
    rareChance: Math.min(0.45, 0.18 + steps * 0.03)
  };
}

export function getScaledCurseModifier(curse, affixType, cursePower = 1) {
  const value = curse?.mod?.[affixType];
  if (!Number.isFinite(value)) return 0;
  if (value >= 0) return value;
  const power = Math.max(1, cursePower || 1);
  // Negative physical atk values are stored in effective units, but the
  // legacy rule rounded the raw curse value before the physical 1.5x term.
  // Reconstruct that order so the unit refactor remains exactly equivalent.
  if (affixType === "atk") return Math.round((value / 1.5) * power) * 1.5;
  return Math.round(value * power);
}

export function isCurseLocked(item) {
  return Boolean(
    item &&
    typeof item === "object" &&
    item.curseEffectId &&
    (item.curseLocked || item.identified === true)
  );
}
