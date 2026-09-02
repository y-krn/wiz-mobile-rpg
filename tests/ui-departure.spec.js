import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS, openDeparturePreparation } from './ui-ux-helpers.js';
for (const vp of VIEWPORTS) {
  test(`Milestone start, merchant, and portal stay thumb-safe at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.unlockedMilestones = [5];
    });
    await page.locator('#btn-town-dungeon').click();
    await page.getByRole('button', { name: /戦士/ }).first().click();
    const shortcut = page.getByRole('button', { name: /B5Fから開始/ });
    await expect(shortcut).toContainText('素材収入 60%');
    expect((await shortcut.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await shortcut.click();
    const started = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { floor: state.floor, startFloor: state.currentRun.startFloor, count: state.party.length };
    });
    expect(started).toEqual({ floor: 5, startFloor: 5, count: 1 });

    await page.evaluate(async () => {
      const { createDefaultCurrentRun, createSoloCharacter, state } = await import('/src/state.js');
      const { revealEquipmentOnEquip } = await import('/src/systems/identification.js');
      const { openSubmenu } = await import('/src/navigation.js');
      const cursed = {
        kind: 'equipment', instanceId: 'merchant_curse', baseId: 'SHORT_SWORD', rarity: 'rare', level: 5,
        identified: false, tags: ['blade', 'curse'], curseEffectId: 'curse_hollow_soul', curseSuspected: true,
        affixes: [], unidentifiedName: 'ショートソード（未鑑定）',
      };
      revealEquipmentOnEquip(cursed);
      state.party = [createSoloCharacter('Fighter')];
      state.party[0].equipment.weapon = cursed;
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.startFloor = 5;
      state.currentRun.deepestFloor = 5;
      state.currentRun.defeatedMilestones = [5];
      state.currentRun.materials = { '霊粉': 9, '呪布': 5, '黒角': 3, '獣の牙': 2 };
      state.floor = 5;
      state.gameState = 'explore';
      openSubmenu('milestone_merchant', '深層商人');
    });
    const powder = page.locator('.milestone-merchant-option[data-stock-id="identify_powder"]');
    const uncurse = page.getByRole('button', { name: /呪いを解く/ });
    const merchantLayout = await page.locator('.milestone-merchant-option').evaluateAll((buttons) => {
      const readBox = (element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          fits: element.scrollWidth <= element.clientWidth + 1,
        };
      };
      const options = buttons.map((button) => ({
        button: readBox(button),
        name: readBox(button.querySelector('.menu-action-card-name')),
        description: readBox(button.querySelector('.menu-action-card-description')),
        cost: readBox(button.querySelector('.menu-action-card-cost')),
        display: getComputedStyle(button).display,
      }));
      return {
        options,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(merchantLayout.hasHorizontalOverflow).toBe(false);
    expect(merchantLayout.options.every(({ display }) => display === 'grid')).toBe(true);
    const firstNameWidth = merchantLayout.options[0].name.width;
    const firstDescriptionLeft = merchantLayout.options[0].description.left;
    for (const { button, name, description, cost } of merchantLayout.options) {
      expect(name.width).toBeCloseTo(firstNameWidth, 3);
      expect(description.left).toBeCloseTo(firstDescriptionLeft, 3);
      expect(cost.left).toBeCloseTo(firstDescriptionLeft, 3);
      for (const child of [name, description, cost]) {
        expect(child.fits).toBe(true);
        expect(child.left).toBeGreaterThanOrEqual(button.left);
        expect(child.right).toBeLessThanOrEqual(button.right);
      }
    }
    expect((await powder.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await uncurse.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.milestone-merchant-option[data-stock-kind="equipment"]')).toHaveCount(0);
    await expect(powder).toContainText('価格');
    await expect(powder).toContainText('霊粉 2（所持 9）');
    await expect(powder).toContainText('あと4個');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="霊粉"]')).toHaveText('霊粉 9');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="獣の牙"]')).toHaveText('獣の牙 2');
    await expect(powder).toHaveAttribute('aria-pressed', 'false');
    await powder.click();
    await expect(powder).toHaveClass(/is-selected/);
    await expect(page.locator('.milestone-merchant-balance')).toContainText('購入確定前：購入後の残素材');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="霊粉"]')).toHaveText('霊粉 7 (-2)');
    await expect(page.locator('#btn-merchant-confirm')).toBeEnabled();
    await expect(page.locator('#btn-merchant-confirm')).toContainText('購入');
    expect((await page.locator('#btn-merchant-confirm').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('#btn-merchant-confirm').click();
    await expect(page.locator('#log-content')).toContainText('鑑定粉を購入した');
    await expect(powder).toContainText('あと3個');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="霊粉"]')).toHaveText('霊粉 7');

    const healPotion = page.locator('.milestone-merchant-option[data-stock-id="heal_potion"]');
    await healPotion.click();
    await expect(page.locator('.merchant-selection-summary')).toContainText('傷薬 (ディオス薬)を購入');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="獣の牙"]')).toHaveText('獣の牙 1 (-1)');
    await expect(healPotion).toContainText('あと2個');
    await page.locator('#btn-merchant-confirm').click();
    await expect(page.locator('#log-content')).toContainText('傷薬 (ディオス薬)を購入した');
    await expect(healPotion).toContainText('あと1個');

    await uncurse.click();
    await expect(page.locator('.milestone-merchant-balance')).toContainText('購入確定前：解呪後の残素材');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="霊粉"]')).toHaveText('霊粉 2 (-5)');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="呪布"]')).toHaveText('呪布 2 (-3)');
    await expect(page.locator('.milestone-merchant-balance-item[data-material="黒角"]')).toHaveText('黒角 2 (-1)');
    await page.locator('#btn-merchant-confirm').click();
    await expect(page.locator('#log-content')).toContainText('ショートソード（未鑑定）（試用済）の呪いを解いた');

    await page.evaluate(async () => {
      const { openSubmenu } = await import('/src/navigation.js');
      openSubmenu('milestone_portal', '帰還の門');
    });
    const retreat = page.getByRole('button', { name: '撤退して素材を100%、未確定戦果をすべて持ち帰る' });
    expect((await retreat.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await retreat.click();
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('Returnを確定しますか？');
    await page.locator('#btn-portal-confirm').click();
    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { gameState: state.gameState, reason: state.currentRun.returnReason };
    });
    expect(result).toEqual({ gameState: 'result', reason: 'milestone_portal' });
  });
}

test('Milestone merchant shows the blocking reason for material and bag limits', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.materials = { '霊粉': 1, '獣の牙': 1 };
    state.inventory = Array(20).fill('HEAL_POTION');
    state.gameState = 'explore';
    openSubmenu('milestone_merchant', '深層商人');
  });

  await expect(page.locator('[data-stock-id="heal_potion"]')).toBeDisabled();
  await expect(page.locator('[data-stock-id="heal_potion"]')).toContainText('あと0個・バッグ満杯');
  await expect(page.locator('[data-stock-id="identify_powder"]')).toBeDisabled();
  await expect(page.locator('[data-stock-id="identify_powder"]')).toContainText('あと0個・素材不足');
  await expect(page.locator('.milestone-merchant-balance-item[data-material="霊粉"]')).toHaveText('霊粉 1');
});

for (const vp of VIEWPORTS) {
  test(`Departure start button fits after selecting two crafts on ${vp.name}`, async ({ page }) => {
    await openDeparturePreparation(page, vp, [5, 10]);
    const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
    await heal.click();
    await heal.click();

    const starts = page.locator('.solo-start-floor-option');
    await expect(starts).toHaveCount(3);
    for (let index = 0; index < await starts.count(); index++) {
      const start = starts.nth(index);
      const box = await start.boundingBox();
      expect(box).not.toBeNull();
      expect(box.y, `Start button must stay inside the viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `Start button must fit in the viewport on ${vp.name}`).toBeLessThanOrEqual(vp.height);
      expect(box.height, `Start button must stay tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      for (const child of ['strong', 'span']) {
        const childBox = await start.locator(child).boundingBox();
        expect(childBox, `${child} must remain visible on ${vp.name}`).not.toBeNull();
        expect(childBox.y, `${child} must stay inside the viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
        expect(childBox.y + childBox.height, `${child} must fit in the viewport on ${vp.name}`).toBeLessThanOrEqual(vp.height);
      }
    }
  });

  test(`Departure start button is independent from craft scrolling on ${vp.name}`, async ({ page }) => {
    await openDeparturePreparation(page, vp);
    const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
    await heal.click();
    await heal.click();

    const start = page.getByRole('button', { name: /B1Fから開始/ });
    const before = await start.boundingBox();
    expect(before).not.toBeNull();
    await page.locator('#submenu-options').evaluate((options) => {
      options.scrollTop = options.scrollHeight;
    });
    const after = await start.boundingBox();
    expect(after).not.toBeNull();
    expect(after.y, `Start button y must not move with craft scrolling on ${vp.name}`).toBeCloseTo(before.y, 3);
    expect(after.height, `Start button height must not change with craft scrolling on ${vp.name}`).toBeCloseTo(before.height, 3);
    expect(await start.evaluate((element) => Boolean(element.closest('#submenu-options')))).toBe(false);
  });

  test(`Departure class reselection clears start buttons on ${vp.name}`, async ({ page }) => {
    await openDeparturePreparation(page, vp);
    await expect(page.getByRole('button', { name: /B1Fから開始/ })).toBeVisible();
    await page.getByRole('button', { name: 'クラスを選び直す' }).click();
    await expect(page.locator('.solo-class-option').first()).toBeVisible();
    await expect(page.locator('.solo-start-floor-option')).toHaveCount(0);
    await expect(page.locator('#departure-start-footer .solo-start-floor-option')).toHaveCount(0);
  });

  test(`Departure start clears floor buttons before opening a submenu on ${vp.name}`, async ({ page }) => {
    await openDeparturePreparation(page, vp);
    await page.getByRole('button', { name: /B1Fから開始/ }).click();
    await expect(page.locator('#explore-controls')).toBeVisible();

    await page.evaluate(async () => {
      const { openSubmenu } = await import('/src/navigation.js');
      openSubmenu('item_inventory', '共有バッグ');
    });
    await expect(page.locator('#submenu-controls')).toBeVisible();
    await expect(page.locator('#departure-start-footer .solo-start-floor-option')).toHaveCount(0);
    await expect(page.locator('.solo-start-floor-option')).toHaveCount(0);
  });
}

