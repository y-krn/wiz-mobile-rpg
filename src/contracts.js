import { MAP_HEIGHT, MAP_WIDTH, MONSTERS, generateRandomAccessory, generateRandomEquipment } from "./data.js";
import { state } from "./state.js";
import { getWardenGateId } from "./state/warden_gates.js";
import { getWardenPerception, WARDEN_PERCEPTION_HINTS } from "./systems/warden_perception.js";
import { getFloorDisplayName, getFloorLabel } from "./data/floor_themes.js";

const WARDEN_CONTRACTS = [
  { floor: 1, danger: "C", material: "獣の牙" },
  { floor: 2, danger: "B", material: "鉄片" },
  { floor: 3, danger: "A", material: "毒腺" },
  { floor: 4, danger: "A", material: "黒角" },
  { floor: 5, danger: "A", material: "霊粉" }
];

function getAvailableWardens(danger, stateInstance) {
  const opened = new Set(stateInstance.openedGates || []);
  return WARDEN_CONTRACTS.filter(({ floor, danger: rank }) =>
    rank === danger && !opened.has(getWardenGateId(floor))
  );
}

function createWardenContract(id, danger, stateInstance) {
  const candidates = getAvailableWardens(danger, stateInstance);
  if (candidates.length === 0) return null;
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const perception = getWardenPerception(target.floor);
  const name = target.floor === 4 ? "フラック" : `${getFloorDisplayName(stateInstance, target.floor)}の門番`;
  return {
    id,
    name: `${name}の討伐`,
    description: `${getFloorLabel(stateInstance, target.floor)}の封印門を守る${name}を討伐して帰還`,
    type: "warden",
    danger,
    targetFloor: target.floor,
    locationFloor: target.floor,
    targetGateId: getWardenGateId(target.floor),
    targetValue: 1,
    currentValue: 0,
    reward: {
      gold: danger === "C" ? 30 : (danger === "B" ? 50 : 80),
      identifyTickets: danger === "C" ? 0 : 1,
      item: null,
      materials: { [target.material]: danger === "A" ? 2 : 1 }
    },
    recommended: `生還者の証言: ${WARDEN_PERCEPTION_HINTS[perception]}`
  };
}

export function revealMapFragment(stateInstance, floor, rng = Math.random) {
  if (!stateInstance.maps?.[floor - 1]) return 0;
  const memory = stateInstance.dungeonMemory ||= { traps: {} };
  memory.traps ||= {};
  memory.mapFragments ||= {};
  const known = new Set(memory.mapFragments[floor] || []);
  const centers = [];
  for (let y = 2; y < MAP_HEIGHT - 2; y++) {
    for (let x = 2; x < MAP_WIDTH - 2; x++) {
      let unknown = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!stateInstance.visitedMaps?.[floor - 1]?.[y + dy]?.[x + dx] && !known.has(`${x + dx},${y + dy}`)) unknown++;
        }
      }
      if (unknown > 0) centers.push({ x, y, unknown });
    }
  }
  if (centers.length === 0) return 0;
  const bestUnknown = Math.max(...centers.map(center => center.unknown));
  const bestCenters = centers.filter(center => center.unknown === bestUnknown);
  const { x: centerX, y: centerY } = bestCenters[Math.floor(rng() * bestCenters.length)];
  let added = 0;
  for (let y = centerY - 2; y <= centerY + 2; y++) {
    for (let x = centerX - 2; x <= centerX + 2; x++) {
      const key = `${x},${y}`;
      if (!stateInstance.visitedMaps?.[floor - 1]?.[y]?.[x] && !known.has(key)) {
        known.add(key);
        added++;
      }
    }
  }
  memory.mapFragments[floor] = [...known];
  return added;
}

export function recordWardenDefeat(stateInstance, gateId) {
  const contract = stateInstance.activeContract;
  if (contract?.type !== "warden" || contract.targetGateId !== gateId) return false;
  contract.currentValue = 1;
  return true;
}

