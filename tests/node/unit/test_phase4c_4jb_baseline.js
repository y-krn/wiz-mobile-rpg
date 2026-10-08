import assert from "node:assert/strict";
import { BIOMES, MONSTERS } from "../../../src/data.js";
import { getCharAffixSum } from "../../../src/rules/item_rules.js";
import { getCharWeaponAtk } from "../../../src/rules/character_stats.js";
import {
  PHASE4C_V1_GUARDIAN_SOLO_SCALE,
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
import { calculateCandidateAward } from "../../../scratch/measurements/progression_exp_award_paired_inventory.js";
import { SPELL_EFFECTS } from "../../../src/systems/spell_effects.js";
import { getDungeonStrength } from "../../../src/rules/dungeons.js";

function test(name, body) {
  try {
    body();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

function makeState(floor) {
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

// A run enters any dungeon at baseline 0 (#2060); a guardian beaten inside
// the dungeon is one step.
test("every dungeon starts at baseline 0 and its guardian grants one step of Level 1 HP", () => {
  for (const [floor, defeated, baseline, maxHp] of [[1, [], 0, 20], [6, [], 0, 20], [6, [10], 1, 22], [1, [5], 1, 22]]) {
    const state = makeState(floor);
    state.currentRun.defeatedMilestones = defeated;
    assert.equal(resolvePhase4cV1Baseline(state.currentRun), baseline);
    assert.equal(applyPhase4cV1PlayerBaseline(state, { refill: true }).baseline, baseline);
    assert.equal(state.party[0].maxHp, maxHp);
    assert.equal(state.party[0].hp, maxHp);
    assert.equal(getCharWeaponAtk(state.party[0]), getCharWeaponAtk({ ...state.party[0], phase4cV1Baseline: 0 }) * (1 + 0.16 * baseline));
    assert.equal(getCharAffixSum(state.party[0], "spellPower"), 0);
  }
});

test("Phase 4c independently multiplies attack spells and leaves healing spells unchanged", () => {
  const makeCaster = baseline => {
    const state = makeState(1);
    if (baseline > 0) state.currentRun.defeatedMilestones = [5];
    const caster = state.party[0];
    caster.equipment.weapon = {
      baseId: "SHORT_SWORD",
      identified: true,
      affixes: [{ type: "spellPower", value: 20 }]
    };
    applyPhase4cV1PlayerBaseline(state);
    return caster;
  };
  const targetForHeal = () => ({ name: "対象", hp: 1, maxHp: 1000, status: "ok" });
  const baseCaster = makeCaster(0);
  const scaledCaster = makeCaster(1);
  assert.equal(getCharAffixSum(scaledCaster, "spellPower"), 20, "baseline stays out of equipment spellPower");
  const baseDamage = SPELL_EFFECTS.HALITO({ caster: baseCaster, target: { name: "敵", hp: 1000, magicResist: 0 }, rng: () => 0 }).damage;
  const scaledDamage = SPELL_EFFECTS.HALITO({ caster: scaledCaster, target: { name: "敵", hp: 1000, magicResist: 0 }, rng: () => 0 }).damage;
  assert.equal(baseDamage, 14);
  assert.equal(scaledDamage, 17, "gear 1.20x stacks with independent baseline 1.16x");

  for (const spellName of ["DIOS", "MADIOS", "DIALMA", "MADI"]) {
    const options = spellName === "MADI" ? { healMin: 80, healMax: 80 } : {};
    const baselineZero = SPELL_EFFECTS[spellName]({ caster: baseCaster, target: targetForHeal(), rng: () => 0, ...options }).heal;
    const baselineOne = SPELL_EFFECTS[spellName]({ caster: scaledCaster, target: targetForHeal(), rng: () => 0, ...options }).heal;
    assert.equal(baselineOne, baselineZero, `${spellName} recovery ignores Phase 4c spell damage multiplier`);
  }
});

test("no active run stays unscaled and a defeated milestone advances the baseline without healing", () => {
  const normal = makeState(10);
  normal.currentRun = null;
  const beforeAttack = getCharWeaponAtk(normal.party[0]);
  const baselineResult = applyPhase4cV1PlayerBaseline(normal, { refill: true });
  assert.equal(baselineResult.applied, false);
  assert.equal(normal.party[0].maxHp, 20);
  assert.equal(getCharWeaponAtk(normal.party[0]), beforeAttack);
  assert.equal(getCharAffixSum(normal.party[0], "spellPower"), 0);
  const normalSpellDamage = SPELL_EFFECTS.HALITO({
    caster: normal.party[0],
    target: { name: "敵", hp: 1000, magicResist: 0 },
    rng: () => 0
  }).damage;
  assert.equal(normalSpellDamage, 12, "no active run has no Phase 4c spell multiplier");
  const untouchedEnemy = { ...MONSTERS.find(monster => !monster.isBoss), hp: 77, maxHp: 77, atk: 23, def: 4 };
  assert.equal(preparePhase4cV1Encounter(normal, [untouchedEnemy]).applied, false);
  assert.deepEqual([untouchedEnemy.hp, untouchedEnemy.maxHp, untouchedEnemy.atk, untouchedEnemy.def], [77, 77, 23, 4]);

  const trial = makeState(1);
  applyPhase4cV1PlayerBaseline(trial, { refill: true });
  trial.party[0].hp = 7;
  trial.currentRun.defeatedMilestones.push(5);
  const update = applyPhase4cV1PlayerBaseline(trial);
  assert.equal(update.baseline, 1);
  assert.equal(update.hpBonusDelta, 2);
  assert.equal(trial.party[0].maxHp, 22);
  assert.equal(trial.party[0].hp, 7);
});

test("Phase 4c scales generic enemies, summons, and guardians by band, and split children inherit parent scale", () => {
  // The band is counted inside the dungeon (#2060): its fifth floor is band 1.
  const state = makeState(5);
  const template = MONSTERS.find(monster => !monster.isBoss && !monster.isMidboss && !monster.treasureRare);
  const generic = { ...template, name: `${template.name} A`, hp: 999, maxHp: 999, atk: 999, def: 999 };
  const guardianTemplate = MONSTERS.find(monster => monster.name === "デーモンガード");
  const boss = { ...guardianTemplate, isBoss: true, hp: 321, maxHp: 321, atk: 123, def: 45 };
  const band = applyPhase4cV1EnemyBaseline([generic, boss], 5);
  assert.equal(band, 1);
  assert.equal(generic.hp, Math.round(template.hp * 1.2));
  assert.equal(generic.atk, Math.round(template.atk * 1.1));
  assert.equal(generic.def, Math.round(template.def));
  const guardianHp = Math.round(guardianTemplate.hp * PHASE4C_V1_GUARDIAN_SOLO_SCALE.hp * 1.2);
  assert.deepEqual(
    [boss.hp, boss.maxHp, boss.atk, boss.def],
    [guardianHp, guardianHp, Math.round(guardianTemplate.atk * PHASE4C_V1_GUARDIAN_SOLO_SCALE.atk * 1.1), guardianTemplate.def]
  );
  // The first four floors of every dungeon are band 0, and a later dungeon
  // applies its own multipliers on top.
  assert.equal(applyPhase4cV1EnemyBaseline([{ ...template, hp: 1, maxHp: 1 }], 6), 0);
  const catacombStrength = getDungeonStrength(10);
  const stoneGuard = MONSTERS.find(monster => monster.name === "ストーンガード");
  const catacombBoss = { ...stoneGuard, isBoss: true };
  assert.equal(applyPhase4cV1EnemyBaseline([catacombBoss], 10), 1);
  assert.equal(catacombBoss.maxHp,
    Math.round(stoneGuard.hp * PHASE4C_V1_GUARDIAN_SOLO_SCALE.hp * 1.2 * catacombStrength.guardianHp));
  assert.equal(catacombBoss.def, Math.round(stoneGuard.def * catacombStrength.guardianDef));

  const authoredB30 = MONSTERS.find(monster => monster.name === "いにしえの竜");
  const b30 = { ...authoredB30, isBoss: true, hp: 640, maxHp: 640, atk: 26, def: 20 };
  applyPhase4cV1EnemyBaseline([b30], 30);
  assert.deepEqual([b30.hp, b30.atk, b30.def], [640, 26, 20], "B30 keeps its authored template-stat rule");

  const summon = preparePhase4cV1Summon(state, { ...template, hp: template.hp, maxHp: template.hp, exp: template.exp });
  assert.equal(summon.maxHp, Math.round(template.hp * 1.2));
  assert.equal(summon.atk, Math.round(template.atk * 1.1));
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
    const state = makeState(floor);
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
  const state = makeState(1);
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
  const state = makeState(1);
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
