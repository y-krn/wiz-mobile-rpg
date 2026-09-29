import { boundedFiniteOrNull } from "./telemetry_normalization.js";

export interface CombatStartPayloadInput {
  runId: string;
  combatId: string;
  context: Record<string, unknown>;
  combat: unknown;
  maxEnemySnapshot: number;
  normalizeEnemyId(value: unknown): string;
}

export interface CombatStartPayload extends Record<string, unknown> {
  runId: string;
  combatId: string;
  floor: number | null;
  playerHp: number | null;
  playerMp: number | null;
  enemyIds: string[];
  isBoss: boolean;
  isMidboss: boolean;
  isRoamingFlack: boolean;
}

interface CombatStartCombat {
  floor?: unknown;
  player?: { hp?: unknown; mp?: unknown } | null;
  monsters?: Array<{ name?: unknown } | null> | null;
  isBoss?: unknown;
  isMidboss?: unknown;
  isRoamingFlack?: unknown;
}

export function buildCombatStartPayload(input: CombatStartPayloadInput): CombatStartPayload {
  const combat = input.combat as CombatStartCombat | null | undefined;
  return {
    runId: input.runId,
    combatId: input.combatId,
    ...input.context,
    floor: boundedFiniteOrNull(combat?.floor),
    playerHp: boundedFiniteOrNull(combat?.player?.hp),
    playerMp: boundedFiniteOrNull(combat?.player?.mp),
    enemyIds: (combat?.monsters ?? [])
      .slice(0, input.maxEnemySnapshot)
      .map(monster => input.normalizeEnemyId(monster?.name)),
    isBoss: Boolean(combat?.isBoss),
    isMidboss: Boolean(combat?.isMidboss),
    isRoamingFlack: Boolean(combat?.isRoamingFlack)
  };
}
