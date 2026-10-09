import { test, expect } from './fixtures/browser-health.js';

// The smithy and the audience hall (#2021): the smith is freed by feeding the
// cold furnace, the chamberlain by giving life to the mirror, and their
// rebuilt rooms offer a longer temper or a reforge, an oath or a mirror gallery.

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
    state.currentRun.runSeed = 'smith-hall-ui-seed';
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
    return { ...found, hp: state.party[0].hp };
  }, { floor, completed, nodes, materials, hp });
  await waitForControls(page);
  return room;
}

// Every feat achieved, so the runs below settle no feat reward of their own.
async function allFeats(page) {
  return page.evaluate(async () => {
    const { FEATS } = await import('/src/data/feats.js');
    return Object.fromEntries(FEATS.map(feat => [feat.id, { runNumber: 1 }]));
  });
}

test('The smith is freed by feeding the cold furnace; without materials he cannot be', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  let room = await seedRoom(page, 23, { materials: { '鉄片': 3 } });
  expect(room.kind).toBe('cold_forge');
  await expect(page.locator('#submenu-title')).toContainText('火の消えた炉');
  await expect(page.getByRole('button', { name: /素材をくべて火を入れる/ })).toBeDisabled();
  await expect(page.locator('#submenu-options')).toContainText('くべる素材が足りない（手持ち3個）。');

  room = await seedRoom(page, 23, { materials: { '鉄片': 5 } });
  expect(room.kind).toBe('cold_forge');
  await page.getByRole('button', { name: '素材をくべて火を入れる（素材4個）' }).click();
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      companions: state.currentRun.companions,
      iron: state.currentRun.materials['鉄片'],
      used: state.maps[22][state.y][state.x].specialRoom.used
    };
  });
  expect(after).toEqual({ companions: ['smith'], iron: 1, used: true });
  await expect(page.locator('#log-content')).toContainText('鍛冶師が同行する。連れて歩いて地上へ出れば、街に鍛冶場が開く。');
});

test('The chamberlain is freed by giving life to the mirror, and the last two facilities open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const room = await seedRoom(page, 28);
  expect(room.kind).toBe('mirror_captive');
  await expect(page.locator('#submenu-title')).toContainText('囚われの鏡');
  await page.getByRole('button', { name: /鏡に生気を与える/ }).click();
  const freed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxHp } = await import('/src/data.js');
    return {
      companions: state.currentRun.companions,
      hp: state.party[0].hp,
      cost: Math.ceil(getCharMaxHp(state.party[0]) * 0.3)
    };
  });
  expect(freed.companions).toEqual(['chamberlain']);
  expect(freed.hp).toBe(room.hp - freed.cost);

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.feats.completed = {
      foreman_rescue: { runNumber: 1 },
      priest_rescue: { runNumber: 1 },
      weaver_rescue: { runNumber: 1 },
      scribe_rescue: { runNumber: 1 }
    };
    state.currentRun.companions = ['smith', 'chamberlain'];
    (await import('/src/result.js')).triggerRunResult('surface');
  });
  await expect(page.locator('.result-feat-row[data-feat-id="smith_rescue"]')).toHaveText('達成鍛冶師を連れ帰る報酬 鍛冶場が開く');
  await expect(page.locator('.result-feat-row[data-feat-id="chamberlain_rescue"]')).toHaveText('達成侍従を連れ帰る報酬 謁見の間が開く');
  await page.locator('#btn-result-castle').click();
  const slots = page.locator('#town-facilities [data-facility-id]');
  await expect(slots).toHaveCount(6);
  await expect(page.locator('#town-facilities [data-facility-open="false"]')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.locator('#town-facilities [data-facility-id="audience_hall"]').click();
  await waitForControls(page);
  await expect(page.locator('#submenu-title')).toContainText('謁見の間');
  await expect(page.locator('[data-facility-node-id="hall_oath"]')).toContainText('誓約の祭壇');
  await expect(page.locator('[data-facility-order-id="hall_return_wing"]')).toContainText('帰還の翼の仕込み（帰還の翼×1）');
});

