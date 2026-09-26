import assert from "node:assert/strict";
import { BIOMES, MONSTERS } from "../../../src/data.js";
import { getCharAffixSum } from "../../../src/rules/item_rules.js";
import { getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import {
  applyPhase4cV1EnemyBaseline,
  applyPhase4cV1PlayerBaseline,
  preparePhase4cV1Encounter,
  preparePhase4cV1Summon,
  resolvePhase4cV1Baseline
} from "../../../src/rules/phase4c_v1_trial.js";
import {
  calculatePhase4jBExpAward,
  preparePhase4jBEncounter
} from "../../../src/rules/phase4j_b_trial.js";
import { applyCombatRewards } from "../../../src/combat_logic/rewards.js";
import { processMonsterDefeat } from "../../../src/combat_logic/monster_traits.js";
import { TRIAL_PROFILES } from "../../../src/trial_profiles.js";
import { calculateCandidateAward } from "../../../scratch/measurements/progression_exp_award_paired_inventory.js";

function test(name, body) {
  try {
    body();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function makeState(profile, floor) {
  return {
    floor,
    party: [{
      name: "試用冒険者",
      level: 1,
      exp: 0,
      hp: 20,
      maxHp: 20,
      status: "ok",
      equipment: { weapon: "SHORT_SWORD", shield: null, armor: null, accessory: null, accessory2: null }
    }],
    currentRun: {
      trialProfile: profile,
      startFloor: floor,
      defeatedMilestones: floor > 1 ? [floor] : [],
      expGained: 0,
      kills: 0,
      bossesKilled: 0,
      elitesKilled: 0,
      materials: {},
      equipmentFound: [],
      quests: [],
      defeatsByRole: {}
    },
    combatState: { isBoss: false, isMidboss: false, isRoamingFlack: false, monsters: [] },
    firstKills: [],
    metaMaterials: {},
    inventory: [],
    floorChestsTotal: [0]
  };
}

test("selected B1/B10/B20 Phase 4c baseline grants Level 1 HP entitlement to both trial profiles", () => {
  for (const profile of [TRIAL_PROFILES.PROGRESSION_EXP, TRIAL_PROFILES.PHASE3_EQUIPMENT]) {
    for (const [floor, baseline, maxHp] of [[1, 0, 20], [10, 2, 24], [20, 4, 28]]) {
      const state = makeState(profile, floor);
      assert.equal(resolvePhase4cV1Baseline(state.currentRun), baseline);
      assert.equal(applyPhase4cV1PlayerBaseline(state, { refill: true }).baseline, baseline);
      assert.equal(state.party[0].maxHp, maxHp);
      assert.equal(state.party[0].hp, maxHp);
      assert.equal(getCharWeaponAtk(state.party[0]), getCharWeaponAtk({ ...state.party[0], phase4cV1Baseline: 0 }) * (1 + 0.16 * baseline));
      assert.equal(getCharAffixSum(state.party[0], "spellPower"), 16 * baseline);
    }
  }
});

test("normal mode stays unscaled and a defeated milestone advances trial baseline without healing", () => {
  const normal = makeState(TRIAL_PROFILES.NORMAL, 10);
  const beforeAttack = getCharWeaponAtk(normal.party[0]);
  const baselineResult = applyPhase4cV1PlayerBaseline(normal, { refill: true });
  assert.equal(baselineResult.applied, false);
  assert.equal(normal.party[0].maxHp, 20);
  assert.equal(getCharWeaponAtk(normal.party[0]), beforeAttack);
  assert.equal(getCharAffixSum(normal.party[0], "spellPower"), 0);
  const untouchedEnemy = { ...MONSTERS.find(monster => !monster.isBoss), hp: 77, maxHp: 77, atk: 23, def: 4 };
  assert.equal(preparePhase4cV1Encounter(normal, [untouchedEnemy]).applied, false);
  assert.deepEqual([untouchedEnemy.hp, untouchedEnemy.maxHp, untouchedEnemy.atk, untouchedEnemy.def], [77, 77, 23, 4]);

  const trial = makeState(TRIAL_PROFILES.PROGRESSION_EXP, 1);
  applyPhase4cV1PlayerBaseline(trial, { refill: true });
  trial.party[0].hp = 7;
  trial.currentRun.defeatedMilestones.push(5);
  const update = applyPhase4cV1PlayerBaseline(trial);
  assert.equal(update.baseline, 1);
  assert.equal(update.hpBonusDelta, 2);
  assert.equal(trial.party[0].maxHp, 22);
  assert.equal(trial.party[0].hp, 7);
});

test("Phase 4c scales generic enemies and summons by band, leaves Boss stats authored, and split children inherit parent scale", () => {
  const state = makeState(TRIAL_PROFILES.PHASE3_EQUIPMENT, 10);
  const template = MONSTERS.find(monster => !monster.isBoss && !monster.isMidboss && !monster.treasureRare);
  const generic = { ...template, name: `${template.name} A`, hp: 999, maxHp: 999, atk: 999, def: 999 };
  const boss = { ...template, isBoss: true, hp: 321, maxHp: 321, atk: 123, def: 45 };
  const band = applyPhase4cV1EnemyBaseline([generic, boss], 10);
  assert.equal(band, 2);
  assert.equal(generic.hp, Math.round(template.hp * 1.4));
  assert.equal(generic.atk, Math.round(template.atk * 1.2));
  assert.equal(generic.def, Math.round(template.def));
  assert.deepEqual([boss.hp, boss.maxHp, boss.atk, boss.def], [321, 321, 123, 45]);

  const summon = preparePhase4cV1Summon(state, { ...template, hp: template.hp, maxHp: template.hp, exp: template.exp });
  assert.equal(summon.maxHp, Math.round(template.hp * 1.4));
  assert.equal(summon.atk, Math.round(template.atk * 1.2));
  assert.equal(summon.exp, 0);

  const splitTemplate = MONSTERS.find(monster => monster.traits?.includes("splitOnDeath") && !monster.isBoss);
  assert.ok(splitTemplate);
  const parent = { ...splitTemplate, hp: 0, maxHp: 40, exp: 40, hasSplit: false, deathProcessed: false, fled: false };
  const encounter = [parent];
  processMonsterDefeat(encounter, parent, []);
  assert.equal(encounter.length, 3);
  assert.ok(encounter.slice(1).every(child => child.maxHp === 20));
});

test("Phase 4j-B awards match the frozen diagnostic formula and deterministic allocation", () => {
  for (const floor of [1, 10, 20]) {
    const names = BIOMES[Math.floor((floor - 1) / 5)].enemyPool.slice(0, 2);
    const templates = names.map(name => MONSTERS.find(monster => monster.name === name));
    const productionAward = calculatePhase4jBExpAward({ floor, kind: "ordinary", monsters: templates });
    const frozenAward = calculateCandidateAward({
      floor,
      kind: "ordinary",
      monsters: templates.map(template => ({ templateExp: template.exp })),
      encounterSize: templates.length
    }).totalAward;
    assert.equal(productionAward, frozenAward);
    const state = makeState(TRIAL_PROFILES.PROGRESSION_EXP, floor);
    const enemies = templates.map(template => ({ ...template, hp: 1, maxHp: 1 }));
    const planned = preparePhase4jBEncounter(state, enemies);
    assert.equal(planned.totalAward, frozenAward);
    assert.equal(enemies.reduce((sum, enemy) => sum + enemy.exp, 0), frozenAward);
    assert.equal(enemies.length, planned.initialCount);
  }
  for (const kind of ["rare", "elite", "midboss", "boss"]) {
    for (const floor of [1, 10, 20]) {
      assert.equal(
        calculatePhase4jBExpAward({ floor, kind }),
        calculateCandidateAward({ floor, kind }).totalAward
      );
    }
  }
});

test("fled initial enemy keeps its owner allocation out of the EXP settlement", () => {
  const state = makeState(TRIAL_PROFILES.PROGRESSION_EXP, 1);
  const templates = BIOMES[0].enemyPool.slice(0, 2).map(name => MONSTERS.find(monster => monster.name === name));
  const monsters = templates.map((template, index) => ({
    ...template,
    hp: 0,
    maxHp: template.hp,
    fled: index === 0
  }));
  const plan = preparePhase4jBEncounter(state, monsters);
  state.currentRun.expGained = 0;
  state.combatState = {
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    trialExpInitialCount: 2,
    monsters
  };
  state.firstKills = [templates[1].name];
  applyCombatRewards(state, monsters, [], () => 1);
  assert.equal(state.party[0].exp, plan.allocations[1]);
  assert.equal(state.currentRun.expGained, plan.allocations[1]);
});

test("combat reward grants candidate EXP once, levels once, and excludes split/summon descendants", () => {
  const state = makeState(TRIAL_PROFILES.PROGRESSION_EXP, 1);
  const character = state.party[0];
  const template = MONSTERS.find(monster => monster.traits?.includes("splitOnDeath") && !monster.isBoss);
  assert.ok(template);
  const parent = { ...template, hp: 0, maxHp: template.hp, fled: false, hasSplit: false, deathProcessed: false };
  const initial = [parent];
  const planned = preparePhase4jBEncounter(state, initial);
  const monsters = [...initial];
  processMonsterDefeat(monsters, parent, []);
  const summoned = { ...template, hp: 0, maxHp: template.hp, exp: 987, fled: false };
  monsters.push(summoned);
  state.combatState = { isBoss: false, isMidboss: false, isRoamingFlack: false, trialExpInitialCount: 1, monsters };
  state.firstKills = [template.name];
  applyCombatRewards(state, monsters, [], () => 1);
  assert.equal(monsters[0].exp, planned.allocations[0]);
  assert.ok(monsters.slice(1).every(monster => monster.exp === 0));
  assert.equal(character.exp, planned.totalAward);
  assert.equal(state.currentRun.expGained, planned.totalAward);
  for (let index = 0; character.level === 1 && index < 6; index++) {
    const enemy = { ...template, hp: 0, maxHp: template.hp, fled: false };
    const result = preparePhase4jBEncounter(state, [enemy]);
    state.combatState.trialExpInitialCount = 1;
    state.combatState.monsters = [enemy];
    applyCombatRewards(state, [enemy], [], () => 1);
    assert.ok(result.totalAward > 0);
  }
  assert.equal(character.level, 2);
  assert.ok(character.exp >= 100 && character.exp < 400);
  assert.equal(state.currentRun.expGained, character.exp);
});
