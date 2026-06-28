import { runCombatRoundCalculation } from "../src/combat_logic.js";

const party = [
  { name: "戦士", class: "Fighter", status: "ok", hp: 100, maxHp: 100, mp: 0, level: 1, equipment: { weapon: "LONG_SWORD" }, str: 15, int: 8, pie: 8, vit: 15, agi: 10, luk: 10, buffs: [] }
];
const monsters = [
  { name: "針甲虫", hp: 30, maxHp: 30, def: 1, traits: ["reflectPhysical"], buffs: [] }
];
const state = {
  party,
  combatState: { monsters, round: 0 },
  inventory: []
};
const selection = {
  actions: [
    { type: "fight", actorIdx: 0, targetIdx: 0 }
  ]
};

const result = runCombatRoundCalculation(state, selection);
console.log("LOG QUEUE:", result.logQueue);
console.log("RESULT PARTY:", result.state.party);
console.log("RESULT MONSTERS:", result.state.combatState.monsters);
