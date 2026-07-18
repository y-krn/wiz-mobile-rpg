export function recordMilestoneVictory(stateLike, floor) {
  if (!Number.isInteger(floor) || floor < 5 || floor % 5 !== 0) {
    return { ok: false, unlocked: false };
  }
  stateLike.currentRun ||= {};
  stateLike.currentRun.defeatedMilestones ||= [];
  if (!stateLike.currentRun.defeatedMilestones.includes(floor)) {
    stateLike.currentRun.defeatedMilestones.push(floor);
    stateLike.currentRun.defeatedMilestones.sort((a, b) => a - b);
  }
  stateLike.unlockedMilestones ||= [];
  const unlocked = !stateLike.unlockedMilestones.includes(floor);
  if (unlocked) {
    stateLike.unlockedMilestones.push(floor);
    stateLike.unlockedMilestones.sort((a, b) => a - b);
  }
  return { ok: true, unlocked };
}