for (const vp of VIEWPORTS) {
  test(`Departure craft choices are thumb-safe on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { openSubmenu } = await import('/src/navigation.js');

      state.gameState = 'town';
      state.metaMaterials = {
        '獣の牙': 10,
        '硬い皮': 10,
        '毒腺': 3,
        '骨片': 3,
        '霊粉': 10,
        '鉄片': 10,
      };
      state.workshop = { ranks: {} };
      state.unlockedMilestones = [];
      openSubmenu('solo_start', '単独潜行');
    });

    await page.locator('.solo-class-option').first().click();
    await expect(page.locator('#game-container')).toHaveClass(/departure-mode/);
    await expect(page.locator('#controls-panel')).toHaveClass(/departure-mode/);
    await expect(page.locator('#log-panel')).toBeHidden();
    await expect(page.locator('#viewport-panel')).toBeHidden();
    const goalBanner = page.locator('#goal-banner');
    await expect(goalBanner).toContainText('🎯 目標: 開始地点とクラスを選び、自己最深記録を更新せよ');
    await expect(goalBanner).not.toContainText('探索率:');
    await expect(goalBanner.locator('.goal-stats-container')).toHaveCount(0);
    const summary = page.locator('.solo-start-craft-summary');
    const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
    const portal = page.locator('[data-recipe-id="TOWN_PORTAL"]');
    const healDecrement = page.locator('[data-craft-recipe-id="HEAL_POTION"]');
    const readCraftBalances = () => page.locator('.solo-start-craft-balance').evaluateAll((badges) => (
      Object.fromEntries(badges.map((badge) => [badge.dataset.material, Number(badge.dataset.balance)]))
    ));
    const expectCraftBalancesToMatchState = async () => {
      const expected = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return Object.fromEntries(
          Object.entries(state.metaMaterials).filter(([, quantity]) => quantity > 0)
        );
      });
      expect(await readCraftBalances()).toEqual(expected);
    };
    await expect(summary).toContainText('0品');
    await expect(heal).toHaveCount(1);
    await expect(heal).toHaveAttribute('aria-pressed', 'false');
    await expect(heal).toContainText('硬い皮 1/10');
    await expect(heal).toContainText('獣の牙 1/10');
    await expect(heal).toContainText('あと10個');
    await expectCraftBalancesToMatchState();
    await expect(portal).toBeEnabled();
    await expect(portal).toContainText('素材8個（種別不問）');
    await expect(healDecrement).toHaveCount(1);
    await expect(healDecrement).toBeDisabled();

    const layout = await page.evaluate(() => {
      const button = document.querySelector('[data-recipe-id="HEAL_POTION"]');
      const floors = [...document.querySelectorAll('.solo-start-floor-option')];
      return {
        craft: button.getBoundingClientRect().toJSON(),
        lowestFloorTop: Math.min(...floors.map((floor) => floor.getBoundingClientRect().top)),
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(layout.hasHorizontalOverflow).toBe(false);
    expect(layout.craft.height, 'Departure craft choice stays tappable').toBeGreaterThanOrEqual(44);
    expect(layout.craft.left).toBeGreaterThanOrEqual(0);
    expect(layout.craft.right).toBeLessThanOrEqual(vp.width);
    expect(layout.craft.top).toBeLessThan(layout.lowestFloorTop);
    await expect(page.locator('#btn-submenu-back')).toBeVisible();
    const backBox = await page.locator('#btn-submenu-back').boundingBox();
    expect(backBox.height, 'Departure back button stays tappable').toBeGreaterThanOrEqual(44);
    expect(backBox.y + backBox.height).toBeLessThanOrEqual(vp.height);

    await heal.click();
    await expect(heal).toHaveAttribute('aria-pressed', 'true');
    await expect(summary).toContainText('1品');
    await expect(summary).toContainText('硬い皮 9 (-1)');
    await expect(summary).toContainText('獣の牙 9 (-1)');
    await expect(heal).toContainText('あと9個');
    await expect(page.locator('[data-material="硬い皮"]')).toContainText('9 (-1)');
    await expect(page.locator('[data-material="獣の牙"]')).toContainText('9 (-1)');
    await expect(healDecrement).toBeEnabled();
    await healDecrement.click();
    await expect(summary).toContainText('0品');
    await expect(summary).toContainText('硬い皮 10');
    await expect(summary).toContainText('獣の牙 10');
    await expect(heal).toContainText('あと10個');
    await expectCraftBalancesToMatchState();
    await portal.click();
    await expect(summary).toContainText('1品');
    await heal.click();
    await expect(summary).toContainText('2品');
    await heal.click();
    await expect(summary).toContainText('3品');
    await healDecrement.click();
    await expect(summary).toContainText('2品');
  });
}

test('Departure craft disables the plus button at the displayed boundary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');

    state.gameState = 'town';
    state.metaMaterials = { '獣の牙': 2, '硬い皮': 2 };
    state.workshop = { ranks: {} };
    state.unlockedMilestones = [];
    openSubmenu('solo_start', '単独潜行');
  });

  await page.locator('.solo-class-option').first().click();
  const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
  await expect(heal).toContainText('硬い皮 1/2');
  await expect(heal).toContainText('獣の牙 1/2');
  await expect(heal).toContainText('あと2個');
  await heal.click();
  await expect(heal).toContainText('あと1個');
  await heal.click();
  await expect(heal).toBeDisabled();
  await expect(heal.locator('.solo-start-craft-cost')).toHaveClass(/is-insufficient/);
  await expect(heal).toContainText('硬い皮 1/0');
  await expect(heal).toContainText('獣の牙 1/0');
  await expect(heal).toContainText('あと0個・素材不足');
});

test('Departure craft allows empty-handed departure without materials', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');

    state.gameState = 'town';
    state.metaMaterials = {};
    state.workshop = { ranks: {} };
    state.unlockedMilestones = [];
    openSubmenu('solo_start', '単独潜行');
  });

  await page.locator('.solo-class-option').first().click();
  const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
  await expect(heal).toBeDisabled();
  await expect(heal).toContainText('あと0個・素材不足');
  await expect(page.locator('.solo-start-craft-balance')).toHaveCount(0);
  await expect(page.locator('.solo-start-floor-option').first()).toBeEnabled();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.inventory)).toEqual([]);
});

test('Preparation keeps run conditions and all 20 bag slots visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.gameState = 'town';
    state.metaMaterials = { '獣の牙': 10, '硬い皮': 10 };
    state.workshop = { ranks: { gear_fighter_saber: 1 } };
    state.unlockedMilestones = [5];
    openSubmenu('run_quest_board', '依頼板 - 潜行の目的');
  });

  const questName = await page.locator('.run-quest-card').first().locator('strong').textContent();
  await page.locator('.run-quest-card').first().click();
  await page.getByRole('button', { name: '選択した依頼で潜行準備へ' }).click();
  await page.getByRole('button', { name: /戦士 \+ 鍛錬サーベル/ }).click();

  const summary = page.locator('.solo-preparation-summary');
  await expect(summary).toContainText('今回の出発条件');
  await expect(summary).toContainText('戦士');
  await expect(summary).toContainText('鍛錬サーベル（バッグ外）');
  await expect(summary).toContainText(questName);
  await expect(summary.locator('.solo-preparation-slot')).toHaveCount(20);
  await expect(summary.locator('.solo-preparation-slot.is-open')).toHaveCount(20);
  await expect(summary).toContainText('持ち込み 0/20');
  await expect(summary).toContainText('戦果を持ち帰る余地');

  const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
  await heal.click();
  await expect(summary).toContainText('持ち込み 1/20');
  await expect(summary.locator('.solo-preparation-slot.is-filled')).toHaveCount(1);
  await expect(summary.locator('.solo-preparation-slot.is-open')).toHaveCount(19);
  await expect(page.getByRole('button', { name: /B5Fから開始/ })).toContainText('素材収入 60%');
});

test('Preparation explains bag cap and Return Wing individual limit', async ({ page }) => {
  await openDeparturePreparation(page, { width: 390, height: 844, name: 'iPhone 13' });
  const portal = page.locator('[data-recipe-id="TOWN_PORTAL"]');
  await portal.click();
  await expect(portal).toBeDisabled();
  await expect(portal).toContainText('あと0個・帰還の翼は1個まで');

  await page.getByRole('button', { name: /クラスを選び直す/ }).click();
  await page.evaluate(async () => {
    (await import('/src/state.js')).state.metaMaterials = { '獣の牙': 20, '硬い皮': 20 };
  });
  await page.locator('.solo-class-option').first().click();
  const heal = page.locator('[data-recipe-id="HEAL_POTION"]');
  for (let index = 0; index < 20; index += 1) await heal.click();
  await expect(page.locator('.solo-preparation-summary')).toContainText('持ち込み 20/20');
  await expect(page.locator('.solo-preparation-slot.is-filled')).toHaveCount(20);
  await expect(heal).toBeDisabled();
  await expect(heal).toContainText('あと0個・バッグ上限（20枠）');
});

test('Preparation remains usable at 320x568', async ({ page }) => {
  await openDeparturePreparation(page, { width: 320, height: 568, name: 'small phone' }, [5, 10]);
  const layout = await page.evaluate(() => ({
    hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    slots: document.querySelectorAll('.solo-preparation-slot').length,
    starts: [...document.querySelectorAll('.solo-start-floor-option')].map(button => {
      const box = button.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    }),
  }));
  expect(layout.hasHorizontalOverflow).toBe(false);
  expect(layout.slots).toBe(20);
  expect(layout.starts.every(({ top, bottom, height }) => top >= 0 && bottom <= 568 && height >= 44)).toBe(true);
});

for (const vp of VIEWPORTS) {
  test(`Departure rendering recovers after page lifecycle pause on ${vp.name}`, async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.addInitScript(() => {
      const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
      let paused = localStorage.getItem('__issue744PauseAfterReload') === '1';
      window.__pauseGameAnimation = () => { paused = true; };
      window.__resumeGameAnimation = () => { paused = false; };
      window.requestAnimationFrame = (callback) => (
        paused ? 0 : nativeRequestAnimationFrame(callback)
      );

      const originalFillText = CanvasRenderingContext2D.prototype.fillText;
      window.__canvasText = [];
      CanvasRenderingContext2D.prototype.fillText = function fillText(text, ...args) {
        if (text === 'CASTLE OF LLYLGAMYN') window.__canvasText.push(text);
        return originalFillText.call(this, text, ...args);
      };
    });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      window.__dungeonSceneDraws = [];
      for (const [kind, method] of [
        ['town', 'drawTownBackground'],
        ['corridor', 'draw3DCorridors'],
      ]) {
        const original = dungeonRenderer[method];
        dungeonRenderer[method] = function recordScene(...args) {
          window.__dungeonSceneDraws.push({
            kind,
            gameState: state.gameState,
            hasMap: Boolean(state.map),
            floor: state.floor,
          });
          return original.apply(this, args);
        };
      }
      state.metaMaterials = { '獣の牙': 10, '硬い皮': 10 };
      state.workshop = { ranks: {} };
      state.unlockedMilestones = [5];
    });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

    await page.evaluate(() => {
      window.__dungeonSceneDraws = [];
      window.__canvasText = [];
      window.__pauseGameAnimation();
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.locator('#btn-town-dungeon').click();
    await page.getByRole('button', { name: /戦士/ }).click();
    await page.locator('[data-recipe-id="HEAL_POTION"]').click();
    await page.getByRole('button', { name: /B1Fから開始/ }).click();
    await expect(page.locator('#explore-controls')).toBeVisible();

    const pausedDeparture = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { gameState: state.gameState, hasMap: Boolean(state.map), draws: window.__dungeonSceneDraws };
    });
    expect(pausedDeparture).toMatchObject({ gameState: 'explore', hasMap: true, draws: [] });

    await page.evaluate(() => {
      window.__resumeGameAnimation();
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => (
      window.__dungeonSceneDraws?.some((draw) => draw.kind === 'corridor')
    ));

    const firstDeparture = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const visibility = (await import('/src/renderer.js')).dungeonRenderer.getSceneVisibility();
      return {
        state: { gameState: state.gameState, hasMap: Boolean(state.map), floor: state.floor },
        visibility,
        draws: window.__dungeonSceneDraws,
        castleTitles: window.__canvasText,
      };
    });
    expect(firstDeparture.state).toEqual({ gameState: 'explore', hasMap: true, floor: 1 });
    expect(firstDeparture.visibility.showTownBackground).toBe(false);
    expect(firstDeparture.draws.at(-1)).toMatchObject({ kind: 'corridor', gameState: 'explore', hasMap: true });
    expect(firstDeparture.draws.some((draw) => draw.kind === 'town')).toBe(false);
    expect(firstDeparture.castleTitles).toEqual([]);

    await page.evaluate(async () => {
      (await import('/src/result.js')).triggerRunResult('retreat');
    });
    await page.getByRole('button', { name: '街へ戻る' }).click();
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.metaMaterials = { '獣の牙': 10, '硬い皮': 10 };
      state.unlockedMilestones = [5];
      window.__dungeonSceneDraws = [];
      window.__canvasText = [];
    });
    await page.locator('#btn-town-dungeon').click();
    await page.getByRole('button', { name: /戦士/ }).click();
    await page.locator('[data-recipe-id="HEAL_POTION"]').click();
    await page.getByRole('button', { name: /B5Fから開始/ }).click();
    await expect(page.locator('#explore-controls')).toBeVisible();
    await page.waitForFunction(() => (
      window.__dungeonSceneDraws?.some((draw) => draw.kind === 'corridor')
    ));

    const secondDeparture = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const visibility = (await import('/src/renderer.js')).dungeonRenderer.getSceneVisibility();
      return {
        state: { gameState: state.gameState, hasMap: Boolean(state.map), floor: state.floor },
        visibility,
        draws: window.__dungeonSceneDraws,
        castleTitles: window.__canvasText,
      };
    });
    expect(secondDeparture.state).toEqual({ gameState: 'explore', hasMap: true, floor: 5 });
    expect(secondDeparture.visibility.showTownBackground).toBe(false);
    expect(secondDeparture.draws.at(-1)).toMatchObject({ kind: 'corridor', gameState: 'explore', hasMap: true });
    expect(secondDeparture.draws.some((draw) => draw.kind === 'town')).toBe(false);
    expect(secondDeparture.castleTitles).toEqual([]);

    await page.evaluate(() => {
      localStorage.setItem('__issue744PauseAfterReload', '1');
    });
    await page.reload();
    const reloadState = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      window.__reloadCorridorDraws = [];
      const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;
      dungeonRenderer.draw3DCorridors = function recordReloadCorridorDraw(...args) {
        window.__reloadCorridorDraws.push({
          gameState: state.gameState,
          hasMap: Boolean(state.map),
          floor: state.floor,
        });
        return originalDraw3DCorridors.apply(this, args);
      };
      return {
        gameState: state.gameState,
        hasMap: Boolean(state.map),
        floor: state.floor,
      };
    });
    expect(reloadState).toEqual({ gameState: 'explore', hasMap: true, floor: 5 });
    await page.evaluate(() => {
      localStorage.removeItem('__issue744PauseAfterReload');
      window.__resumeGameAnimation();
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => (
      window.__reloadCorridorDraws?.some((draw) => draw.gameState === 'explore' && draw.hasMap)
    ));
    const resumedSave = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const visibility = (await import('/src/renderer.js')).dungeonRenderer.getSceneVisibility();
      return {
        state: { gameState: state.gameState, hasMap: Boolean(state.map), floor: state.floor },
        visibility,
        corridorDraws: window.__reloadCorridorDraws,
        castleTitles: window.__canvasText,
      };
    });
    expect(resumedSave.state).toEqual({ gameState: 'explore', hasMap: true, floor: 5 });
    expect(resumedSave.visibility.showTownBackground).toBe(false);
    expect(resumedSave.corridorDraws.at(-1)).toMatchObject({ gameState: 'explore', hasMap: true, floor: 5 });
    expect(resumedSave.castleTitles).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}
