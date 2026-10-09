import { test, expect } from './fixtures/browser-health.js';

// The chapel (#2018): the priest is freed on B8F with blood and led home, the
// chapel altar takes an offering, and the grave returns part of a death's loss.

// Opening a room arms the controls guard for a moment; a tap during it is
// ignored. Wait it out before pressing a button in the room.
async function waitForControls(page) {
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !state.transitioning && !isControlsGuarded();
  })).toBe(true);
}

// Stand in the special room of B8F. `keep` carries the town state of an
// earlier run in the same page (feats, facilities, materials) into the new one.
async function seedCatacombRoom(page, { completed = {}, nodes = [], companions = [], materials = {}, keep = false } = {}) {
  const room = await page.evaluate(async ({ completed, nodes, companions, materials, keep }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    if (!keep) {
      initNewGame();
      state.feats.completed = completed;
      state.facilities = { nodes, orders: {}, grave: {} };
    }
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = [];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'chapel-ui-seed';
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.deepestFloor = 8;
    state.currentRun.companions = companions;
    state.currentRun.materials = { ...materials };
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.noiseEvents = [];
    state.floor = 8;
    state._freshRunFloor = 8;
    const grid = ensureRunFloor(state, 8);
    state.map = grid;
    state.visitedMap = state.visitedMaps[7];
    let found = null;
    grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.specialRoom) found = { x, y, kind: cell.specialRoom.kind };
    }));
    state.x = found.x;
    state.y = found.y;
    state.gameState = 'explore';
    updateUI();
    checkCellEvents();
    return { ...found, hp: state.party[0].hp };
  }, { completed, nodes, companions, materials, keep });
  await waitForControls(page);
  return room;
}

// Feats already achieved, so the runs below settle no feat reward of their own.
const RESCUED = {
  depth_5: { runNumber: 1 },
  foreman_rescue: { runNumber: 1 },
  priest_rescue: { runNumber: 2 },
  depth_10: { runNumber: 3 },
  guardian_10: { runNumber: 4 }
};

test('The priest is freed with blood on B8F and led home together with the foreman', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedCatacombRoom(page, { companions: ['foreman'] });
  expect(room.kind).toBe('sealed_priest');

  await expect(page.locator('#submenu-title')).toContainText('封じられた祭壇');
  await expect(page.locator('#submenu-options')).toContainText('封印は血でしか解けない');
  await page.getByRole('button', { name: /血を捧げて封印を解く/ }).click();

  const escort = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxHp } = await import('/src/data.js');
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    return {
      companions: state.currentRun.companions,
      hp: state.party[0].hp,
      cost: Math.ceil(getCharMaxHp(state.party[0]) * 0.25),
      used: state.map[state.y][state.x].specialRoom.used,
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent),
      stakes: createRunStakesSummary().querySelector('.run-stakes-companion')?.textContent || ''
    };
  });
  expect(escort.companions).toEqual(['foreman', 'priest']);
  expect(escort.hp).toBe(room.hp - escort.cost);
  expect(escort.used).toBe(true);
  expect(escort.hud[0]).toBe('同行：鉱夫頭・司祭生還で救出');
  expect(escort.stakes).toBe('同行：鉱夫頭・司祭。生還すれば街へ連れ帰る。死ねば・断念すれば連れ帰れない。');
  await expect(page.locator('#log-content')).toContainText('司祭が同行する。連れて歩いて地上へ出れば、街に礼拝堂が開く。');

  await page.evaluate(async () => {
    (await import('/src/result.js')).triggerRunResult('surface');
  });
  await expect(page.locator('.result-feat-row[data-feat-id="foreman_rescue"]')).toHaveText('達成鉱夫頭を連れ帰る報酬 坑夫組合が開く');
  await expect(page.locator('.result-feat-row[data-feat-id="priest_rescue"]')).toHaveText('達成司祭を連れ帰る報酬 礼拝堂が開く');
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#town-facilities [data-facility-id="miner_guild"]')).toHaveAttribute('data-facility-open', 'true');
  const chapel = page.locator('#town-facilities [data-facility-id="chapel"]');
  await expect(chapel).toHaveAttribute('data-facility-open', 'true');
  await expect(chapel).toContainText('礼拝堂');
  await expect(chapel).toContainText('司祭がいる。まだ何も解放していない');
});

