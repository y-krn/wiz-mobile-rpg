import {
  getItemData, checkCharLevelUp, getCharMaxHp,
  getPartyMaxAffix, getPartyCoreParams, getCoreLogText
} from "../data.js";
import { generateRandomAccessory, generateRandomEquipment } from "../systems/equipment_generation.js";
import { determineMonsterDrop, getMonsterMainMaterial } from "./drops.js";
import { addCanonicalInventoryItemToState } from "../state/inventory_state.js";
import { createMonsterCodexRecord, recordEquipmentDiscovery, recordMonsterLoot } from "../state/codex_state.js";
import { getFeatAnnouncementLines, recordRoleDefeats } from "../systems/feats.js";
import { addRunFragments, getVictoryFragments } from "../systems/guidebook.js";
import { freeKeeperAfterFight } from "../systems/facility_rooms.js";
import { settlePhase4jBExpOwnership } from "../rules/phase4j_b_trial.js";

function rollCombatAccessoryDrop(state, rng) {
  const roll = rng();
  if (state.combatState.isBoss) {
    return roll > 0 && roll < 0.35
      ? generateRandomAccessory(state.floor, { forceRarity: "epic", rng, party: state.party })
      : null;
  }
  if (state.combatState.isMidboss || state.combatState.isRoamingFlack) {
    return roll > 0 && roll < 0.25
      ? generateRandomAccessory(state.floor, { forceRarity: "rare", rng, party: state.party })
      : null;
  }
  const isRare = state.combatState.monsters?.some(m => m.isRare);
  const chance = isRare ? 0.12 : 0.03;
  return roll > 0 && roll < chance
    ? generateRandomAccessory(state.floor, { forceRarity: null, rng, party: state.party })
    : null;
}

