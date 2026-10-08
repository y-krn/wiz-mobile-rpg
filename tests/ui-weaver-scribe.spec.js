import { test, expect } from './fixtures/browser-health.js';

// The weaving house and the scriptorium (#2019): the weaver is cut out of her
// cocoon by winning the brood fight, the scribe is freed by draining his room,
// and their rebuilt rooms offer a rest or a mend, a wider floor plan or a copy.

// Opening a room arms the controls guard for a moment; a tap during it is
// ignored. Wait it out before pressing a button in the room.
async function waitForControls(page) {
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !state.transitioning && !isControlsGuarded();
  })).toBe(true);
}

// Stand in the special room of the given floor.
async function seedRoom(page, floor, { completed = {}, nodes = [], materials = {}, hp = null } = {}) {
  const room = await page.evaluate(async ({ floor, completed, nodes, materials, hp }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    initNewGame();
    state.feats.completed = completed;
    state.facilities = { nodes, orders: {}, grave: {} };
    state.party = [createStartingKitCharacter('vanguard')];
    if (hp !== null) state.party[0].hp = hp;
    state.inventory = [];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'weaver-scribe-ui-seed';
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
    return found;
  }, { floor, completed, nodes, materials, hp });
  await waitForControls(page);
  return room;
}

// Work that takes several turns can be interrupted by a monster. Put the run
// back into the room and press the button again until the room is spent.
async function pressUntilRoomSpent(page, buttonName) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByRole('button', { name: buttonName }).click();
    const spent = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { checkCellEvents } = await import('/src/movement.js');
      const { updateUI } = await import('/src/ui.js');
      const room = state.maps[state.floor - 1][state.y][state.x].specialRoom;
      if (room.used) return true;
      state.combatState = null;
      state.gameState = 'explore';
      state.party[0].hp = Math.max(1, state.party[0].hp);
      updateUI();
      checkCellEvents();
      return false;
    });
    if (spent) return;
    await waitForControls(page);
  }
  throw new Error(`the room was not spent by "${buttonName}"`);
}

const OPEN = {
  depth_5: { runNumber: 1 },
  depth_10: { runNumber: 1 },
  depth_15: { runNumber: 1 },
  depth_20: { runNumber: 1 },
  guardian_5: { runNumber: 1 },
  guardian_10: { runNumber: 1 },
  guardian_15: { runNumber: 1 },
  guardian_20: { runNumber: 1 },
  foreman_rescue: { runNumber: 1 },
  priest_rescue: { runNumber: 1 },
  weaver_rescue: { runNumber: 1 },
  scribe_rescue: { runNumber: 1 }
};

test('The weaver is cut out of her cocoon by winning the brood fight; fleeing leaves her there', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedRoom(page, 13);
  expect(room.kind).toBe('cocooned_weaver');
  await expect(page.locator('#submenu-title')).toContainText('繭の卵室');
  await expect(page.locator('#submenu-options')).toContainText('逃げても繭は残り、また挑める');
  await page.getByRole('button', { name: '繭を切る（強敵と戦う）' }).click();

  const fight = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      isBrood: state.combatState?.isBrood,
      used: state.maps[12][state.y][state.x].specialRoom.used,
      companions: state.currentRun.companions
    };
  });
  expect(fight).toEqual({ gameState: 'combat', isBrood: true, used: false, companions: [] });

  // Fleeing: the room is still there and offers the fight again.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    const { updateUI } = await import('/src/ui.js');
    state.combatState = null;
    state.gameState = 'explore';
    updateUI();
    checkCellEvents();
  });
  await waitForControls(page);
  await expect(page.getByRole('button', { name: '繭を切る（強敵と戦う）' })).toBeVisible();
  await page.getByRole('button', { name: '繭を切る（強敵と戦う）' }).click();

  // Winning: the rewards of the fight free her and she joins the run.
  const won = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { applyCombatRewards } = await import('/src/combat_logic/rewards.js');
    const { updateUI } = await import('/src/ui.js');
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    state.combatState.monsters.forEach(monster => { monster.hp = 0; });
    const logQueue = [];
    applyCombatRewards(state, state.combatState.monsters, logQueue);
    state.combatState = null;
    state.gameState = 'explore';
    updateUI();
    return {
      companions: state.currentRun.companions,
      used: state.maps[12][state.y][state.x].specialRoom.used,
      log: logQueue.map(entry => entry.msg),
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent),
      stakes: createRunStakesSummary().querySelector('.run-stakes-companion')?.textContent || ''
    };
  });
  expect(won.companions).toEqual(['weaver']);
  expect(won.used).toBe(true);
  expect(won.log).toContain('織り手が同行する。連れて歩いて地上へ出れば、街に織り場が開く。帰還の翼では連れて帰れない。');
  expect(won.log).toContain('卵室の荷を検める。');
  expect(won.hud[0]).toBe('同行：織り手生還で救出');
  expect(won.stakes).toBe('同行：織り手。生還すれば街へ連れ帰る。死ねば・断念すれば連れ帰れない。');
});