test('The town shows only the next person to look for, and the chapel lists its rebuilds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    updateUI();
  });
  const slots = page.locator('#town-facilities [data-facility-id]');
  await expect(slots).toHaveCount(1);
  await expect(slots.first()).toHaveAttribute('data-facility-id', 'miner_guild');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.feats.completed = { foreman_rescue: { runNumber: 1 } };
    updateUI();
  });
  await expect(slots).toHaveCount(2);
  const chapel = page.locator('#town-facilities [data-facility-id="chapel"]');
  await expect(chapel).toBeDisabled();
  await expect(chapel).toContainText('？？？');
  await expect(chapel).toContainText('忘れられた地下墓地の3階目で、祈りの声が封じられている。');
  await expect(page.locator('#town-feat-summary .feat-card[data-feat-id="priest_rescue"]')).toContainText('未救出');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.feats.completed = { foreman_rescue: { runNumber: 1 }, priest_rescue: { runNumber: 2 } };
    state.metaMaterials = { '骨片': 8, '霊粉': 10, '呪布': 4, '黒角': 2 };
    updateUI();
  });
  await expect(chapel).toBeEnabled();
  await chapel.click();
  await waitForControls(page);
  await expect(page.locator('#submenu-title')).toContainText('礼拝堂');
  const offering = page.locator('[data-facility-node-id="chapel_offering"]');
  await expect(offering).toBeDisabled();
  await expect(offering).toContainText('先に偉業「地下墓地の底へ」');
  const grave = page.locator('[data-facility-node-id="chapel_grave"]');
  await expect(grave).toBeDisabled();
  await expect(grave).toContainText('先に偉業「地下墓地の主を倒す」');
  await expect(page.locator('[data-facility-order-id="chapel_greater_heal"]')).toContainText('上薬の仕込み（上薬×2）');

  // The kit is bought and joins the starting kits with its holy water.
  const kit = page.locator('[data-facility-node-id="chapel_kit"]');
  await expect(kit).toBeEnabled();
  await kit.click();
  await expect(kit).toHaveAttribute('data-facility-node-bought', 'true');
  await page.locator('#btn-submenu-back').click();
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('.solo-starting-kit-option')).toHaveCount(5);
  await page.locator('[data-kit-id="pilgrim"]').click();
  const detail = page.locator('.solo-kit-detail');
  await expect(detail).toHaveAttribute('data-detail-kit-id', 'pilgrim');
  await expect(detail.locator('.solo-kit-items')).toContainText('祝福の聖水');
  await page.locator('#btn-kit-confirm').click();
  await page.locator('#btn-departure-start').click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const started = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ITEMS } = await import('/src/data/items.js');
    const id = item => (typeof item === 'string' ? item : item?.baseId);
    const equipment = state.party[0].equipment;
    return {
      kit: state.currentRun.startingKit,
      water: state.inventory.filter(item => id(item) === 'HOLY_WATER').length,
      shieldType: ITEMS[id(equipment.shield)]?.guardProfile,
      craft: state.currentRun.departureCraftItems
    };
  });
  expect(started).toEqual({ kit: 'pilgrim', water: 1, shieldType: 'arcane', craft: [] });
});