// Helper to get monster by name
export function getMonsterByName(name) {
  return MONSTERS.find(m => m.name === name) || null;
}

// Generate dynamic characteristics and recommended builds based on kill count
export function getMonsterContractInfo(monsterName, killCount = 0) {
  const monster = getMonsterByName(monsterName);
  if (!monster) {
    return {
      features: "特徴: 不明",
      recommended: "推奨: 情報なし"
    };
  }

  if (killCount < 3) {
    return {
      features: "特徴: 不明",
      recommended: `推奨: まだ情報不足（あと ${Math.max(1, 3 - killCount)} 体討伐が必要）`
    };
  }

  const features = [];
  const recs = [];

  features.push(`B${monster.level}F周辺に出現`);

  if (monster.isPoisonous) {
    features.push("毒攻撃を使用");
    recs.push("解毒薬", "僧侶(LATUMOFIS)");
  }
  if (monster.isParalyzing) {
    features.push("麻痺攻撃を使用");
    recs.push("僧侶(マディ/DIALMA系回復)", "状態異常対策");
  }
  if (monster.isBlinding) {
    features.push("目つぶしを使用");
    recs.push("回復役");
  }
  if (monster.spell) {
    features.push(`呪文使用 (${monster.spell})`);
    recs.push("高HPの戦士", "回復薬");
  }
  if (monster.physResist && monster.physResist > 0) {
    features.push(`物理耐性あり (${Math.round(monster.physResist * 100)}%)`);
    recs.push("攻撃魔法", "魔術師");
  }
  if (monster.magicResist && monster.magicResist > 0) {
    features.push(`魔法耐性あり (${Math.round(monster.magicResist * 100)}%)`);
    recs.push("物理攻撃", "戦士/侍");
  }
  if (monster.isSniper) {
    features.push("後列への狙撃攻撃");
    recs.push("後列のHP確保", "盾装備");
  }

  if (recs.length === 0) {
    recs.push("通常装備で対応可能");
  }

  return {
    features: "特徴: " + features.join("、"),
    recommended: "推奨: " + recs.join("、")
  };
}

// Generate unique ID for contract
function generateContractId() {
  return "CN-" + Math.floor(Math.random() * 900000 + 100000);
}

