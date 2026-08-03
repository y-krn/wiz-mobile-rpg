import { test, expect } from '@playwright/test';
import { VIEWPORTS } from './ui-ux-helpers.js';
for (const vp of VIEWPORTS) {
  test(`Equipment gamble stays explicit and thumb-safe at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      state.party = [createSoloCharacter('Fighter')];
      state.identifyTickets = 4;
      state.inventory = [
        {
          kind: 'equipment', instanceId: 'ui_safe', baseId: 'SHORT_SWORD', rarity: 'rare', level: 3,
          identified: false, halfIdentified: false, tags: ['blade'], hintTags: ['blade'],
          curseEffectId: null, cursePower: 1.3, curseSuspected: false,
          unidentifiedName: 'ショートソード（未鑑定）',
          affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 4 }]
        },
        {
          kind: 'equipment', instanceId: 'ui_curse', baseId: 'LEATHER_ARMOR', rarity: 'rare', level: 5,
          identified: false, halfIdentified: false, tags: ['ward', 'curse'], hintTags: ['ward'],
          curseEffectId: 'curse_hollow_soul', cursePower: 1.6, curseSuspected: true,
          unidentifiedName: 'レザーアーマー（未鑑定）',
          affixes: [{ id: 'def', type: 'def', kind: 'support', value: 4 }]
        }
      ];
      openEquipOverlay(0);
    });

    await page.locator('.equip-item-row', { hasText: 'ショートソード（未鑑定）' }).click();
    await expect(page.locator('.equip-detail-content')).toContainText('比較不能');
    const identifyButton = page.getByRole('button', { name: /鑑定する/ });
    await expect(identifyButton).toBeVisible();
    expect((await identifyButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await identifyButton.click();
    await expect(page.locator('.equip-detail-content')).not.toContainText('比較不能');

    await page.locator('.equip-item-row', { hasText: 'レザーアーマー（未鑑定）' }).click();
    const gambleButton = page.getByRole('button', { name: '未鑑定で装備する（正体開示）' });
    expect((await gambleButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await gambleButton.click();
    await page.locator('.equip-item-row', { hasText: '呪い・外せない' }).click();
    await expect(page.locator('.equip-detail-content')).toContainText('呪いで固定中');
    const removeButton = page.getByRole('button', { name: /節目商人で解呪できます/ });
    await expect(removeButton).toBeVisible();
    expect((await removeButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });
}

for (const vp of VIEWPORTS) {
  test(`Equipment controls stay in the bottom reach zone at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const classes = ['Fighter', 'Mage', 'Priest', 'Thief'];
      state.party = classes.map((className, index) => {
        const char = createSoloCharacter(className);
        char.name = `長い冒険者名${index + 1}`;
        return char;
      });
      state.inventory = Array.from({ length: 20 }, (_, index) => ({
        kind: 'equipment',
        instanceId: `bottom_bar_${index}`,
        baseId: index % 2 === 0 ? 'SHORT_SWORD' : 'LEATHER_ARMOR',
        rarity: 'common',
        level: 1,
        identified: true,
        affixes: [],
      }));
      state.gameState = 'town';
      openEquipOverlay(0);
    });

    const overlay = page.locator('#equip-overlay');
    const footer = overlay.locator('.bottom-actions-container');
    await expect(footer).toBeVisible();
    await expect(overlay.locator(':scope > .equip-header-area button')).toHaveCount(0);
    await expect(overlay.locator(':scope > .equip-header-area .equip-title')).toHaveCount(1);
    await expect(overlay.locator(':scope > .equip-body + .bottom-actions-container')).toHaveCount(1);

    const controls = footer.locator('button');
    const controlCount = await controls.count();
    for (let index = 0; index < controlCount; index += 1) {
      const control = controls.nth(index);
      const box = await control.boundingBox();
      expect(box.height, `${await control.textContent()} should be at least 44px on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(box.x, `${await control.textContent()} should not overflow left on ${vp.name}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${await control.textContent()} should not overflow right on ${vp.name}`).toBeLessThanOrEqual(vp.width);
    }

    for (const control of await footer.locator('.equip-filter-chip, #btn-equip-close').all()) {
      const box = await control.boundingBox();
      expect(vp.height - box.y, `${await control.textContent()} should start within 200px of the bottom on ${vp.name}`).toBeLessThanOrEqual(200);
    }

    const itemList = overlay.locator('.equip-item-list');
    const savedScrollTop = await itemList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(savedScrollTop).toBeGreaterThan(0);
    await footer.locator('.equip-actor-chip').nth(1).click();
    await expect.poll(() => itemList.evaluate((element) => element.scrollTop)).toBe(savedScrollTop);

    await footer.getByRole('button', { name: '鎧' }).click();
    await expect(footer.getByRole('button', { name: '鎧' })).toHaveClass(/active/);
    await expect(overlay.locator('.equip-item-row-name', { hasText: 'ショートソード' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

    await page.locator('#btn-equip-close').click();
    await expect(overlay).toBeHidden();
    expect(await page.evaluate(async () => (await import('/src/state.js')).state.gameState)).toBe('town');
  });
}

test('Full log overlay preserves history scroll and follows new logs at the tail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const historyScroll = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openLogOverlay, updateUI } = await import('/src/ui.js');

    state.gameState = 'town';
    state.logs = Array.from({ length: 80 }, (_, index) => `過去ログ ${index + 1}`);
    updateUI();
    openLogOverlay();

    const body = document.querySelector('#log-overlay-body');
    const maxScroll = body.scrollHeight - body.clientHeight;
    body.scrollTop = Math.floor(maxScroll / 2);
    const before = body.scrollTop;
    state.logs.push('遡り中に追加されたログ');
    updateUI();

    return { before, after: body.scrollTop, maxScroll };
  });

  expect(historyScroll.maxScroll).toBeGreaterThan(48);
  expect(historyScroll.before).toBeLessThan(historyScroll.maxScroll - 24);
  expect(historyScroll.after).toBe(historyScroll.before);

  const reopenedScroll = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { closeLogOverlay, openLogOverlay } = await import('/src/ui.js');
    const body = document.querySelector('#log-overlay-body');
    const maxScroll = body.scrollHeight - body.clientHeight;

    body.scrollTop = Math.floor(maxScroll / 2);
    const before = body.scrollTop;
    closeLogOverlay();
    state.logs.push('閉じている間に追加されたログ');
    openLogOverlay();

    return {
      before,
      maxScroll,
      distanceFromTail: body.scrollHeight - body.scrollTop - body.clientHeight,
      lastLine: body.lastElementChild?.textContent,
    };
  });

  expect(reopenedScroll.before).toBeLessThan(reopenedScroll.maxScroll - 24);
  expect(reopenedScroll.distanceFromTail).toBeLessThanOrEqual(1);
  expect(reopenedScroll.lastLine).toBe('閉じている間に追加されたログ');

  const tailScroll = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const body = document.querySelector('#log-overlay-body');

    body.scrollTop = body.scrollHeight;
    state.logs.push('末尾で追加されたログ');
    updateUI();

    return {
      distanceFromTail: body.scrollHeight - body.scrollTop - body.clientHeight,
      lastLine: body.lastElementChild?.textContent,
    };
  });

  expect(tailScroll.distanceFromTail).toBeLessThanOrEqual(1);
  expect(tailScroll.lastLine).toBe('末尾で追加されたログ');
});

test('Inline log preserves history scroll and follows new logs at the tail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const historyScroll = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');

    state.gameState = 'town';
    state.logs = Array.from(
      { length: 12 },
      (_, index) => `インラインログ ${index + 1} ${'詳細 '.repeat(8)}`,
    );
    updateUI();

    const panel = document.querySelector('#log-panel');
    const maxScroll = panel.scrollHeight - panel.clientHeight;
    panel.scrollTop = Math.floor(maxScroll / 2);
    const before = panel.scrollTop;
    state.logs.push(`インラインログ 13 ${'詳細 '.repeat(8)}`);
    updateUI();

    return { before, after: panel.scrollTop, maxScroll };
  });

  expect(historyScroll.maxScroll).toBeGreaterThan(48);
  expect(historyScroll.before).toBeLessThan(historyScroll.maxScroll - 24);
  expect(historyScroll.after).toBe(historyScroll.before);

  const tailScroll = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const panel = document.querySelector('#log-panel');

    panel.scrollTop = panel.scrollHeight;
    state.logs.push(`末尾追従ログ ${'長い内容 '.repeat(30)}`);
    updateUI();

    return panel.scrollHeight - panel.scrollTop - panel.clientHeight;
  });

  expect(tailScroll).toBeLessThanOrEqual(1);
  await expect(page.locator('#log-content')).toContainText('末尾追従ログ');
});

for (const vp of VIEWPORTS) {
  test(`Workshop purchase is thumb-safe on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { openSubmenu } = await import('/src/navigation.js');

      state.gameState = 'town';
      state.metaMaterials = { '獣の牙': 20, '鉄片': 10 };
      state.workshop = { ranks: {} };
      openSubmenu('workshop_main', '工房 - 恒久アンロック');
    });

    await expect(page.locator('.workshop-node')).toHaveCount(10);

    const layout = await page.locator('.workshop-node').evaluateAll((buttons) => ({
      buttons: buttons.map((button) => button.getBoundingClientRect().toJSON()),
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    expect(layout.hasHorizontalOverflow).toBe(false);
    for (const button of layout.buttons) {
      expect(button.height, `Workshop button should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(button.left, `Workshop button should stay inside viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
      expect(button.right, `Workshop button should stay inside viewport on ${vp.name}`).toBeLessThanOrEqual(vp.width);
    }

    await page.getByRole('button', { name: /軽量武器候補/ }).click();
    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return {
        beastFang: state.metaMaterials['獣の牙'],
        iron: state.metaMaterials['鉄片'],
        rank: state.workshop.ranks.gear_rapier,
      };
    });
    expect(result).toEqual({ beastFang: 16, iron: 8, rank: 1 });
    await expect(page.getByRole('button', { name: /軽量武器候補/ })).toBeDisabled();
  });
}
