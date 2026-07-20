import { EVENT_TYPES } from "../src/data.js";
import { getFloorTemplate } from "../src/data/floor_templates.js";
import { generateRunFloor } from "../src/run_map_generator.js";

// 行き止まりに置かれる宝箱の抽選レンジ。隠し部屋も 75% の確率で宝箱、
// 25% で石板を追加するため (map_generator.js の placeSecretRooms)、
// 総数の上限はテンプレの secretDoors.room の分だけ広がる。
const MIN_CHESTS = 8;
const MAX_CHESTS = 12;
const SAMPLE_FLOORS = [1, 8, 15, 22, 28];
const SEEDS_PER_FLOOR = 20;
const failures = [];
const observedCounts = new Set();

function countEvent(grid, eventType) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.event === eventType) count++;
    }
  }
  return count;
}

for (const floor of SAMPLE_FLOORS) {
  const secretRoomCount = getFloorTemplate(floor).gimmickDensity.secretDoors.room;

  for (let index = 0; index < SEEDS_PER_FLOOR; index++) {
    const runSeed = `CHEST-COUNT-${floor}-${index}`;
    const generated = generateRunFloor({ runSeed, floor });
    const chests = countEvent(generated.grid, EVENT_TYPES.CHEST);
    observedCounts.add(chests);

    const maxChests = MAX_CHESTS + secretRoomCount;
    if (chests < MIN_CHESTS || chests > maxChests) {
      failures.push(`${runSeed}: chest count ${chests} outside ${MIN_CHESTS}-${maxChests}`);
    }

    const springs = countEvent(generated.grid, EVENT_TYPES.SPRING);
    const tablets = countEvent(generated.grid, EVENT_TYPES.TABLET);
    const maxTablets = 2 + secretRoomCount;
    if (springs !== 2) failures.push(`${runSeed}: spring count ${springs} expected 2`);
    if (tablets < 2 || tablets > maxTablets) {
      failures.push(`${runSeed}: tablet count ${tablets} outside 2-${maxTablets}`);
    }

    const repeated = generateRunFloor({ runSeed, floor });
    const repeatedChests = countEvent(repeated.grid, EVENT_TYPES.CHEST);
    if (repeatedChests !== chests) {
      failures.push(`${runSeed}: chest count not reproducible (${chests} vs ${repeatedChests})`);
    }
  }
}

if (observedCounts.size < 2) {
  failures.push(`chest count is not randomized: only ${[...observedCounts].join(",")} observed`);
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(
  `[PASS] chest count: ${SAMPLE_FLOORS.length * SEEDS_PER_FLOOR} floors within `
    + `${MIN_CHESTS}-${MAX_CHESTS} (+secret rooms), `
    + `observed values ${[...observedCounts].sort((a, b) => a - b).join(",")}.`
);
