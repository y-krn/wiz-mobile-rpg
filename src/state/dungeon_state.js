import { markMapChanged, state } from "./state_core.js";
import { MAP_WIDTH, MAP_HEIGHT } from "../data.js";
import { createRng } from "../seed_rng.js";

// 保存済みマップに探索メモリを重ねるだけの処理。床の生成そのものはラン側が持つ。
export function applyDungeonMemoryToMaps() {
  if (!state.dungeonMemory) {
    state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
  }
  state.dungeonMemory.mapFragments ||= {};
  state.dungeonMemory.visitedFloors ||= [1];
  markMapChanged();
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
        if (cell.type === "stairs-up") {
          up = { x, y };
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
