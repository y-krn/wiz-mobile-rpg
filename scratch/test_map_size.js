import { MAP_HEIGHT, MAP_WIDTH, START_X, START_Y } from "../src/constants/map.js";
import { getFloorTemplate } from "../src/data/floor_templates.js";
import { generateRunFloor } from "../src/run_map_generator.js";

const EXPECTED_TEMPLATE_SIZES = Object.freeze({
  shallow: 24,
  middle: 27,
  deep: 30
});
const SAMPLE_FLOORS = [1, 5, 10, 11, 15, 20, 21, 25, 30];
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(MAP_WIDTH === 30, `MAP_WIDTH expected 30 but got ${MAP_WIDTH}`);
check(MAP_HEIGHT === 30, `MAP_HEIGHT expected 30 but got ${MAP_HEIGHT}`);
check(
  START_X >= 1 && START_X <= MAP_WIDTH - 2,
  `START_X out of bounds: ${START_X}`
);
check(
  START_Y >= 1 && START_Y <= MAP_HEIGHT - 2,
  `START_Y out of bounds: ${START_Y}`
);

for (const floor of SAMPLE_FLOORS) {
  const template = getFloorTemplate(floor);
  const expected = EXPECTED_TEMPLATE_SIZES[template.id];
  check(
    template.size.width === expected && template.size.height === expected,
    `floor ${floor} (${template.id}) size expected ${expected}x${expected} `
      + `but got ${template.size.width}x${template.size.height}`
  );

  const generated = generateRunFloor({ runSeed: `MAP-SIZE-${floor}`, floor });
  const grid = generated.grid;
  check(
    grid.length === expected,
    `floor ${floor} generated height expected ${expected} but got ${grid.length}`
  );
  check(
    grid.every(row => row.length === expected),
    `floor ${floor} generated width is not uniformly ${expected}`
  );
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] map size: ${SAMPLE_FLOORS.length} floors match template sizes 24/27/30.`);
