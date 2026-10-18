import assert from 'node:assert/strict';

const makeDummyElement = () => ({
  style: { setProperty: () => {}, removeProperty: () => {} },
  dataset: {},
  append: () => {},
  appendChild: () => {},
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {}
  },
  setAttribute: () => {},
  getAttribute: () => '',
  querySelector: () => null,
  querySelectorAll: () => [],
  textContent: '',
  innerHTML: ''
});

global.document = {
  activeElement: null,
  getElementById: () => makeDummyElement(),
  createElement: () => makeDummyElement(),
  querySelector: () => null,
  querySelectorAll: () => []
};
global.window = {};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

const { state, createStartingKitCharacter } = await import('../../../src/state.js');
const { advanceRoamingTurn, executeEnterDungeon, getCurrentFloorExplorationSteps, handleMove } = await import('../../../src/movement.js');
const { ensureRunFloor } = await import('../../../src/state/run_floor_state.js');
const { RUBBLE_CLEAR_TURNS, getHeatDamage, isHeatActive } = await import('../../../src/rules/traversal_gimmicks.js');
const { getCharMaxHp } = await import('../../../src/data.js');
const { WATER_RISES_PER_DEPTH, getDeepWaterDamage } = await import('../../../src/systems/rising_water.js');
const { NOISE_STAGE_MAX, addNoise } = await import('../../../src/systems/dungeon_noise.js');
const { findHunterStep } = await import('../../../src/rules/round_trip.js');

// #1963: live exploration resolves biome traversal gimmicks in place.
global.setTimeout = callback => {
  callback();
  return 0;
};
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) if (predicate(grid[y][x])) return { x, y, cell: grid[y][x] };
  }
  return null;
}

// Stand on the open neighbor of (x, y) and face it.
function faceCell({ x, y, cell }) {
  const dir = cell.walls.findIndex(wall => !wall);
  state.x = x + DX[dir];
  state.y = y + DY[dir];
  state.prevX = state.x;
  state.prevY = state.y;
  state.dir = (dir + 2) % 4;
}

function quiet() {
  state.roamingMonsters = [];
  state.noiseEvents = [];
  state.gameState = 'explore';
  state.transitioning = false;
  state.encounterQuietSteps = 99;
}

const logText = () => state.logs.map(entry => (typeof entry === 'string' ? entry : entry.text)).join('\n');

state.party = [createStartingKitCharacter('vanguard')];
executeEnterDungeon(1);

// Rubble: the first push explains, the second digs for RUBBLE_CLEAR_TURNS turns.
{
  quiet();
  const rubble = findCell(state.map, cell => cell.obstacle?.kind === 'rubble');
  assert.ok(rubble, 'B1 has rubble');
  faceCell(rubble);
  const origin = { x: state.x, y: state.y };
  const stepsBefore = getCurrentFloorExplorationSteps();
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, origin, 'bumping rubble keeps the player in place');
  assert.equal(rubble.cell.obstacle.state, 'intact');
  assert.equal(rubble.cell.obstacle.discovered, true);
  assert.equal(getCurrentFloorExplorationSteps(), stepsBefore, 'a bump spends no turn');
  assert.match(logText(), /落盤で道が塞がっている/);

  // Any other action in between cancels the pending dig.
  handleMove('turn-left');
  handleMove('turn-right');
  quiet();
  handleMove('forward');
  assert.equal(rubble.cell.obstacle.state, 'intact', 'a non-consecutive push only explains again');

  const stepsBeforeDig = getCurrentFloorExplorationSteps();
  quiet();
  handleMove('forward');
  assert.equal(rubble.cell.obstacle.state, 'cleared', 'the second push in a row digs through');
  assert.equal(getCurrentFloorExplorationSteps() - stepsBeforeDig, RUBBLE_CLEAR_TURNS);
  assert.deepEqual({ x: state.x, y: state.y }, origin, 'digging does not move the player');
  quiet();
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, { x: rubble.x, y: rubble.y }, 'cleared rubble is walkable');
}

// Seal: bumping explains; stepping on the lever opens it.
{
  state.floor = 6;
  state._freshRunFloor = 6;
  const map = ensureRunFloor(state, 6);
  quiet();
  const gate = findCell(map, cell => cell.obstacle?.kind === 'seal');
  const lever = findCell(map, cell => cell.lever);
  assert.ok(gate && lever, 'B6 has a seal and a lever');
  faceCell(gate);
  const origin = { x: state.x, y: state.y };
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, origin, 'the seal blocks the step');
  assert.match(logText(), /石の封印扉/);

  faceCell(lever);
  quiet();
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, { x: lever.x, y: lever.y });
  assert.equal(lever.cell.lever.state, 'pulled');
  assert.equal(gate.cell.obstacle.state, 'open', 'the lever opens its seal');
  assert.match(logText(), /石扉の開く音/);

  faceCell(gate);
  quiet();
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, { x: gate.x, y: gate.y }, 'the opened seal is walkable');
}

function enterFloor(floor) {
  state.floor = floor;
  state._freshRunFloor = floor;
  return ensureRunFloor(state, floor);
}

