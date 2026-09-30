import { boundedFiniteOrNull } from "./telemetry_normalization.js";

export interface CombatEndPayloadInput {
  runId: string;
  combatId: string;
  context: Record<string, unknown>;
  combat: unknown;
  result: string;
  maxEnemySnapshot: number;
}

export interface CombatEndPayload extends Record<string, unknown> {
  runId: string;
  combatId: string;
  floor: number | null;
  result: string;
  turns: number | null;
  playerHp: number | null;
  playerMp: number | null;
  enemiesDefeated: number;
}

interface CombatEndMonster {
  hp?: unknown;
  fled?: unknown;
}

interface CombatEndCombat {
  floor?: unknown;
  turns?: unknown;
  player?: { hp?: unknown; mp?: unknown } | null;
  monsters?: Array<CombatEndMonster | null | undefined> | null;
}

export function buildCombatEndPayload(input: CombatEndPayloadInput): CombatEndPayload {
  const combat = input.combat as CombatEndCombat | null | undefined;
  return {
    runId: input.runId,
    combatId: input.combatId,
    ...input.context,
    floor: boundedFiniteOrNull(combat?.floor),
    result: input.result,
    turns: boundedFiniteOrNull(combat?.turns),
    playerHp: boundedFiniteOrNull(combat?.player?.hp),
    playerMp: boundedFiniteOrNull(combat?.player?.mp),
    enemiesDefeated: (combat?.monsters ?? [])
      .slice(0, input.maxEnemySnapshot)
      .filter(monster => (monster?.hp as number) <= 0 && !monster?.fled)
      .length
  };
}
