import assert from "node:assert/strict";
import {
  PHYSICAL_RESISTANCE_CAP,
  PHYSICAL_DEF_RESISTANCE_SCALE,
  PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING,
  applyPhysicalResistance,
  calculatePhysicalAttackFormula,
  combinePhysicalResistances,
  getEffectiveDef,
  getPhysicalDefenseResistance
} from "../src/rules/character_stats.js";
import {
  getMonsterPhysicalResistance,
  getMonsterResistanceStatus,
  getMonsterResistanceTier
} from "../src/data/monsters.js";

function run() {
  assert.equal(getPhysicalDefenseResistance(0), 0);
  assert.equal(getPhysicalDefenseResistance(10), 10 / (10 + PHYSICAL_DEF_RESISTANCE_SCALE));
  assert.equal(getPhysicalDefenseResistance(5), 5 / (5 + PHYSICAL_DEF_RESISTANCE_SCALE));
  assert.equal(
    getPhysicalDefenseResistance(10, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING),
    10 / (10 + PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING)
  );
  assert.ok(
    getPhysicalDefenseResistance(5) - getPhysicalDefenseResistance(4) >
      getPhysicalDefenseResistance(10) - getPhysicalDefenseResistance(9),
    "additional DEF has diminishing returns"
  );

  const cappedResistance = combinePhysicalResistances(1, 0.6);
  assert.equal(cappedResistance, PHYSICAL_RESISTANCE_CAP);
  assert.ok(cappedResistance < 1, "physical resistance never reaches complete immunity");
  assert.equal(combinePhysicalResistances(-2, -0.4), -1, "physical pool lower bound is -1");
  assert.ok(Math.abs(applyPhysicalResistance(100, cappedResistance) - 10) < 1e-9);
  assert.equal(applyPhysicalResistance(0, cappedResistance), 1, "resolved physical hits keep minimum 1");
  assert.equal(calculatePhysicalAttackFormula({ weaponAtk: 0, str: 10, def: 18 }), 1);
  const incomingResistance = getPhysicalDefenseResistance(10, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING);
  assert.equal(
    Math.floor(applyPhysicalResistance(10, incomingResistance)),
    Math.floor(10 * (1 - incomingResistance)),
    "incoming nonzero DEF uses the calibrated incoming pool"
  );

  const monster = { def: 5, physResist: 0 };
  const resistance = getMonsterPhysicalResistance(monster);
  assert.equal(resistance, 5 / (5 + PHYSICAL_DEF_RESISTANCE_SCALE));
  assert.equal(getMonsterResistanceTier(resistance), "やや効きにくい");
  const status = getMonsterResistanceStatus(monster, { physResistKnown: true });
  assert.equal(status.find(entry => entry.type === "physical")?.description, "やや効きにくい");
  assert.equal(
    Math.floor(applyPhysicalResistance(30, resistance)),
    Math.floor(30 * (1 - resistance)),
    "displayed physical tier uses the resistance applied to damage"
  );

  const buffedMonster = { def: 5, physResist: 0, buffs: [{ type: "def", value: 3, turns: 1 }] };
  assert.equal(getEffectiveDef(buffedMonster), 8);
  const buffedResistance = getMonsterPhysicalResistance(buffedMonster);
  assert.equal(buffedResistance, 8 / (8 + PHYSICAL_DEF_RESISTANCE_SCALE), "display uses effective DEF with active buffs");
  assert.equal(
    Math.floor(applyPhysicalResistance(30, buffedResistance)),
    Math.floor(calculatePhysicalAttackFormula({ weaponAtk: 30, str: 10, def: 8 })),
    "displayed resistance and effective combat DEF resolve to the same damage"
  );
}

try {
  run();
  console.log("[PASS] bounded physical mitigation keeps display, cap, and diminishing returns aligned.");
} catch (error) {
  console.error("[FAIL] physical mitigation verification failed:", error);
  process.exit(1);
}