test('The smith forge tempers for five battles, or reforges the equipped weapon', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const completed = await allFeats(page);
  let room = await seedRoom(page, 23, { completed, nodes: ['smith_forge'], materials: { '鉄片': 4 } });
  expect(room.kind).toBe('smith_forge');
  await expect(page.locator('#submenu-title')).toContainText('鍛冶師の炉');
  await expect(page.locator('[data-smith-reforge]')).toHaveCount(0);
  await page.getByRole('button', { name: /武器を鍛え直す/ }).click();
  const tempered = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { temper: state.party[0].forgeTemper, iron: state.currentRun.materials['鉄片'] };
  });
  expect(tempered.temper.battles).toBe(5);
  expect(tempered.temper.bonus).toBeGreaterThan(0);
  expect(tempered.iron).toBe(2);

  room = await seedRoom(page, 23, { completed, nodes: ['smith_forge', 'smith_reforge'], materials: { '鉄片': 4 } });
  expect(room.kind).toBe('smith_forge');
  await expect(page.locator('#submenu-options')).toContainText('どちらか一方');
  const before = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharWeaponAtk } = await import('/src/rules/character_stats.js');
    return getCharWeaponAtk(state.party[0]);
  });
  await expect(page.locator('[data-smith-reforge]')).toHaveText('武器を打ち直す（素材4個・強化値+1へ）');
  await page.locator('[data-smith-reforge]').click();
  const reforged = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharWeaponAtk } = await import('/src/rules/character_stats.js');
    const { getItemData } = await import('/src/rules/item_rules.js');
    const weapon = state.party[0].equipment.weapon;
    return {
      level: weapon.enhanceLevel,
      name: getItemData(weapon).name,
      atk: getCharWeaponAtk(state.party[0]),
      temper: state.party[0].forgeTemper || null,
      iron: state.currentRun.materials['鉄片'],
      used: state.maps[22][state.y][state.x].specialRoom.used
    };
  });
  expect(reforged.level).toBe(1);
  expect(reforged.name).toContain('+1');
  expect(reforged.atk).toBe(before + 3);
  expect(reforged.temper).toBeNull();
  expect(reforged.iron).toBe(0);
  expect(reforged.used).toBe(true);
});

test('The forge furnace reforges what is worn and stays open while materials last (#2063)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // B22: the forge's second floor holds an ordinary furnace.
  const room = await seedRoom(page, 22, { materials: { '鉄片': 8 } });
  expect(room.kind).toBe('forge');
  const weapon = page.locator('[data-rule-reforge="weapon"]');
  await expect(weapon).toContainText('武器を打ち直す（素材4個・強化値+');
  await expect(async () => {
    await weapon.click({ timeout: 1000 });
    await expect(page.locator('#log-content')).toContainText('武器を打ち直した', { timeout: 1000 });
  }).toPass();
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { level: state.party[0].equipment.weapon.enhanceLevel, used: Boolean(state.map[state.y][state.x].specialRoom.used), iron: state.currentRun.materials['鉄片'] };
  });
  expect(after.level).toBeGreaterThanOrEqual(1);
  expect(after.used).toBe(false);
  expect(after.iron).toBe(4);
});

