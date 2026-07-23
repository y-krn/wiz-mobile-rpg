/* global console, process */

// Mock localStorage for the Node.js simulation environment before imports.
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  },
  configurable: true
});

const {
  SOLO_CLASSES,
  createDefaultCurrentRun,
  createSoloCharacter
} = await import("../src/state/initial_state.js");
const { generateEncounter } = await import("../src/combat_ui/encounter.js");
const { runCombatRoundCalculation } = await import("../src/combat_logic.js");
const { applyCombatRewards } = await import("../src/combat_logic/rewards.js");
const { checkCharLevelUp } = await import("../src/systems/leveling.js");
const { SPELL_EFFECTS } = await import("../src/systems/spell_effects.js");
const { assignRunQuests, updateRunQuests } = await import("../src/systems/run_quests.js");
const { generateRunFloor } = await import("../src/run_map_generator.js");
const { getFloorTemplate } = await import("../src/data/floor_templates.js");
const { EVENT_TYPES } = await import("../src/constants/events.js");
const { generateChestMaterials } = await import("../src/chest.js");
const { MATERIAL_DROP_BALANCE } = await import("../src/data/materials.js");
const { bankRunMaterials, getBankedMaterials } = await import("../src/rules/material_rules.js");

const RUNS_PER_CASE = Math.max(1, Number(process.env.SIM_RUNS || 500));
const SIM_SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const TARGET_DEPTHS = [5, 10, 15, 20];
const MAX_COMBAT_TURNS = 50;

// 仮値・感度分析対象: critical pathに対する寄り道込み歩数を1.4倍と置く。
const EXPLORATION_FACTOR = 1.4;
// 仮値・感度分析対象: 探索係数1.4に対応し、配置宝箱の70%を拾えると置く。
const CHEST_PICKUP_RATE = 0.7;
// 仮値・感度分析対象: 戦闘1ターンを探索3歩相当と置く。
const COMBAT_TURN_WEIGHT = 3;

const HOLY_TAGS = new Set(["undead", "spirit", "demon"]);

let randomState = SIM_SEED;
Math.random = () => {
  randomState += 0x6D2B79F5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

function createSimulationState(className, startFloor, runSeed) {
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = runSeed;
  currentRun.startFloor = startFloor;
  currentRun.deepestFloor = startFloor;
  currentRun.characterClass = className;
  currentRun.floorsVisited = [startFloor];
  assignRunQuests(currentRun);

  return {
    party: [createSoloCharacter(className)],
    combatState: null,
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun,
    roamingMonsters: [],
    floorChestsTotal: [],
    metaMaterials: {},
    identifyTickets: 0,
    gold: 0,
    floor: startFloor
  };
}

function isAlive(character) {
  return character.status !== "dead" && character.hp > 0;
}

function hasSpell(character, spellName) {
  return character.spells?.includes(spellName) === true;
}

function getLowestHpEnemyIndex(monsters, predicate = () => true) {
  let selectedIdx = -1;
  let selectedHp = Infinity;
  monsters.forEach((monster, idx) => {
    if (monster.hp > 0 && predicate(monster) && monster.hp < selectedHp) {
      selectedIdx = idx;
      selectedHp = monster.hp;
    }
  });
  return selectedIdx;
}

function hasHolyTag(monster) {
  return monster.tags?.some(tag => HOLY_TAGS.has(tag)) === true;
}

function selectCombatAction(state) {
  const character = state.party[0];
  const monsters = state.combatState.monsters;
  const lowestHpIdx = getLowestHpEnemyIndex(monsters);

  if (hasSpell(character, "DIOS") && character.hp < character.maxHp * 0.35 && character.mp >= 1) {
    return { type: "spell", actorIdx: 0, targetIdx: 0, spellName: "DIOS" };
  }

  const reserveMp = hasSpell(character, "DIOS") ? 1 : 0;
  if (character.mp > reserveMp) {
    if (character.class === "Priest" && hasSpell(character, "BADIOS")) {
      const holyTargetIdx = monsters.findIndex(monster => monster.hp > 0 && hasHolyTag(monster));
      const firstLivingIdx = monsters.findIndex(monster => monster.hp > 0);
      return {
        type: "spell",
        actorIdx: 0,
        targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : firstLivingIdx,
        spellName: "BADIOS"
      };
    }

    if (character.class === "Bishop") {
      const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
      if (holyTargetIdx >= 0 && hasSpell(character, "BADIOS")) {
        return { type: "spell", actorIdx: 0, targetIdx: holyTargetIdx, spellName: "BADIOS" };
      }
      if (hasSpell(character, "HALITO")) {
        return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
      }
    }

    if ((character.class === "Mage" || character.class === "Samurai") && hasSpell(character, "HALITO")) {
      return { type: "spell", actorIdx: 0, targetIdx: lowestHpIdx, spellName: "HALITO" };
    }

    if (character.class === "Ranger" && hasSpell(character, "BADIOS")) {
      const holyTargetIdx = getLowestHpEnemyIndex(monsters, hasHolyTag);
      return {
        type: "spell",
        actorIdx: 0,
        targetIdx: holyTargetIdx >= 0 ? holyTargetIdx : lowestHpIdx,
        spellName: "BADIOS"
      };
    }
  }

  return { type: "fight", actorIdx: 0, targetIdx: lowestHpIdx };
}

function runEncounter(state) {
  const { monsters } = generateEncounter(state, false, false, false, null);
  state.combatState = {
    monsters,
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    allParalyzedTurns: 0,
    phase: "choose_actions",
    roundNumber: 1
  };

  let rounds = 0;
  for (; rounds < MAX_COMBAT_TURNS; rounds++) {
    const character = state.party[0];
    if (!isAlive(character)) return { result: "death", rounds, state };
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return { result: "victory", rounds, state };
    }

    const roundResult = runCombatRoundCalculation(state, {
      actions: [selectCombatAction(state)]
    });
    state = roundResult.state;

    if (!isAlive(state.party[0])) return { result: "death", rounds: rounds + 1, state };
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return { result: "victory", rounds: rounds + 1, state };
    }
  }

  return { result: "stalemate", rounds, state };
}