test('The scribe is freed by draining his room and both keepers open their facilities', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedRoom(page, 18, { completed: { foreman_rescue: { runNumber: 1 }, priest_rescue: { runNumber: 1 } } });
  expect(room.kind).toBe('stranded_scribe');
  await expect(page.locator('#submenu-title')).toContainText('水に沈んだ閲覧室');
  await pressUntilRoomSpent(page, /水門を回して水を抜く/);
  await expect(page.locator('#log-content')).toContainText('写本師が同行する。連れて歩いて地上へ出れば、街に写本室が開く。');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.currentRun.companions = ['weaver', 'scribe'];
    (await import('/src/result.js')).triggerRunResult('surface');
  });
  await expect(page.locator('.result-feat-row[data-feat-id="weaver_rescue"]')).toHaveText('達成織り手を連れ帰る報酬 織り場が開く');
  await expect(page.locator('.result-feat-row[data-feat-id="scribe_rescue"]')).toHaveText('達成写本師を連れ帰る報酬 写本室が開く');
  await page.locator('#btn-result-castle').click();
  const weaving = page.locator('#town-facilities [data-facility-id="weaving_house"]');
  const scriptorium = page.locator('#town-facilities [data-facility-id="scriptorium"]');
  await expect(weaving).toHaveAttribute('data-facility-open', 'true');
  await expect(weaving).toContainText('織り手がいる。まだ何も解放していない');
  await expect(scriptorium).toHaveAttribute('data-facility-open', 'true');

  await scriptorium.click();
  await waitForControls(page);
  await expect(page.locator('#submenu-title')).toContainText('写本室');
  await expect(page.locator('[data-facility-node-id="scribe_kit"]')).toContainText('写本師キット');
  await expect(page.locator('[data-facility-node-id="scribe_copy_desk"]')).toContainText('先に偉業「書庫の主を倒す」');
  await expect(page.locator('[data-facility-order-id="scribe_mana_potion"]')).toContainText('魔力草の仕込み（魔力草×2）');
});

test('The hammock restores HP once per run, or mends the armor instead', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  let room = await seedRoom(page, 13, { completed: OPEN, nodes: ['weaver_hammock'], hp: 10 });
  expect(room.kind).toBe('weaver_hammock');
  await expect(page.locator('#submenu-title')).toContainText('織り手の吊り寝床');
  await expect(page.locator('[data-hammock-mend]')).toHaveCount(0);
  const before = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxHp } = await import('/src/data.js');
    return { hp: state.party[0].hp, maxHp: getCharMaxHp(state.party[0]), steps: state.currentRun.steps };
  });
  await pressUntilRoomSpent(page, /吊り寝床で休む/);
  const rested = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { hp: state.party[0].hp, steps: state.currentRun.steps };
  });
  expect(rested.hp).toBe(before.hp + Math.ceil(before.maxHp * 0.3));
  expect(rested.steps - before.steps).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#log-content')).toContainText('吊り寝床で休んだ。');

  // With the mending bench, the armor can be patched instead.
  room = await seedRoom(page, 13, {
    completed: OPEN,
    nodes: ['weaver_hammock', 'weaver_mending'],
    materials: { '呪布': 3 }
  });
  expect(room.kind).toBe('weaver_hammock');
  await expect(page.locator('#submenu-options')).toContainText('どちらか一方');
  await expect(page.getByRole('button', { name: /吊り寝床で休む/ })).toBeDisabled();
  await page.locator('[data-hammock-mend]').click();
  const mended = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharDef, getCharEquipmentDef } = await import('/src/rules/character_stats.js');
    const hero = state.party[0];
    return {
      mend: hero.armorMend,
      gain: getCharDef(hero) - getCharEquipmentDef(hero),
      cloth: state.currentRun.materials['呪布'],
      used: state.maps[12][state.y][state.x].specialRoom.used
    };
  });
  expect(mended.mend.battles).toBe(3);
  expect(mended.gain).toBe(mended.mend.bonus);
  expect(mended.gain).toBeGreaterThan(0);
  expect(mended.cloth).toBe(1);
  expect(mended.used).toBe(true);
});