test('An oath heals fully and a death then leaves no materials in the town', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const completed = await allFeats(page);
  const room = await seedRoom(page, 28, { completed, nodes: ['hall_oath'], materials: { '鉄片': 10 }, hp: 9 });
  expect(room.kind).toBe('oath_altar');
  await expect(page.locator('#submenu-title')).toContainText('誓約の祭壇');
  await expect(page.getByRole('button', { name: /^鏡を覗く（HP/ })).toBeVisible();
  await page.locator('[data-oath]').click();

  const sworn = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxHp } = await import('/src/data.js');
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    const summary = createRunStakesSummary();
    return {
      oath: state.currentRun.oath,
      full: state.party[0].hp === getCharMaxHp(state.party[0]),
      used: state.maps[27][state.y][state.x].specialRoom.used,
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent),
      stakes: summary.querySelector('.run-stakes-oath')?.textContent || '',
      loss: summary.textContent
    };
  });
  expect(sworn.oath).toBe(true);
  expect(sworn.full).toBe(true);
  expect(sworn.used).toBe(true);
  expect(sworn.hud[0]).toBe('誓約死ねば素材は残らない');
  expect(sworn.stakes).toBe('誓約中：死ねば・断念すれば、手持ちの素材は1つも街に残らない。');
  expect(sworn.loss).toContain('死ねば・断念すれば失う素材 10個');

  const town = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.party[0].hp = 0;
    (await import('/src/result.js')).triggerRunResult('gameover');
    return state.metaMaterials['鉄片'] || 0;
  });
  expect(town).toBe(0);
  await expect(page.locator('.result-feat-row[data-feat-id="oath"]')).toHaveText('誓約誓約は破れた手持ちの素材は街に残らなかった');
});

test('The mirror gallery shows two floors ahead without taking HP', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const completed = await allFeats(page);
  const room = await seedRoom(page, 28, { completed, nodes: ['hall_oath', 'hall_gallery'] });
  expect(room.kind).toBe('oath_altar');
  await page.getByRole('button', { name: '鏡の回廊を覗く（2階先まで）' }).click();
  const seen = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const stairsShown = floor => {
      const grid = ensureRunFloor(state, floor);
      let shown = false;
      grid.forEach((row, y) => row.forEach((cell, x) => {
        if (cell.type === 'stairs-down') shown = Boolean(state.visitedMaps[floor - 1][y][x]);
      }));
      return shown;
    };
    return {
      hp: state.party[0].hp,
      oath: state.currentRun.oath,
      vision: state.maps[27][state.y][state.x].specialRoom.vision,
      next: stairsShown(29)
    };
  });
  expect(seen.hp).toBe(room.hp);
  expect(seen.oath).toBe(false);
  expect(seen.vision).toBe(2);
  expect(seen.next).toBe(true);
});

test('The ironclad and ceremonial kits start with their equipment and say how they play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.feats.completed = { smith_rescue: { runNumber: 1 }, chamberlain_rescue: { runNumber: 1 } };
    state.facilities = { nodes: ['smith_kit', 'hall_kit'], orders: {}, grave: {} };
    updateUI();
  });
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('.solo-starting-kit-option')).toHaveCount(6);
  await page.locator('[data-kit-id="ceremonial"]').click();
  const detail = page.locator('.solo-kit-detail');
  await expect(detail).toHaveAttribute('data-detail-kit-id', 'ceremonial');
  await expect(detail.locator('.solo-kit-equipment')).toContainText('ラージシールド');
  await expect(detail).toContainText('遅い');

  await page.locator('[data-kit-id="ironclad"]').click();
  await expect(detail).toHaveAttribute('data-detail-kit-id', 'ironclad');
  await expect(detail.locator('.solo-kit-equipment')).toContainText('プレートメイル');
  await expect(detail.locator('.solo-kit-items')).toContainText('守りの薬');
  await expect(detail).toContainText('遅い');
  await page.locator('#btn-kit-confirm').click();
  await page.locator('#btn-departure-start').click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const started = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharacterEquipmentLoad } = await import('/src/rules/equipment_load.js');
    const id = item => (typeof item === 'string' ? item : item?.baseId);
    const hero = state.party[0];
    return {
      kit: state.currentRun.startingKit,
      weapon: id(hero.equipment.weapon),
      armor: id(hero.equipment.armor),
      shield: hero.equipment.shield,
      potions: state.inventory.filter(item => id(item) === 'GUARD_POTION').length,
      load: getCharacterEquipmentLoad(hero).class
    };
  });
  expect(started).toEqual({ kit: 'ironclad', weapon: 'DAGGER', armor: 'PLATE_MAIL', shield: null, potions: 1, load: 'heavy' });
});
