// sim-scope: run
// 本番のラン内生成と同じ階段・テンプレート・バイオーム設定を測る。
// generateRandomMap のレガシー既定値では B5 以降に下り階段がなく、
// isChokeCell が常に falseになるため、simulation から直接呼ばない。
// 踏んだ罠は stairs-up から stairs-down への最短経路上だけ集計する。
// trapsTriggered は宝箱罠と共有のため使わず、grid 上の床罠を直接分離する。
const { generateRunFloor } = await import("../src/run_map_generator.js");
const { createRng } = await import("../src/seed_rng.js");
const { generateRandomAccessory, generateRandomEquipment } = await import("../src/systems/equipment_generation.js");
const { ITEMS, getPartyMaxAffix } = await import("../src/data.js");
const { createSoloCharacter, state } = await import("../src/state.js");
const { detectAdjacentTraps } = await import("../src/systems/traps.js");
const { getTrapChokeRate } = await import("../src/map_generator.js");

const DIRECTIONS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];
const FLOORS = [1, 3, 5, 8, 10, 12, 15, 20];
const INVESTMENTS = [
  { id: "none", label: "無投資", slots: [] },
  { id: "mid", label: "中", slots: ["accessory"] },
  { id: "full", label: "全振り", slots: ["accessory", "weapon"] }
];
const SAMPLES = 1000;

function keyOf(position) {
  return `${position.x},${position.y}`;
}

function findCell(grid, type) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].type === type) return { x, y };
    }
  }
  return null;
}

function shortestPath(grid) {
  const start = findCell(grid, "stairs-up");
  const target = findCell(grid, "stairs-down");
  if (!start || !target) throw new Error("stairs-up/down missing from generated floor");

  const startKey = keyOf(start);
  const targetKey = keyOf(target);
  const queue = [start];
  const positions = new Map([[startKey, start]]);
  const previous = new Map([[startKey, null]]);

  for (let index = 0; index < queue.length && !previous.has(targetKey); index++) {
    const current = queue[index];
    const cell = grid[current.y][current.x];
    for (const { dx, dy, dir } of DIRECTIONS) {
      if (cell.walls[dir]) continue;
      const next = grid[current.y + dy]?.[current.x + dx];
      if (!next || next.blockEnter?.[(dir + 2) % 4]) continue;

      const nextPosition = { x: current.x + dx, y: current.y + dy };
      const nextKey = keyOf(nextPosition);
      if (previous.has(nextKey)) continue;
      previous.set(nextKey, keyOf(current));
      positions.set(nextKey, nextPosition);
      queue.push(nextPosition);
    }
  }

  if (!previous.has(targetKey)) throw new Error("stairs-down is unreachable");

  const path = [];
  for (let currentKey = targetKey; currentKey !== null; currentKey = previous.get(currentKey)) {
    path.unshift(positions.get(currentKey));
  }
  return path;
}

function findTrapSenseItem(floor, slot, character, loadoutSeed) {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const rng = createRng(`${loadoutSeed}:${slot}:${attempt}`);
    const item = slot === "accessory"
      ? generateRandomAccessory(floor, {
        forceRarity: "magic",
        rng,
        party: [character],
        allowCores: false
      })
      : generateRandomEquipment(floor, {
        forceRarity: "magic",
        rng,
        party: [character],
        allowCores: false
      });
    const base = ITEMS[item?.baseId];
    const hasTrapSense = item?.affixes?.some(affix => affix.type === "trapSense");
    if (base?.type !== slot || !base.classes?.includes(character.class) || !hasTrapSense) continue;

    // 生成された実アイテムを鑑定済みとして装備し、getPartyMaxAffix に渡す。
    return { ...item, identified: true };
  }
  throw new Error(`trapSense item not found: B${floor} ${slot}`);
}

function buildInvestmentParty(floor, investment) {
  const character = createSoloCharacter("Thief");
  for (const slot of investment.slots) {
    character.equipment[slot] = findTrapSenseItem(
      floor,
      slot,
      character,
      `TRAP_LOADOUT_B${floor}:${investment.id}`
    );
  }
  return [character];
}