// Crumbling ledge: crossing it once makes it fall behind the player.
{
  const map = enterFloor(11);
  quiet();
  const ledge = findCell(map, cell => cell.obstacle?.kind === 'crumble');
  assert.ok(ledge, 'B11 has a crumbling ledge');
  faceCell(ledge);
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, { x: ledge.x, y: ledge.y }, 'an intact ledge is walkable');
  const exitDir = ledge.cell.walls.findIndex((wall, dir) => !wall && dir !== (state.dir + 2) % 4);
  state.dir = exitDir;
  // The floor is random: a discovered trap past the ledge would stop the step at a confirmation prompt.
  map[ledge.y + DY[exitDir]][ledge.x + DX[exitDir]].trap = null;
  quiet();
  handleMove('forward');
  assert.equal(ledge.cell.obstacle.state, 'collapsed', 'the ledge falls once crossed');
  assert.match(logText(), /足場が崩れ落ちた/);
  state.dir = (exitDir + 2) % 4;
  const beside = { x: state.x, y: state.y };
  quiet();
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, beside, 'a fallen ledge blocks the way back');
}

// Flood: wading spends an extra exploration turn.
{
  const map = enterFloor(16);
  quiet();
  const water = findCell(map, cell => cell.hazard?.kind === 'flood');
  assert.ok(water, 'B16 has flooded cells');
  faceCell(water);
  const before = getCurrentFloorExplorationSteps();
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, { x: water.x, y: water.y });
  assert.equal(getCurrentFloorExplorationSteps() - before, 2, 'one step plus one wading turn');
  assert.equal(water.cell.hazard.discovered, true);
}

// Heat: a hot grate burns, a cool one does not.
{
  const map = enterFloor(21);
  const vent = findCell(map, cell => cell.hazard?.kind === 'heat');
  assert.ok(vent, 'B21 has heat grates');
  const hero = state.party[0];
  for (const wantHot of [false, true]) {
    quiet();
    faceCell(vent);
    // The step itself advances the turn; pick the floor turn so the arrival matches.
    let turn = 0;
    while (isHeatActive(vent.cell.hazard, turn + 1) !== wantHot) turn++;
    state.currentRun.floorSteps[String(state.floor)] = turn;
    hero.hp = getCharMaxHp(hero);
    hero.status = 'normal';
    handleMove('forward');
    assert.deepEqual({ x: state.x, y: state.y }, { x: vent.x, y: vent.y });
    const expected = wantHot ? getCharMaxHp(hero) - getHeatDamage(getCharMaxHp(hero)) : getCharMaxHp(hero);
    assert.equal(hero.hp, expected, `a ${wantHot ? 'hot' : 'cool'} grate ${wantHot ? 'burns' : 'is safe'}`);
  }
}

// Spinner: stepping on one turns the player to a different heading.
{
  const map = enterFloor(26);
  quiet();
  const spinner = findCell(map, cell => cell.hazard?.kind === 'spinner');
  assert.ok(spinner, 'B26 has a spinner');
  assert.equal(spinner.cell.hazard.discovered, false, 'spinners start hidden');
  faceCell(spinner);
  const facing = state.dir;
  handleMove('forward');
  assert.deepEqual({ x: state.x, y: state.y }, { x: spinner.x, y: spinner.y });
  assert.notEqual(state.dir, facing, 'the spinner turned the player');
  assert.equal(spinner.cell.hazard.discovered, true);
  assert.match(logText(), /足元の床が回転した/);
}

// Deep water drowns (#2142): a step can take the last HP and end the run.
{
  const map = enterFloor(16);
  quiet();
  const water = findCell(map, cell => cell.hazard?.kind === 'flood');
  water.cell.hazard.age = WATER_RISES_PER_DEPTH * 2;
  faceCell(water);
  const hero = state.party[0];
  hero.status = 'normal';
  hero.hp = getDeepWaterDamage(getCharMaxHp(hero));
  handleMove('forward');
  assert.equal(hero.hp, 0);
  assert.equal(hero.status, 'dead', 'deep water drowns');
  assert.match(logText(), /深みに足を取られ/);
  assert.notEqual(state.gameState, 'explore', 'a drowned party ends the run');
}

// Stacked noise in the mine (#2144): the strong enemy walks straight at the
// party one step on every action, and a flee still shakes it off.
{
  const map = enterFloor(2);
  quiet();
  state.party[0].status = 'normal';
  state.party[0].hp = getCharMaxHp(state.party[0]);
  const start = findCell(map, cell => cell.type === 'empty' && cell.walls.some(wall => !wall) && !cell.event && !cell.hazard && !cell.trap);
  state.x = start.x;
  state.y = start.y;
  const far = { x: 0, y: 0, d: -1 };
  map.forEach((row, y) => row.forEach((cell, x) => {
    const d = findHunterStep(map, { x, y }, { x: state.x, y: state.y }).distance;
    if (cell.type === 'empty' && Number.isFinite(d) && d > far.d) Object.assign(far, { x, y, d });
  }));
  assert.ok(far.d > 4, 'B2 has room to be chased across');
  const elite = { id: 'e', floor: 2, x: far.x, y: far.y, homeX: far.x, homeY: far.y, kind: 'elite', perception: 'sound' };
  state.roamingMonsters = [elite];
  for (let i = 0; i < NOISE_STAGE_MAX; i++) addNoise(state, state.x, state.y, 4, { source: 'dig' });
  const distance = () => findHunterStep(map, elite, { x: state.x, y: state.y }).distance;
  for (let turn = 1; turn <= 3; turn++) {
    advanceRoamingTurn(false);
    assert.equal(distance(), far.d - turn, 'one step closer on every action');
  }
  assert.match(logText(), /まっすぐこちらへ/);
  elite.fleeGraceTicks = 2;
  const held = distance();
  advanceRoamingTurn(false);
  assert.equal(distance(), held, 'after a flee it holds still');
  state.roamingMonsters = [];
  state.currentRun.noiseAlarm = null;
}

console.log('[PASS] Issue #1963 traversal gimmicks resolve through live exploration.');
