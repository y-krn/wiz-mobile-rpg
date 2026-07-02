import { state } from "./state_core.js";
import { saveAutosave } from "./save_storage.js";
import { findSuitableRoamingMonsterStart } from "./initial_state.js";
import { generateRandomMap } from "../map_generator.js";
import { createRng } from "../seed_rng.js";
import { MAP_WIDTH, MAP_HEIGHT, START_X, START_Y } from "../data.js";

export function rebuildDungeonMaps() {
  const b1 = generateRandomMap(1, null, state.seed);
  const b2 = generateRandomMap(2, b1.stairsDownCoord, state.seed);
  const b3 = generateRandomMap(3, b2.stairsDownCoord, state.seed);
  const b4 = generateRandomMap(4, b3.stairsDownCoord, state.seed);
  const b5 = generateRandomMap(5, b4.stairsDownCoord, state.seed);
  state.maps = [b1.grid, b2.grid, b3.grid, b4.grid, b5.grid];
  
  state.roamingMonsters = [];
  const f4Start = findSuitableRoamingMonsterStart(b4, 4);
  if (f4Start) {
    state.roamingMonsters.push({ floor: 4, x: f4Start.x, y: f4Start.y, name: "フラック" });
  }
  const f5Start = findSuitableRoamingMonsterStart(b5, 5);
  if (f5Start) {
    state.roamingMonsters.push({ floor: 5, x: f5Start.x, y: f5Start.y, name: "フラック" });
  }
  
  state.visitedMaps = [
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
  ];
  applyDungeonMemoryToMaps();
  state.visitedMap[state.y][state.x] = true;
  saveAutosave();
}

export function applyDungeonMemoryToMaps() {
  if (!state.dungeonMemory || !state.dungeonMemory.traps) {
    state.dungeonMemory = { traps: {} };
    return;
  }

  if (state.maps) {
    for (let f = 1; f <= 5; f++) {
      const grid = state.maps[f - 1];
      if (!grid) continue;

      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const cell = grid[y]?.[x];
          if (cell && cell.trap) {
            const trapId = cell.trap.id;
            const memory = state.dungeonMemory.traps[trapId];
            if (memory) {
              cell.trap.state = memory.state;
              if (memory.weakenLevel !== undefined) {
                cell.trap.weakenLevel = memory.weakenLevel;
              }
            } else {
              cell.trap.state = "hidden";
            }
          }
        }
      }
    }
  }
}

