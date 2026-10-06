// #1840: victory log carries a presentation-only summary (exp, materials,
// first-kill rewards, drops, level-ups) that the victory toast formats.
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true
});

import assert from "assert";

const { state, initNewGame } = await import("../../../src/state.js");
const { applyCombatRewards } = await import("../../../src/combat_logic/rewards.js");
const { EXP_LEVELS } = await import("../../../src/data.js");
const { formatVictorySummary } = await import("../../../src/ui/victory_toast.js");

initNewGame();
state.party = [
  { name: "Frontliner", level: 1, hp: 10, maxHp: 20, mp: 0, maxMp: 0, status: "ok", exp: EXP_LEVELS[2] - 1 }
];
state.firstKills = [];
state.identifyTickets = 0;
const wolf = { name: "ワーウルフ", hp: 0, maxHp: 36, level: 3, exp: 100, fled: false, tags: [], spriteType: "wolf" };
state.combatState = { isBoss: false, isMidboss: false, isRoamingFlack: false, monsters: [wolf] };
state.currentRun = { kills: 0, expGained: 0, materials: {}, equipmentFound: [] };

const logQueue = [];
// rng 0.99 skips random drops so the summary is deterministic.
applyCombatRewards(state, [wolf], logQueue, () => 0.99);

const victoryEntry = logQueue.find(log => log.victorySummary);
assert.ok(victoryEntry, "victory log entry carries a summary");
assert.equal(victoryEntry.msg, "戦闘に勝利した！戦闘経験を積んだ。");
const summary = victoryEntry.victorySummary;
assert.equal(summary.exp, 100);
assert.deepEqual(summary.firstKillMaterials, { "獣の牙": 1 });
assert.deepEqual(summary.items, []);
assert.equal(summary.levelUps.length, 1);
const [levelUp] = summary.levelUps;
assert.equal(levelUp.name, "Frontliner");
assert.equal(levelUp.levelBefore, 1);
assert.equal(levelUp.level, state.party[0].level);
assert.equal(levelUp.maxHpBefore, 20);
assert.equal(levelUp.maxHp, state.party[0].maxHp);
assert.ok(levelUp.maxHp > levelUp.maxHpBefore, "level-up raises max HP");

const formatted = formatVictorySummary(summary);
assert.equal(formatted.title, "勝利！ レベルアップ");
assert.ok(formatted.rewards.includes("経験値 +100"));
assert.ok(formatted.rewards.includes("初討伐 獣の牙 x1"));
assert.deepEqual(formatted.levelUps, [{
  heading: `Frontliner Lv1 → Lv${levelUp.level}`,
  stat: `最大HP 20 → ${levelUp.maxHp}（+${levelUp.maxHp - 20}）`
}]);

// Plain victory without level-up keeps a short, tap-free summary.
assert.deepEqual(formatVictorySummary({
  exp: 12,
  materials: { "骨片": 2 },
  firstKillMaterials: {},
  bonusTickets: 1,
  items: ["ショートソード"],
  levelUps: []
}), {
  title: "勝利！",
  rewards: ["経験値 +12", "素材 骨片 x2", "初討伐 鑑定粉 +1", "入手 ショートソード"],
  levelUps: []
});

// All enemies fled: no victory summary is produced.
const fledQueue = [];
state.combatState = { isBoss: false, isMidboss: false, isRoamingFlack: false, monsters: [] };
applyCombatRewards(state, [{ ...wolf, fled: true }], fledQueue, () => 0.99);
assert.ok(!fledQueue.some(log => log.victorySummary), "fled-only combat has no victory summary");

console.log("[PASS] victory summary");