function applyPostCombatRecovery(character) {
  while (hasSpell(character, "DIOS") && character.mp > 0 && character.hp < character.maxHp * 0.70) {
    character.mp -= 1;
    SPELL_EFFECTS.DIOS({ caster: character, target: character });
  }
}

function applyFloorTransitionHeal(character) {
  if (!isAlive(character)) return 0;
  const healed = Math.min(
    character.maxHp - character.hp,
    Math.max(1, Math.floor(character.maxHp * 0.15))
  );
  character.hp += healed;
  return healed;
}

function getEncounterChance(floorStep) {
  return floorStep <= 30 ? 0.10 : 0.04;
}

function getFloorStepCount(generated, floor) {
  const template = getFloorTemplate(floor);
  const fallback = (template.criticalPathRange[0] + template.criticalPathRange[1]) / 2;
  const criticalPath = Number.isFinite(generated.validation?.criticalPath)
    ? generated.validation.criticalPath
    : fallback;
  return Math.max(1, Math.round(criticalPath * EXPLORATION_FACTOR));
}

function countFloorChests(grid) {
  return grid.flat().filter(cell => cell.event === EVENT_TYPES.CHEST).length;
}

function schedulePickedUpChests(chestCount, floorSteps) {
  const schedule = new Map();
  for (let index = 0; index < chestCount; index++) {
    if (Math.random() >= CHEST_PICKUP_RATE) continue;
    const step = 1 + Math.floor(Math.random() * floorSteps);
    schedule.set(step, (schedule.get(step) || 0) + 1);
  }
  return schedule;
}

function addMaterials(target, additions) {
  Object.entries(additions).forEach(([name, quantity]) => {
    target[name] = (target[name] || 0) + quantity;
  });
}

function totalMaterials(materials) {
  return Object.values(materials).reduce((sum, quantity) => sum + quantity, 0);
}

function finishRun(state, outcome, metrics) {
  const { banked, balance } = bankRunMaterials(
    state.metaMaterials,
    state.currentRun.materials,
    outcome
  );
  state.currentRun.bankedMaterials = banked;
  state.metaMaterials = balance;

  // getBankedMaterialsも同じ実ルール結果を返すことを、集計経路で明示的に確認する。
  const checkedBanked = getBankedMaterials(state.currentRun.materials, outcome);
  if (totalMaterials(checkedBanked) !== totalMaterials(banked)) {
    throw new Error("bank material calculation mismatch");
  }

  return {
    survived: outcome === "retreat",
    died: outcome === "death",
    bankedMaterials: totalMaterials(banked),
    timeCost: metrics.steps + COMBAT_TURN_WEIGHT * metrics.combatRounds,
    reachedFloor: state.currentRun.deepestFloor,
    stalemate: metrics.stalemate
  };
}

function descendToNextFloor(state, nextFloor) {
  state.floor = nextFloor;
  state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
  state.currentRun.floorsVisited.push(nextFloor);
  updateRunQuests(state.currentRun);
  applyFloorTransitionHeal(state.party[0]);
}

