import { test, expect } from '@playwright/test';
import { VIEWPORTS } from './ui-ux-helpers.js';

const EQUIPMENT_SHORT_VIEWPORTS = [
  { width: 375, height: 667, name: 'iPhone SE' },
  { width: 320, height: 568, name: 'short mobile' },
];

for (const vp of VIEWPORTS) {
  test(`Equipment list keeps the equipped comparison visible at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Fighter');
      char.equipment = { weapon: null, shield: null, armor: null, accessory: null, accessory2: null };
      state.party = [char];
      state.inventory = Array.from({ length: 20 }, (_, index) => ({
        kind: 'equipment',
        instanceId: `list_visibility_${index}`,
        baseId: index % 2 === 0 ? 'SHORT_SWORD' : 'LEATHER_ARMOR',
        rarity: 'common',
        level: 1,
        identified: true,
        affixes: [],
      }));
      openEquipOverlay(0);
    });

    const overlay = page.locator('#equip-overlay');
    await expect(overlay.locator('.equip-section-heading')).toHaveCount(2);
    await expect(overlay.locator('.equip-section-heading', { hasText: '装備中' })).toBeVisible();
    await expect(overlay.locator('.equip-section-heading', { hasText: 'バッグの装備品' })).toBeVisible();
    await expect(overlay.locator('.equip-type-heading')).toHaveCount(2);
    await expect(overlay.locator('.equip-equipped-row')).toHaveCount(0);
    await expect(overlay.locator('.equip-empty-slot')).toHaveCount(5);

    const firstBagRow = overlay.locator('.equip-bag-section .equip-item-row').first();
    const firstBagBox = await firstBagRow.boundingBox();
    expect(firstBagBox.y, `first bag row should be visible on ${vp.name}`).toBeGreaterThanOrEqual(0);
    expect(firstBagBox.y + firstBagBox.height, `first bag row should fit on ${vp.name}`).toBeLessThanOrEqual(vp.height);
    await firstBagRow.click();
    await expect(overlay.locator('.equip-empty-slot[data-slot-id="weapon"]')).toHaveClass(/is-comparison-target/);

    for (const row of await overlay.locator('.equip-item-row').all()) {
      expect((await row.boundingBox()).height, `equipment row should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
    }

    const equippedSection = overlay.locator('.equip-equipped-section');
    const equippedTop = (await equippedSection.boundingBox()).y;
    const itemList = overlay.locator('.equip-item-list');
    await itemList.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await equippedSection.boundingBox()).y).toBe(equippedTop);

    await overlay.locator('.equip-filter-chip', { hasText: '鎧' }).click();
    await expect(overlay.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' })).toHaveCount(0);
    await expect(overlay.locator('.equip-bag-section .equip-item-row', { hasText: 'レザーアーマー' })).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
  });

  test(`Equipment list marks the selected replacement slot at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Fighter');
      char.equipment = { weapon: 'DAGGER', shield: null, armor: null, accessory: null, accessory2: null };
      state.party = [char];
      state.inventory = [{
        kind: 'equipment',
        instanceId: 'replacement_target',
        baseId: 'SHORT_SWORD',
        rarity: 'common',
        level: 1,
        identified: true,
        affixes: [],
      }];
      openEquipOverlay(0);
    });

    const equippedWeapon = page.locator('.equip-equipped-row[data-slot-id="weapon"]');
    await expect(equippedWeapon).toHaveClass(/equip-equipped-row/);
    await expect(equippedWeapon).toContainText('装備中');
    await expect(equippedWeapon).not.toHaveClass(/is-comparison-target/);

    await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
    await expect(page.locator('.equip-equipped-row[data-slot-id="weapon"]')).toHaveClass(/is-comparison-target/);
    await expect(page.locator('.equip-equipped-row[data-slot-id="weapon"]')).toHaveAttribute('aria-current', 'location');
  });

  test(`Equipment attack preview reflects weapon and STR coefficients at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Fighter');
      char.equipment.weapon = 'DAGGER';
      char.equipment.accessory = null;
      state.floor = 1;
      state.party = [char];
      state.inventory = [
        {
          kind: 'equipment', instanceId: 'display_atk_plus_two', baseId: 'DAGGER', rarity: 'magic', level: 1,
          identified: true, affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 2 }]
        },
        {
          kind: 'equipment', instanceId: 'display_str_plus_two', baseId: 'RING_STR', rarity: 'magic', level: 1,
          identified: true, affixes: []
        }
      ];
      openEquipOverlay(0);
    });

    await page.locator('.equip-item-row', { hasText: '鋭利なダガー' }).click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).toHaveText('+3');

    await page.locator('.equip-item-row', { hasText: '力の指輪' }).click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).toHaveText('+2');
  });

  test(`Equipment attack preview keeps odd/even weapon values integer at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Thief');
      char.equipment.weapon = 'DAGGER';
      char.equipment.accessory = null;
      state.floor = 1;
      state.party = [char];
      state.inventory = [{
        kind: 'equipment', instanceId: 'display_atk_plus_one', baseId: 'DAGGER', rarity: 'magic', level: 1,
        identified: true, affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 1 }]
      }];
      openEquipOverlay(0);
    });

    const oddWeapon = page.locator('.equip-item-row', { hasText: '攻撃 +3' });
    await expect(oddWeapon.locator('.equip-row-badge')).toHaveText('+1');
    await oddWeapon.click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('strong')).toHaveText(/^\d+→\d+$/);
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).toHaveText('+1');
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).not.toContainText('.');
    await page.getByRole('button', { name: '装備する' }).click();

    const evenWeapon = page.locator('.equip-item-row', { hasText: '攻撃 +2' }).last();
    await evenWeapon.click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('strong')).toHaveText(/^\d+→\d+$/);
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).toHaveText('-1');
    await expect(evenWeapon.locator('.equip-row-badge')).toHaveText('-1');
  });

  test(`Equipment can be discarded with confirmation at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      state.party = [createSoloCharacter('Fighter')];
      state.inventory = [
        {
          kind: 'equipment', instanceId: 'discard_sword', baseId: 'SHORT_SWORD', rarity: 'common', level: 1,
          identified: true, affixes: []
        },
        {
          kind: 'equipment', instanceId: 'keep_armor', baseId: 'LEATHER_ARMOR', rarity: 'common', level: 1,
          identified: true, affixes: []
        }
      ];
      openEquipOverlay(0);
    });

    await page.locator('.equip-item-row.rarity-common', { hasText: 'ショートソード' }).click();
    const discardButton = page.getByRole('button', { name: '破棄する' });
    await expect(discardButton).toBeVisible();
    expect((await discardButton.boundingBox()).height).toBeGreaterThanOrEqual(44);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('ショートソード');
      await dialog.dismiss();
    });
    await discardButton.click();
    await expect.poll(() => page.evaluate(async () => (await import('/src/state.js')).state.inventory.length)).toBe(2);

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await discardButton.click();
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.inventory.map((item) => item.instanceId);
    })).toEqual(['keep_armor']);
    expect(await page.evaluate(() => {
      const payload = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
      return payload.inventory.map((item) => item.instanceId);
    })).toEqual(['keep_armor']);
  });

  test(`Equipment detail can return to the list at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      state.party = [createSoloCharacter('Fighter')];
      state.inventory = [{
        kind: 'equipment', instanceId: 'return_to_list_sword', baseId: 'SHORT_SWORD', rarity: 'common', level: 1,
        identified: true, affixes: []
      }];
      openEquipOverlay(0);
    });

    const sword = page.locator('.equip-item-row.rarity-common', { hasText: 'ショートソード' });
    await sword.click();
    const backButton = page.getByRole('button', { name: '一覧へ戻る' });
    await expect(backButton).toBeVisible();
    expect((await backButton.boundingBox()).height).toBeGreaterThanOrEqual(44);

    await backButton.click();
    await expect(page.locator('.equip-detail-placeholder')).toContainText('装備品を選択してください');
    await expect(page.getByRole('button', { name: '一覧へ戻る' })).toHaveCount(0);
    await expect(page.locator('.equip-item-row.rarity-common', { hasText: 'ショートソード' })).toHaveCount(1);
    expect(await page.evaluate(async () => (await import('/src/state.js')).state.inventory)).toHaveLength(1);
  });

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
        },
        {
          kind: 'equipment', instanceId: 'ui_accessory', baseId: 'AMULET_HP', rarity: 'rare', level: 3,
          identified: true, halfIdentified: false, tags: ['ward'], hintTags: ['ward'],
          curseEffectId: null, cursePower: 1, curseSuspected: false,
          affixes: [{ id: 'hp', type: 'hp', kind: 'support', value: 4 }]
        }, {
          kind: 'equipment', instanceId: 'ui_magic', baseId: 'RING_STR', rarity: 'magic', level: 2,
          identified: true, halfIdentified: false, tags: ['iron'], hintTags: ['iron'],
          curseEffectId: null, cursePower: 1, curseSuspected: false,
          affixes: [{ id: 'str', type: 'str', kind: 'support', value: 2 }]
        }, {
          kind: 'equipment', instanceId: 'ui_epic', baseId: 'SHORT_SWORD', rarity: 'epic', level: 6,
          identified: true, halfIdentified: false, tags: ['blade'], hintTags: ['blade'],
          curseEffectId: null, cursePower: 1, curseSuspected: false,
          affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 8 }]
        }
      ];
      openEquipOverlay(0);
    });

    const unidentifiedSword = page.locator('.equip-item-row', { hasText: 'ショートソード（未鑑定）' });
    await expect(unidentifiedSword).not.toHaveClass(/rarity-/);
    await expect(unidentifiedSword.locator('.equip-rarity-badge')).toHaveCount(0);
    await unidentifiedSword.click();
    await expect(page.locator('.equip-detail-content')).toContainText('比較不能');
    const identifyButton = page.getByRole('button', { name: /鑑定する/ });
    await expect(identifyButton).toBeVisible();
    expect((await identifyButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await identifyButton.click();
    await expect(page.locator('.equip-detail-content')).not.toContainText('比較不能');
    const identifiedSword = page.locator('.equip-item-row.rarity-rare', { hasText: 'ショートソード' }).first();
    await expect(identifiedSword).toHaveClass(/rarity-rare/);
    await expect(identifiedSword.locator('.equip-rarity-badge')).toHaveText('RARE');
    await expect(page.locator('.equip-item-row.rarity-magic .equip-rarity-badge')).toHaveText('MAGIC');
    await expect(page.locator('.equip-item-row.rarity-epic .equip-rarity-badge')).toHaveText('EPIC');
    await expect(page.locator('.equip-detail-rarity')).toHaveText('RARE');

    await page.locator('.equip-item-row', { hasText: '生命の護符' }).click();
    await expect(page.locator('.equip-slot-choice')).toHaveCount(2);
    for (const choice of await page.locator('.equip-slot-choice').all()) {
      expect((await choice.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: '装飾2: なし' }).click();
    await page.getByRole('button', { name: '装備する' }).click();
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.party[0].equipment.accessory2?.instanceId || null;
    })).toBe('ui_accessory');

    await page.locator('.equip-item-row', { hasText: 'レザーアーマー（未鑑定）' }).click();
    const gambleButton = page.getByRole('button', { name: '未鑑定で装備する（正体開示）' });
    expect((await gambleButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await gambleButton.click();
    await page.locator('.equip-item-row', { hasText: '呪い・外せない' }).click();
    await expect(page.locator('.equip-detail-content')).toContainText('呪いで固定中');
    const removeButton = page.getByRole('button', { name: /深層商人で解呪できます/ });
    await expect(removeButton).toBeVisible();
    expect((await removeButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: '破棄する' })).toHaveCount(0);
  });
}

for (const vp of EQUIPMENT_SHORT_VIEWPORTS) {
  test(`Filled equipment layout keeps two bag rows at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Fighter');
      char.equipment = {
        weapon: 'SHORT_SWORD',
        shield: 'SMALL_SHIELD',
        armor: 'LEATHER_ARMOR',
        accessory: 'AMULET_HP',
        accessory2: 'RING_STR',
      };
      state.party = [char];
      state.inventory = [
        'DAGGER', 'WAND', 'MACE', 'RAPIER', 'SMALL_SHIELD', 'BUCKLER',
        'ROBE', 'LEATHER_ARMOR', 'EXPLORER_CLOAK', 'AMULET_HP', 'RING_STR',
      ].map((baseId, index) => ({
        kind: 'equipment',
        instanceId: `filled_layout_${index}`,
        baseId,
        rarity: 'common',
        level: 1,
        identified: true,
        affixes: [],
      }));
      openEquipOverlay(0);
    });

    const overlay = page.locator('#equip-overlay');
    await expect(overlay.locator('.equip-equipped-row')).toHaveCount(5);
    await expect(overlay.locator('.equip-section-heading', { hasText: '装備中' })).toBeVisible();
    await expect(overlay.locator('.equip-section-heading', { hasText: 'バッグの装備品' })).toBeVisible();

    const bagSection = overlay.locator('.equip-bag-section');
    const bagBox = await bagSection.boundingBox();
    const itemList = overlay.locator('.equip-bag-section .equip-item-list');
    const itemListBox = await itemList.boundingBox();
    const detail = overlay.locator('.equip-detail-col');
    const detailBox = await detail.boundingBox();
    expect(bagBox?.height, `bag section should reserve two tap rows on ${vp.name}`).toBeGreaterThanOrEqual(154);
    expect(detailBox?.height, `detail panel should retain a measurable region on ${vp.name}`).toBeGreaterThan(0);
    expect(detailBox?.y, `detail must not overlap the bag list on ${vp.name}`).toBeGreaterThanOrEqual((itemListBox?.y || 0) + (itemListBox?.height || 0) - 0.5);

    const bagRows = overlay.locator('.equip-bag-section .equip-item-row');
    expect(await bagRows.count()).toBeGreaterThanOrEqual(2);
    for (const row of [bagRows.nth(0), bagRows.nth(1)]) {
      const rowBox = await row.boundingBox();
      expect(rowBox?.height, `bag rows keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(rowBox?.y, `bag row should be inside the scrolling list on ${vp.name}`).toBeGreaterThanOrEqual((itemListBox?.y || 0) - 0.5);
      expect(rowBox?.y + rowBox?.height, `two bag rows should fit on ${vp.name}`).toBeLessThanOrEqual((itemListBox?.y || 0) + (itemListBox?.height || 0) + 0.5);
    }

    await bagRows.first().click();
    const description = overlay.locator('.equip-detail-desc');
    await expect(description).toBeVisible();
    const descriptionMetrics = await description.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        height: box.height,
        lineHeight: Number.parseFloat(styles.lineHeight),
        whiteSpace: styles.whiteSpace,
      };
    });
    expect(descriptionMetrics.whiteSpace, `description should wrap on ${vp.name}`).toBe('normal');
    expect(descriptionMetrics.height, `description should show multiple lines on ${vp.name}`).toBeGreaterThanOrEqual(descriptionMetrics.lineHeight * 2 - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

    await page.screenshot({
      path: `output/playwright/issue-711-after-selected-${vp.width}x${vp.height}.png`,
      fullPage: true,
    });
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
    const expectedScrollTop = await itemList.evaluate((element, targetScrollTop) => Math.min(targetScrollTop, element.scrollHeight - element.clientHeight), savedScrollTop);
    await expect.poll(() => itemList.evaluate((element) => element.scrollTop)).toBe(expectedScrollTop);

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

    await expect(page.locator('.workshop-node')).toHaveCount(18);

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
