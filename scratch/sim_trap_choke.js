// sim-scope: run
// 本番のラン内生成と同じ階段・テンプレート・バイオーム設定を測る。
// generateRandomMap のレガシー既定値では B5 以降に下り階段がなく、
// isChokeCell が常に falseになるため、simulation から直接呼ばない。
// 踏んだ罠は stairs-up から stairs-down への最短経路上だけ集計する。
// trapsTriggered は宝箱罠と共有のため使わず、grid 上の床罠を直接分離する。
import { requireRunnerProvenance } from "./measurement_provenance.js";

export const MEASUREMENT_PROVENANCE = requireRunnerProvenance();

const { generateRunFloor } = await import("../src/run_map_generator.js");
const { createRng } = await import("../src/seed_rng.js");
const { generateRandomAccessory, generateRandomEquipment } = await import("../src/systems/equipment_generation.js");
const {
  ITEMS,
  MATERIAL_TAGS,
  TAG_EFFECT_MAP,
  getBiomeForFloor,
  getCharMaxHp,
  getPartyMaxAffix
} = await import("../src/data.js");
const { createSoloCharacter, state } = await import("../src/state.js");
const { detectAdjacentTraps } = await import("../src/systems/traps.js");
const { resolveFloorTrapEffect } = await import("../src/rules/trap_effect_rules.js");
const { getTrapChokeRate } = await import("../src/map_generator.js");
const { executeTagInscription } = await import("../src/craft.js");

if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
}

const trapSenseInscription = Object.entries(TAG_EFFECT_MAP)
  .find(([, effect]) => effect.type === "trapSense");
if (!trapSenseInscription) throw new Error("trapSense inscription is not registered");
const [trapSenseTag, trapSenseEffect] = trapSenseInscription;
const trapSenseMaterial = Object.entries(MATERIAL_TAGS)
  .find(([, tags]) => tags.includes(trapSenseTag))?.[0];
if (!trapSenseMaterial) throw new Error(`No material is assigned to ${trapSenseTag}`);

const DIRECTIONS = [
  { dx: 0, dy: -1, dir: 0 },
  { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 },
  { dx: -1, dy: 0, dir: 3 }
];
const FLOORS = [1, 3, 5, 8, 10, 12, 15, 20, 25, 30];
const INVESTMENTS = [
  { id: "none", label: "無投資", slots: [] },
  { id: "mid", label: "中", slots: ["accessory"] },
  { id: "full", label: "全振り", slots: ["accessory", "weapon"] }
];
const CLASSES = ["Fighter", "Thief", "Samurai"];
const TRAP_TYPES = ["damage", "pitfall", "mpDrain", "alarm"];
const EXPECTED_HP_GAIN_BY_CLASS = Object.freeze({ Fighter: 8, Thief: 6, Samurai: 7 });
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

function findPrimaryWeapon(floor, character, loadoutSeed) {
  const isFrontline = ["Fighter", "Samurai"].includes(character.class);
  const minimumAtk = isFrontline && floor >= 3 ? 12 : 0;
  const preferredBaseId = isFrontline && floor >= 5 ? "KATANA" : null;
  for (let attempt = 0; attempt < 10000; attempt++) {
    const rng = createRng(`${loadoutSeed}:weapon:${attempt}`);
    const item = generateRandomEquipment(floor, {
      forceRarity: "magic",
      rng,
      party: [character],
      allowCores: false
    });
    const base = ITEMS[item?.baseId];
    if (base?.type !== "weapon" || !base.classes?.includes(character.class)) continue;
    if (preferredBaseId && item.baseId !== preferredBaseId) continue;
    if ((base.atk || 0) < minimumAtk) continue;
    return { ...item, identified: true };
  }
  throw new Error(`primary weapon not found: B${floor} ${character.class}`);
}

function inscribeTrapSense(item) {
  const previousInventory = state.inventory;
  const previousMaterials = state.metaMaterials;
  const previousLogs = state.logs;
  const candidate = {
    ...item,
    identified: true,
    tags: [...(item.tags || [])]
  };
  state.inventory = [candidate];
  state.metaMaterials = { [trapSenseMaterial]: trapSenseEffect.matCost };
  state.logs = [];
  try {
    if (!executeTagInscription(0, trapSenseMaterial, trapSenseTag)) {
      throw new Error(`trapSense inscription failed for ${item.baseId}`);
    }
    return state.inventory[0];
  } finally {
    state.inventory = previousInventory;
    state.metaMaterials = previousMaterials;
    state.logs = previousLogs;
  }
}