test('The scribe room shows the next floor too, or yields a fragment from the copy desk', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  let room = await seedRoom(page, 18, { completed: OPEN, nodes: ['scribe_waymark'] });
  expect(room.kind).toBe('scribe_reading_room');
  await expect(page.locator('#submenu-title')).toContainText('写本師の閲覧室');
  await expect(page.locator('[data-scribe-copy]')).toHaveCount(0);
  await page.getByRole('button', { name: /見取り図を読む/ }).click();
  const read = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const stairsShown = (grid, visited) => {
      let shown = false;
      grid.forEach((row, y) => row.forEach((cell, x) => {
        if (cell.type === 'stairs-down') shown = Boolean(visited[y][x]);
      }));
      return shown;
    };
    const here = stairsShown(state.maps[17], state.visitedMaps[17]);
    const nextGrid = ensureRunFloor(state, 19);
    return {
      here,
      next: stairsShown(nextGrid, state.visitedMaps[18]),
      room: state.maps[17][state.y][state.x].specialRoom
    };
  });
  expect(read.here).toBe(true);
  expect(read.next).toBe(true);
  expect(read.room.used).toBe(true);
  expect(read.room.vision).toBe(true);
  await expect(page.locator('#log-content')).toContainText('次の階の下り階段も書き留めた。');

  room = await seedRoom(page, 18, { completed: OPEN, nodes: ['scribe_waymark', 'scribe_copy_desk'] });
  expect(room.kind).toBe('scribe_reading_room');
  await expect(page.locator('#submenu-options')).toContainText('どちらか一方');
  await page.locator('[data-scribe-copy]').click();
  const copied = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const nextGrid = ensureRunFloor(state, 19);
    let nextShown = false;
    nextGrid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.type === 'stairs-down') nextShown = Boolean(state.visitedMaps[18][y][x]);
    }));
    return {
      fragments: state.currentRun.guideFragments,
      room: state.maps[17][state.y][state.x].specialRoom,
      nextShown
    };
  });
  expect(copied.fragments).toBe(1);
  expect(copied.room.used).toBe(true);
  expect(copied.nextShown).toBe(false);
  await expect(page.locator('#log-content')).toContainText('手引き書の断片を1枚手に入れた');
});

test('The stalker and scribe kits start with their supplies', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.feats.completed = { weaver_rescue: { runNumber: 1 }, scribe_rescue: { runNumber: 1 } };
    state.facilities = { nodes: ['weaver_kit', 'scribe_kit'], orders: {}, grave: {} };
    updateUI();
  });
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('.solo-starting-kit-option')).toHaveCount(6);
  await page.locator('[data-kit-id="stalker"]').click();
  const detail = page.locator('.solo-kit-detail');
  await expect(detail).toHaveAttribute('data-detail-kit-id', 'stalker');
  await expect(detail.locator('.solo-kit-items')).toContainText('静寂の香×2・鳴らし玉');
  await expect(detail.locator('.solo-kit-equipment')).not.toContainText('シールド');

  await page.locator('[data-kit-id="scribe"]').click();
  await expect(detail).toHaveAttribute('data-detail-kit-id', 'scribe');
  await expect(detail.locator('.solo-kit-items')).toContainText('魔力草×2');
  await page.locator('#btn-kit-confirm').click();
  await page.locator('#btn-departure-start').click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const started = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxMp } = await import('/src/data.js');
    const id = item => (typeof item === 'string' ? item : item?.baseId);
    const hero = state.party[0];
    return {
      kit: state.currentRun.startingKit,
      herbs: state.inventory.filter(item => id(item) === 'MANA_POTION').length,
      runes: hero.mediumState.socketedRunes.length,
      mpFull: hero.mp === getCharMaxMp(hero) && hero.mp > 1,
      shield: hero.equipment.shield
    };
  });
  expect(started).toEqual({ kit: 'scribe', herbs: 2, runes: 1, mpFull: true, shield: null });
});
