import { MONSTERS, getContractProgressIncrement } from "./data.js";

export function revealMapFragment() {
  return 0;
}

export function recordWardenDefeat(stateInstance, gateId) {
  const contract = stateInstance.activeContract;
  if (contract?.type !== "warden" || contract.targetGateId !== gateId) return false;
  contract.currentValue = getContractProgressIncrement(stateInstance.party, 1);
  return true;
}

export function getMonsterByName(name) {
  return MONSTERS.find(monster => monster.name === name) || null;
}

export function getMonsterContractInfo(monsterName, killCount = 0) {
  const monster = getMonsterByName(monsterName);
  if (!monster) return null;
  return { monster, killCount, unlocked: killCount > 0 };
}

export function createRandomContract(danger = "C") {
  const quantity = danger === "A" ? 4 : danger === "B" ? 3 : 2;
  return {
    id: `run_quest_${danger}`,
    type: "depth",
    name: `深度目標 B${quantity + 3}F`,
    description: `B${quantity + 3}Fへ到達する。`,
    danger,
    targetValue: quantity + 3,
    currentValue: 0,
    reward: { materials: { "獣の牙": quantity } }
  };
}

export function generateContractsList() {
  return [createRandomContract("C"), createRandomContract("B")];
}

export function checkActiveContract(stateInstance, runResult, success) {
  const contract = stateInstance.activeContract;
  if (!contract) return null;
  const completed = success && (runResult.deepestFloor || 0) >= contract.targetValue;
  if (!completed) return { success: false, contract, reason: "目標深度へ届かなかった。" };
  runResult.materials ||= {};
  Object.entries(contract.reward.materials || {}).forEach(([name, quantity]) => {
    runResult.materials[name] = (runResult.materials[name] || 0) + quantity;
  });
  stateInstance.activeContract = null;
  return { success: true, contract, awardedReward: contract.reward };
}