function buildInvestmentParty(floor, investment, className) {
  const character = createSoloCharacter(className);
  for (const slot of investment.slots) {
    if (slot === "accessory") {
      character.equipment.accessory = findTrapSenseItem(
        floor,
        slot,
        character,
        `TRAP_LOADOUT_B${floor}:${className}:${investment.id}`
      );
    } else if (slot === "weapon") {
      character.equipment.weapon = inscribeTrapSense(findPrimaryWeapon(
        floor,
        character,
        `TRAP_LOADOUT_B${floor}:${className}:${investment.id}`
      ));
    }
  }
  return [applyExpectedProgression(character, floor)];
}

function describeWeapon(character) {
  const weapon = character.equipment?.weapon;
  const baseId = typeof weapon === "object" ? weapon.baseId : weapon;
  const base = ITEMS[baseId];
  const inscription = weapon?.inscription?.type === "trapSense" ? "*" : "";
  return `${baseId || "none"}${inscription}(${base?.atk || 0})`;
}

function createTrapEffectTotals() {
  return Object.fromEntries(TRAP_TYPES.map(type => [type, {
    count: 0,
    hpDamage: 0,
    mpDrain: 0
  }]));
}

// 深度想定レベルはマイルストーンごとに1上昇させる（B1=1、B5=2、…、B20=5）。
function getExpectedLevel(floor) {
  return 1 + Math.floor(floor / 5);
}

function applyExpectedProgression(character, floor) {
  const expectedLevel = getExpectedLevel(floor);
  const expectedHpGain = EXPECTED_HP_GAIN_BY_CLASS[character.class];
  if (expectedHpGain === undefined) {
    throw new Error(`missing expected HP gain: ${character.class}`);
  }
  character.level = expectedLevel;
  character.maxHp += expectedHpGain * (expectedLevel - 1);
  return character;
}

function getExpectedHpProfile(floor, className) {
  const character = createSoloCharacter(className);
  applyExpectedProgression(character, floor);
  return {
    level: character.level,
    maxHp: getCharMaxHp(character)
  };
}

function addTrapEffectTotals(target, source) {
  for (const type of TRAP_TYPES) {
    target[type].count += source[type].count;
    target[type].hpDamage += source[type].hpDamage;
    target[type].mpDrain += source[type].mpDrain;
  }
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
  const trapEffects = createTrapEffectTotals();
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
        const effect = resolveFloorTrapEffect({
          trap,
          floor,
          party,
          weakened: false,
          rng: createRng(`${runSeed}:trap-effect:${trap.id}`)
        });
        const typeTotals = trapEffects[trap.type];
        if (!typeTotals) throw new Error(`unexpected trap type: ${trap.type}`);
        typeTotals.count++;
        typeTotals.hpDamage += effect.partyDamage.reduce((sum, damage) => sum + damage, 0);
        typeTotals.mpDrain += effect.partyMpDrain.reduce((sum, drain) => sum + drain, 0);
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

  return { stepped, ambush, detected, trapEffects };
}

console.log("=== TRAP CHOKE DISTRIBUTION ===");
console.log("floor | traps | choke | actual | target | shortfall");