function simulateRun({ className, startFloor, targetDepth, runIndex, seriesId }) {
  const runSeed = `${SIM_SEED}:${seriesId}:${className}:${runIndex}`;
  let state = createSimulationState(className, startFloor, runSeed);
  const metrics = { steps: 0, combatRounds: 0, stalemate: false };

  for (let floor = startFloor; floor <= targetDepth; floor++) {
    state.floor = floor;
    const generated = generateRunFloor({ runSeed, floor });
    const floorSteps = getFloorStepCount(generated, floor);
    const chestSchedule = schedulePickedUpChests(countFloorChests(generated.grid), floorSteps);

    for (let step = 1; step <= floorSteps; step++) {
      metrics.steps++;
      state.currentRun.steps++;
      state.currentRun.floorSteps[String(floor)] =
        (state.currentRun.floorSteps[String(floor)] || 0) + 1;

      const pickedUpChests = chestSchedule.get(step) || 0;
      for (let chest = 0; chest < pickedUpChests; chest++) {
        addMaterials(state.currentRun.materials, generateChestMaterials(floor, Math.random, 0));
        state.currentRun.chestsOpened++;
      }

      if (Math.random() >= getEncounterChance(step)) continue;

      state.currentRun.battles++;
      const combatResult = runEncounter(state);
      state = combatResult.state;
      metrics.combatRounds += combatResult.rounds;

      if (combatResult.result !== "victory") {
        metrics.stalemate = combatResult.result === "stalemate";
        return finishRun(state, "death", metrics);
      }

      applyCombatRewards(state, state.combatState.monsters, [], Math.random);
      while (checkCharLevelUp(state.party[0])) {
        // applyCombatRewards performs the first possible level-up.
      }
      applyPostCombatRecovery(state.party[0]);
      if (!isAlive(state.party[0])) return finishRun(state, "death", metrics);
    }

    if (floor < targetDepth) descendToNextFloor(state, floor + 1);
  }

  return finishRun(state, "retreat", metrics);
}