export function applyCombatRewards(state, monsters, logQueue, rng = Math.random, policy = null) {
  settlePhase4jBExpOwnership(state, monsters);
  const nonFledMonsters = monsters.filter(m => !m.fled);
  const totalExp = nonFledMonsters.reduce((sum, m) => sum + m.exp, 0);
  const livingChars = state.party.filter(c => c.status !== "dead");
  const scholarEye = Boolean(getPartyCoreParams(state.party, "CORE_SCHOLAR_EYE"));
  const uncataloguedNames = new Set(nonFledMonsters.filter(m => {
    const baseName = m.name.replace(/\s[A-Z]$/, "");
    return (state.codex?.monsters?.[baseName]?.killed || 0) === 0;
  }).map(m => m.name.replace(/\s[A-Z]$/, "")));

  // Check First Kill Bonuses
  const firstKilledNames = [];
  const firstKilledMats = {};
  let bonusTickets = 0;
  
  nonFledMonsters.forEach(m => {
    if (m.hasSplit === true) return;
    const baseName = m.name.replace(/\s[A-Z]$/, "");
    if (state.firstKills && !state.firstKills.includes(baseName)) {
      if (!state.firstKills) state.firstKills = [];
      state.firstKills.push(baseName);
      firstKilledNames.push(baseName);
      
      // 素材付与
      const mat = getMonsterMainMaterial(m);
      if (mat) {
        firstKilledMats[mat] = (firstKilledMats[mat] || 0) + 1;
        recordMonsterLoot(m, mat, state);
      }
      
      // 5種類討伐ごとにラン内鑑定粉+1個
      if (state.firstKills.length % 5 === 0) {
        bonusTickets++;
      }
    }
  });

  // チケット付与の反映
  if (bonusTickets > 0) {
    state.identifyTickets = (state.identifyTickets || 0) + bonusTickets;
  }

  // 初討伐報酬はbanking対象外のメタ素材へ直接加算する。
  Object.entries(firstKilledMats).forEach(([mat, qty]) => {
    state.metaMaterials ||= {};
    state.metaMaterials[mat] = (state.metaMaterials[mat] || 0) + qty;
    if (!state.currentRun) return;
    state.currentRun.codexRewards ||= {};
    state.currentRun.codexRewards[mat] = (state.currentRun.codexRewards[mat] || 0) + qty;
  });

  if (state.codex) {
    if (!state.codex.stats) {
      state.codex.stats = { totalRuns: 0, totalDeaths: 0, deepestFloor: 1, totalKills: 0, totalChests: 0 };
    }
    state.codex.stats.totalKills += nonFledMonsters.length;
    
    if (!state.codex.monsters) state.codex.monsters = {};
    nonFledMonsters.forEach(m => {
      if (m.hasSplit === true) return;
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (!state.codex.monsters[baseName]) {
        state.codex.monsters[baseName] = createMonsterCodexRecord({ encountered: 1 });
      }
      state.codex.monsters[baseName].killed++;
      if (firstKilledNames.includes(baseName)) {
        state.codex.monsters[baseName].firstKilled = true;
      }
      
    });
  }

  const expShare = livingChars.length > 0 ? Math.round(totalExp / livingChars.length) : 0;
  const bonusExpShare = 0;

  if (state.currentRun) {
    state.currentRun.kills += nonFledMonsters.length;
    state.currentRun.expGained += (expShare + bonusExpShare);
    if (state.combatState.isBoss) {
      state.currentRun.bossesKilled += nonFledMonsters.length;
    } else if (state.combatState.isMidboss || state.combatState.isRoamingFlack) {
      state.currentRun.elitesKilled += nonFledMonsters.length;
    } else {
      nonFledMonsters.forEach(m => {
        if (m.isRare) {
          state.currentRun.elitesKilled++;
        }
      });
    }
    recordRoleDefeats(state.currentRun, nonFledMonsters);
    // Guidebook fragments (#2013): one per strong-enemy fight or rare enemy,
    // two per floor guardian. They are kept only by a safe return.
    const eliteFight = state.combatState.isMidboss || state.combatState.isRoamingFlack ||
      state.combatState.isBrood;
    const fragments = addRunFragments(state.currentRun, getVictoryFragments({
      guardians: state.combatState.isBoss && nonFledMonsters.length > 0 ? 1 : 0,
      elites: state.combatState.isBoss
        ? 0
        : eliteFight
          ? Math.min(1, nonFledMonsters.length)
          : nonFledMonsters.filter(monster => monster.isRare).length
    }));
    if (fragments > 0) {
      logQueue.push({
        msg: `手引き書の断片を${fragments}枚手に入れた（計${state.currentRun.guideFragments}枚）。生還すれば持ち帰れる。`,
        sound: "item"
      });
    }
    getFeatAnnouncementLines(state.feats, state.currentRun).forEach(msg => {
      logQueue.push({ msg, sound: "item" });
    });
  }

  // 素材ドロップの実行
  const runMats = {};
  const materialFind = getPartyMaxAffix(state.party, "materialFind") / 100;
  let scholarActivated = false;
  nonFledMonsters.forEach(m => {
    const baseName = m.name.replace(/\s[A-Z]$/, "");
    const guaranteed = scholarEye && uncataloguedNames.has(baseName);
    const drops = determineMonsterDrop(m, state.floor, rng, {
      chanceBonus: materialFind,
      guaranteed,
      startFloor: state.currentRun?.startFloor || 1,
      rareMaterialFloor: policy?.materialDropOverride?.rareMaterialFloor,
      secondaryMaterialProfile: policy?.materialDropOverride?.secondaryMaterialProfile
    });
    scholarActivated ||= guaranteed;
    Object.entries(drops).forEach(([mat, qty]) => {
      runMats[mat] = (runMats[mat] || 0) + qty;
      recordMonsterLoot(m, mat, state);
      
      if (state.currentRun) {
        state.currentRun.materials ||= {};
        state.currentRun.materials[mat] = (state.currentRun.materials[mat] || 0) + qty;
      }
    });
  });

  const victoryMaterial = getPartyMaxAffix(state.party, "victoryMaterial");
  if (nonFledMonsters.length > 0 && victoryMaterial > 0 && rng() * 100 < victoryMaterial) {
    const sourceMonster = nonFledMonsters[Math.floor(rng() * nonFledMonsters.length)];
    const mat = getMonsterMainMaterial(sourceMonster);
    runMats[mat] = (runMats[mat] || 0) + 1;
    recordMonsterLoot(sourceMonster, mat, state);
    if (state.currentRun) {
      state.currentRun.materials ||= {};
      state.currentRun.materials[mat] = (state.currentRun.materials[mat] || 0) + 1;
    }
    logQueue.push({ msg: `勝利の跡から${mat}を見つけた！`, sound: "item" });
  }

  // Presentation-only digest of this victory (#1840). It rides on the victory
  // log entry and is filled in below as level-ups and drops resolve.
  const victorySummary = {
    exp: expShare + bonusExpShare,
    materials: { ...runMats },
    firstKillMaterials: { ...firstKilledMats },
    bonusTickets,
    levelUps: [],
    items: []
  };

  if (nonFledMonsters.length > 0) {
    let msg = "戦闘に勝利した！";
    if (expShare > 0) {
      msg += `戦闘経験を積んだ。`;
    }
    logQueue.push({
      msg,
      sound: "level_up",
      victorySummary
    });

    if (Object.keys(runMats).length > 0) {
      const matStr = Object.entries(runMats).map(([mat, qty]) => `${mat}×${qty}`).join("・");
      logQueue.push({
        msg: `素材を手に入れた：${matStr}`,
        sound: "item"
      });
    }
    if (scholarActivated) {
      logQueue.push({ msg: getCoreLogText("CORE_SCHOLAR_EYE") });
    }

    if (firstKilledNames.length > 0) {
      logQueue.push({
        msg: `初めて${firstKilledNames.join("・")}を倒した！`,
        sound: "item"
      });
      let rewardMsg = "初めて倒した報酬";
      const matListStr = Object.entries(firstKilledMats).map(([mat, qty]) => `${mat}×${qty}`).join("・");
      if (matListStr) {
        rewardMsg += `：${matListStr}`;
      }
      if (bonusTickets > 0) {
        rewardMsg += `${matListStr ? "・" : "："}鑑定粉×${bonusTickets}`;
      }
      logQueue.push({
        msg: rewardMsg
      });
    }
  } else {
    logQueue.push({
      msg: `敵がすべて逃げ出し、戦闘が終了した。`,
      sound: "miss"
    });
  }

  if (nonFledMonsters.length === 0) {
    logQueue.push({
      msg: "周囲に静寂が戻った。",
      endCombat: true
    });
    return true; // ended
  }

  livingChars.forEach(c => {
    c.exp += (expShare + bonusExpShare);
    const hpBeforeLevelUp = c.hp;
    const levelBefore = c.level;
    const maxHpBefore = getCharMaxHp(c);
    const lvlUp = checkCharLevelUp(c);
    if (lvlUp) {
      const levelUpRecoveryHp = Math.max(0, c.hp - hpBeforeLevelUp);
      victorySummary.levelUps.push({
        name: c.name,
        levelBefore,
        level: c.level,
        maxHpBefore,
        maxHp: getCharMaxHp(c)
      });
      logQueue.push({
        msg: `[★] レベルアップ！${c.name}はレベル${c.level}になった！HPが${levelUpRecoveryHp}回復した。`,
        sound: "level_up",
        flash: true,
        floatText: "レベルアップ！",
        floatColor: "#ffb300",
        levelUpRecoveryHp
      });
    }
  });

  // 敵撃破時の未鑑定装備ドロップ判定
  let dropEquipment = null;
  if (state.combatState.isBoss) {
    dropEquipment = generateRandomEquipment(state.floor, {
      forceRarity: "epic",
      rng,
      party: state.party
    });
  } else if (state.combatState.isMidboss) {
    const rarity = rng() < 0.25 ? "epic" : "rare";
    dropEquipment = generateRandomEquipment(state.floor, {
      forceRarity: rarity,
      rng,
      party: state.party
    });
  } else if (state.combatState.isRoamingFlack) {
    const rarity = rng() < 0.30 ? "epic" : "rare";
    dropEquipment = generateRandomEquipment(state.floor, {
      forceRarity: rarity,
      rng,
      party: state.party
    });
  } else {
    const isRare = state.combatState.monsters && state.combatState.monsters.some(m => m.isRare);
    const chance = isRare ? 0.55 : 0.14;
    if (rng() < chance) {
      dropEquipment = generateRandomEquipment(state.floor, {
        forceRarity: null,
        rng,
        party: state.party
      });
    }
  }

  if (dropEquipment) {
    const added = addCanonicalInventoryItemToState(state, dropEquipment, { dungeonLoot: true, source: "combat" });
    if (added) {
      recordEquipmentDiscovery(dropEquipment, state);
      if (state.currentRun) {
        state.currentRun.equipmentFound.push(dropEquipment);
      }
      const eqData = getItemData(dropEquipment);
      victorySummary.items.push(eqData.name);
      if (nonFledMonsters.length === 1) {
        recordMonsterLoot(nonFledMonsters[0], eqData.name, state);
      }
      logQueue.push({
        msg: `魔物の骸から${eqData.name}を手に入れた！`,
        sound: "item"
      });
    } else {
      logQueue.push({
        msg: `魔物は何かを落としたが、バッグが満杯で拾えなかった！`,
        sound: "miss"
      });
    }
  }

  const dropAccessory = rollCombatAccessoryDrop(state, rng);
  if (dropAccessory) {
    const added = addCanonicalInventoryItemToState(state, dropAccessory, { dungeonLoot: true, source: "combat" });
    if (added) {
      recordEquipmentDiscovery(dropAccessory, state);
      if (state.currentRun) {
        state.currentRun.equipmentFound.push(dropAccessory);
      }
      const itemData = getItemData(dropAccessory);
      victorySummary.items.push(itemData.name);
      if (nonFledMonsters.length === 1) {
        recordMonsterLoot(nonFledMonsters[0], itemData.name, state);
      }
      logQueue.push({
        msg: `魔物の骸から${itemData.name}を手に入れた！`,
        sound: "item"
      });
    } else {
      logQueue.push({
        msg: `魔物は装身具を落としたが、バッグが満杯で拾えなかった！`,
        sound: "miss"
      });
    }
  }

  if (state.combatState.isBoss) {
    logQueue.push({
      msg: `B${state.floor}Fの階層守護者を撃破した！帰還の門と商人が解放された。`,
      sound: "item",
      milestoneVictory: state.floor
    });
  } else if (state.combatState.isMidboss) {
    logQueue.push({
      msg: "デーモンガードの骸から竜の鍵を手に入れた！これであの扉を開けられるはずだ！",
      sound: "item",
      giveKey: true
    });
  } else if (state.combatState.isMimic) {
    logQueue.push({
      msg: "ミミックを倒した！抱え込んでいた宝が残っている。",
      sound: "item"
    });
    logQueue.push({
      msg: "ミミックの残骸から宝を回収する。",
      triggerChest: true
    });
  } else if (state.combatState.isBrood) {
    // A keeper cocooned in this brood chamber is freed by the victory (#2019).
    const freed = freeKeeperAfterFight(state.map?.[state.y]?.[state.x], state.currentRun);
    if (freed) {
      state.mapRevision = (state.mapRevision ?? 0) + 1;
      logQueue.push({
        msg: `巣の主を倒した！繭を切り開くと、${freed.companion.name}が這い出してきた。「ありがとう。街まで連れて行って」`,
        sound: "item"
      });
      logQueue.push({
        msg: `${freed.companion.name}が同行する。帰還の門か帰還の翼で生還すれば、街に${freed.name}が開く。`
      });
    }
    logQueue.push({
      msg: freed ? "卵室の奥に、獲物の遺した荷が積まれている。" : "巣の主を倒した！卵室の奥に、獲物の遺した荷が積まれている。",
      sound: "item"
    });
    logQueue.push({
      msg: "卵室の荷を検める。",
      triggerChest: true
    });
  } else if (state.combatState.isRoamingFlack) {
    const defeatedId = state.combatState.roamingMonsterId;
    const eliteName = state.combatState.monsters?.[0]?.name || "強敵";
    if (state.currentRun) {
      state.currentRun.eliteDefeatedFloors ||= [];
      if (!state.currentRun.eliteDefeatedFloors.includes(state.floor)) {
        state.currentRun.eliteDefeatedFloors.push(state.floor);
      }
      state.currentRun.eliteFloors ||= {};
      state.currentRun.eliteFloors[String(state.floor)] = {
        ...(state.currentRun.eliteFloors[String(state.floor)] || {}),
        entryRollResolved: true,
        spawned: true,
        defeated: true
      };
    }
    state.roamingMonsters = state.roamingMonsters.filter(rm => {
      if (defeatedId) return rm.id !== defeatedId;
      return !(rm.floor === state.floor && rm.x === state.x && rm.y === state.y);
    });

    logQueue.push({
      msg: `強敵「${eliteName}」を見事に撃破した！`,
      sound: "item"
    });
    logQueue.push({
      msg: `${eliteName}の残骸の影に宝箱を見つけた！`,
      triggerChest: true
    });
  } else {
    if (rng() < 0.20) {
      logQueue.push({
        msg: "魔物が宝箱を残していった！",
        triggerChest: true
      });
    } else {
      logQueue.push({
        msg: "周囲に静寂が戻った。",
        endCombat: true
      });
    }
  }

  return false;
}
