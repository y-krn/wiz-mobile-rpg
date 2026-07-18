import assert from "node:assert/strict";
import { checkActiveContract, generateContractsList } from "../src/contracts.js";

const quests = generateContractsList();
assert.equal(quests.length, 2);
assert.ok(quests.every(quest => !Object.hasOwn(quest.reward, "gold")));

const state = { activeContract: quests[0] };
const run = { deepestFloor: quests[0].targetValue, materials: {} };
const result = checkActiveContract(state, run, true);
assert.equal(result.success, true);
assert.ok(run.materials["獣の牙"] > 0);
assert.equal(state.activeContract, null);
console.log("[PASS] run quests pay run materials only");