// Create a single randomized contract
export function createRandomContract(danger, stateInstance = state) {
  const id = generateContractId();
  const typeRoll = Math.random();

  // 1. Warden contract (only while a matching gate remains sealed)
  if (typeRoll < 0.20) {
    const wardenContract = createWardenContract(id, danger, stateInstance);
    if (wardenContract) return wardenContract;
  }

  // 2. Weekly contract (B-rank only)
  if (danger === "B" && typeRoll < 0.30) {
    const weeklySeed = `WEEKLY-2026-W${Math.floor(Math.random() * 5) + 20}`; // e.g. WEEKLY-2026-W25
    return {
      id,
      name: "週間城の踏破",
      description: `固定シード [ ${weeklySeed} ] で${getFloorLabel(stateInstance, 3)}に到達して帰還`,
      type: "weekly",
      danger: "B",
      targetValue: 3, // Target B3F
      locationFloor: 3,
      currentValue: 1, // Current floor (starts at 1)
      reward: {
        gold: 100,
        identifyTickets: 1,
        item: null
      },
      seed: weeklySeed,
      recommended: "推奨: 固定シードでの地形把握 / 帰還呪文"
    };
  }

  // 3. Kill Contract
  if (typeRoll < 0.40) {
    // Select monster based on danger
    let candidates;
    if (danger === "C") {
      candidates = ["かみつき蟲", "ゴブリンの呪術師", "コボルトの斥候"];
    } else if (danger === "B") {
      candidates = ["ゾンビ", "ガイコツ戦士", "ワーウルフ", "スピリット", "ウィル・オー・ウィスプ"];
    } else {
      candidates = ["マスターメイジ", "ポイズンジャイアント", "アースジャイアント", "レッドドラゴン"];
    }

    const targetMonsterName = candidates[Math.floor(Math.random() * candidates.length)];
    const monster = getMonsterByName(targetMonsterName);
    const targetValue = danger === "C" ? 5 : (danger === "B" ? 3 : 1);
    
    let rewardGold = 40 + Math.floor(Math.random() * 20);
    let rewardTickets = 0;
    let rewardItem = null;

    if (danger === "B") {
      rewardGold = 80 + Math.floor(Math.random() * 40);
      rewardTickets = 1;
      if (Math.random() < 0.30) {
        rewardItem = "rare_equip";
      }
    } else if (danger === "A") {
      rewardGold = 150 + Math.floor(Math.random() * 80);
      rewardTickets = 2;
      rewardItem = "rare_equip";
    }

    const codexCount = stateInstance.codex?.monsters?.[targetMonsterName]?.killed || 0;
    const info = getMonsterContractInfo(targetMonsterName, codexCount);

    return {
      id,
      name: `${targetMonsterName}の討伐`,
      description: `B${monster.level}F周辺で${targetMonsterName}を${targetValue}体討伐して帰還`,
      type: "kill",
      danger,
      targetMonsterName,
      targetValue,
      currentValue: 0,
      reward: {
        gold: rewardGold,
        identifyTickets: rewardTickets,
        item: rewardItem
      },
      recommended: info.recommended
    };
  }

  // 4. Chest / Recovery Contract
  if (typeRoll < 0.70) {
    const isChestCount = Math.random() < 0.5;
    if (isChestCount) {
      const targetValue = danger === "C" ? 2 : (danger === "B" ? 4 : 6);
      let rewardGold = danger === "C" ? 50 : (danger === "B" ? 90 : 180);
      let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
      let rewardItem = danger === "A" ? "rare_equip" : null;
      if (danger === "B" && Math.random() < 0.30) {
        rewardItem = "rare_equip";
      }

      return {
        id,
        name: "宝箱の回収依頼",
        description: `迷宮内で宝箱を${targetValue}個開けて帰還`,
        type: "chest",
        danger,
        targetValue,
        currentValue: 0,
        reward: {
          gold: rewardGold,
          identifyTickets: rewardTickets,
          item: rewardItem,
          mapFragmentFloor: danger === "A" ? 4 : null
        },
        recommended: "推奨: 盗賊 / 罠解除装備 / 祝福の聖水"
      };
    } else {
      // Unidentified equipment recovery
      const targetValue = danger === "C" ? 1 : (danger === "B" ? 2 : 3);
      let rewardGold = danger === "C" ? 60 : (danger === "B" ? 100 : 200);
      let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
      let rewardItem = danger === "A" ? "epic_equip" : null; // Epic for A-rank recovery!
      if (danger === "B" && Math.random() < 0.30) {
        rewardItem = "rare_equip";
      }

      return {
        id,
        name: "未鑑定装備の回収",
        description: `未鑑定状態の装備品を${targetValue}個持ち帰る`,
        type: "recovery",
        danger,
        targetValue,
        currentValue: 0,
        reward: {
          gold: rewardGold,
          identifyTickets: rewardTickets,
          item: rewardItem
        },
        recommended: "推奨: バッグの空き容量確保 / B3F以降の宝箱"
      };
    }
  }

  // 5. Reach Contract
  if (typeRoll < 0.85) {
    const targetFloor = danger === "C" ? 2 : (danger === "B" ? 3 : 4);
    let rewardGold = danger === "C" ? 50 : (danger === "B" ? 90 : 180);
    let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
    let rewardItem = danger === "A" ? "rare_equip" : null;
    if (danger === "B" && Math.random() < 0.30) {
      rewardItem = "rare_equip";
    }

    return {
      id,
      name: `${getFloorDisplayName(stateInstance, targetFloor)}への到達`,
      description: `${getFloorLabel(stateInstance, targetFloor)}に到達し、生きて帰還する`,
      type: "reach",
      danger,
      targetFloor,
      locationFloor: targetFloor,
      targetValue: targetFloor,
      currentValue: 1, // Starts on floor 1
      reward: {
        gold: rewardGold,
        identifyTickets: rewardTickets,
        item: rewardItem,
        mapFragmentFloor: danger === "A" ? targetFloor : null
      },
      recommended: `推奨: 帰還のスクロール / 地下${targetFloor}階へのショートカット開通`
    };
  }

  // 6. Limit / Restriction Contract
  const limitType = Math.random() < 0.5 ? "trap" : "no_death";
  const targetFloor = danger === "C" ? 2 : (danger === "B" ? 3 : 4);
  let rewardGold = danger === "C" ? 60 : (danger === "B" ? 110 : 220);
  let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
  let rewardItem = danger === "A" ? "rare_equip" : null;
  if (danger === "B" && Math.random() < 0.30) {
    rewardItem = "rare_equip";
  }

  let desc;
  let recommended;
  if (limitType === "trap") {
    const trapLimit = danger === "C" ? 2 : (danger === "B" ? 1 : 0);
    desc = `罠被弾を${trapLimit}回以下に抑えて${getFloorLabel(stateInstance, targetFloor)}に到達し帰還`;
    recommended = "推奨: 盗賊の罠解除 / 罠被弾を避ける慎重な移動";
  } else {
    desc = `誰も戦闘不能にならずに${getFloorLabel(stateInstance, targetFloor)}に到達し帰還`;
    recommended = "推奨: 僧侶の回復呪文 / 傷薬の十分な持参 / 無理な戦闘回避";
  }

  return {
    id,
    name: limitType === "trap" ? "安全探索の誓約" : "不退転の遠征契約",
    description: desc,
    type: "limit",
    danger,
    limitType,
    targetFloor,
    locationFloor: targetFloor,
    targetValue: targetFloor,
    currentValue: 1,
    reward: {
      gold: rewardGold,
      identifyTickets: rewardTickets,
      item: rewardItem
    },
    recommended
  };
}

