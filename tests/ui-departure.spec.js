import { test, expect } from '@playwright/test';
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
      openSubmenu('milestone_merchant', '節目商人');
    });
    const powder = page.getByRole('button', { name: /鑑定粉/ });
    const uncurse = page.getByRole('button', { name: /呪いを解く/ });
    expect((await powder.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await uncurse.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.milestone-merchant-option[data-stock-kind="equipment"]')).toHaveCount(0);
    await powder.click();
    await expect(page.locator('#log-content')).toContainText('鑑定粉を購入した');

    await page.evaluate(async () => {
      const { openSubmenu } = await import('/src/navigation.js');
      openSubmenu('milestone_portal', '帰還ポータル');
    });
    const retreat = page.getByRole('button', { name: /素材を100%持ち帰る/ });
    expect((await retreat.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await retreat.click();
    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { gameState: state.gameState, reason: state.currentRun.returnReason };
    });
    expect(result).toEqual({ gameState: 'result', reason: 'milestone_portal' });
  });
}

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
