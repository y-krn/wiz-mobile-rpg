// Shared production-backed flee observation used by diagnostics.

function partingAttackDamageValues(diagnostic) {
  return (diagnostic?.rounds || [])
    .flatMap(round => round.log || [])
    .map(message => String(message).match(/追撃！.*?(\d+)のダメージ/))
    .filter(Boolean)
    .map(match => Number(match[1]));
}

export function summarizeFleeTelemetry({ identity, diagnostic } = {}) {
  const rounds = diagnostic?.rounds || [];
  const fleeSelected = rounds.filter(round => round.fleeSelected === true).length;
  const fleeExecuted = rounds.filter(round => round.fleeExecuted === true).length;
  const fleePartingAttackCount = rounds.filter(round => round.fleePartingAttack === true).length;
  const outcome = identity?.outcome || diagnostic?.result || null;
  const partingAttackDamage = partingAttackDamageValues(diagnostic);
  return {
    observed: diagnostic !== undefined && diagnostic !== null,
    fleeSelected,
    fleeExecuted,
    fleeSelectedButNotExecuted: Math.max(0, fleeSelected - fleeExecuted),
    fleePartingAttackCount,
    fleeSurvived: Number(fleeExecuted > 0 && outcome === "flee"),
    fleeDiedFromPartingAttack: Number(
      fleeExecuted > 0 && fleePartingAttackCount > 0 && outcome === "death"
    ),
    partingAttackDamage,
    partingAttackDamageHp: partingAttackDamage.reduce((sum, value) => sum + value, 0)
  };
}

export function mergeFleeTelemetry(values) {
  return values.reduce((total, value) => ({
    observed: total.observed || value.observed,
    fleeSelected: total.fleeSelected + value.fleeSelected,
    fleeExecuted: total.fleeExecuted + value.fleeExecuted,
    fleeSelectedButNotExecuted:
      total.fleeSelectedButNotExecuted + value.fleeSelectedButNotExecuted,
    fleePartingAttackCount: total.fleePartingAttackCount + value.fleePartingAttackCount,
    fleeSurvived: total.fleeSurvived + value.fleeSurvived,
    fleeDiedFromPartingAttack:
      total.fleeDiedFromPartingAttack + value.fleeDiedFromPartingAttack,
    partingAttackDamageHp: total.partingAttackDamageHp + value.partingAttackDamageHp
  }), {
    observed: false,
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeSelectedButNotExecuted: 0,
    fleePartingAttackCount: 0,
    fleeSurvived: 0,
    fleeDiedFromPartingAttack: 0,
    partingAttackDamageHp: 0
  });
}