function walkFloor({ floor, grid, path, party, runSeed }) {
  state.floor = floor;
  state.maps = Array.from({ length: floor }, (_, index) => index === floor - 1 ? grid : null);
  state.visitedMaps = Array.from({ length: floor }, () => null);
  state.party = party;
  state.gameState = "explore";
  state.logs = [];
  state.x = path[0].x;
  state.y = path[0].y;
  state.prevX = path[0].x;
  state.prevY = path[0].y;

  let stepped = 0;
  let ambush = 0;
  let detected = 0;
  const previousRandom = Math.random;
  // 判定そのものは実装側の detectAdjacentTraps に任せ、再現性のためだけに RNG を注入する。
  Math.random = createRng(`${runSeed}:trap-detect`);
  try {
    for (let index = 0; index < path.length; index++) {
      const position = path[index];
      state.prevX = state.x;
      state.prevY = state.y;
      state.x = position.x;
      state.y = position.y;
      detectAdjacentTraps();

      const next = path[index + 1];
      if (!next) continue;
      const trap = grid[next.y]?.[next.x]?.trap;
      if (!trap) continue;

      stepped++;
      if (trap.state === "hidden") {
        ambush++;
      } else if (trap.state === "discovered") {
        detected++;
      } else {
        throw new Error(`unexpected stepped trap state: ${trap.state}`);
      }

      // 3択UI／罠効果は再現せず、同じ床を再集計しないためだけに実発動後の状態へ進める。
      trap.state = "disabled";
    }
  } finally {
    Math.random = previousRandom;
  }

  return { stepped, ambush, detected };
}

console.log("=== TRAP CHOKE DISTRIBUTION ===");
console.log("floor | traps | choke | actual | target | shortfall");

const detectionTotalsByFloor = new Map();
for (const floor of FLOORS) {
  let totalTraps = 0;
  let totalChoke = 0;
  let shortfalls = 0;
  const loadouts = new Map(INVESTMENTS.map(investment => {
    const party = buildInvestmentParty(floor, investment);
    return [investment.id, {
      party,
      trapSense: getPartyMaxAffix(party, "trapSense")
    }];
  }));
  const detectionTotals = new Map(INVESTMENTS.map(investment => [investment.id, {
    trapSense: loadouts.get(investment.id).trapSense,
    stepped: 0,
    ambush: 0,
    detected: 0
  }]));

  for (let i = 0; i < SAMPLES; i++) {
    const runSeed = `TRAP_SIM_${floor}_${i}`;
    const map = generateRunFloor({ runSeed, floor });
    const meta = map.trapMeta;
    totalTraps += meta.total;
    totalChoke += meta.choke;
    if (meta.choke < meta.chokeTargeted) shortfalls++;

    const path = shortestPath(map.grid);
    for (const investment of INVESTMENTS) {
      const result = detectionTotals.get(investment.id);
      const loadout = loadouts.get(investment.id);
      const scenario = walkFloor({
        floor,
        grid: structuredClone(map.grid),
        path,
        party: loadout.party,
        runSeed: `${runSeed}:${investment.id}`
      });
      result.stepped += scenario.stepped;
      result.ambush += scenario.ambush;
      result.detected += scenario.detected;
    }
  }

  detectionTotalsByFloor.set(floor, detectionTotals);

  const actualRate = totalChoke / totalTraps;
  const targetRate = getTrapChokeRate(floor);
  console.log(
    `B${String(floor).padStart(2)}   | ` +
    `${(totalTraps / SAMPLES).toFixed(1).padStart(5)} | ` +
    `${(totalChoke / SAMPLES).toFixed(1).padStart(5)} | ` +
    `${actualRate.toFixed(3).padStart(6)} | ` +
    `${targetRate.toFixed(3).padStart(6)} | ` +
    `${((shortfalls / SAMPLES) * 100).toFixed(0).padStart(3)}%`
  );
}

console.log("\n=== TRAP SURPRISE DETECTION ===");
console.log("floor | investment | trapSense | stepped | ambush | detected | ambush rate");

for (const floor of FLOORS) {
  const totals = detectionTotalsByFloor.get(floor);
  for (const investment of INVESTMENTS) {
    const result = totals.get(investment.id);
    const ambushRate = result.stepped > 0 ? (result.ambush / result.stepped) * 100 : 0;
    console.log(
      `B${String(floor).padStart(2)}   | ` +
      `${investment.label.padEnd(10)} | ` +
      `${String(result.trapSense).padStart(9)} | ` +
      `${String(result.stepped).padStart(7)} | ` +
      `${String(result.ambush).padStart(6)} | ` +
      `${String(result.detected).padStart(8)} | ` +
      `${ambushRate.toFixed(1).padStart(10)}%`
    );
  }
}

console.log("\nstepped = stairs-up→stairs-down 最短経路上の床罠。");
console.log("ambush = 察知失敗で3択UIを経ず発動、detected = 察知成功で3択UI経由想定。");
console.log("trapSense は実生成装備を createSoloCharacter に装備し、getPartyMaxAffix で取得した値。");
console.log("各歩行位置で detectAdjacentTraps を呼び、detectRolled の生涯1回制限も実装経路で適用。");
