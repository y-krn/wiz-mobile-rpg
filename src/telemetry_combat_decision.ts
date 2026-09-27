import {
  normalizeCombatIndex,
  normalizeDecisionAction,
  type TelemetryDecisionAction
} from "./telemetry_decision_normalization.js";

export interface CombatDecisionInput {
  runId: string | null;
  combatId: string | null;
  action: unknown;
  actorIdx: unknown;
  targetIdx: unknown;
  partySize: unknown;
  monsters: unknown;
  context: Record<string, unknown>;
  spellId: string | null;
  spellTarget: unknown;
  itemId: string | null;
  itemCategory: string;
  normalizeEnemyId: (name: unknown) => string;
}

export interface CombatDecisionPayload {
  runId: unknown;
  combatId: unknown;
  action: TelemetryDecisionAction;
  actorIndex: number | null;
  targetIndex: number | null;
  targetEnemyId: string | null;
  spellId: string | null;
  itemId: string | null;
  itemCategory: string;
  [key: string]: unknown;
}

function isEnemySpellTarget(target: unknown): boolean {
  return target === "single_enemy" || target === "all_enemies";
}

function isAllSpellTarget(target: unknown): boolean {
  return target === "all_enemies" || target === "all_allies";
}

function readMonsterName(monster: unknown): unknown {
  if (monster === null || monster === undefined) return undefined;
  if (typeof monster !== "object" && typeof monster !== "function") return undefined;
  return Reflect.get(monster, "name");
}

export function buildCombatDecisionPayload(input: CombatDecisionInput): CombatDecisionPayload {
  const action = normalizeDecisionAction(input.action);
  const monsters: readonly unknown[] = Array.isArray(input.monsters) ? input.monsters : [];
  const isAllyTarget = action === "item" || action === "spell" && input.spellTarget === "single_ally";
  const isEnemyTarget = action === "attack" || action === "spell" && isEnemySpellTarget(input.spellTarget);
  const targetCollectionSize = isAllyTarget
    ? input.partySize
    : isEnemyTarget
      ? monsters.length
      : 0;
  const target = isEnemyTarget && typeof input.targetIdx === "number" && Number.isInteger(input.targetIdx)
    ? monsters[input.targetIdx]
    : null;

  return {
    runId: input.runId,
    combatId: input.combatId,
    ...input.context,
    action,
    actorIndex: normalizeCombatIndex(input.actorIdx, input.partySize),
    targetIndex: normalizeCombatIndex(
      input.targetIdx,
      targetCollectionSize,
      action === "spell" && isAllSpellTarget(input.spellTarget)
    ),
    targetEnemyId: target ? input.normalizeEnemyId(readMonsterName(target)) : null,
    spellId: input.spellId,
    itemId: input.itemId,
    itemCategory: input.itemCategory
  };
}