const detectionTotalsByFloor = new Map();
const trapTypeTotalsByFloor = new Map();
for (const floor of FLOORS) {
  let totalTraps = 0;
  let totalChoke = 0;
  let shortfalls = 0;
  const trapTypeTotals = Object.fromEntries(TRAP_TYPES.map(type => [type, 0]));
  const loadoutKey = (className, investmentId) => `${className}:${investmentId}`;
  const loadouts = new Map(CLASSES.flatMap(className => INVESTMENTS.map(investment => {
    const party = buildInvestmentParty(floor, investment, className);
    const expectedHp = getExpectedHpProfile(floor, className);
    return [loadoutKey(className, investment.id), {
      party,
      trapSense: getPartyMaxAffix(party, "trapSense"),
      weapon: describeWeapon(party[0]),
      expectedLevel: expectedHp.level,
      maxHp: expectedHp.maxHp
    }];
  })));
  const detectionTotals = new Map(CLASSES.flatMap(className => INVESTMENTS.map(investment => {
    const key = loadoutKey(className, investment.id);
    return [key, {
      className,
      investmentId: investment.id,
      trapSense: loadouts.get(key).trapSense,
      weapon: loadouts.get(key).weapon,
      expectedLevel: loadouts.get(key).expectedLevel,
      maxHp: loadouts.get(key).maxHp,
      stepped: 0,
      ambush: 0,
      detected: 0,
      trapEffects: createTrapEffectTotals()
    }];
  })));

  for (let i = 0; i < SAMPLES; i++) {
    const runSeed = `TRAP_SIM_${floor}_${i}`;
    const map = generateRunFloor({ runSeed, floor });
    const meta = map.trapMeta;
    totalTraps += meta.total;
    totalChoke += meta.choke;
    let generatedTrapTotal = 0;
    for (const cell of map.grid.flat()) {
      if (!cell.trap) continue;
      if (!(cell.trap.type in trapTypeTotals)) {
        throw new Error(`unexpected generated trap type: ${cell.trap.type}`);
      }
      trapTypeTotals[cell.trap.type]++;
      generatedTrapTotal++;
    }
    if (generatedTrapTotal !== meta.total) {
      throw new Error(`trapMeta total mismatch at B${floor}: ${generatedTrapTotal} !== ${meta.total}`);
    }
    if (meta.choke < meta.chokeTargeted) shortfalls++;

    const path = shortestPath(map.grid);
    for (const className of CLASSES) {
      for (const investment of INVESTMENTS) {
        const key = loadoutKey(className, investment.id);
        const result = detectionTotals.get(key);
        const loadout = loadouts.get(key);
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
        addTrapEffectTotals(result.trapEffects, scenario.trapEffects);
      }
    }
  }

  detectionTotalsByFloor.set(floor, detectionTotals);
  trapTypeTotalsByFloor.set(floor, trapTypeTotals);

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

console.log("\n=== TRAP TYPE DISTRIBUTION ===");
console.log("floor | biome            | declared trapSet      | actual cell.trap.type (count/share)                         | declared regular share | undeclared regular | pitfall policy");

for (const floor of FLOORS) {
  const biome = getBiomeForFloor(floor);
  const totals = trapTypeTotalsByFloor.get(floor);
  const totalTraps = TRAP_TYPES.reduce((sum, type) => sum + totals[type], 0);
  const regularTypes = TRAP_TYPES.filter(type => type !== "pitfall");
  const regularTotal = regularTypes.reduce((sum, type) => sum + totals[type], 0);
  const declaredRegularCount = biome.gimmicks.trapSet
    .filter(type => regularTypes.includes(type))
    .reduce((sum, type) => sum + totals[type], 0);
  const actualTypes = TRAP_TYPES.filter(type => totals[type] > 0);
  const missingDeclared = biome.gimmicks.trapSet.filter(type =>
    regularTypes.includes(type) && totals[type] === 0
  );
  if (missingDeclared.length > 0) {
    throw new Error(`declared trapSet type missing at B${floor}: ${missingDeclared.join(",")}`);
  }
  const undeclaredRegular = actualTypes.filter(type =>
    type !== "pitfall" && !biome.gimmicks.trapSet.includes(type)
  );
  const actualSummary = TRAP_TYPES.map(type =>
    `${type}:${totals[type]}/${((totals[type] / totalTraps) * 100).toFixed(1)}%`
  ).join(" ");
  console.log(
    `B${String(floor).padStart(2)}   | ` +
    `${biome.id.padEnd(16)} | ` +
    `${biome.gimmicks.trapSet.join("+").padEnd(21)} | ` +
    `${actualSummary.padEnd(59)} | ` +
    `${((declaredRegularCount / regularTotal) * 100).toFixed(1).padStart(7)}% | ` +
    `${(undeclaredRegular.join("+") || "-").padEnd(17)} | ` +
    `${floor <= 3 ? "B1-B3 only" : "none"}`
  );
}

console.log("actual = SAMPLES個の実生成 grid 全 cell.trap.type 集計。trapSet は regular trap の2倍重み対象、pitfall は浅層専用別枠。");

console.log("\n=== TRAP SURPRISE DETECTION ===");
console.log("floor | class   | investment | trapSense | weapon           | stepped | ambush | detected | ambush rate");

for (const floor of FLOORS) {
  const totals = detectionTotalsByFloor.get(floor);
  for (const className of CLASSES) {
    for (const investment of INVESTMENTS) {
      const result = totals.get(`${className}:${investment.id}`);
      const ambushRate = result.stepped > 0 ? (result.ambush / result.stepped) * 100 : 0;
      console.log(
        `B${String(floor).padStart(2)}   | ` +
        `${className.padEnd(7)} | ` +
        `${investment.label.padEnd(10)} | ` +
        `${String(result.trapSense).padStart(9)} | ` +
        `${result.weapon.padEnd(16)} | ` +
        `${String(result.stepped).padStart(7)} | ` +
        `${String(result.ambush).padStart(6)} | ` +
        `${String(result.detected).padStart(8)} | ` +
        `${ambushRate.toFixed(1).padStart(10)}%`
      );
    }
  }
}

console.log("\nstepped = stairs-up→stairs-down 最短経路上の床罠。");
console.log("ambush = 察知失敗で3択UIを経ず発動、detected = 察知成功で3択UI経由想定。");
console.log("trapSense は実生成装備を createSoloCharacter に装備し、getPartyMaxAffix で取得した値。");
console.log("全振りの weapon * は実生成装備へ executeTagInscription を通した主力武器。");
console.log("各歩行位置で detectAdjacentTraps を呼び、detectRolled の生涯1回制限も実装経路で適用。");

console.log("\n=== TRAP SURPRISE DAMAGE ===");
console.log("floor | biome            | trapSet                 | class   | investment | level | maxHP | ambush/run | HP/run | HP/maxHP | MP/run | damage n/hp | pitfall n/hp | mpDrain n/mp | alarm n");

function formatTrapType(result, type) {
  const totals = result.trapEffects[type];
  const countPerRun = totals.count / SAMPLES;
  if (type === "alarm") return countPerRun.toFixed(2);
  const impactPerRun = (type === "mpDrain" ? totals.mpDrain : totals.hpDamage) / SAMPLES;
  return `${countPerRun.toFixed(2)}/${impactPerRun.toFixed(2)}`;
}

for (const floor of FLOORS) {
  const biome = getBiomeForFloor(floor);
  const totals = detectionTotalsByFloor.get(floor);
  for (const className of CLASSES) {
    for (const investment of INVESTMENTS) {
      const result = totals.get(`${className}:${investment.id}`);
      const hpPerRun = TRAP_TYPES.reduce(
        (sum, type) => sum + result.trapEffects[type].hpDamage,
        0
      ) / SAMPLES;
      const mpPerRun = result.trapEffects.mpDrain.mpDrain / SAMPLES;
      const hpShare = result.maxHp > 0 ? (hpPerRun / result.maxHp) * 100 : 0;
      console.log(
        `B${String(floor).padStart(2)}   | ` +
        `${biome.id.padEnd(16)} | ` +
        `${biome.gimmicks.trapSet.join("+").padEnd(23)} | ` +
        `${className.padEnd(7)} | ` +
        `${investment.label.padEnd(10)} | ` +
        `${String(result.expectedLevel).padStart(5)} | ` +
        `${String(result.maxHp).padStart(5)} | ` +
        `${(result.ambush / SAMPLES).toFixed(2).padStart(10)} | ` +
        `${hpPerRun.toFixed(2).padStart(6)} | ` +
        `${hpShare.toFixed(1).padStart(7)}% | ` +
        `${mpPerRun.toFixed(2).padStart(6)} | ` +
        `${formatTrapType(result, "damage").padStart(11)} | ` +
        `${formatTrapType(result, "pitfall").padStart(12)} | ` +
        `${formatTrapType(result, "mpDrain").padStart(12)} | ` +
        `${formatTrapType(result, "alarm").padStart(7)}`
      );
    }
  }
}

console.log("想定level = 1 + floor / 5。想定HPは職業別level gain期待値（Fighter+8 / Thief+6 / Samurai+7）を加算し、基準装備込み getCharMaxHp で取得。");
console.log("HP/run は不意打ち時 resolveFloorTrapEffect の partyDamage 合計、HP/maxHP は想定最大HP比。MP/run は partyMpDrain、各型 n/値 は回数/型別被害。");
console.log("罠型・trapSet は generateRunFloor が生成した実マップから集計。回復・撤退・戦闘は不意打ち圧力の単独測定対象外。");
