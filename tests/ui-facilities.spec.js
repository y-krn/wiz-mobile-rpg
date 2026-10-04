import { test, expect } from './fixtures/browser-health.js';

// Town facilities (#2009): the foreman is dug out on B3F, led home by a safe
// return, and opens the miner guild, which sells the miner kit.

async function seedForemanRoom(page) {
  return page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'facility-ui-seed';
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.startFloor = 1;
    state.currentRun.deepestFloor = 3;
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = 3;
    state._freshRunFloor = 3;
    const grid = ensureRunFloor(state, 3);
    state.map = grid;
    state.visitedMap = state.visitedMaps[2];
    let room = null;
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.specialRoom) room = { x, y, kind: cell.specialRoom.kind };
    }));
    state.x = room.x;
    state.y = room.y;
    state.gameState = 'explore';
    updateUI();
    checkCellEvents();
    return room;
  });
}

test('Town shows a silhouette until the foreman is home, then opens the miner guild', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    updateUI();
  });

  const slot = page.locator('#town-facilities [data-facility-id="miner_guild"]');
  await expect(slot).toHaveAttribute('data-facility-open', 'false');
  await expect(slot).toBeDisabled();
  await expect(slot).toContainText('？？？');
  await expect(slot).toContainText('崩れた坑道の3階目で、誰かが助けを待っている。');
  await expect(slot).not.toContainText('坑夫組合');
  await expect(page.locator('#town-feat-summary .feat-card[data-feat-id="foreman_rescue"]')).toContainText('未救出');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.feats.counters.foremanRescued = 1;
    state.feats.completed = { foreman_rescue: { runNumber: 1 } };
    state.metaMaterials = { '獣の牙': 5, '鉄片': 4 };
    updateUI();
  });
  await expect(slot).toHaveAttribute('data-facility-open', 'true');
  await expect(slot).toBeEnabled();
  await expect(slot).toContainText('坑夫組合');
  await expect(slot).toContainText('解放 0 / 1');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await slot.click();
  await expect(page.locator('#submenu-title')).toContainText('坑夫組合');
  const node = page.locator('[data-facility-node-id="miner_kit"]');
  await expect(node).toBeDisabled();
  await expect(node).toContainText('獣の牙 6（所持5）・鉄片 4（所持4）／素材不足');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.metaMaterials = { '獣の牙': 7, '鉄片': 5 };
    openSubmenu('facility_miner_guild', '坑夫組合 - 鉱夫頭の施設', true);
  });
  await expect(node).toBeEnabled();
  await node.click();
  await expect(node).toHaveAttribute('data-facility-node-bought', 'true');
  await expect(node).toContainText('坑夫キット（解放済み）');
  const afterPurchase = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { fang: state.metaMaterials['獣の牙'], iron: state.metaMaterials['鉄片'], nodes: state.facilities.nodes };
  });
  expect(afterPurchase).toEqual({ fang: 1, iron: 1, nodes: ['miner_kit'] });

  await page.locator('#btn-submenu-back').click();
  await expect(slot).toContainText('解放 1 / 1');

  // The bought kit joins the starting kits and carries its supplies into the run.
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('.solo-starting-kit-option')).toHaveCount(5);
  await page.locator('[data-kit-id="miner"]').click();
  const detail = page.locator('.solo-kit-detail');
  await expect(detail).toHaveAttribute('data-detail-kit-id', 'miner');
  await expect(detail.locator('.solo-kit-equipment')).toContainText('メイス');
  await expect(detail.locator('.solo-kit-equipment')).not.toContainText('シールド');
  await expect(detail.locator('.solo-kit-items')).toContainText('罠外しキット×2・探知石（毎回支給・倉庫には戻らない）');
  await page.locator('#btn-kit-confirm').click();
  await expect(page.locator('.solo-preparation-summary')).toContainText('持ち込み 3/20（出発クラフト 0品）');
  await page.locator('#btn-departure-start').click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const started = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const id = item => (typeof item === 'string' ? item : item?.baseId);
    return {
      kit: state.currentRun.startingKit,
      trapKits: state.inventory.filter(item => id(item) === 'TRAP_KIT').length,
      stones: state.inventory.filter(item => id(item) === 'TRAP_SENSE_STONE').length,
      craft: state.currentRun.departureCraftItems,
      shield: state.party[0].equipment.shield
    };
  });
  expect(started).toEqual({ kit: 'miner', trapKits: 2, stones: 1, craft: [], shield: null });
});

test('The foreman is dug out on B3F, shown as an escort, and rescued by a safe return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedForemanRoom(page);
  expect(room.kind).toBe('trapped_foreman');

  await expect(page.locator('#submenu-title')).toContainText('崩落した詰所');
  await expect(page.locator('#submenu-options')).toContainText('生還して初めて救出になり、死ねば連れ帰れない');
  await page.getByRole('button', { name: /岩を掘って助け出す/ }).click();

  // Digging may be interrupted by an encounter; finish it deterministically.
  const escort = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    if (state.currentRun.companion !== 'foreman') {
      state.combatState = null;
      state.gameState = 'explore';
      state.currentRun.companion = 'foreman';
      state.map[state.y][state.x].specialRoom.used = true;
    }
    updateUI();
    return {
      companion: state.currentRun.companion,
      used: state.map[state.y][state.x].specialRoom.used,
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent)
    };
  });
  expect(escort.companion).toBe('foreman');
  expect(escort.used).toBe(true);
  expect(escort.hud[0]).toBe('同行：鉱夫頭生還で救出');

  const stakes = await page.evaluate(async () => {
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    return createRunStakesSummary().querySelector('.run-stakes-companion')?.textContent || '';
  });
  expect(stakes).toBe('同行：鉱夫頭。生還すれば街へ連れ帰る。死ねば・断念すれば連れ帰れない。');

  await page.evaluate(async () => {
    (await import('/src/result.js')).triggerRunResult('milestone_portal');
  });
  const row = page.locator('.result-feat-row[data-feat-id="foreman_rescue"]');
  await expect(row).toHaveText('達成鉱夫頭を連れ帰る報酬 坑夫組合が開く');
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#town-facilities [data-facility-id="miner_guild"]')).toHaveAttribute('data-facility-open', 'true');
});

test('A foreman led into a death stays in the dungeon and waits on the next run', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedForemanRoom(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { closeSubmenu } = await import('/src/navigation.js');
    closeSubmenu();
    state.currentRun.companion = 'foreman';
    state.party[0].hp = 0;
    (await import('/src/result.js')).triggerRunResult('gameover');
  });

  const row = page.locator('.result-feat-row[data-feat-id="foreman_rescue"]');
  await expect(row).toHaveText('失敗鉱夫頭を連れ帰る鉱夫頭は迷宮に残された');
  await expect(row).toHaveClass(/failed/);
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#town-facilities [data-facility-id="miner_guild"]')).toHaveAttribute('data-facility-open', 'false');

  const nextRoom = await seedForemanRoom(page);
  expect(nextRoom.kind).toBe('trapped_foreman');
});
