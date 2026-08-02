// sim-scope: run
// 本番のラン内生成と同じ階段・テンプレート・バイオーム設定を測る。
// generateRandomMap のレガシー既定値では B5 以降に下り階段がなく、
// isChokeCell が常に falseになるため、simulation から直接呼ばない。
// 踏んだ罠は stairs-up から stairs-down への最短経路上だけ集計する。
// trapsTriggered は宝箱罠と共有のため使わず、grid 上の床罠を直接分離する。
const { generateRunFloor } = await import("../src/run_map_generator.js");
const { createRng } = await import("../src/seed_rng.js");
const { calculateDetectRate } = await import("../src/rules/trap_rules.js");
const { getTrapChokeRate } = await import("../src/map_generator.js");

const DIRECTIONS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];
const FLOORS = [1, 3, 5, 8, 10, 12, 15, 20];
const INVESTMENTS = [
  { id: "none", label: "無投資", trapSense: 0 },
  { id: "mid", label: "中", trapSense: 10 },
  { id: "full", label: "全振り", trapSense: 15 }
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

console.log("=== TRAP CHOKE DISTRIBUTION ===");
console.log("floor | traps | choke | actual | target | shortfall");

const detectionTotalsByFloor = new Map();
for (const floor of FLOORS) {
  let totalTraps = 0;
  let totalChoke = 0;
  let shortfalls = 0;
  const detectionTotals = new Map(INVESTMENTS.map(investment => [investment.id, {
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

    const steppedTraps = shortestPath(map.grid)
      .map(position => map.grid[position.y][position.x].trap)
      .filter(Boolean);
    for (const investment of INVESTMENTS) {
      const result = detectionTotals.get(investment.id);
      const detectRate = calculateDetectRate({
        floor,
        scoutBonus: investment.trapSense / 100
      });
      const rng = createRng(`${runSeed}:${investment.id}`);
      result.stepped += steppedTraps.length;
      for (let trapIndex = 0; trapIndex < steppedTraps.length; trapIndex++) {
        // 1 trap = 1 detection roll, matching detectRolled's lifetime rule.
        if (rng() < detectRate) {
          result.detected++;
        } else {
          result.ambush++;
        }
      }
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
console.log("floor | investment | detect | stepped | ambush | detected | ambush rate");

for (const floor of FLOORS) {
  const totals = detectionTotalsByFloor.get(floor);
  for (const investment of INVESTMENTS) {
    const result = totals.get(investment.id);
    const detectRate = calculateDetectRate({
      floor,
      scoutBonus: investment.trapSense / 100
    });
    const ambushRate = result.stepped > 0 ? (result.ambush / result.stepped) * 100 : 0;
    console.log(
      `B${String(floor).padStart(2)}   | ` +
      `${investment.label.padEnd(10)} | ` +
      `${detectRate.toFixed(3).padStart(6)} | ` +
      `${String(result.stepped).padStart(7)} | ` +
      `${String(result.ambush).padStart(6)} | ` +
      `${String(result.detected).padStart(8)} | ` +
      `${ambushRate.toFixed(1).padStart(10)}%`
    );
  }
}

console.log("\nstepped = stairs-up→stairs-down 最短経路上の床罠。");
console.log("ambush = 察知失敗で3択UIを経ず発動、detected = 察知成功で3択UI経由想定。");
console.log("trapSense は無投資/中(+10pt)/全振り(+15pt)。");
