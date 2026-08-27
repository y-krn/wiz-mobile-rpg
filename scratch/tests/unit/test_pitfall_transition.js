import assert from 'node:assert/strict';

const makeDummyElement = () => ({
  style: { setProperty: () => {}, removeProperty: () => {} },
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

const { state, createSoloCharacter } = await import('../../../src/state.js');
const { executeEnterDungeon, handleMove } = await import('../../../src/movement.js');
const { handleTrapAction } = await import('../../../src/systems/traps.js');

const originalSetTimeout = global.setTimeout;
global.setTimeout = callback => {
  callback();
  return 0;
};

try {
  state.party = [createSoloCharacter('Thief')];
  executeEnterDungeon(1);

  let edge = null;
  for (let y = 1; y < state.map.length - 1 && !edge; y++) {
    for (let x = 1; x < state.map[y].length - 1 && !edge; x++) {
      for (let dir = 0; dir < 4; dir++) {
        if (!state.map[y][x].walls[dir] && !state.map[y][x].blockEnter?.[dir]) {
          edge = { x, y, dir };
          break;
        }
      }
    }
  }
  assert.ok(edge, 'a passable edge is required for pitfall transition coverage');

  const dx = [0, 1, 0, -1];
  const dy = [-1, 0, 1, 0];
  const trapX = edge.x + dx[edge.dir];
  const trapY = edge.y + dy[edge.dir];
  state.x = edge.x;
  state.y = edge.y;
  state.dir = edge.dir;
  state.map[trapY][trapX].trap = {
    id: 'unit_pitfall_lazy_floor',
    floorId: 'B1',
    position: { x: trapX, y: trapY },
    type: 'pitfall',
    state: 'discovered',
    difficulty: 30
  };

  assert.equal(state.maps[1], undefined, 'pitfall test starts before B2 generation');
  handleMove('forward');
  assert.equal(state.gameState, 'trap_encounter');
  handleTrapAction('force');

  assert.equal(state.floor, 2);
  assert.equal(state.gameState, 'explore');
  assert.equal(state.transitioning, false);
  assert.equal(state.activeTrapState, null);
  assert.equal(Boolean(state.maps[1]), true);
} finally {
  global.setTimeout = originalSetTimeout;
}

console.log('pitfall transition checks passed');
