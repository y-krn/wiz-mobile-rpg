import assert from "node:assert/strict";
import { WORKSHOP_NODES } from "../src/data/workshop.js";
import { getDepthMaterialDropChance, getDepthMaterialExpectedQuantity } from "../src/rules/material_rules.js";

const rows = [];
for (let floor = 1; floor <= 30; floor++) {
  const expectedPerFight = getDepthMaterialDropChance(floor) * getDepthMaterialExpectedQuantity(floor);
  const relativeFightTime = 1 + (floor - 1) * 0.01;
  const expectedPerTime = expectedPerFight / relativeFightTime;
  rows.push({ floor, expectedPerFight, expectedPerTime });
}

for (let index = 1; index < rows.length; index++) {
  assert.ok(rows[index].expectedPerFight >= rows[index - 1].expectedPerFight, `B${index + 1} expected income regressed`);
  assert.ok(rows[index].expectedPerTime >= rows[index - 1].expectedPerTime, `B${index + 1} time efficiency regressed`);
}

const permanentStats = WORKSHOP_NODES.filter(node => node.grants?.stat);
assert.ok(permanentStats.length > 0, "permanent stat nodes missing");
assert.ok(permanentStats.every(node => node.maxRank === 5 && node.costs.length === 5), "permanent stat cap changed");

console.log("floor expected/fight expected/time");
[1, 5, 10, 15, 20, 25, 30].forEach(floor => {
  const row = rows[floor - 1];
  console.log(`B${floor}F ${row.expectedPerFight.toFixed(3)} ${row.expectedPerTime.toFixed(3)}`);
});
