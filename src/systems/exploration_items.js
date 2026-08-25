export const NOISE_BALL_FORCED_ENCOUNTER_STEPS = 4;
export const SILENCE_INCENSE_STEPS = 10;
export const SILENCE_INCENSE_ENCOUNTER_MULTIPLIER = 0.2;
export const TRAP_SENSE_STONE_RADIUS = 3;

function markMapChanged(stateLike) {
  stateLike.mapRevision = (stateLike.mapRevision || 0) + 1;
}

export function applyNoiseBall(stateLike) {
  stateLike.forcedEncounterSteps = NOISE_BALL_FORCED_ENCOUNTER_STEPS;
  return {
    ok: true,
    message: `次の${NOISE_BALL_FORCED_ENCOUNTER_STEPS}歩以内に通常の魔物が寄ってくる。`
  };
}

export function applySilenceIncense(stateLike) {
  stateLike.silenceTurns = SILENCE_INCENSE_STEPS;
  return {
    ok: true,
    message: `${SILENCE_INCENSE_STEPS}歩ほど、通常の遭遇が起こりにくくなる。`
  };
}

function canTraverse(grid, from, direction) {
  const cell = grid?.[from.y]?.[from.x];
  if (!cell || cell.walls?.[direction]) return false;
  const dx = [0, 1, 0, -1][direction];
  const dy = [-1, 0, 1, 0][direction];
  return Boolean(grid?.[from.y + dy]?.[from.x + dx]);
}

export function revealTrapsInRange(stateLike, radius = TRAP_SENSE_STONE_RADIUS) {
  const grid = stateLike?.map;
  const start = { x: stateLike?.x, y: stateLike?.y };
  if (!grid || !Number.isInteger(start.x) || !Number.isInteger(start.y)) {
    return { ok: false, revealed: [], message: "探知石は反応しなかった。" };
  }

  const queue = [{ ...start, distance: 0 }];
  const visited = new Set([`${start.x},${start.y}`]);
  const revealed = [];
  while (queue.length > 0) {
    const current = queue.shift();
    const trap = grid[current.y]?.[current.x]?.trap;
    if (trap && trap.state === "hidden") {
      trap.state = "discovered";
      trap.traceReadLevel = Math.max(3, trap.traceReadLevel || 0);
      revealed.push({ x: current.x, y: current.y, type: trap.type });
    }
    if (current.distance >= radius) continue;

    for (let direction = 0; direction < 4; direction++) {
      if (!canTraverse(grid, current, direction)) continue;
      const dx = [0, 1, 0, -1][direction];
      const dy = [-1, 0, 1, 0][direction];
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ ...next, distance: current.distance + 1 });
    }
  }

  if (revealed.length > 0) markMapChanged(stateLike);
  return {
    ok: true,
    revealed,
    message: revealed.length > 0
      ? `探知石が${revealed.length}個の罠を映し出した。`
      : "探知石は反応しなかった。"
  };
}

export function applyExplorationItem(stateLike, itemKey) {
  if (itemKey === "NOISE_BALL") return applyNoiseBall(stateLike);
  if (itemKey === "SILENCE_INCENSE") return applySilenceIncense(stateLike);
  if (itemKey === "TRAP_SENSE_STONE") return revealTrapsInRange(stateLike);
  return { ok: false, revealed: [], message: "この道具は探索中には使えない。" };
}
