import { test, expect } from './fixtures/browser-health.js';

// Keeper rooms, rebuilt rooms and town facilities after the 2026-10 screen
// audit (#2036): the menu text names the choice, numbers sit on the buttons,
// and a facility's cost line states the one thing in the way.

const RESCUE_CLOSING = '生きて街まで連れ帰れば、きっと力になってくれる。';
const ALL_KEEPERS = {
  foreman_rescue: { runNumber: 1 },
  priest_rescue: { runNumber: 1 },
  weaver_rescue: { runNumber: 1 },
  scribe_rescue: { runNumber: 1 },
  smith_rescue: { runNumber: 1 },
  chamberlain_rescue: { runNumber: 1 },
};

async function waitForControls(page) {
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !state.transitioning && !isControlsGuarded();
  })).toBe(true);
}

// Stand in the special room of the given floor and return its menu text.
async function openRoom(page, floor, { completed = {}, nodes = [], materials = {} } = {}) {
  const kind = await page.evaluate(async ({ floor, completed, nodes, materials }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    initNewGame();
    state.feats.completed = completed;
    state.facilities = { nodes, orders: {}, grave: {} };
    state.party = [createStartingKitCharacter('vanguard')];
    state.party[0].hp = 20;
    state.inventory = [];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'room-wording-2036';
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.deepestFloor = floor;
    state.currentRun.materials = { ...materials };
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.noiseEvents = [];
    state.floor = floor;
    state._freshRunFloor = floor;
    const grid = ensureRunFloor(state, floor);
    state.map = grid;
    state.visitedMap = state.visitedMaps[floor - 1];
    let found = null;
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.specialRoom) found = { x, y, kind: cell.specialRoom.kind };
    }));
    state.x = found.x;
    state.y = found.y;
    state.gameState = 'explore';
    updateUI();
    checkCellEvents();
    return found.kind;
  }, { floor, completed, nodes, materials });
  await waitForControls(page);
  const description = (await page.locator('#submenu-options .submenu-description').allTextContents()).join('');
  const buttons = await page.locator('#submenu-options button').allTextContents();
  return { kind, description, buttons };
}

test('Keeper rooms end on one short line and keep their numbers on the button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const expected = {
    3: ['trapped_foreman', /^岩を掘って助け出す（3手番・物音）$/],
    8: ['sealed_priest', /^血を捧げて封印を解く（HP\d+）$/],
    13: ['cocooned_weaver', /^繭を切る（強敵と戦う）$/],
    18: ['stranded_scribe', /^水門を回して水を抜く（5手番）$/],
    23: ['cold_forge', /^素材をくべて火を入れる（素材4個）$/],
    28: ['mirror_captive', /^鏡に生気を与える（HP\d+）$/],
  };
  for (const [floor, [kind, action]] of Object.entries(expected)) {
    const room = await openRoom(page, Number(floor), { materials: { '鉄片': 9 } });
    expect(room.kind, `B${floor}F`).toBe(kind);
    expect(room.description, `B${floor}F`).toContain(RESCUE_CLOSING);
    expect(room.description, `B${floor}F`).not.toMatch(/\d|所持素材|エリート級|戦いには加わらない/);
    expect(room.buttons[0], `B${floor}F`).toMatch(action);
  }
});

test('Rebuilt rooms name the choice in words and price it on the buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const hammock = await openRoom(page, 13, {
    completed: ALL_KEEPERS,
    nodes: ['weaver_hammock', 'weaver_mending'],
    materials: { '呪布': 3 },
  });
  expect(hammock.kind).toBe('weaver_hammock');
  expect(hammock.description).toBe('ひと休みするか、防具を繕ってもらうか、どちらか一方。使えるのは、この潜行で一度きり。');
  expect(hammock.buttons[0]).toMatch(/^吊り寝床で休む（4手番・HP\+\d+）$/);
  expect(hammock.buttons[1]).toMatch(/^防具を繕う（素材2個・3戦のあいだ防御力\+\d+）$/);

  const forge = await openRoom(page, 23, {
    completed: ALL_KEEPERS,
    nodes: ['smith_forge', 'smith_reforge'],
    materials: { '鉄片': 1 },
  });
  expect(forge.kind).toBe('smith_forge');
  expect(forge.description).toContain('武器を鍛え直すか、打ち直すか、どちらか一方。');
  // What is carried is mentioned only because it falls short.
  expect(forge.description).toContain('くべる素材が足りない（手持ち1個）。');
  expect(forge.description).not.toContain('所持素材');
  expect(forge.buttons[0]).toMatch(/^武器を鍛え直す（素材\d+個・5戦のあいだ攻撃力\+\d+）$/);

  const outpost = await openRoom(page, 3, { completed: ALL_KEEPERS, nodes: ['miner_outpost'] });
  expect(outpost.kind).toBe('miner_outpost');
  expect(outpost.description).toBe('補給を1つ分けてくれる。応じてくれるのは、この潜行で一度きり。');
});

test('A facility cost line states the cost and the one thing in the way', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async ({ completed }) => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { openSubmenu } = await import('/src/navigation.js');
    initNewGame();
    state.feats.completed = completed;
    state.facilities = { nodes: [], orders: {}, grave: {} };
    state.metaMaterials = { '獣の牙': 5, '鉄片': 9, '硬い皮': 9 };
    state.gameState = 'town';
    updateUI();
    openSubmenu('facility_miner_guild', '坑夫組合 - 鉱夫頭の施設');
  }, { completed: { foreman_rescue: { runNumber: 1 } } });

  const cost = id => page.locator(`[data-facility-node-id="${id}"]`);
  await expect(cost('miner_kit')).toContainText('獣の牙 6・鉄片 4／素材が足りない（獣の牙 あと1）');
  await expect(cost('miner_outpost')).toContainText('硬い皮 6・獣の牙 4／先に偉業「坑道を抜ける」を達成する（B5Fに到達する）');
  await expect(cost('miner_outpost')).toContainText('崩れた坑道の3階目に、坑夫の詰所ができる。');
  await expect(cost('miner_blast')).toContainText('先に偉業「坑道の主を倒す」を達成する');
  const text = await page.locator('#submenu-options').textContent();
  expect(text).not.toMatch(/所持\d|条件：|特別部屋/);

  // The town list says who is there and how much is in place.
  await page.evaluate(async () => {
    const { closeSubmenu } = await import('/src/navigation.js');
    closeSubmenu();
  });
  await expect(page.locator('[data-facility-id="miner_guild"]')).toContainText('鉱夫頭がいる。まだ何も解放していない');
});
