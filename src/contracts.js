import { MONSTERS, generateRandomEquipment } from "./data.js";
import { state } from "./state.js";

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

  // 1. Weekly contract (B-rank only, 20% chance)
  if (danger === "B" && typeRoll < 0.20) {
    const weeklySeed = `WEEKLY-2026-W${Math.floor(Math.random() * 5) + 20}`; // e.g. WEEKLY-2026-W25
    return {
      id,
      name: "週間城の踏破",
      description: `固定シード [ ${weeklySeed} ] でB3Fに到達して帰還`,
      type: "weekly",
      danger: "B",
      targetValue: 3, // Target B3F
      currentValue: 1, // Current floor (starts at 1)
      reward: {
        gold: 300,
        identifyTickets: 1,
        item: null
      },
      seed: weeklySeed,
      recommended: "推奨: 固定シードでの地形把握 / 帰還呪文"
    };
  }

  // 2. Kill Contract
  if (typeRoll < 0.40) {
    // Select monster based on danger
    let candidates = [];
    if (danger === "C") {
      candidates = ["かみつき蟲", "ゴブリンの呪術師", "コボルトの斥候"];
    } else if (danger === "B") {
      candidates = ["ゾンビ", "ガイコツ戦士", "ワーウルフ", "スピリット", "ウィル・オー・ウィスプ"];
    } else {
      candidates = ["マスターメイジ", "ポイズンジャイアント", "アースジャイアント", "フラック"];
    }

    const targetMonsterName = candidates[Math.floor(Math.random() * candidates.length)];
    const monster = getMonsterByName(targetMonsterName);
    const targetValue = danger === "C" ? 5 : (danger === "B" ? 3 : 1);
    
    let rewardGold = 100 + Math.floor(Math.random() * 50);
    let rewardTickets = 0;
    let rewardItem = null;

    if (danger === "B") {
      rewardGold = 200 + Math.floor(Math.random() * 100);
      rewardTickets = 1;
    } else if (danger === "A") {
      rewardGold = 400 + Math.floor(Math.random() * 200);
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

  // 3. Chest / Recovery Contract
  if (typeRoll < 0.70) {
    const isChestCount = Math.random() < 0.5;
    if (isChestCount) {
      const targetValue = danger === "C" ? 2 : (danger === "B" ? 4 : 6);
      let rewardGold = danger === "C" ? 120 : (danger === "B" ? 250 : 500);
      let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
      let rewardItem = danger === "A" ? "rare_equip" : null;

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
          item: rewardItem
        },
        recommended: "推奨: 盗賊 / 罠解除装備 / 祝福の聖水"
      };
    } else {
      // Unidentified equipment recovery
      const targetValue = danger === "C" ? 1 : (danger === "B" ? 2 : 3);
      let rewardGold = danger === "C" ? 130 : (danger === "B" ? 280 : 550);
      let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
      let rewardItem = danger === "A" ? "epic_equip" : null; // Epic for A-rank recovery!

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

  // 4. Reach Contract
  if (typeRoll < 0.85) {
    const targetFloor = danger === "C" ? 2 : (danger === "B" ? 3 : 4);
    let rewardGold = danger === "C" ? 120 : (danger === "B" ? 240 : 450);
    let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
    let rewardItem = danger === "A" ? "rare_equip" : null;

    return {
      id,
      name: `地下${targetFloor}階への到達`,
      description: `B${targetFloor}Fに到達し、生きて帰還する`,
      type: "reach",
      danger,
      targetFloor,
      targetValue: targetFloor,
      currentValue: 1, // Starts on floor 1
      reward: {
        gold: rewardGold,
        identifyTickets: rewardTickets,
        item: rewardItem
      },
      recommended: `推奨: 帰還のスクロール / 地下${targetFloor}階へのショートカット開通`
    };
  }

  // 5. Limit / Restriction Contract
  const limitType = Math.random() < 0.5 ? "trap" : "no_death";
  const targetFloor = danger === "C" ? 2 : (danger === "B" ? 3 : 4);
  let rewardGold = danger === "C" ? 150 : (danger === "B" ? 300 : 600);
  let rewardTickets = danger === "C" ? 0 : (danger === "B" ? 1 : 2);
  let rewardItem = danger === "A" ? "rare_equip" : null;

  let desc = "";
  let recommended = "";
  if (limitType === "trap") {
    const trapLimit = danger === "C" ? 2 : (danger === "B" ? 1 : 0);
    desc = `罠被弾を${trapLimit}回以下に抑えてB${targetFloor}Fに到達し帰還`;
    recommended = "推奨: 盗賊の罠解除 / 罠被弾を避ける慎重な移動";
  } else {
    desc = `誰も戦闘不能にならずにB${targetFloor}Fに到達し帰還`;
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
  } else if (contract.type === "kill") {
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

    let itemMsg = "";
    if (contract.reward.item) {
      const rarity = contract.reward.item === "epic_equip" ? "epic" : "rare";
      // Generate unidentified reward item
      const item = generateRandomEquipment(runResult.deepestFloor || 3, rarity);
      item.identified = false;

      // Add to inventory, or storage if full
      if (stateInstance.inventory.length < 20) {
        stateInstance.inventory.push(item);
        itemMsg = `報酬アイテム「未鑑定の${item.type === "weapon" ? "武器" : (item.type === "shield" ? "盾" : "防具")}」がバッグに追加されました。`;
      } else {
        if (!stateInstance.storage) stateInstance.storage = [];
        if (stateInstance.storage.length < stateInstance.storageMax) {
          stateInstance.storage.push(item);
          itemMsg = `バッグが満杯のため、報酬「未鑑定の${item.type === "weapon" ? "武器" : (item.type === "shield" ? "盾" : "防具")}」は倉庫に送られました。`;
        } else {
          itemMsg = `バッグと倉庫が満杯のため、報酬アイテムを受け取れませんでした。`;
        }
      }
    }

    if (!stateInstance.completedContracts) stateInstance.completedContracts = [];
    stateInstance.completedContracts.push(contract.id);

    stateInstance.activeContract = null;
    stateInstance.contracts = generateContractsList(stateInstance);

    return {
      success: true,
      contract,
      itemMsg
    };
  }

  // If not achieved, contract remains active
  return {
    success: false,
    contract,
    reason: "契約目標未達成"
  };
}
