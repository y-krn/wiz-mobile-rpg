// balance-impact: none — coarse enemy HP disclosure only; combat rules unchanged.

export type EnemyHpStateInput = {
  readonly hp?: unknown;
  readonly maxHp?: unknown;
};

export type EnemyHpState = "状態不明" | "健在" | "負傷" | "重傷";

const HP_STATE_THRESHOLDS = Object.freeze({
  healthy: 0.75,
  wounded: 0.35
});

export function getEnemyHpState(monster: EnemyHpStateInput = {}): EnemyHpState {
  const hp = Number(monster.hp);
  const maxHp = Number(monster.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return "状態不明";

  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  if (ratio >= HP_STATE_THRESHOLDS.healthy) return "健在";
  if (ratio >= HP_STATE_THRESHOLDS.wounded) return "負傷";
  return "重傷";
}