export function calculateSeedProperties() {
  if (!state.seed) {
    return { rank: "-", label: "未設定", biases: [] };
  }

  let totalDist = 0;
  let floorCount = 0;
  
  for (let f = 1; f <= 5; f++) {
    const grid = state.maps[f - 1];
    if (!grid) continue;
    
    let up = null;
    let down = null;
    
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = grid[y]?.[x];
        if (!cell) continue;
        if (f === 1) {
          if (x === START_X && y === START_Y) {
            up = { x, y };
          }
        } else {
          if (cell.type === "stairs-up") {
            up = { x, y };
          }
        }
        if (cell.type === "stairs-down") {
          down = { x, y };
        }
      }
    }
    
    if (up && down) {
      const dist = Math.abs(up.x - down.x) + Math.abs(up.y - down.y);
      totalDist += dist;
      floorCount++;
    }
  }
  
  const distScore = floorCount > 0 ? Math.min(30, (totalDist / (floorCount * 25)) * 30) : 15;

  let totalChests = 0;
  let trappedChests = 0;
  let goldSum = 0;
  let equipChanceSum = 0;
  
  for (let f = 1; f <= 5; f++) {
    const grid = state.maps[f - 1];
    if (!grid) continue;
    
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = grid[y]?.[x];
        if (cell && cell.event === "chest") {
          totalChests++;
          const chestSeed = `${state.seed}:chest:B${f}:${x},${y}`;
          const rng = createRng(chestSeed);
          
          let traps = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"];
          if (f === 2) {
            traps = ["poison needle", "poison needle", "gas bomb", "teleporter", "flash bomb", "none", "none"];
          } else if (f === 4) {
            traps = ["gas bomb", "teleporter", "teleporter", "flash bomb", "poison needle"];
          } else if (f === 5) {
            traps = ["gas bomb", "teleporter", "teleporter", "poison needle", "flash bomb"];
          }
          const randIdx = Math.floor(rng() * traps.length);
          const trap = traps[randIdx];
          if (trap !== "none") {
            trappedChests++;
          }
          
          let gold = Math.floor(rng() * 81) + 20;
          if (f === 4) gold = Math.floor(rng() * 201) + 100;
          else if (f === 5) gold = Math.floor(rng() * 301) + 150;
          goldSum += gold;
          
          const itemChance = f === 4 ? 0.75 : 0.50;
          if (rng() < itemChance) {
            const randChance = f === 5 ? 0.70 : (["poison needle", "gas bomb", "teleporter"].includes(trap) ? 0.60 : 0.35);
            if (rng() < randChance) {
              equipChanceSum += 1;
            }
          }
        }
      }
    }
  }

  const trapRate = totalChests > 0 ? trappedChests / totalChests : 0.5;
  const trapScore = trapRate * 20;
  
  let themeScore = 0;
  const biases = [];
  
  const b2Seed = `${state.seed}:monster_theme:B2`;
  const b2Rng = createRng(b2Seed);
  const b2Theme = b2Rng() < 0.60 ? "poisonous" : "standard";
  if (b2Theme === "poisonous") {
    themeScore += 5;
    biases.push("毒系多め");
  }
  
  const b3Seed = `${state.seed}:monster_theme:B3`;
  const b3Rng = createRng(b3Seed);
  const b3Theme = b3Rng() < 0.60 ? "spirit" : "standard";
  if (b3Theme === "spirit") {
    themeScore += 10;
    biases.push("不死・霊体多め");
  }
  
  const b5Seed = `${state.seed}:monster_theme:B5`;
  const b5Rng = createRng(b5Seed);
  const b5Theme = b5Rng() < 0.70 ? "dragon" : "giant";
  if (b5Theme === "dragon") {
    themeScore += 10;
    biases.push("竜族多め");
  } else {
    biases.push("巨人族多め");
  }

  let springCount = 0;
  for (let f = 1; f <= 5; f++) {
    const grid = state.maps[f - 1];
    if (!grid) continue;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (grid[y]?.[x]?.event === "event_spring") {
          springCount++;
        }
      }
    }
  }
  const springScore = Math.max(0, 25 - (springCount * 2.5));
  
  if (trapRate >= 0.8) {
    biases.push("罠多め");
  } else if (trapRate < 0.4) {
    biases.push("安全な宝箱");
  }
  
  const avgGold = totalChests > 0 ? goldSum / totalChests : 0;
  if (avgGold > 120) {
    biases.push("ゴールド豊富");
  }
  
  const equipRate = totalChests > 0 ? equipChanceSum / totalChests : 0;
  if (equipRate >= 0.3) {
    biases.push("宝箱品質高");
  }
  
  if (springCount <= 4) {
    biases.push("泉少なめ");
  } else if (springCount >= 8) {
    biases.push("泉豊富");
  }

  const finalScore = Math.round(distScore + trapScore + themeScore + springScore);
  
  let rank;
  let label;
  if (finalScore >= 70) {
    rank = "S";
    label = "極限の魔城";
  } else if (finalScore >= 50) {
    rank = "A";
    label = "危険な遠征";
  } else if (finalScore >= 35) {
    rank = "B";
    label = "深部探索";
  } else if (finalScore >= 20) {
    rank = "C";
    label = "通常探索";
  } else {
    rank = "D";
    label = "安全な偵察";
  }

  return {
    score: finalScore,
    rank,
    label,
    biases: biases.slice(0, 3)
  };
}
