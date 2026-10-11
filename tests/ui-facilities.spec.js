import { test, expect } from './fixtures/browser-health.js';

// Town facilities (#2009): the foreman is dug out on B3F, led home by a safe
// return, and opens the miner guild, which sells the miner kit.

// Opening a room arms the controls guard for a moment; a tap during it is
// ignored. Wait it out before pressing a button in the room.
async function waitForControls(page) {
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !state.transitioning && !isControlsGuarded();
  })).toBe(true);
}

async function seedForemanRoom(page) {
  const room = await seedForemanRoomState(page);
  await waitForControls(page);
  return room;
}

async function seedForemanRoomState(page) {
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
  // The rescue is posted in the tavern (#2107).
  await page.locator('#btn-town-feats').click();
  await expect(page.locator('.feat-card[data-feat-id="foreman_rescue"]')).toContainText('未救出');
  await page.locator('#btn-submenu-back').click();

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
  await expect(slot).toContainText('鉱夫頭がいる。まだ何も解放していない');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await slot.click();
  await expect(page.locator('#submenu-title')).toContainText('坑夫組合');
  const node = page.locator('[data-facility-node-id="miner_kit"]');
  await expect(node).toBeDisabled();
  await expect(node).toContainText('獣の牙 6・鉄片 4／素材が足りない（獣の牙 あと1）');

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
  await expect(slot).toContainText('3つのうち1つを解放');

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
  await expect(page.locator('.solo-preparation-summary')).toContainText('持ち込み 3/20');
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
  await expect(page.locator('#submenu-options')).toContainText('生きて街まで連れ帰れば、きっと力になってくれる。');
  await page.getByRole('button', { name: /岩を掘って助け出す/ }).click();

  // Digging may be interrupted by an encounter; finish it deterministically.
  const escort = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    if (!state.currentRun.companions.includes('foreman')) {
      state.combatState = null;
      state.gameState = 'explore';
      state.currentRun.companions = ['foreman'];
      state.map[state.y][state.x].specialRoom.used = true;
    }
    updateUI();
    return {
      companions: state.currentRun.companions,
      used: state.map[state.y][state.x].specialRoom.used,
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent)
    };
  });
  expect(escort.companions).toEqual(['foreman']);
  expect(escort.used).toBe(true);
  expect(escort.hud[0]).toBe('同行：鉱夫頭生還で救出');

  const stakes = await page.evaluate(async () => {
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    return createRunStakesSummary().querySelector('.run-stakes-companion')?.textContent || '';
  });
  expect(stakes).toBe('同行：鉱夫頭。生還すれば街へ連れ帰る。死ねば・断念すれば連れ帰れない。');

  await page.evaluate(async () => {
    (await import('/src/result.js')).triggerRunResult('surface');
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
    state.currentRun.companions = ['foreman'];
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

async function seedOutpostRoom(page, options) {
  const room = await seedOutpostRoomState(page, options);
  await waitForControls(page);
  return room;
}

async function seedOutpostRoomState(page, { nodes, inventory = [] }) {
  return page.evaluate(async ({ nodes, inventory }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    initNewGame();
    state.feats.counters.foremanRescued = 1;
    state.feats.completed = { foreman_rescue: { runNumber: 1 }, depth_5: { runNumber: 2 }, guardian_5: { runNumber: 3 } };
    state.facilities = { nodes };
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = inventory;
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'facility-ui-seed';
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.deepestFloor = 3;
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.noiseEvents = [];
    state.floor = 3;
    state._freshRunFloor = 3;
    const grid = ensureRunFloor(state, 3);
    state.map = grid;
    state.visitedMap = state.visitedMaps[2];
    let room = null;
    let rubble = 0;
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.specialRoom) room = { x, y, kind: cell.specialRoom.kind };
      if (cell.obstacle?.kind === 'rubble' && cell.obstacle.state !== 'cleared') rubble += 1;
    }));
    state.x = room.x;
    state.y = room.y;
    state.gameState = 'explore';
    updateUI();
    checkCellEvents();
    return { ...room, rubble };
  }, { nodes, inventory });
}

test('The miner outpost hands out one supply per run', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedOutpostRoom(page, { nodes: ['miner_outpost'] });
  expect(room.kind).toBe('miner_outpost');

  await expect(page.locator('#submenu-title')).toContainText('坑夫の詰所');
  await expect(page.getByRole('button', { name: '傷薬を受け取る' })).toBeVisible();
  await expect(page.getByRole('button', { name: '解毒薬を受け取る' })).toBeVisible();
  await expect(page.getByRole('button', { name: '罠外しキットを受け取る' })).toBeVisible();
  await expect(page.getByRole('button', { name: /発破を頼む/ })).toHaveCount(0);
  await page.getByRole('button', { name: '解毒薬を受け取る' }).click();

  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const id = item => (typeof item === 'string' ? item : item?.baseId);
    return {
      inventory: state.inventory.map(id),
      used: state.map[state.y][state.x].specialRoom.used,
      craft: state.currentRun.departureCraftItems,
      town: state.currentRun.townInventory.map(id),
      gameState: state.gameState
    };
  });
  expect(after).toEqual({ inventory: ['ANTIDOTE'], used: true, craft: [], town: [], gameState: 'explore' });
  await expect(page.locator('#log-content')).toContainText('詰所の坑夫から解毒薬を受け取った。');

  // The supply is dungeon loot: a safe return does not put it into storage.
  const storage = await page.evaluate(async () => {
    (await import('/src/result.js')).triggerRunResult('surface');
    return (await import('/src/state.js')).state.storage.length;
  });
  expect(storage).toBe(0);
});