function simulateCase({ startFloor, targetDepth, label, seriesId }) {
  const totals = {
    survived: 0,
    died: 0,
    bankedMaterials: 0,
    timeCost: 0,
    reachedFloor: 0,
    stalemates: 0
  };

  for (let runIndex = 0; runIndex < RUNS_PER_CASE; runIndex++) {
    const className = SOLO_CLASSES[runIndex % SOLO_CLASSES.length];
    const result = simulateRun({ className, startFloor, targetDepth, runIndex, seriesId });
    totals.survived += Number(result.survived);
    totals.died += Number(result.died);
    totals.bankedMaterials += result.bankedMaterials;
    totals.timeCost += result.timeCost;
    totals.reachedFloor += result.reachedFloor;
    totals.stalemates += Number(result.stalemate);
  }

  const bankedMaterialEv = totals.bankedMaterials / RUNS_PER_CASE;
  const averageTimeCost = totals.timeCost / RUNS_PER_CASE;
  return {
    label,
    startFloor,
    targetDepth,
    survivalRate: totals.survived / RUNS_PER_CASE,
    deathRate: totals.died / RUNS_PER_CASE,
    bankedMaterialEv,
    averageTimeCost,
    materialEvPerTime: bankedMaterialEv / averageTimeCost,
    averageReachedFloor: totals.reachedFloor / RUNS_PER_CASE,
    stalemateRate: totals.stalemates / RUNS_PER_CASE
  };
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function printTable(results) {
  console.log("戦略       | 生還率 | 死亡率 | bank素材EV | 平均時間 | 素材EV/時間 | 平均到達階");
  console.log("-----------|--------|--------|------------|----------|-------------|-----------");
  results.forEach(result => {
    console.log(
      `${result.label.padEnd(10)} | ${formatPercent(result.survivalRate).padStart(6)} | ` +
      `${formatPercent(result.deathRate).padStart(6)} | ${result.bankedMaterialEv.toFixed(2).padStart(10)} | ` +
      `${result.averageTimeCost.toFixed(2).padStart(8)} | ${result.materialEvPerTime.toFixed(4).padStart(11)} | ` +
      `${result.averageReachedFloor.toFixed(2).padStart(9)}`
    );
  });
}

function isMonotonicallyIncreasing(results) {
  return results.every((result, index) =>
    index === 0 || result.materialEvPerTime >= results[index - 1].materialEvPerTime
  );
}

function printFailureComment(results) {
  const b5 = results[0];
  const deepest = results.at(-1);
  const firstDeclineIndex = results.findIndex((result, index) =>
    index > 0 && result.materialEvPerTime < results[index - 1].materialEvPerTime
  );
  let commentPrinted = false;
  if (b5.deathRate < 0.10) {
    console.log(
      `機械コメント: B5死亡率 ${formatPercent(b5.deathRate)} と低く撤退が安全。` +
      "撤退コストまたは撤退条件が効きやすい。"
    );
    commentPrinted = true;
  }
  if (deepest.deathRate - b5.deathRate >= 0.20) {
    console.log(
      `機械コメント: B20死亡率 ${formatPercent(deepest.deathRate)} はB5より` +
      `${((deepest.deathRate - b5.deathRate) * 100).toFixed(1)}pt高い。死亡バンク率の影響が大きい。`
    );
    commentPrinted = true;
  }
  if (deepest.bankedMaterialEv <= b5.bankedMaterialEv) {
    console.log(
      `機械コメント: bank素材EV B5=${b5.bankedMaterialEv.toFixed(2)} / ` +
      `B20=${deepest.bankedMaterialEv.toFixed(2)}。深度別素材単価カーブまたはランクエスト報酬の深度依存が不足。`
    );
    commentPrinted = true;
  } else if (deepest.materialEvPerTime <= b5.materialEvPerTime) {
    console.log(
      `機械コメント: B20はbank素材EV ${deepest.bankedMaterialEv.toFixed(2)} を得るが` +
      `平均時間 ${deepest.averageTimeCost.toFixed(2)}。深層側の時間報酬または撤退コスト差が不足。`
    );
    commentPrinted = true;
  }
  if (!commentPrinted && firstDeclineIndex >= 1) {
    const previous = results[firstDeclineIndex - 1];
    const declined = results[firstDeclineIndex];
    console.log(
      `機械コメント: ${previous.label}→${declined.label}で素材EV/時間が` +
      `${previous.materialEvPerTime.toFixed(4)}→${declined.materialEvPerTime.toFixed(4)}。` +
      "該当深度帯の素材単価カーブまたはランクエスト報酬の深度依存が効きやすい。"
    );
  }
}

console.log("深度別 リスク調整後素材EVシミュレーション");
console.log(`試行数: 各ケース N=${RUNS_PER_CASE}（全${SOLO_CLASSES.length}職をround-robin集約）`);
console.log(`乱数seed: ${SIM_SEED}`);
console.log(
  `仮定: 探索係数=${EXPLORATION_FACTOR}, 宝箱拾得率=${CHEST_PICKUP_RATE}, ` +
  `戦闘ターン重み=${COMBAT_TURN_WEIGHT}`
);
console.log("時間単位: 1歩=1、1戦闘ターン=3");
console.log("撤退=100% bank、死亡=30% bank");

const depthResults = TARGET_DEPTHS.map(targetDepth => simulateCase({
  startFloor: 1,
  targetDepth,
  label: `B${targetDepth}撤退`,
  seriesId: `depth-${targetDepth}`
}));

console.log("\n【B1開始 深度別系列】");
printTable(depthResults);

const monotonic = isMonotonicallyIncreasing(depthResults);
const bestDepthResult = [...depthResults].sort((a, b) => b.materialEvPerTime - a.materialEvPerTime)[0];
const b5IsBest = bestDepthResult.targetDepth === 5;
console.log(`単位時間EVは深度について単調増加: ${monotonic ? "Yes" : "No"}`);
console.log(`B5が単位時間EV最上位でない: ${b5IsBest ? "不合格" : "合格"}（最上位=${bestDepthResult.label}）`);
if (!monotonic || b5IsBest) printFailureComment(depthResults);

const milestoneResults = [
  simulateCase({
    startFloor: 10,
    targetDepth: 15,
    label: "B10→B15",
    seriesId: "milestone-10-15"
  }),
  simulateCase({
    startFloor: 1,
    targetDepth: 15,
    label: "B1→B15",
    seriesId: "baseline-1-15"
  })
];

console.log("\n【マイルストーン開始比較】");
console.log(
  `B10開始は currentRun.startFloor=10 により実ドロップ量へ ` +
  `milestoneStartMultiplier=${MATERIAL_DROP_BALANCE.milestoneStartMultiplier} を適用`
);
printTable(milestoneResults);
const milestoneDominated =
  milestoneResults[0].materialEvPerTime < milestoneResults[1].materialEvPerTime;
console.log(
  `Issue #237 裏取り: B10開始はB1開始より単位時間EVで劣後(dominated): ` +
  `${milestoneDominated ? "Yes" : "No"}`
);

const stalemateCases = [...depthResults, ...milestoneResults].filter(result => result.stalemateRate > 0);
if (stalemateCases.length > 0) {
  console.log(
    `注: ${MAX_COMBAT_TURNS}ターン上限到達は進行不能として死亡bank扱い: ` +
    stalemateCases.map(result => `${result.label}=${formatPercent(result.stalemateRate)}`).join(", ")
  );
}
