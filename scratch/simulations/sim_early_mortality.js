// sim-scope: run
/* global console, process */

import "./simulation_preflight.js";
import { requireRunnerProvenance } from "../measurements/measurement_provenance.js";

export const MEASUREMENT_PROVENANCE = requireRunnerProvenance();

// Mock localStorage before importing game modules.
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
} = await import("../../src/state/initial_state.js");
const { ELITE_CLASSES } = await import("../../src/data/classes.js");
const { generateEncounter } = await import("../../src/combat_ui/encounter.js");
const { runCombatRoundCalculation } = await import("../../src/combat_logic.js");
const { SPELL_EFFECTS } = await import("../../src/systems/spell_effects.js");
const { assignRunQuests, updateRunQuests } = await import("../../src/systems/run_quests.js");
const { generateRunFloor } = await import("../../src/run_map_generator.js");
const { getFloorTemplate } = await import("../../src/data/floor_templates.js");
const { EVENT_TYPES } = await import("../../src/constants/events.js");
const { generateChestMaterials } = await import("../../src/chest.js");
const {
  getCharAffixSum,
  getCharAgi,
  getCharDef,
  getCharInt,
  getCharMaxHp,
  getCharPie,
  getCharStr,
  getCharVit,
  getCharWeaponAtk,
  getItemData
} = await import("../../src/data.js");
const { ITEM_EFFECTS } = await import("../../src/systems/item_effects.js");

const RUNS = Math.max(1, Number(process.env.SIM_RUNS || 1000));
const SIM_SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const MAX_COMBAT_TURNS = 50;
const MAX_FLOOR = 100;
const EXPLORATION_FACTOR = 1.4;
const CHEST_PICKUP_RATE = 0.7;
const INITIAL_HEAL_POTIONS = 0;
const HEAL_POTION_THRESHOLD = 0.35;
// 仮値・感度分析対象: 最大HPの35%以下なら次の自ターンで逃走する。
const FLEE_HP_THRESHOLD = 0.35;
const SIM_CLASSES = SOLO_CLASSES.filter(className => !ELITE_CLASSES.includes(className));
const EQUIPMENT_SCORE_WEIGHTS = Object.freeze({
  weaponAtk: 2,
  defense: 2,
  maxHp: 0.25,
  str: 1,
  vit: 1,
  int: 0.5,
  pie: 0.5,
  agi: 0.25,
  guardian: 0.2,
  spellGuard: 0.15,
  followUp: 0.15,
  firstStrike: 0.1,
  arcane: 0.1,
  devotion: 0.1
});
const HOLY_TAGS = new Set(["undead", "spirit", "demon"]);
const TRACKED_STATUSES = new Set(["poisoned", "paralyzed", "paralyze", "sleep", "blind"]);
const INCAPACITATING_STATUSES = new Set(["paralyzed", "paralyze", "sleep"]);