test('An offering at the chapel altar reaches the town although the run dies', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedCatacombRoom(page, {
    completed: RESCUED,
    nodes: ['chapel_offering'],
    materials: { '鉄片': 6, '骨片': 10 }
  });
  expect(room.kind).toBe('chapel_altar');

  await expect(page.locator('#submenu-title')).toContainText('礼拝堂の祭壇');
  await expect(page.getByRole('button', { name: /浄めを願う/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /血の祝福を受ける/ })).toBeVisible();
  await expect(page.locator('[data-chapel-grave]')).toHaveCount(0);
  await expect(page.locator('[data-offering-material="骨片"]')).toHaveText('献灯：骨片 6個を街へ送る');
  await page.locator('[data-offering-material="鉄片"]').click();

  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    return {
      materials: state.currentRun.materials,
      offered: state.currentRun.offeredMaterials,
      used: state.map[state.y][state.x].specialRoom.used,
      stakes: createRunStakesSummary().querySelector('.run-stakes-offered')?.textContent || ''
    };
  });
  expect(after).toEqual({
    materials: { '骨片': 10 },
    offered: { '鉄片': 6 },
    used: true,
    stakes: '献灯で送った素材 6個は確定。死んでも街に届く。'
  });
  await expect(page.locator('#log-content')).toContainText('献灯台に鉄片を6個供えた。');

  const town = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.party[0].hp = 0;
    (await import('/src/result.js')).triggerRunResult('gameover');
    return { iron: state.metaMaterials['鉄片'], bone: state.metaMaterials['骨片'], grave: state.facilities.grave };
  });
  expect(town).toEqual({ iron: 6, bone: 3, grave: {} });
});

test('The catacomb altar lifts a known curse and keeps the better piece (#2063)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedCatacombRoom(page, { completed: RESCUED, materials: { '骨片': 6 } });
  // Wear a cursed find the adventurer already knows about, then step on the altar again.
  const worn = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { generateRandomEquipment } = await import('/src/systems/equipment_generation.js');
    const { closeSubmenu } = await import('/src/navigation.js');
    const { checkCellEvents } = await import('/src/movement.js');
    // Half the catacomb's finds are cursed; take the first cursed armour.
    let piece = null;
    for (let seed = 1; !piece?.curseEffectId; seed++) {
      let a = seed;
      const rng = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
      piece = generateRandomEquipment(8, { rng, forceBaseId: 'LEATHER_ARMOR' });
    }
    piece.identified = true;
    state.party[0].equipment.armor = piece;
    closeSubmenu();
    checkCellEvents();
    return { rarity: piece.rarity, curse: piece.curseEffectId };
  });
  expect(worn.curse).not.toBeNull();
  expect(worn.rarity).not.toBe('magic');
  const lift = page.getByRole('button', { name: /の呪いを解く（素材4個）/ });
  await expect(lift).toBeVisible();
  // A freshly opened menu ignores taps for a moment (controls guard), so retry.
  await expect(async () => {
    await lift.click({ timeout: 1000 });
    await expect(page.locator('#log-content')).toContainText('から呪いが抜けた。', { timeout: 1000 });
  }).toPass();
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const armor = state.party[0].equipment.armor;
    return { curse: armor.curseEffectId, rarity: armor.rarity, used: state.map[state.y][state.x].specialRoom.used, bone: state.currentRun.materials['骨片'] };
  });
  expect(after).toEqual({ curse: null, rarity: worn.rarity, used: true, bone: 2 });
});

test('The grave keeps part of a death and returns it at the chapel altar on the next run', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedCatacombRoom(page, {
    completed: RESCUED,
    nodes: ['chapel_offering', 'chapel_grave'],
    materials: { '骨片': 10 }
  });
  // Nothing is on the grave yet.
  await expect(page.locator('[data-chapel-grave="empty"]')).toBeDisabled();
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { closeSubmenu } = await import('/src/navigation.js');
    closeSubmenu();
    state.party[0].hp = 0;
    (await import('/src/result.js')).triggerRunResult('gameover');
  });
  await expect(page.locator('.result-feat-row[data-feat-id="chapel_grave"]'))
    .toHaveText('墓標素材 3個が墓標に残った地下墓地の3階目、礼拝堂の祭壇で取り戻せる');

  const room = await seedCatacombRoom(page, { keep: true });
  expect(room.kind).toBe('chapel_altar');
  const pray = page.locator('[data-chapel-grave="filled"]');
  await expect(pray).toHaveText('墓標に祈る（骨片 x3）');
  await pray.click();
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      materials: state.currentRun.materials,
      grave: state.facilities.grave,
      used: state.map[state.y][state.x].specialRoom.used
    };
  });
  expect(after).toEqual({ materials: { '骨片': 3 }, grave: {}, used: true });
  await expect(page.locator('#log-content')).toContainText('墓標に祈った。前の死で失った素材が手元に戻った：');
});