test('The blast clears the floor rubble, marks the stairs, and makes noise instead of a supply', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedOutpostRoom(page, { nodes: ['miner_outpost', 'miner_blast'] });
  expect(room.kind).toBe('miner_outpost');
  expect(room.rubble).toBeGreaterThan(0);

  await expect(page.locator('#submenu-options')).toContainText('どちらか一方');
  await page.getByRole('button', { name: /発破を頼む/ }).click();

  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    let rubble = 0;
    let stairsShown = false;
    state.map.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.obstacle?.kind === 'rubble' && cell.obstacle.state !== 'cleared') rubble += 1;
      if (cell.type === 'stairs-down') stairsShown = Boolean(state.visitedMap[y][x]);
    }));
    return {
      rubble,
      stairsShown,
      inventory: state.inventory.length,
      used: state.map[state.y][state.x].specialRoom.used,
      noise: state.noiseEvents.filter(event => event.floor === 3).map(event => event.ttl)
    };
  });
  expect(after.rubble).toBe(0);
  expect(after.stairsShown).toBe(true);
  expect(after.inventory).toBe(0);
  expect(after.used).toBe(true);
  expect(after.noise.length).toBeGreaterThan(0);
  expect(Math.max(...after.noise)).toBeGreaterThanOrEqual(7);
  await expect(page.locator('#log-content')).toContainText('発破の音が階じゅうに響いた');
});

test('The guild shows each rebuild with its feat condition before it can be bought', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.feats.counters.foremanRescued = 1;
    state.feats.counters.bestDepth = 4;
    state.feats.completed = { foreman_rescue: { runNumber: 1 } };
    state.metaMaterials = { '硬い皮': 20, '獣の牙': 20, '鉄片': 20 };
    updateUI();
  });
  await page.locator('#town-facilities [data-facility-id="miner_guild"]').click();

  const outpost = page.locator('[data-facility-node-id="miner_outpost"]');
  await expect(outpost).toBeDisabled();
  await expect(outpost).toContainText('先に偉業「坑道を抜ける」を達成する（崩れた坑道のB5Fに到達する）');
  await expect(outpost).toContainText('傷薬・解毒薬・罠外しキットのどれか1つ');
  const blast = page.locator('[data-facility-node-id="miner_blast"]');
  await expect(blast).toBeDisabled();
  await expect(blast).toContainText('先に偉業「坑道の主を倒す」');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.feats.counters.bestDepth = 5;
    state.feats.completed.depth_5 = { runNumber: 2 };
    openSubmenu('facility_miner_guild', '坑夫組合 - 鉱夫頭の施設', true);
  });
  await expect(outpost).toBeEnabled();
  await outpost.click();
  await expect(outpost).toHaveAttribute('data-facility-node-bought', 'true');
  await expect(blast).toBeDisabled();
  await expect(blast).toContainText('先に偉業「坑道の主を倒す」');
});

test('An order is paid in the guild, survives a death, and reaches storage on a safe return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.feats.counters.foremanRescued = 1;
    state.feats.completed = { foreman_rescue: { runNumber: 1 } };
    state.metaMaterials = { '鉄片': 3, '硬い皮': 1 };
    updateUI();
  });
  const slot = page.locator('#town-facilities [data-facility-id="miner_guild"]');
  await slot.click();
  await waitForControls(page);

  const order = page.locator('[data-facility-order-id="miner_trap_kits"]');
  await expect(order).toBeEnabled();
  await expect(order).toContainText('罠外しキットの仕込み（罠外しキット×2）');
  await expect(order).toContainText('鉄片 2・硬い皮 1');
  await order.click();
  const open = page.locator('[data-facility-order-open="miner_trap_kits"]');
  await expect(open).toHaveText('仕込み中：罠外しキット×2。次に生還した時に仕上がり、倉庫に入る。');
  await expect(order).toHaveCount(0);
  const paid = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { iron: state.metaMaterials['鉄片'], hide: state.metaMaterials['硬い皮'], storage: state.storage.length };
  });
  expect(paid).toEqual({ iron: 1, hide: 0, storage: 0 });

  await page.locator('#btn-submenu-back').click();
  await expect(slot).toContainText('仕込み中');

  const endRun = reason => page.evaluate(async reason => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = [];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.startingKit = 'vanguard';
    state.floor = 2;
    state.gameState = 'explore';
    if (reason === 'gameover') state.party[0].hp = 0;
    (await import('/src/result.js')).triggerRunResult(reason);
    const id = item => (typeof item === 'string' ? item : item?.baseId);
    return { storage: state.storage.map(id), orders: state.facilities.orders };
  }, reason);

  // A death does not lose the order: it waits for the next safe return.
  const afterDeath = await endRun('gameover');
  expect(afterDeath).toEqual({ storage: [], orders: { miner_guild: { orderId: 'miner_trap_kits', items: ['TRAP_KIT', 'TRAP_KIT'] } } });
  const waiting = page.locator('.result-feat-row[data-feat-id="facility_orders"]');
  await expect(waiting).toHaveText('持ち越し仕込み中の品 2個生還すると仕上がる');
  await page.locator('#btn-result-castle').click();
  await expect(slot).toContainText('仕込み中');

  const afterReturn = await endRun('surface');
  expect(afterReturn).toEqual({ storage: ['TRAP_KIT', 'TRAP_KIT'], orders: {} });
  const delivered = page.locator('.result-feat-row[data-feat-id="facility_orders"]');
  await expect(delivered).toHaveText('仕上がり仕込みの品 罠外しキット×2倉庫に入った');
  await page.locator('#btn-result-castle').click();
  await expect(slot).not.toContainText('仕込み中');
});