let randomState = SIM_SEED;
Math.random = () => {
  randomState += 0x6D2B79F5;
  let value = randomState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

function hashSimulationRunSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSimulationState(className, runSeed) {
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = runSeed;
  currentRun.startFloor = 1;
  currentRun.deepestFloor = 1;
  currentRun.characterClass = className;
  currentRun.floorsVisited = [1];
  assignRunQuests(currentRun);

  return {
    party: [createSoloCharacter(className)],
    combatState: null,
    inventory: [
      ...Array(INITIAL_HEAL_POTIONS).fill("HEAL_POTION")
    ],
    firstKills: [],
    codex: null,
    currentRun,
    roamingMonsters: [],
    floorChestsTotal: [],
    metaMaterials: {},
    identifyTickets: 0,
    gold: 0,
    floor: 1
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

  if (character.hp <= getCharMaxHp(character) * FLEE_HP_THRESHOLD) {
    return { type: "run", actorIdx: 0 };
  }

  if (
    character.hp <= getCharMaxHp(character) * HEAL_POTION_THRESHOLD
    && state.inventory.includes("HEAL_POTION")
  ) {
    return { type: "item", actorIdx: 0, targetIdx: 0, itemKey: "HEAL_POTION" };
  }

  if (hasSpell(character, "DIOS") && character.hp < getCharMaxHp(character) * 0.35 && character.mp >= 1) {
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

function updateStatusFromLog(currentStatus, message, characterName) {
  if (!message.includes(characterName)) return currentStatus;
  if (message.includes("毒に侵された")) return "poisoned";
  if (message.includes("麻痺状態になった")) return "paralyzed";
  if (message.includes("眠りに落ちた")) return "sleep";
  if (message.includes("盲目状態になった")) return "blind";
  if (
    message.includes("状態異常から回復した")
    || message.includes("目を覚ました")
    || message.includes("麻痺が解けた")
    || message.includes("毒が消え去った")
    || message.includes("視界が戻った")
  ) {
    return "ok";
  }
  return currentStatus;
}

function parseRoundTelemetry(logQueue, character, roundStartHp, roundStartStatus) {
  let reconstructedHp = roundStartHp;
  let activeStatus = roundStartStatus;
  const damageEvents = [];
  const statusesApplied = [];

  logQueue.forEach(({ msg }) => {
    const nextStatus = updateStatusFromLog(activeStatus, msg, character.name);
    if (nextStatus !== activeStatus && TRACKED_STATUSES.has(nextStatus)) {
      statusesApplied.push(nextStatus);
    }
    activeStatus = nextStatus;

    if (msg.includes(character.name)) {
      const healMatch = msg.match(/HPが\s*(\d+)\s*回復/);
      if (healMatch) {
        reconstructedHp = Math.min(getCharMaxHp(character), reconstructedHp + Number(healMatch[1]));
      }
    }

    const isEnemyDamage = msg.startsWith("[ 敵 ]") && msg.includes(character.name);
    const isPlayerPoisonDamage = msg.startsWith("[味方] [!] 毒のダメージ")
      && msg.includes(character.name);
    if (!isEnemyDamage && !isPlayerPoisonDamage) return;

    const damageMatch = msg.match(/(\d+)の(?:反射|炎|氷|爆裂)?ダメージ/);
    if (!damageMatch) return;
    const damage = Number(damageMatch[1]);
    const preHitHp = reconstructedHp;
    reconstructedHp = Math.max(0, reconstructedHp - damage);
    damageEvents.push({
      damage,
      maxHp: getCharMaxHp(character),
      preHitHp,
      fatal: damage >= preHitHp,
      normalAttack: msg.includes("の攻撃！") && !msg.includes("追撃") && !msg.includes("狙撃")
    });
  });

  return { damageEvents, statusesApplied, activeStatus };
}

function classifyDeath({
  damageEvents,
  rounds,
  potionsRemaining,
  statusAtDeath,
  stalemate
}) {
  if (stalemate) {
    return {
      primary: "stalemate",
      statusRelated: TRACKED_STATUSES.has(statusAtDeath)
    };
  }

  const maxSingleAtLeastMaxHp = damageEvents.some(event => event.damage >= event.maxHp);
  const onlyHitKilled = damageEvents.length === 1 && damageEvents[0].fatal;
  const oneShot = maxSingleAtLeastMaxHp || onlyHitKilled;
  const attrition = !oneShot && rounds >= 2 && potionsRemaining === 0;
  return {
    primary: oneShot ? "oneShot" : (attrition ? "attrition" : "other"),
    statusRelated: TRACKED_STATUSES.has(statusAtDeath)
  };
}

function runEncounter(state, cumulativeUpgrades) {
  const { monsters } = generateEncounter(state, false, false, false, null);
  const initialMonsters = monsters.map(monster => ({
    name: monster.name,
    role: monster.role || "unknown",
    atk: monster.atk,
    hp: monster.maxHp
  }));
  const characterAtStart = state.party[0];
  const encounterStart = {
    level: characterAtStart.level,
    maxHp: getCharMaxHp(characterAtStart),
    hpRatio: characterAtStart.hp / getCharMaxHp(characterAtStart),
    upgrades: cumulativeUpgrades
  };
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
  let healPotionsUsed = 0;
  let incapacitationStreak = 0;
  let maxIncapacitationStreak = 0;
  const damageEvents = [];
  const statusesSeen = new Set();
  const statusesApplied = [];

  for (; rounds < MAX_COMBAT_TURNS; rounds++) {
    const character = state.party[0];
    if (!isAlive(character)) break;
    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return {
        result: "victory",
        rounds,
        healPotionsUsed,
        state,
        normalAttackRatios: damageEvents.filter(event => event.normalAttack)
          .map(event => event.damage / event.maxHp),
        maxIncapacitationStreak
      };
    }

    if (TRACKED_STATUSES.has(character.status)) statusesSeen.add(character.status);
    if (INCAPACITATING_STATUSES.has(character.status)) {
      incapacitationStreak++;
      maxIncapacitationStreak = Math.max(maxIncapacitationStreak, incapacitationStreak);
    } else {
      incapacitationStreak = 0;
    }

    const roundStartHp = character.hp;
    const roundStartStatus = character.status;
    const action = selectCombatAction(state);
    const potionCountBefore = state.inventory.filter(item => item === "HEAL_POTION").length;
    const roundResult = runCombatRoundCalculation(state, { actions: [action] });
    state = roundResult.state;
    const potionCountAfter = state.inventory.filter(item => item === "HEAL_POTION").length;
    healPotionsUsed += potionCountBefore - potionCountAfter;
    const fled = roundResult.logQueue.some(entry => entry.runEscape);
    const fleePartingHit = roundResult.logQueue.some(entry => entry.msg?.includes("の追撃！"));

    const parsed = parseRoundTelemetry(
      roundResult.logQueue,
      state.party[0],
      roundStartHp,
      roundStartStatus
    );
    damageEvents.push(...parsed.damageEvents);
    parsed.statusesApplied.forEach(status => {
      statusesSeen.add(status);
      statusesApplied.push(status);
    });
    if (TRACKED_STATUSES.has(state.party[0].status)) statusesSeen.add(state.party[0].status);

    if (!isAlive(state.party[0])) {
      const death = {
        encounterStart,
        level: state.party[0].level,
        maxHp: getCharMaxHp(state.party[0]),
        upgrades: cumulativeUpgrades,
        initialMonsters,
        rounds: rounds + 1,
        potionsRemaining: potionCountAfter,
        damageEvents,
        statusesSeen: [...statusesSeen],
        statusesApplied,
        statusAtDeath: parsed.activeStatus,
        maxIncapacitationStreak,
        fleeActionChosen: action.type === "run",
        fleePartingHit,
        stalemate: false
      };
      death.classification = classifyDeath(death);
      return {
        result: "death",
        rounds: rounds + 1,
        healPotionsUsed,
        state,
        death,
        normalAttackRatios: damageEvents.filter(event => event.normalAttack)
          .map(event => event.damage / event.maxHp),
        maxIncapacitationStreak
      };
    }

    if (fled) {
      return {
        result: "flee",
        rounds: rounds + 1,
        healPotionsUsed,
        state,
        normalAttackRatios: damageEvents.filter(event => event.normalAttack)
          .map(event => event.damage / event.maxHp),
        maxIncapacitationStreak
      };
    }

    if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
      return {
        result: "victory",
        rounds: rounds + 1,
        healPotionsUsed,
        state,
        normalAttackRatios: damageEvents.filter(event => event.normalAttack)
          .map(event => event.damage / event.maxHp),
        maxIncapacitationStreak
      };
    }
  }

  const character = state.party[0];
  const death = {
    encounterStart,
    level: character.level,
    maxHp: getCharMaxHp(character),
    upgrades: cumulativeUpgrades,
    initialMonsters,
    rounds,
    potionsRemaining: state.inventory.filter(item => item === "HEAL_POTION").length,
    damageEvents,
    statusesSeen: [...statusesSeen],
    statusesApplied,
    statusAtDeath: character.status,
    maxIncapacitationStreak,
    stalemate: true
  };
  death.classification = classifyDeath(death);
  return {
    result: "stalemate",
    rounds,
    healPotionsUsed,
    state,
    death,
    normalAttackRatios: damageEvents.filter(event => event.normalAttack)
      .map(event => event.damage / event.maxHp),
    maxIncapacitationStreak
  };
}

function applyPostCombatRecovery(character) {
  while (hasSpell(character, "DIOS") && character.mp > 0 && character.hp < getCharMaxHp(character) * 0.70) {
    character.mp -= 1;
    SPELL_EFFECTS.DIOS({ caster: character, target: character });
  }
}

function useHealPotionIfNeeded(state) {
  const character = state.party[0];
  const maxHp = getCharMaxHp(character);
  if (!isAlive(character) || character.hp > maxHp * HEAL_POTION_THRESHOLD) return false;
  const potionIndex = state.inventory.indexOf("HEAL_POTION");
  if (potionIndex < 0) return false;
  state.inventory.splice(potionIndex, 1);
  ITEM_EFFECTS.HEAL_POTION({ char: character });
  return true;
}

function identifyWithoutCurse(item) {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    identified: true,
    halfIdentified: false,
    curseEffectId: null,
    cursePower: 0,
    curseSuspected: false
  };
}

function isEquipment(item) {
  return ["weapon", "shield", "armor", "accessory"].includes(item?.type);
}

function canEquipForSimulation(character, item) {
  const itemData = getItemData(item);
  if (!isEquipment(itemData)) return false;
  if (itemData.classes && !itemData.classes.includes(character.class)) return false;
  return true;
}

function getEquipmentScore(character) {
  return (
    getCharWeaponAtk(character) * EQUIPMENT_SCORE_WEIGHTS.weaponAtk
    + getCharDef(character) * EQUIPMENT_SCORE_WEIGHTS.defense
    + getCharMaxHp(character) * EQUIPMENT_SCORE_WEIGHTS.maxHp
    + getCharStr(character) * EQUIPMENT_SCORE_WEIGHTS.str
    + getCharVit(character) * EQUIPMENT_SCORE_WEIGHTS.vit
    + getCharInt(character) * EQUIPMENT_SCORE_WEIGHTS.int
    + getCharPie(character) * EQUIPMENT_SCORE_WEIGHTS.pie
    + getCharAgi(character) * EQUIPMENT_SCORE_WEIGHTS.agi
    + getCharAffixSum(character, "guardian") * EQUIPMENT_SCORE_WEIGHTS.guardian
    + getCharAffixSum(character, "spellGuard") * EQUIPMENT_SCORE_WEIGHTS.spellGuard
    + getCharAffixSum(character, "followUp") * EQUIPMENT_SCORE_WEIGHTS.followUp
    + getCharAffixSum(character, "firstStrike") * EQUIPMENT_SCORE_WEIGHTS.firstStrike
    + getCharAffixSum(character, "arcane") * EQUIPMENT_SCORE_WEIGHTS.arcane
    + getCharAffixSum(character, "devotion") * EQUIPMENT_SCORE_WEIGHTS.devotion
  );
}

function equipGreedyUpgrades(state) {
  const character = state.party[0];
  let upgrades = 0;

  while (true) {
    const currentScore = getEquipmentScore(character);
    let best = null;

    state.inventory.forEach((inventoryItem, index) => {
      const candidate = identifyWithoutCurse(inventoryItem);
      const itemData = getItemData(candidate);
      if (!canEquipForSimulation(character, candidate)) return;

      const slot = itemData.type;
      const oldEquipment = character.equipment[slot];
      character.equipment[slot] = candidate;
      const candidateScore = getEquipmentScore(character);
      character.equipment[slot] = oldEquipment;

      if (candidateScore <= currentScore || (best && candidateScore <= best.score)) return;
      best = { candidate, index, oldEquipment, score: candidateScore, slot };
    });

    if (!best) break;
    character.equipment[best.slot] = best.candidate;
    if (best.oldEquipment) {
      state.inventory[best.index] = best.oldEquipment;
    } else {
      state.inventory.splice(best.index, 1);
    }
    character.hp = Math.min(character.hp, getCharMaxHp(character));
    upgrades++;
  }

  state.inventory = state.inventory.filter(item => !isEquipment(getItemData(item)));
  return upgrades;
}

function applyFloorTransitionHeal(character) {
  if (!isAlive(character)) return;
  const maxHp = getCharMaxHp(character);
  character.hp += Math.min(
    maxHp - character.hp,
    Math.max(1, Math.floor(maxHp * 0.15))
  );
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

function descendToNextFloor(state, nextFloor) {
  state.floor = nextFloor;
  state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor, nextFloor);
  state.currentRun.floorsVisited.push(nextFloor);
  updateRunQuests(state.currentRun);
  applyFloorTransitionHeal(state.party[0]);
}

function makeSnapshot(state, upgrades) {
  const character = state.party[0];
  return {
    level: character.level,
    upgrades,
    hpRatio: character.hp / getCharMaxHp(character)
  };
}

function simulateRun({ className, runIndex }) {
  const runSeed = `${SIM_SEED}:early-mortality:${className}:${runIndex}`;
  randomState = hashSimulationRunSeed(runSeed);
  let state = createSimulationState(className, runSeed);
  let equipmentUpgrades = 0;
  let b2Entered = false;
  let b2PassedSnapshot = null;
  let b2FailedSnapshot = null;
  const normalAttackRatios = [];
  let maxIncapacitationStreak = 0;
  let fleeCount = 0;

  for (let floor = 1; floor <= MAX_FLOOR; floor++) {
    state.floor = floor;
    if (floor === 2) b2Entered = true;
    const generated = generateRunFloor({ runSeed, floor });
    const floorSteps = getFloorStepCount(generated, floor);
    const chestSchedule = schedulePickedUpChests(countFloorChests(generated.grid), floorSteps);

    for (let step = 1; step <= floorSteps; step++) {
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
      const preEncounterSnapshot = makeSnapshot(state, equipmentUpgrades);
      const combatResult = runEncounter(state, equipmentUpgrades);
      state = combatResult.state;
      if (floor <= 5) normalAttackRatios.push(...combatResult.normalAttackRatios);
      maxIncapacitationStreak = Math.max(
        maxIncapacitationStreak,
        combatResult.maxIncapacitationStreak
      );

      if (combatResult.result === "flee") {
        fleeCount++;
        applyPostCombatRecovery(state.party[0]);
        useHealPotionIfNeeded(state);
        continue;
      }

      if (combatResult.result !== "victory") {
        if (floor === 2) b2FailedSnapshot = preEncounterSnapshot;
        return {
          className,
          reachedFloor: floor,
          died: true,
          stalemate: combatResult.result === "stalemate",
          death: combatResult.death,
          normalAttackRatios,
          b2Entered,
          b2PassedSnapshot,
          b2FailedSnapshot,
          maxIncapacitationStreak,
          fleeCount
        };
      }

      equipmentUpgrades += equipGreedyUpgrades(state);
      applyPostCombatRecovery(state.party[0]);
      useHealPotionIfNeeded(state);
    }

    if (floor === 2) b2PassedSnapshot = makeSnapshot(state, equipmentUpgrades);
    descendToNextFloor(state, floor + 1);
  }

  return {
    className,
    reachedFloor: MAX_FLOOR,
    died: false,
    stalemate: false,
    death: null,
    normalAttackRatios,
    b2Entered,
    b2PassedSnapshot,
    b2FailedSnapshot,
    maxIncapacitationStreak,
    fleeCount
  };
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

function formatPercent(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function floorBucket(floor) {
  return floor >= 7 ? "B7+" : `B${floor}`;
}

function summarizeSnapshots(snapshots) {
  return {
    level: average(snapshots.map(snapshot => snapshot.level)),
    upgrades: average(snapshots.map(snapshot => snapshot.upgrades)),
    hpRatio: average(snapshots.map(snapshot => snapshot.hpRatio))
  };
}

function printResults(results) {
  const deaths = results.filter(result => result.died);
  const actualDeaths = deaths.filter(result => !result.stalemate);
  const earlyDeaths = actualDeaths.filter(result => result.reachedFloor <= 5);
  const censored = results.filter(result => !result.died);
  const floorBuckets = ["B1", "B2", "B3", "B4", "B5", "B6", "B7+"];
  const floorCounts = Object.fromEntries(floorBuckets.map(bucket => [bucket, 0]));
  deaths.forEach(result => {
    floorCounts[floorBucket(result.reachedFloor)]++;
  });

  console.log("早期死亡診断シミュレーション");
  console.log(`試行数: N=${RUNS}（基本${SIM_CLASSES.length}職をround-robin集約）`);
  console.log(`乱数seed: ${SIM_SEED}`);
  console.log(`生存モデル: #231準拠（B1開始、初期傷薬2、回復HP35%閾値、逃走HP${FLEE_HP_THRESHOLD * 100}%閾値、貪欲装備、実報酬・実マップ）`);
  console.log("逃走=常時成功（自ターン到達時）、先行攻撃＋離脱時追撃1発、報酬なし、探索継続");
  console.log(`安全上限: B${MAX_FLOOR} / 戦闘${MAX_COMBAT_TURNS}ターン（到達時は打切り）`);
  console.log("");

  console.log("【1. 階別死亡分布】");
  console.log(`平均到達階: ${average(results.map(result => result.reachedFloor)).toFixed(2)}`);
  floorBuckets.forEach(bucket => {
    console.log(`${bucket}: ${floorCounts[bucket]} / ${RUNS} (${formatPercent(floorCounts[bucket] / RUNS)})`);
  });
  console.log(`打切り生存: ${censored.length} / ${RUNS} (${formatPercent(censored.length / RUNS)})`);
  console.log(`50ターン進行不能: ${deaths.filter(result => result.stalemate).length} / ${RUNS} (${formatPercent(deaths.filter(result => result.stalemate).length / RUNS)})`);
  const totalFlees = results.reduce((sum, result) => sum + result.fleeCount, 0);
  const runsWithFlee = results.filter(result => result.fleeCount > 0);
  console.log(`逃走回数: ${totalFlees} / 逃走run: ${runsWithFlee.length} / ${RUNS} (${formatPercent(runsWithFlee.length / RUNS)})`);
  console.log("");

  console.log("【2. 死亡時キャラ状態（B1-B5実死亡）】");
  console.log(`対象死亡: ${earlyDeaths.length}`);
  console.log(`平均Lv: ${average(earlyDeaths.map(result => result.death.level)).toFixed(2)}`);
  console.log(`平均maxHP: ${average(earlyDeaths.map(result => result.death.maxHp)).toFixed(2)}`);
  console.log(`平均換装回数: ${average(earlyDeaths.map(result => result.death.upgrades)).toFixed(2)}`);
  console.log(`死亡戦闘開始HP率: ${formatPercent(average(earlyDeaths.map(result => result.death.encounterStart.hpRatio)))}`);
  console.log("");

  const fatalMonsters = earlyDeaths.flatMap(result => result.death.initialMonsters);
  const roles = ["aggressor", "disruptor", "amplifier", "unknown"];
  console.log("【3. 死亡戦闘の敵構成（B1-B5、戦闘開始時）】");
  console.log(`平均敵数: ${average(earlyDeaths.map(result => result.death.initialMonsters.length)).toFixed(2)}`);
  roles.forEach(role => {
    const roleCount = fatalMonsters.filter(monster => monster.role === role).length;
    const encounterCount = earlyDeaths.filter(result =>
      result.death.initialMonsters.some(monster => monster.role === role)
    ).length;
    console.log(
      `${role}: 個体構成比 ${formatPercent(roleCount / fatalMonsters.length)}`
      + ` / 戦闘出現率 ${formatPercent(encounterCount / earlyDeaths.length)}`
    );
  });
  console.log(`敵平均atk: ${average(fatalMonsters.map(monster => monster.atk)).toFixed(2)}`);
  console.log(`敵平均hp: ${average(fatalMonsters.map(monster => monster.hp)).toFixed(2)}`);
  const monsterCounts = new Map();
  fatalMonsters.forEach(monster => {
    const baseName = monster.name.replace(/ [A-Z]$/, "");
    const key = `${baseName} [${monster.role}]`;
    monsterCounts.set(key, (monsterCounts.get(key) || 0) + 1);
  });
  const topMonsters = [...monsterCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  console.log(`出現上位: ${topMonsters.map(([name, count]) => `${name}=${count}`).join(", ")}`);
  console.log("");

  const primaryCounts = {
    oneShot: earlyDeaths.filter(result => result.death.classification.primary === "oneShot").length,
    attrition: earlyDeaths.filter(result => result.death.classification.primary === "attrition").length,
    other: earlyDeaths.filter(result => result.death.classification.primary === "other").length
  };
  const statusRelated = earlyDeaths.filter(result => result.death.classification.statusRelated);
  const statusSeen = earlyDeaths.filter(result => result.death.statusesSeen.length > 0);
  console.log("【4. ダメージ源分類（B1-B5実死亡）】");
  console.log("定義: 1撃死=死亡戦闘の受ダメージが1回だけ、または単発ダメージ>=maxHP。");
  console.log("定義: 削り殺され=1撃死以外、2ターン以上、死亡時傷薬0。状態異常絡みは死亡時activeの重複指標。");
  console.log(`1撃死系: ${primaryCounts.oneShot} / ${earlyDeaths.length} (${formatPercent(primaryCounts.oneShot / earlyDeaths.length)})`);
  console.log(`削り殺され系: ${primaryCounts.attrition} / ${earlyDeaths.length} (${formatPercent(primaryCounts.attrition / earlyDeaths.length)})`);
  console.log(`その他: ${primaryCounts.other} / ${earlyDeaths.length} (${formatPercent(primaryCounts.other / earlyDeaths.length)})`);
  const fleeActionDeaths = earlyDeaths.filter(result => result.death.fleeActionChosen);
  const fleePartingDeaths = fleeActionDeaths.filter(result => result.death.fleePartingHit);
  const fleePreTurnDeaths = fleeActionDeaths.filter(result => !result.death.fleePartingHit);
  const blindFleeDeaths = fleeActionDeaths.filter(result =>
    result.death.statusesSeen.includes("blind")
  );
  console.log(`逃走選択ターン死亡: ${fleeActionDeaths.length} / ${earlyDeaths.length} (${formatPercent(fleeActionDeaths.length / earlyDeaths.length)})`);
  console.log(`うち自ターン前死亡: ${fleePreTurnDeaths.length} / ${fleeActionDeaths.length} (${formatPercent(fleePreTurnDeaths.length / fleeActionDeaths.length)})`);
  console.log(`うち離脱時追撃死: ${fleePartingDeaths.length} / ${fleeActionDeaths.length} (${formatPercent(fleePartingDeaths.length / fleeActionDeaths.length)})`);
  console.log(`逃走選択ターン死亡中blind関与: ${blindFleeDeaths.length} / ${fleeActionDeaths.length} (${formatPercent(blindFleeDeaths.length / fleeActionDeaths.length)})`);
  console.log(`状態異常active死亡: ${statusRelated.length} / ${earlyDeaths.length} (${formatPercent(statusRelated.length / earlyDeaths.length)})`);
  console.log(`死亡戦闘中に状態異常あり: ${statusSeen.length} / ${earlyDeaths.length} (${formatPercent(statusSeen.length / earlyDeaths.length)})`);
  ["poisoned", "paralyzed", "sleep", "blind"].forEach(status => {
    const count = earlyDeaths.filter(result => result.death.statusesSeen.includes(status)).length;
    console.log(`${status}関与戦闘: ${count} / ${earlyDeaths.length} (${formatPercent(count / earlyDeaths.length)})`);
  });
  const incapacitatedDeaths = earlyDeaths.filter(result =>
    result.death.statusesSeen.some(status => INCAPACITATING_STATUSES.has(status))
  );
  const overOneTurn = earlyDeaths.filter(result => result.maxIncapacitationStreak > 1);
  const attritionDeaths = earlyDeaths.filter(result =>
    result.death.classification.primary === "attrition"
  );
  const blindAttrition = attritionDeaths.filter(result =>
    result.death.statusesSeen.includes("blind")
  );
  const nonBlindAttrition = attritionDeaths.filter(result =>
    !result.death.statusesSeen.includes("blind")
  );
  console.log(`削り死亡中blind関与: ${blindAttrition.length} / ${attritionDeaths.length} (${formatPercent(blindAttrition.length / attritionDeaths.length)})`);
  console.log(
    `削り死亡の平均戦闘長: ${average(attritionDeaths.map(result => result.death.rounds)).toFixed(2)}ターン`
    + ` / 平均被ダメージ回数${average(attritionDeaths.map(result => result.death.damageEvents.length)).toFixed(2)}`
  );
  console.log(
    `blind有無の削り戦闘長: 有${average(blindAttrition.map(result => result.death.rounds)).toFixed(2)}`
    + ` / 無${average(nonBlindAttrition.map(result => result.death.rounds)).toFixed(2)}ターン`
  );
  console.log(`麻痺/睡眠関与死亡戦闘: ${incapacitatedDeaths.length} / ${earlyDeaths.length} (${formatPercent(incapacitatedDeaths.length / earlyDeaths.length)})`);
  console.log(`麻痺/睡眠がラウンド開始時2回以上連続（再付与含む）: ${overOneTurn.length} / ${earlyDeaths.length} (${formatPercent(overOneTurn.length / earlyDeaths.length)})`);
  console.log("");

  const earlyAttackRatios = results.flatMap(result => result.normalAttackRatios);
  console.log("【5. B1-B5 敵通常攻撃1発 / キャラmaxHP】");
  console.log("対象: 通常物理攻撃のみ。魔法・毒・反射・狙撃を除外。");
  console.log(`観測数: ${earlyAttackRatios.length}`);
  console.log(`中央値: ${formatPercent(percentile(earlyAttackRatios, 0.50))}`);
  console.log(`90パーセンタイル: ${formatPercent(percentile(earlyAttackRatios, 0.90))}`);
  console.log("");

  console.log("【6. クラス別 早期死亡】");
  SIM_CLASSES.forEach(className => {
    const classResults = results.filter(result => result.className === className);
    const byB3 = classResults.filter(result => result.died && result.reachedFloor <= 3).length;
    console.log(
      `${className}: N=${classResults.length}`
      + ` / 平均到達${average(classResults.map(result => result.reachedFloor)).toFixed(2)}`
      + ` / B3まで死亡${formatPercent(byB3 / classResults.length)}`
    );
  });
  console.log("");

  const passedB2 = results.map(result => result.b2PassedSnapshot).filter(Boolean);
  const failedOnB2 = results.map(result => result.b2FailedSnapshot).filter(Boolean);
  const passedSummary = summarizeSnapshots(passedB2);
  const failedSummary = summarizeSnapshots(failedOnB2);
  console.log("【7. B2→B3 分岐（B2進入者）】");
  console.log("突破側=B2全探索終了時。失敗側=B2死亡戦闘開始時の近似。B1死亡は比較不能のため除外。");
  console.log(
    `突破 ${passedB2.length}: 平均Lv${passedSummary.level.toFixed(2)}`
    + ` / 平均換装${passedSummary.upgrades.toFixed(2)}`
    + ` / 平均HP${formatPercent(passedSummary.hpRatio)}`
  );
  console.log(
    `失敗 ${failedOnB2.length}: 平均Lv${failedSummary.level.toFixed(2)}`
    + ` / 平均換装${failedSummary.upgrades.toFixed(2)}`
    + ` / 平均HP${formatPercent(failedSummary.hpRatio)}`
  );
  console.log(
    `差(突破-失敗): Lv${(passedSummary.level - failedSummary.level).toFixed(2)}`
    + ` / 換装${(passedSummary.upgrades - failedSummary.upgrades).toFixed(2)}`
    + ` / HP${((passedSummary.hpRatio - failedSummary.hpRatio) * 100).toFixed(1)}pt`
  );
  console.log("");

  console.log("【注記】");
  console.log(`逃走閾値${FLEE_HP_THRESHOLD}は仮値・感度分析対象。逃走後はDIOS/傷薬による通常の戦闘後回復を行う。`);
  console.log("麻痺/睡眠はラウンド開始時の連続回数を計測。再付与を含むため、2回以上だけでは持続時間違反を意味しない。");
  console.log("被弾解除・行動消費解除は実戦闘ロジックを使用。");
}

const results = [];
for (let runIndex = 0; runIndex < RUNS; runIndex++) {
  const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
  results.push(simulateRun({ className, runIndex }));
}
printResults(results);
