import { test, expect } from './fixtures/browser-health.js';

test('loadout changes stay in a draft until one exploration-turn commit @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'transaction-sword', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 1, identified: true, affixes: [],
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'transaction-ui' };
    state.gameState = 'explore';
    window.__uxTelemetry = [];
    __setTelemetryClientForTests({ capture: (name, properties) => window.__uxTelemetry.push({ name, properties }) });
    trackRunStart(state.currentRun, character, state);
    openEquipOverlay(0);
  });

  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { weapon: state.party[0].equipment.weapon, inventory: state.inventory, steps: state.currentRun.steps };
  })).toEqual({ weapon: 'DAGGER', inventory: [expect.any(Object)], steps: 0 });

  await expect(page.locator('#btn-equip-commit')).toBeEnabled();
  await expect(page.locator('#btn-equip-commit')).toContainText('探索時間が進む');
  await page.locator('#btn-equip-commit').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      weapon: state.party[0].equipment.weapon?.instanceId || state.party[0].equipment.weapon,
      returned: state.inventory.map(item => item?.instanceId || item),
      steps: state.currentRun.steps,
      floorSteps: state.currentRun.floorSteps['1'],
    };
  })).toEqual({
    weapon: 'transaction-sword',
    returned: ['DAGGER'],
    steps: 1,
    floorSteps: 1,
  });
  expect(await page.evaluate(() => window.__uxTelemetry
    .filter((event) => event.name.startsWith('ux_decision_'))
    .map((event) => [event.name, event.properties.surface, event.properties.resolution]))).toEqual([
    ['ux_decision_opened', 'equipment', undefined],
    ['ux_decision_resolved', 'equipment', 'commit'],
  ]);
});

test('canceling a dirty loadout draft leaves the live run untouched @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = ['SHORT_SWORD'];
    state.currentRun = { steps: 4, floorSteps: { '1': 4 }, materials: {}, runSeed: 'cancel-ui' };
    state.gameState = 'explore';
    window.__uxTelemetry = [];
    __setTelemetryClientForTests({ capture: (name, properties) => window.__uxTelemetry.push({ name, properties }) });
    trackRunStart(state.currentRun, character, state);
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.getByRole('button', { name: 'キャンセル' }).first().click();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { weapon: state.party[0].equipment.weapon, inventory: state.inventory, steps: state.currentRun.steps };
  })).toEqual({ weapon: 'DAGGER', inventory: ['SHORT_SWORD'], steps: 4 });
  expect(await page.evaluate(() => window.__uxTelemetry
    .filter((event) => event.name.startsWith('ux_decision_'))
    .map((event) => [event.name, event.properties.surface, event.properties.resolution]))).toEqual([
    ['ux_decision_opened', 'equipment', undefined],
    ['ux_decision_resolved', 'equipment', 'cancel'],
  ]);
});

test('equipment transaction actions stay separated and thumb-safe across mobile widths @e2e @smoke', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const { createStartingKitCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const character = createStartingKitCharacter('vanguard');
      character.equipment.weapon = 'DAGGER';
      state.party = [character];
      state.inventory = [{
        kind: 'equipment', instanceId: 'touch-target-sword', baseId: 'SHORT_SWORD',
        rarity: 'rare', level: 1, identified: true, affixes: [],
      }];
      state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'touch-target-ui' };
      state.gameState = 'explore';
      openEquipOverlay(0);
    });

    await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
    await page.getByRole('button', { name: '装備する' }).click();

    const actionButtons = {
      organize: page.locator('.equip-transaction-actions .equip-organize-entry'),
      cancel: page.locator('#btn-equip-close'),
      commit: page.locator('#btn-equip-commit'),
    };
    const boxes = {};
    for (const [name, button] of Object.entries(actionButtons)) {
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box, `${name} should have a rendered bounding box at ${viewport.width}px`).not.toBeNull();
      boxes[name] = {
        ...box,
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
      };
      expect(boxes[name].height, `${name} should meet the 44px touch target at ${viewport.width}px`).toBeGreaterThanOrEqual(44);
      expect(boxes[name].left).toBeGreaterThanOrEqual(0);
      expect(boxes[name].right).toBeLessThanOrEqual(viewport.width);
    }

    expect(boxes.organize.bottom).toBeLessThanOrEqual(boxes.cancel.top - 11);
    expect(boxes.cancel.right).toBeLessThanOrEqual(boxes.commit.left - 11);
    expect(boxes.cancel.top).toBe(boxes.commit.top);

    const commitBeforeDisabled = { ...boxes.commit };
    await actionButtons.commit.evaluate((button) => { button.disabled = true; });
    const commitAfterDisabled = await actionButtons.commit.boundingBox();
    expect(commitAfterDisabled).toEqual({
      x: commitBeforeDisabled.x,
      y: commitBeforeDisabled.y,
      width: commitBeforeDisabled.width,
      height: commitBeforeDisabled.height,
    });

    const layout = await page.locator('.equip-transaction-actions').evaluate((row) => ({
      scrollWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      scrollHeight: row.scrollHeight,
      clientHeight: row.clientHeight,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.scrollHeight).toBeGreaterThan(0);
  }
});

