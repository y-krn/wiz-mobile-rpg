import {
  boundedFiniteOrNull,
  MAX_TELEMETRY_RESOURCE_VALUE,
  normalizeStableValue
} from "./telemetry_normalization.js";

export type DamageReceivedField =
  | "floor"
  | "character"
  | "enemyId"
  | "attackType"
  | "rawDamage"
  | "preDefDamage"
  | "postDefDamage"
  | "finalDamage"
  | "finalDef"
  | "defResistance"
  | "playerHpBefore"
  | "playerHpAfter"
  | "playerMp"
  | "isDefending"
  | "guardProfileId";

export interface DamageReceivedPayloadInput {
  runId: string;
  combatId: string;
  defenseBreakdown: unknown;
  safeAttackTypes: ReadonlySet<string>;
  safeGuardProfileIds: ReadonlySet<string>;
  readDamageField(field: DamageReceivedField): unknown;
  normalizeEnemyId(value: unknown): string;
  resolveBuildSnapshot(character: unknown): unknown;
}

export interface DamageReceivedPayload {
  runId: string;
  combatId: string;
  floor: number | null;
  buildSnapshot?: unknown;
  enemyId: string;
  attackType: string;
  rawDamage: number | null;
  preDefDamage: number | null;
  postDefDamage: number | null;
  finalDamage: number | null;
  finalDef: number | null;
  defResistance: number | null;
  baseDef?: number | null;
  equipmentDef?: number | null;
  buffDef?: number | null;
  frontGuardDef?: number | null;
  firstStrikeDefense?: number | null;
  tempDefDown?: number | null;
  playerHpBefore: number | null;
  playerHpAfter: number | null;
  playerMp: number | null;
  isDefending: boolean;
  guardProfileId: string;
}

export function normalizeDefenseBreakdown(breakdown: unknown): Partial<DamageReceivedPayload> {
  if (!breakdown || typeof breakdown !== "object") return {};
  const values = breakdown as {
    baseDef?: unknown;
    equipmentDef?: unknown;
    buffDef?: unknown;
    frontGuardDef?: unknown;
    firstStrikeDefense?: unknown;
    tempDefDown?: unknown;
  };
  const normalize = (value: unknown): number | null =>
    boundedFiniteOrNull(value, -MAX_TELEMETRY_RESOURCE_VALUE);
  return {
    baseDef: normalize(values.baseDef ?? values.equipmentDef),
    equipmentDef: normalize(values.equipmentDef),
    buffDef: normalize(values.buffDef),
    frontGuardDef: normalize(values.frontGuardDef),
    firstStrikeDefense: normalize(values.firstStrikeDefense),
    tempDefDown: normalize(values.tempDefDown)
  };
}

export function buildDamageReceivedPayload(input: DamageReceivedPayloadInput): DamageReceivedPayload {
  return {
    runId: input.runId,
    combatId: input.combatId,
    floor: boundedFiniteOrNull(input.readDamageField("floor")),
    ...(input.readDamageField("character")
      ? { buildSnapshot: input.resolveBuildSnapshot(input.readDamageField("character")) }
      : {}),
    enemyId: input.normalizeEnemyId(input.readDamageField("enemyId")),
    attackType: normalizeStableValue(input.readDamageField("attackType"), input.safeAttackTypes),
    rawDamage: boundedFiniteOrNull(input.readDamageField("rawDamage")),
    preDefDamage: boundedFiniteOrNull(input.readDamageField("preDefDamage")),
    postDefDamage: boundedFiniteOrNull(input.readDamageField("postDefDamage")),
    finalDamage: boundedFiniteOrNull(input.readDamageField("finalDamage")),
    finalDef: boundedFiniteOrNull(input.readDamageField("finalDef")),
    defResistance: boundedFiniteOrNull(input.readDamageField("defResistance"), -1, 1),
    ...normalizeDefenseBreakdown(input.defenseBreakdown),
    playerHpBefore: boundedFiniteOrNull(input.readDamageField("playerHpBefore")),
    playerHpAfter: boundedFiniteOrNull(input.readDamageField("playerHpAfter")),
    playerMp: boundedFiniteOrNull(input.readDamageField("playerMp")),
    isDefending: Boolean(input.readDamageField("isDefending")),
    guardProfileId: normalizeStableValue(input.readDamageField("guardProfileId"), input.safeGuardProfileIds)
  };
}