// Generate the 3 initial contracts (C, B, A)
export function generateContractsList(stateInstance = state) {
  return [
    createRandomContract("C", stateInstance),
    createRandomContract("B", stateInstance),
    createRandomContract("A", stateInstance)
  ];
}

// Check active contract progress on run completion (return to town)
// runResult is typically state.currentRun, success is true if returned alive
export function checkActiveContract(stateInstance, runResult, success) {
  if (!stateInstance.activeContract) return null;

  const contract = stateInstance.activeContract;

  // If the run was not successful (e.g. party wiped), contract fails and is lost
  if (!success) {
    stateInstance.activeContract = null;
    // Generate new contracts list
    stateInstance.contracts = generateContractsList(stateInstance);
    return {
      success: false,
      contract,
      reason: "全滅により契約失敗（破棄されました）"
    };
  }

  let achieved = false;

  // Check achievement conditions
  if (contract.type === "weekly") {
    // Must be weekly seed and reached floor 3
    if (stateInstance.seed === contract.seed && runResult.deepestFloor >= 3) {
      achieved = true;
    }
  } else if (contract.type === "kill" || contract.type === "warden") {
    // Check if contract value >= target value
    if (contract.currentValue >= contract.targetValue) {
      achieved = true;
    }
  } else if (contract.type === "chest") {
    // chests opened during this run
    if (runResult.chestsOpened >= contract.targetValue) {
      achieved = true;
    }
  } else if (contract.type === "recovery") {
    // Count unidentified items in final inventory
    const unIdCount = stateInstance.inventory.filter(item => typeof item === "object" && !item.identified).length;
    if (unIdCount >= contract.targetValue) {
      achieved = true;
      // Bring back unidentified items, we don't consume them, but the contract is resolved
    }
  } else if (contract.type === "reach") {
    if (runResult.deepestFloor >= contract.targetFloor) {
      achieved = true;
    }
  } else if (contract.type === "limit") {
    const reachedFloor = runResult.deepestFloor >= contract.targetFloor;
    if (reachedFloor) {
      if (contract.limitType === "trap") {
        const limitCount = contract.danger === "C" ? 2 : (contract.danger === "B" ? 1 : 0);
        if (runResult.trapsTriggered <= limitCount) {
          achieved = true;
        }
      } else if (contract.limitType === "no_death") {
        const anyoneDead = stateInstance.party.some(char => char.status === "dead" || char.hp <= 0) || 
                           (runResult.deathLogs && runResult.deathLogs.length > 0);
        if (!anyoneDead) {
          achieved = true;
        }
      }
    }
  }

  if (achieved) {
    // Award rewards
    stateInstance.gold += contract.reward.gold;
    stateInstance.identifyTickets = (stateInstance.identifyTickets || 0) + contract.reward.identifyTickets;

    Object.entries(contract.reward.materials || {}).forEach(([material, quantity]) => {
      stateInstance.materials ||= {};
      stateInstance.materials[material] = (stateInstance.materials[material] || 0) + quantity;
    });

    const revealedCells = contract.reward.mapFragmentFloor
      ? revealMapFragment(stateInstance, contract.reward.mapFragmentFloor)
      : 0;

    let itemMsg = "";
    const addRewardItem = (item, label) => {
      if (!item) return false;
      item.identified = false;
      if (stateInstance.inventory.length < 20) {
        stateInstance.inventory.push(item);
        itemMsg = `報酬「${label}」がバッグに追加されました。`;
        return true;
      }
      if (!stateInstance.storage) stateInstance.storage = [];
      if (stateInstance.storage.length < stateInstance.storageMax) {
        stateInstance.storage.push(item);
        itemMsg = `バッグ満杯のため、報酬「${label}」は倉庫に送られました。`;
        return true;
      }
      itemMsg = `バッグ・倉庫が満杯のため、報酬を受け取れませんでした。`;
      return false;
    };

    if (contract.reward.item) {
      let rarity = "magic";
      if (contract.reward.item === "epic_equip") {
        const isDeep = (runResult.deepestFloor || 1) >= 4;
        const isRankA = contract.danger === "A";
        rarity = (isDeep && isRankA) ? "epic" : "rare";
      } else if (contract.reward.item === "rare_equip") {
        rarity = contract.danger === "C" ? "magic" : "rare";
      }

      let genFloor = runResult.deepestFloor || 1;
      if (contract.danger === "C") genFloor = Math.min(genFloor, 2);
      if (contract.danger === "B") genFloor = Math.min(genFloor, 3);
      if (contract.danger === "A") genFloor = Math.min(genFloor, 5);

      const item = generateRandomEquipment(genFloor, rarity, Math.random, state.party);
      addRewardItem(item, `未鑑定${item.type === "weapon" ? "武器" : (item.type === "shield" ? "盾" : "防具")}`);
    }

    const accessoryChance = contract.danger === "A" ? 0.30 : (contract.danger === "B" ? 0.15 : 0);
    const accessoryRoll = Math.random();
    if (stateInstance.inventory.length < 20 && accessoryChance > 0 && accessoryRoll > 0 && accessoryRoll < accessoryChance) {
      const genFloor = Math.min(runResult.deepestFloor || 1, contract.danger === "A" ? 5 : 3);
      const rarity = contract.danger === "A" && genFloor >= 4 ? "rare" : null;
      addRewardItem(generateRandomAccessory(genFloor, rarity, Math.random, state.party), "未鑑定装身具");
    }

    if (!stateInstance.completedContracts) stateInstance.completedContracts = [];
    stateInstance.completedContracts.push(contract.id);

    stateInstance.activeContract = null;
    stateInstance.contracts = generateContractsList(stateInstance);

    return {
      success: true,
      contract,
      itemMsg,
      revealedCells
    };
  }

  // If not achieved, contract remains active
  return {
    success: false,
    contract,
    reason: "契約目標未達成"
  };
}