test('unknown equipment uses an explicit irreversible trial action @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'ui-unknown-trial', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 2, identified: false, halfIdentified: false,
      knowledgeStage: 'discovery', trialCount: 0, tags: ['blade'],
      hintTags: ['blade'], observedHintTags: [],
      curseEffectId: 'curse_blood_thirst', cursePower: 1, curseSuspected: true,
      affixes: []
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'trial-ui' };
    state.gameState = 'explore';
    openEquipOverlay(0);
  });

  await page.locator('.equip-bag-section .equip-item-row', { hasText: '未鑑定の装備品' }).click();
  await expect(page.locator('.equip-detail-content')).toContainText('知識段階: 発見');
  await expect(page.getByRole('button', { name: '試す' })).toContainText('探索時間が進む');
  await page.getByRole('button', { name: '試す' }).click();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { weapon: state.party[0].equipment.weapon, steps: state.currentRun.steps };
  })).toEqual({ weapon: 'DAGGER', steps: 0 });

  await expect(page.locator('#btn-equip-commit')).toContainText('試す内容を確定する（探索時間が進む）');
  await page.getByRole('button', { name: '試す内容を確定する（探索時間が進む）' }).click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const item = state.party[0].equipment.weapon;
    return {
      item: item?.instanceId || item,
      knowledgeStage: item?.knowledgeStage,
      trialCount: item?.trialCount,
      curseLocked: item?.curseLocked,
      returned: state.inventory.map(value => value?.instanceId || value),
      steps: state.currentRun.steps
    };
  })).toEqual({
    item: 'ui-unknown-trial',
    knowledgeStage: 'trial',
    trialCount: 1,
    curseLocked: true,
    returned: ['DAGGER'],
    steps: 1
  });
});

test('committing outside exploration does not advance exploration time @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = ['SHORT_SWORD'];
    state.currentRun = { steps: 4, floorSteps: { '1': 4 }, materials: {}, runSeed: 'town-ui' };
    state.gameState = 'town';
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.locator('#btn-equip-commit').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      weapon: state.party[0].equipment.weapon,
      inventory: state.inventory,
      steps: state.currentRun.steps,
      floorSteps: state.currentRun.floorSteps['1'],
      gameState: state.gameState,
    };
  })).toEqual({
    weapon: 'SHORT_SWORD',
    inventory: ['DAGGER'],
    steps: 4,
    floorSteps: 4,
    gameState: 'town',
  });
});

test('committing a loadout consumes the normal exploration poison tick @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    character.hp = 10;
    character.status = 'poisoned';
    state.party = [character];
    state.inventory = ['SHORT_SWORD'];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'poison-ui' };
    state.floor = 1;
    state.gameState = 'explore';
    window.__loadoutTestRandom = Math.random;
    Math.random = () => 0;
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.locator('#btn-equip-commit').click();
  const result = await page.evaluate(async () => {
    Math.random = window.__loadoutTestRandom;
    const { state } = await import('/src/state.js');
    return { hp: state.party[0].hp, steps: state.currentRun.steps };
  });
  expect(result).toEqual({ hp: 9, steps: 1 });
});

