import { markMapChanged, markMapCellVisited, state } from "./state_core.js";
import { saveAutosave } from "./save_storage.js";
import { findSuitableRoamingMonsterStart } from "./initial_state.js";
import { generateRandomMap } from "../map_generator.js";
import { createRng } from "../seed_rng.js";
import { MAP_WIDTH, MAP_HEIGHT } from "../data.js";
import { applyOpenedGatesToMap, createWardenMonster, ensureWardenGate, findMapCellByType } from "./warden_gates.js";
import { getWardenPerception } from "../systems/warden_perception.js";

function createUngatedWarden(mapData, floor) {
  const start = findSuitableRoamingMonsterStart(mapData, floor);
  if (!start) return null;
  return {
    id: `B${floor}_WARDEN`, floor, x: start.x, y: start.y,
    name: floor === 4 ? "フラック" : `封印門の門番 B${floor}`,
    kind: "warden", perception: getWardenPerception(floor),
    homeX: start.x, homeY: start.y, gateId: null
  };
}

export function rebuildDungeonMaps() {
  const generatedMaps = [];
  let parentStairsCoord = null;
  for (let floor = 1; floor <= 5; floor++) {
    const mapData = generateRandomMap(floor, parentStairsCoord, state.seed);
    const ensured = ensureWardenGate(mapData.grid, floor, mapData.wardenGate);
    if (ensured.stairsDownCoord) mapData.stairsDownCoord = ensured.stairsDownCoord;
    mapData.wardenGate = ensured.gate;
    generatedMaps.push(mapData);
    parentStairsCoord = mapData.stairsDownCoord;
  }
  state.maps = generatedMaps.map(mapData => mapData.grid);
  const [b1] = generatedMaps;
  const start = findMapCellByType(b1.grid, "stairs-up");
  state.floor = 1;
  state.x = start.x;
  state.y = start.y;
  state.prevX = start.x;
  state.prevY = start.y;
  
  state.roamingMonsters = [];
  generatedMaps.forEach((mapData, index) => {
    const floor = index + 1;
    const gate = mapData.wardenGate;
    applyOpenedGatesToMap(mapData.grid, state.openedGates);
    if (!gate?.id || !state.openedGates?.includes(gate.id)) {
      const warden = createWardenMonster(floor, gate, mapData.grid) || createUngatedWarden(mapData, floor);
      if (warden) state.roamingMonsters.push(warden);
    }
  });
  
  state.visitedMaps = [
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false)),
    Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(false))
  ];
  applyDungeonMemoryToMaps();
  markMapCellVisited(state.x, state.y);
  markMapChanged();
  saveAutosave();
}

export function applyDungeonMemoryToMaps() {
  if (!state.dungeonMemory) {
    state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
  }
  state.dungeonMemory.mapFragments ||= {};
  state.dungeonMemory.visitedFloors ||= [1];

  if (state.maps) {
    for (let floor = 1; floor <= 5; floor++) {
      const grid = state.maps[floor - 1];
      if (!grid) continue;
      const rng = createRng(`${state.seed}:warden-backfill:B${floor}`);
      const { gate, stairsDownCoord } = ensureWardenGate(grid, floor, null, rng);
      if (stairsDownCoord) {
        console.warn(`B${floor}F warden gate backfill relocated stairs-down to (${stairsDownCoord.x}, ${stairsDownCoord.y})`);
      }
      applyOpenedGatesToMap(grid, state.openedGates);
      if (gate && state.openedGates?.includes(gate.id) && state.roamingMonsters) {
        state.roamingMonsters = state.roamingMonsters.filter(rm => rm.gateId !== gate.id);
      }
      if (gate && !state.openedGates?.includes(gate.id)) {
        if (!state.roamingMonsters) state.roamingMonsters = [];
        const existing = state.roamingMonsters.find(rm => rm.kind === "warden" && rm.gateId === gate.id);
        if (existing && !existing.perception) {
          existing.perception = createWardenMonster(floor, gate, grid)?.perception;
        }
        const exists = Boolean(existing);
        if (!exists) {
          const warden = createWardenMonster(floor, gate, grid);
          if (warden) state.roamingMonsters.push(warden);
        }
      }
      if (!gate && !state.roamingMonsters?.some(rm => rm.id === `B${floor}_WARDEN`)) {
        if (!state.roamingMonsters) state.roamingMonsters = [];
        const warden = createUngatedWarden({ grid }, floor);
        if (warden) state.roamingMonsters.push(warden);
      }
    }
  }
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