test('equipment detail exposes build commitments and neutral replacement consequences @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('vanguard');
    character.equipment.weapon = 'DAGGER';
    character.equipment.shield = 'SMALL_SHIELD';
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'build-commitment-heavy', baseId: 'CLAYMORE',
      rarity: 'rare', level: 1, identified: true, affixes: []
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'build-commitment-ui' };
    state.gameState = 'explore';
    openEquipOverlay(0);
  });

  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'クレイモア' }).click();
  const detail = page.locator('.equip-detail-content');
  await expect(detail).toContainText('現在の構成');
  await expect(detail.locator('[data-build-field="weapon"]')).toContainText('ダガー');
  await expect(detail.locator('[data-build-field="weapon"]')).toContainText('軽武器');
  await expect(detail.locator('[data-build-field="hands"]')).toContainText('使用 2/2');
  const buildText = await detail.locator('.equip-build-grid').textContent();
  expect(buildText).toContain('装備に使う手');
  expect(buildText).toContain('媒体');
  expect(buildText).toContain('ルーン枠');
  expect(buildText).toContain('使用中のルーン');
  expect(buildText).toContain('戦い方を変える効果');
  expect(buildText).toContain('補助的な特殊効果');
  expect(buildText).toContain('装備効果');
  expect(buildText).toContain('探索に役立つ効果');
  expect(buildText).not.toMatch(/手数|Main-axis|Auxiliary|active Rune|Rune slot|探索 Support/);
  await expect(detail.locator('[data-build-field="guard"]')).toContainText('スモールシールド');
  await expect(detail.locator('[data-build-field="guard"]')).toContainText('軽盾の守り');
  await expect(detail.locator('[data-build-compare="weapon"]')).toContainText('両手重武器');
  await expect(detail.locator('[data-build-compare="guard"]')).toContainText('盾なし');
  await expect(detail.locator('[data-build-compare="bag"]')).toContainText('1/20 → 2/20');
  await expect(detail.locator('[data-build-compare="bag-items"]')).toContainText('ダガーがバッグへ戻る');
  await expect(detail.locator('[data-build-compare="bag-items"]')).toContainText('スモールシールドがバッグへ戻る');
  await expect(detail.locator('.equip-build-comparison-note')).toContainText('確定前');
});

test('active and spare Runes are labeled by their ownership surface @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('arcana');
    character.mediumState = { mediumKey: 'WAND', socketedRunes: ['RUNE_HALITO'] };
    state.party = [character];
    state.inventory = ['RUNE_DIOS'];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'rune-ownership-ui' };
    state.gameState = 'explore';
    openEquipOverlay(0);
  });

  const runePanel = page.locator('.equip-rune-panel');
  await expect(runePanel).toContainText('使用中のルーン（バッグ外）');
  await expect(runePanel).toContainText('バッグ内の予備ルーン');
  await expect(runePanel.locator('.equip-rune-row.active')).toContainText('HALITOのルーン');
  await expect(runePanel.locator('.equip-rune-row:not(.active)')).toContainText('DIOSのルーン');
});

test('medium replacement shows current MP separately from maximum MP @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createStartingKitCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createStartingKitCharacter('arcana');
    character.mp = 2;
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'medium-replacement', baseId: 'ARCH_WAND',
      rarity: 'rare', level: 1, identified: true, affixes: []
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'medium-mp-ui' };
    state.gameState = 'town';
    openEquipOverlay(0);
  });

  await page.locator('.equip-bag-section .equip-item-row', { hasText: '大魔道の杖' }).click();
  await expect(page.locator('[data-build-compare="max-mp"]')).toContainText('3 → 5');
  await expect(page.locator('[data-build-compare="mp"]')).toContainText('2/3 → 2/5');
  await expect(page.locator('[data-build-compare="bag"]')).toContainText('1/20 → 2/20');
  await expect(page.locator('[data-build-compare="bag-items"]')).toContainText('魔術師の杖がバッグへ戻る');
  await expect(page.locator('[data-build-compare="bag-items"]')).toContainText('装着中のルーン 1個がバッグへ戻る');
  await page.getByRole('button', { name: '装備する' }).click();
  await page.locator('#btn-equip-commit').click();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxMp } = await import('/src/data.js');
    return { mp: state.party[0].mp, maxMp: getCharMaxMp(state.party[0]) };
  })).toEqual({ mp: 2, maxMp: 5 });
});
