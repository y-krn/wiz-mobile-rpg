import { test, expect } from './fixtures/browser-health.js';
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
    await expect(overlay.locator('.equip-exchange-line')).toContainText('なし');
    await page.getByRole('button', { name: '一覧へ戻る' }).click();

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
    await expect(page.locator('.equip-body.is-detail')).toBeVisible();
    await expect(page.locator('.equip-exchange-line')).toContainText('ダガー');
    await expect(page.locator('.equip-exchange-line')).toContainText('ショートソード');
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
          kind: 'equipment', instanceId: 'display_atk_plus_three', baseId: 'DAGGER', rarity: 'magic', level: 1,
          identified: true, affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 3 }]
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

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
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
        kind: 'equipment', instanceId: 'display_atk_plus_one_point_five', baseId: 'DAGGER', rarity: 'magic', level: 1,
        identified: true, affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 1.5 }]
      }];
      openEquipOverlay(0);
    });

    const oddWeapon = page.locator('.equip-item-row', { hasText: '攻撃 +4.5' });
    await expect(oddWeapon.locator('.equip-row-badge')).toHaveText('+1');
    await oddWeapon.click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('strong')).toHaveText(/^\d+→\d+$/);
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).toHaveText('+1');
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).not.toContainText('.');
    await page.getByRole('button', { name: '装備する' }).click();

    const evenWeapon = page.locator('.equip-item-row', { hasText: '攻撃 +3' }).last();
    await evenWeapon.click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('strong')).toHaveText(/^\d+→\d+$/);
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' }).locator('em')).toHaveText('-1');
    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await expect(evenWeapon.locator('.equip-row-badge')).toHaveText('-1');
  });

  test(`Equipment previews do not mutate player state or save payload at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state, saveAutosave, createSavePayload } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Fighter');
      char.equipment.weapon = 'DAGGER';
      state.party = [char];
      state.inventory = [{
        kind: 'equipment', instanceId: 'pure_preview_sword', baseId: 'SHORT_SWORD', rarity: 'magic', level: 1,
        identified: true, affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 3 }]
      }];
      state.metaMaterials = { '鉄片': 4 };
      saveAutosave();
      openEquipOverlay(0);
      window.__equipmentPreviewBaseline = {
        party: JSON.stringify(state.party),
        inventory: JSON.stringify(state.inventory),
        savePayload: JSON.stringify(createSavePayload()),
        autosave: localStorage.getItem('mobile_wiz_rpg_autosave')
      };
    });

    const assertPreviewStateUnchanged = async () => {
      const current = await page.evaluate(async () => {
        const { state, createSavePayload } = await import('/src/state.js');
        const baseline = window.__equipmentPreviewBaseline;
        return {
          party: JSON.stringify(state.party),
          inventory: JSON.stringify(state.inventory),
          savePayload: JSON.stringify(createSavePayload()),
          autosave: localStorage.getItem('mobile_wiz_rpg_autosave'),
          baseline
        };
      });
      expect(current.party).toBe(current.baseline.party);
      expect(current.inventory).toBe(current.baseline.inventory);
      expect(current.savePayload).toBe(current.baseline.savePayload);
      expect(current.autosave).toBe(current.baseline.autosave);
    };

    await page.locator('.equip-item-row', { hasText: 'ショートソード' }).click();
    await expect(page.locator('.equip-stat-pill', { hasText: '攻撃' })).toBeVisible();
    await assertPreviewStateUnchanged();

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await assertPreviewStateUnchanged();
    await page.locator('.equip-equipped-row[data-slot-id="weapon"]').click();
    await expect(page.locator('.equip-exchange-line')).toContainText('→ なし');
    await assertPreviewStateUnchanged();

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.locator('.equip-item-row', { hasText: 'ショートソード' }).click();
    await assertPreviewStateUnchanged();
    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.getByRole('button', { name: '閉じる' }).click();
    await page.evaluate(async () => {
      const { openEquipOverlay } = await import('/src/equip.js');
      openEquipOverlay(0);
    });
    await page.locator('.equip-item-row', { hasText: 'ショートソード' }).click();
    await assertPreviewStateUnchanged();
    await page.getByRole('button', { name: '装備する' }).click();
    await page.locator('#btn-equip-commit').click();
    await page.evaluate(async () => (await import('/src/equip.js')).openEquipOverlay(0));
    await expect(page.locator('.equip-equipped-row[data-slot-id="weapon"]')).toContainText('ショートソード');
    await page.locator('.equip-equipped-row[data-slot-id="weapon"]').click();
    await page.getByRole('button', { name: '外す' }).click();
    await page.locator('#btn-equip-commit').click();
    await expect(page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' })).toHaveCount(1);
    expect(await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return {
        equipped: state.party[0].equipment.weapon,
        inventory: state.inventory.map((item) => typeof item === 'object' ? item.instanceId : item)
      };
    })).toEqual({ equipped: null, inventory: ['DAGGER', 'pure_preview_sword'] });
  });

  test(`Equipment preview tolerates guarded equipment proxies at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state, createSavePayload } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const char = createSoloCharacter('Fighter');
      char.equipment.weapon = 'DAGGER';
      const equipment = {
        weapon: char.equipment.weapon,
        shield: char.equipment.shield,
        armor: char.equipment.armor,
        accessory: char.equipment.accessory,
        accessory2: char.equipment.accessory2,
        ignored: 'ignored'
      };
      char.equipment = new Proxy(equipment, {
        ownKeys() {
          throw new Error('equipment keys unavailable');
        }
      });
      state.party = [char];
      state.inventory = [{
        kind: 'equipment', instanceId: 'proxy_preview_sword', baseId: 'SHORT_SWORD', rarity: 'magic', level: 1,
        identified: true, affixes: []
      }];
      const payload = createSavePayload();
      window.__guardedEquipmentBaseline = {
        partyEquipment: JSON.stringify({ weapon: payload.party[0].equipment.weapon, shield: payload.party[0].equipment.shield }),
        inventory: JSON.stringify(payload.inventory)
      };
      openEquipOverlay(0);
    });

    const assertGuardedStateUnchanged = async () => {
      const current = await page.evaluate(async () => {
        const { createSavePayload } = await import('/src/state.js');
        const payload = createSavePayload();
        return {
          partyEquipment: JSON.stringify({ weapon: payload.party[0].equipment.weapon, shield: payload.party[0].equipment.shield }),
          inventory: JSON.stringify(payload.inventory),
          baseline: window.__guardedEquipmentBaseline
        };
      });
      expect(current.partyEquipment).toBe(current.baseline.partyEquipment);
      expect(current.inventory).toBe(current.baseline.inventory);
    };

    await expect(page.locator('.equip-equipped-row[data-slot-id="weapon"]')).toContainText('ダガー');
    await page.locator('.equip-equipped-row[data-slot-id="weapon"]').click();
    await expect(page.locator('.equip-exchange-line')).toContainText('ダガー → なし');
    await assertGuardedStateUnchanged();
    await page.getByRole('button', { name: '一覧へ戻る' }).click();

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const equipment = {
        weapon: state.party[0].equipment.weapon,
        shield: state.party[0].equipment.shield,
        armor: state.party[0].equipment.armor,
        accessory: state.party[0].equipment.accessory,
        accessory2: state.party[0].equipment.accessory2,
        ignored: 'ignored'
      };
      state.party[0].equipment = new Proxy(equipment, {
        get(target, property, receiver) {
          if (property === 'ignored') throw new Error('equipment property unavailable');
          return Reflect.get(target, property, receiver);
        }
      });
      const { openEquipOverlay } = await import('/src/equip.js');
      openEquipOverlay(0);
    });
    await expect(page.locator('.equip-equipped-row[data-slot-id="weapon"]')).toContainText('ダガー');
    await page.locator('.equip-equipped-row[data-slot-id="weapon"]').click();
    await expect(page.locator('.equip-exchange-line')).toContainText('ダガー → なし');
    await assertGuardedStateUnchanged();
  });

  test(`Equipment can be discarded with confirmation at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');
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
      window.__discardTelemetry = [];
      __setTelemetryClientForTests({
        capture: (name, properties) => window.__discardTelemetry.push({ name, properties })
      });
      trackRunStart(state.currentRun || {}, state.party[0], state);
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
    expect(await page.evaluate(() => window.__discardTelemetry.filter(event => event.name === 'equipment_decision' && event.properties.action === 'discard'))).toEqual([]);

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const equipment = state.party[0].equipment;
      let rejectNextWrite = true;
      state.party[0].equipment = new Proxy(equipment, {
        set(target, property, value) {
          if (rejectNextWrite) {
            rejectNextWrite = false;
            throw new Error('preview write rejected');
          }
          return Reflect.set(target, property, value);
        }
      });
    });
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await discardButton.click();
    await page.getByRole('button', { name: /確定する（探索時間が進む）/ }).click();
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.inventory.map((item) => item.instanceId);
    })).toEqual(['keep_armor']);
    expect(await page.evaluate(() => {
      const payload = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
      return payload.inventory.map((item) => item.instanceId);
    })).toEqual(['keep_armor']);
    const discardEvents = await page.evaluate(() => window.__discardTelemetry.filter(event => event.name === 'equipment_decision' && event.properties.action === 'discard'));
    expect(discardEvents).toHaveLength(1);
    expect(discardEvents[0].properties.action).toBe('discard');
    expect(discardEvents[0].properties.comparisonAvailable).toBe(true);
  });

  test(`Equipment organize mode safely discards multiple bag items at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');
      const equipped = {
        kind: 'equipment', instanceId: 'organize_equipped', baseId: 'DAGGER', rarity: 'common', level: 1,
        identified: true, affixes: []
      };
      state.party = [createSoloCharacter('Fighter')];
      state.party[0].equipment.weapon = equipped;
      state.inventory = [
        equipped,
        {
          kind: 'equipment', instanceId: 'organize_common', baseId: 'MACE', rarity: 'common', level: 1,
          identified: true, affixes: []
        },
        {
          kind: 'equipment', instanceId: 'organize_rare', baseId: 'LONG_SWORD', rarity: 'rare', level: 1,
          identified: true, affixes: []
        },
        {
          kind: 'equipment', instanceId: 'organize_unidentified', baseId: 'RING_STR', rarity: 'rare', level: 1,
          identified: false, affixes: []
        },
        {
          kind: 'equipment', instanceId: 'organize_affix', baseId: 'LEATHER_ARMOR', rarity: 'common', level: 1,
          identified: true, enhanceLevel: 1,
          affixes: [{ id: 'def', type: 'def', kind: 'support', value: 2 }]
        }
      ];
      window.__organizeTelemetry = [];
      __setTelemetryClientForTests({
        capture: (name, properties) => window.__organizeTelemetry.push({ name, properties })
      });
      trackRunStart(state.currentRun || {}, state.party[0], state);
      openEquipOverlay(0);
    });

    await page.getByRole('button', { name: /整理モード/ }).click();
    await expect(page.locator('.equip-body.is-organize')).toBeVisible();
    await expect(page.locator('#equip-organize-help')).toContainText('装備中のアイテムは整理対象から除外されます');
    await expect(page.locator('.equip-equipped-section')).toHaveCount(0);
    await expect(page.locator('.equip-body.is-organize .equip-item-row')).toHaveCount(4);
    await expect(page.getByRole('checkbox', { name: /ダガー/ })).toHaveCount(0);
    for (const row of await page.locator('.equip-body.is-organize .equip-item-row').all()) {
      expect((await row.boundingBox()).height, `organize row should be comfortable to tap on ${vp.width}x${vp.height}`).toBeGreaterThanOrEqual(48);
      await expect(row.locator('.equip-discard-indicator')).toHaveText('☐');
    }

    await page.getByRole('checkbox', { name: /メイス/ }).click();
    await expect(page.locator('.equip-organize-count')).toHaveText('1件選択中');
    await expect(page.getByRole('checkbox', { name: /メイス/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('checkbox', { name: /メイス/ }).locator('.equip-discard-indicator')).toHaveText('☑');
    await page.getByRole('button', { name: '通常表示に戻る' }).click();
    await expect(page.locator('.equip-status-bar')).toContainText('バッグ 5/20');
    await page.getByRole('button', { name: /整理モード/ }).click();

    await page.getByRole('checkbox', { name: /メイス/ }).click();
    await page.getByRole('checkbox', { name: /ロングソード/ }).click();
    await page.getByRole('checkbox', { name: /未鑑定の装備品/ }).click();
    await expect(page.locator('.equip-organize-count')).toHaveText('3件選択中');
    await expect(page.locator('.equip-organize-warning')).toContainText('未鑑定 1件');
    await expect(page.locator('.equip-organize-warning')).toContainText('Rare以上 2件');
    const bulkDiscard = page.getByRole('button', { name: '選択した装備を破棄（3件）' });
    await expect(bulkDiscard).toBeEnabled();
    expect((await bulkDiscard.boundingBox()).height).toBeGreaterThanOrEqual(44);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('3件');
      expect(dialog.message()).toContain('破棄');
      expect(dialog.message()).toContain('未鑑定');
      expect(dialog.message()).toContain('Rare以上');
      await dialog.accept();
    });
    await bulkDiscard.click();
    await page.getByRole('button', { name: /確定する（探索時間が進む）/ }).click();

    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.inventory.map((item) => item.instanceId);
    })).toEqual(['organize_equipped', 'organize_affix']);
    await expect(page.locator('.equip-status-bar')).toContainText('バッグ 2/20');
    await expect.poll(() => page.evaluate(() => window.__organizeTelemetry.filter((event) => (
      event.name === 'equipment_decision' && event.properties.action === 'discard'
    )).length)).toBe(3);

    await expect(page.locator('#equip-overlay')).toBeHidden();
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

  test(`Equipment detail wires enhancement with material and target states at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      state.party = [createSoloCharacter('Fighter')];
      state.metaMaterials = { '鉄片': 1, '魔石片': 0, '硬い皮': 2 };
      state.inventory = [
        {
          kind: 'equipment', instanceId: 'ui_enhance_weapon', baseId: 'SHORT_SWORD', rarity: 'common', level: 1,
          identified: true, enhanceLevel: 0, affixes: []
        },
        {
          kind: 'equipment', instanceId: 'ui_enhance_accessory', baseId: 'AMULET_HP', rarity: 'common', level: 1,
          identified: true, enhanceLevel: 0, affixes: []
        },
        {
          kind: 'equipment', instanceId: 'ui_enhance_unidentified', baseId: 'WAND', rarity: 'common', level: 1,
          identified: false, unidentifiedName: '未鑑定の杖', enhanceLevel: 0, affixes: []
        },
      ];
      openEquipOverlay(0);
    });

    await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
    const panel = page.locator('.equip-workshop-panel');
    await expect(panel).toContainText('強化段階: +0 / +1');
    await expect(panel.locator('.equip-material-line[data-material="鉄片"]')).toHaveText('鉄片 1/2');
    const insufficient = panel.getByRole('button', { name: '強化素材が不足しています' });
    await expect(insufficient).toBeDisabled();

    const actionBox = await insufficient.boundingBox();
    expect(actionBox?.height, `enhancement action should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { renderEquip } = await import('/src/equip.js');
      state.metaMaterials['鉄片'] = 2;
      state.metaMaterials['魔石片'] = 1;
      renderEquip();
    });
    const enhanceButton = panel.getByRole('button', { name: '強化する' });
    await expect(enhanceButton).toBeEnabled();
    await enhanceButton.scrollIntoViewIfNeeded();
    const readyBox = await enhanceButton.boundingBox();
    expect(readyBox?.height, `enhancement action should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
    await enhanceButton.click();

    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.inventory[0].enhanceLevel;
    })).toBe(1);
    await expect(panel).toContainText('強化段階: +1 / +1');
    await expect(panel).toContainText('攻撃力:');
    await expect(panel).toContainText('強化済み（現行上限 +1）');

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.locator('.equip-equipped-row[data-slot-id="shield"]').click();
    const equippedPanel = page.locator('.equip-workshop-panel');
    await expect(equippedPanel).toContainText('強化段階: +0 / +1');
    await expect(equippedPanel).toContainText('防御力:');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { renderEquip } = await import('/src/equip.js');
      state.metaMaterials['鉄片'] = 2;
      state.metaMaterials['魔石片'] = 1;
      renderEquip();
    });
    const equippedEnhanceButton = equippedPanel.getByRole('button', { name: '強化する' });
    await expect(equippedEnhanceButton).toBeEnabled();
    await equippedEnhanceButton.click();
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.party[0].equipment.shield.enhanceLevel;
    })).toBe(1);
    await expect(equippedPanel).toContainText('強化段階: +1 / +1');

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.locator('.equip-item-row', { hasText: '生命の護符' }).click();
    await expect(page.locator('.equip-workshop-section', { hasText: '装備強化' })).toContainText('この装備は強化対象外です');
    await expect(page.locator('.equip-workshop-section', { hasText: '装備強化' }).getByRole('button', { name: '強化する' })).toHaveCount(0);

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.locator('.equip-item-row', { hasText: '未鑑定の杖' }).click();
    const unidentifiedEnhanceSection = page.locator('.equip-workshop-section', { hasText: '装備強化' });
    await expect(unidentifiedEnhanceSection).toContainText('未鑑定のため強化対象外です');
    await expect(unidentifiedEnhanceSection.getByRole('button', { name: '強化する' })).toHaveCount(0);
  });

  test(`Equipment detail wires support-affix polishing with material and target states at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      state.party = [createSoloCharacter('Fighter')];
      state.metaMaterials = { '魔石片': 1 };
      state.inventory = [
        {
          kind: 'equipment', instanceId: 'ui_polish_support', baseId: 'DAGGER', rarity: 'magic', level: 1,
          identified: true, affixes: [
            { id: 'atk', type: 'atk', kind: 'support', value: 3 },
            { id: 'def', type: 'def', kind: 'support', value: 2 },
          ]
        },
        {
          kind: 'equipment', instanceId: 'ui_polish_core', baseId: 'MACE', rarity: 'magic', level: 1,
          identified: true, affixes: [{ id: 'CORE_LAST_STAND', type: 'CORE_LAST_STAND', kind: 'core' }]
        },
        {
          kind: 'equipment', instanceId: 'ui_polish_unidentified', baseId: 'WAND', rarity: 'magic', level: 1,
          identified: false, unidentifiedName: '未鑑定の杖',
          affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 3 }]
        },
      ];
      openEquipOverlay(0);
    });

    await page.locator('.equip-bag-section .equip-item-row', { hasText: '鋭利なダガー' }).click();
    const panel = page.locator('.equip-workshop-panel');
    const polishSection = panel.locator('.equip-polish-section');
    await expect(panel).toContainText('補助アフィックス研磨');
    await expect(polishSection.locator('.equip-material-line[data-material="魔石片"]')).toHaveText('魔石片 1/2');
    const insufficient = panel.getByRole('button', { name: '研磨素材が不足しています' }).first();
    await expect(insufficient).toBeDisabled();
    await expect(panel).toContainText('攻撃: 3 → 5');
    await expect(panel).toContainText('防御: 2 → 3');

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { renderEquip } = await import('/src/equip.js');
      state.metaMaterials['魔石片'] = 2;
      renderEquip();
    });
    await expect(polishSection.getByRole('button', { name: '研磨する' })).toHaveCount(2);
    const polishButton = polishSection.getByRole('button', { name: '研磨する' }).nth(1);
    await expect(polishButton).toBeEnabled();
    await polishButton.scrollIntoViewIfNeeded();
    const readyBox = await polishButton.boundingBox();
    expect(readyBox?.height, `polishing action should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
    await polishButton.click();

    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { values: state.inventory[0].affixes.map((affix) => affix.value), polished: state.inventory[0].polished };
    })).toEqual({ values: [3, 3], polished: true });
    await expect(page.locator('.equip-affix-details')).toContainText('攻撃: +3');
    await expect(page.locator('.equip-affix-details')).toContainText('防御: +3');
    await expect(panel).toContainText('研磨済み（この装備は1回まで）');

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.locator('.equip-item-row', { hasText: 'メイス' }).click();
    await expect(page.locator('.equip-workshop-section', { hasText: '補助アフィックス研磨' })).toContainText('コアは研磨対象外です');

    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    await page.locator('.equip-item-row', { hasText: '未鑑定の杖' }).click();
    await expect(page.locator('.equip-workshop-section', { hasText: '補助アフィックス研磨' })).toContainText('未鑑定のため研磨対象外です');
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
    await expect(page.locator('.equip-detail-content')).toContainText('知識段階: 発見');
    await expect(page.locator('.equip-detail-content')).toContainText('兆候:');
    const identifyButton = page.getByRole('button', { name: /鑑定する/ });
    await expect(identifyButton).toBeVisible();
    expect((await identifyButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await identifyButton.click();
    await expect(page.locator('.equip-detail-content')).not.toContainText('比較不能');
    await expect(page.locator('.equip-detail-content')).toContainText('知識段階: 完全理解');
    await expect(page.locator('.equip-detail-rarity')).toHaveText('RARE');
    await page.getByRole('button', { name: '一覧へ戻る' }).click();
    const identifiedSword = page.locator('.equip-item-row.rarity-rare', { hasText: 'ショートソード' }).first();
    await expect(identifiedSword).toHaveClass(/rarity-rare/);
    await expect(identifiedSword.locator('.equip-rarity-badge')).toHaveText('RARE');
    await expect(page.locator('.equip-item-row.rarity-magic .equip-rarity-badge')).toHaveText('MAGIC');
    await expect(page.locator('.equip-item-row.rarity-epic .equip-rarity-badge')).toHaveText('EPIC');

    await page.locator('.equip-item-row', { hasText: '生命の護符' }).click();
    await expect(page.locator('.equip-slot-choice')).toHaveCount(2);
    for (const choice of await page.locator('.equip-slot-choice').all()) {
      expect((await choice.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: '装飾2: なし' }).click();
    await page.getByRole('button', { name: '装備する' }).click();
    await page.getByRole('button', { name: /確定する（探索時間が進む）/ }).click();
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.party[0].equipment.accessory2?.instanceId || null;
    })).toBe('ui_accessory');
    await page.evaluate(async () => (await import('/src/equip.js')).openEquipOverlay(0));

    await page.locator('.equip-item-row', { hasText: 'レザーアーマー（未鑑定）' }).click();
    await expect(page.locator('.equip-affix-details')).toHaveCount(0);
    const gambleButton = page.locator('button.equip-action-btn').filter({ hasText: '未鑑定で装備する' });
    await expect(gambleButton).toBeVisible();
    await gambleButton.scrollIntoViewIfNeeded();
    expect((await gambleButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await gambleButton.click();
    await page.getByRole('button', { name: /確定する（探索時間が進む）/ }).click();
    await page.evaluate(async () => (await import('/src/equip.js')).openEquipOverlay(0));
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const item = state.party[0].equipment.armor;
      return {
        identified: item.identified,
        halfIdentified: item.halfIdentified,
        knowledgeStage: item.knowledgeStage,
        curseLocked: item.curseLocked
      };
    })).toEqual({ identified: false, halfIdentified: false, knowledgeStage: 'trial', curseLocked: true });
    await page.locator('.equip-item-row', { hasText: '呪い・外せない' }).click();
    await expect(page.locator('.equip-detail-content')).toContainText('呪いで固定中');
    await expect(page.locator('.equip-detail-content')).toContainText('知識段階: 試用');
    await expect(page.locator('.equip-detail-content')).toContainText('主な手応え:');
    await expect(page.locator('.equip-affix-details')).toContainText('呪われている（効果不明）');
    await expect(page.locator('.equip-affix-details')).not.toContainText('魂喰い');
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
    await expect(overlay.locator('.equip-body.is-detail')).toBeVisible();
    await expect(overlay.locator('.equip-exchange-line')).toContainText('ショートソード');
    await expect(overlay.locator('.equip-detail-col')).toBeVisible();

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
    const detailNameMetrics = await overlay.locator('.equip-detail-name').evaluate((element) => {
      const styles = getComputedStyle(element);
      return { whiteSpace: styles.whiteSpace, overflowWrap: styles.overflowWrap, textOverflow: styles.textOverflow };
    });
    expect(detailNameMetrics.whiteSpace, `detail name should wrap on ${vp.name}`).toBe('normal');
    expect(detailNameMetrics.overflowWrap, `detail name should break long tokens on ${vp.name}`).toBe('anywhere');
    expect(detailNameMetrics.textOverflow, `detail name should not ellipsize on ${vp.name}`).toBe('clip');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

    console.log(`[ISSUE-715 AFTER] ${vp.width}x${vp.height} equipped rows remain available in the list screen; selected comparison is shown in the detail screen`);

    await page.screenshot({
      path: `output/playwright/issue-715-after-${vp.width}x${vp.height}.png`,
      fullPage: true,
    });
  });
}

for (const vp of EQUIPMENT_SHORT_VIEWPORTS) {
  test(`Equipment detail keeps primary actions and comparison visible at ${vp.width}x${vp.height}`, async ({ page }) => {
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
      state.identifyTickets = 4;
      state.inventory = [
        {
          kind: 'equipment', instanceId: `issue740_detail_${innerWidth}`,
          baseId: 'SHORT_SWORD', rarity: 'rare', level: 3,
          identified: false, halfIdentified: false, tags: ['blade'], hintTags: ['blade'],
          curseEffectId: null, cursePower: 1.3, curseSuspected: false,
          unidentifiedName: 'ショートソード（未鑑定）',
          affixes: [
            { id: 'atk', type: 'atk', kind: 'support', value: 4 },
            { id: 'def', type: 'def', kind: 'support', value: 4 },
            { id: 'hp', type: 'hp', kind: 'support', value: 4 },
            { id: 'mp', type: 'mp', kind: 'support', value: 4 },
            { id: 'str', type: 'str', kind: 'support', value: 2 },
            { id: 'int', type: 'int', kind: 'support', value: 2 },
            { id: 'pie', type: 'pie', kind: 'support', value: 2 },
          ],
        },
        {
          kind: 'equipment', instanceId: `issue740_detail_second_${innerWidth}`,
          baseId: 'DAGGER', rarity: 'common', level: 1, identified: true, affixes: [],
        },
      ];
      openEquipOverlay(0);
    });

    const overlay = page.locator('#equip-overlay');
    const bagRows = overlay.locator('.equip-bag-section .equip-item-row');
    await expect(overlay.locator('.equip-equipped-row')).toHaveCount(5);
    await expect(bagRows).toHaveCount(2);
    const itemListBox = await overlay.locator('.equip-item-list').boundingBox();
    for (const row of [bagRows.nth(0), bagRows.nth(1)]) {
      const rowBox = await row.boundingBox();
      expect(rowBox?.height, `bag row should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(rowBox?.y, `bag row should be visible on ${vp.name}`).toBeGreaterThanOrEqual(itemListBox?.y || 0);
      expect(rowBox?.y + rowBox?.height, `bag row should fit before selection on ${vp.name}`).toBeLessThanOrEqual(
        (itemListBox?.y || 0) + (itemListBox?.height || 0) + 0.5
      );
    }

    await bagRows.first().click();
    await expect(overlay.locator('.equip-body.is-detail')).toBeVisible();
    await expect(overlay.locator('.equip-exchange-line')).toHaveText(/武器: ショートソード →/);
    await expect(overlay.locator('.equip-detail-content')).toContainText('比較不能');

    const unidentifiedMetrics = await overlay.evaluate((root) => {
      const detail = root.querySelector('.equip-detail-col');
      const content = root.querySelector('.equip-detail-content');
      const actions = root.querySelector('.equip-detail-actions');
      const identify = [...actions.querySelectorAll('button')].find((button) => button.textContent.includes('鑑定する'));
      const detailBox = detail.getBoundingClientRect();
      const contentBox = content.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      const identifyBox = identify.getBoundingClientRect();
      return {
        detailHeight: detailBox.height,
        contentHeight: content.scrollHeight,
        actionsHeight: actionsBox.height,
        identifyBox: { y: identifyBox.y, height: identifyBox.height },
        identifyVisible: identifyBox.y >= 0 && identifyBox.y + identifyBox.height <= innerHeight,
        contentScrollTop: content.scrollTop,
        contentBottom: contentBox.y + contentBox.height,
      };
    });
    expect(unidentifiedMetrics.identifyVisible, `identify button should fit without scrolling on ${vp.name}`).toBe(true);
    expect(unidentifiedMetrics.identifyBox.height, `identify button should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
    expect(unidentifiedMetrics.contentScrollTop, `detail content should start at the top on ${vp.name}`).toBe(0);
    for (const button of await overlay.locator('.equip-detail-actions button').all()) {
      const box = await button.boundingBox();
      expect(box?.height, `${await button.textContent()} should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(box?.y, `${await button.textContent()} should be inside the viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
      expect(box?.y + box?.height, `${await button.textContent()} should fit the viewport on ${vp.name}`).toBeLessThanOrEqual(vp.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    console.log(`[ISSUE-740 AFTER UNIDENTIFIED] ${vp.width}x${vp.height} ${JSON.stringify(unidentifiedMetrics)}`);
    await page.screenshot({
      path: `output/playwright/issue-740-after-unidentified-${vp.width}x${vp.height}.png`,
      fullPage: true,
    });

    await page.getByRole('button', { name: /鑑定する/ }).click();
    await expect(overlay.locator('.equip-detail-content')).not.toContainText('比較不能');
    const comparisonMetrics = await overlay.evaluate((root) => {
      const detail = root.querySelector('.equip-detail-col');
      const content = root.querySelector('.equip-detail-content');
      const grid = root.querySelector('.equip-stat-grid');
      const detailBox = detail.getBoundingClientRect();
      const contentBox = content.getBoundingClientRect();
      const gridBox = grid.getBoundingClientRect();
      const visibleTop = Math.max(contentBox.y, detailBox.y, 0);
      const visibleBottom = Math.min(contentBox.y + contentBox.height, detailBox.y + detailBox.height, innerHeight);
      const visibleHeight = Math.max(0, Math.min(gridBox.y + gridBox.height, visibleBottom) - Math.max(gridBox.y, visibleTop));
      return {
        detailHeight: detailBox.height,
        contentHeight: content.scrollHeight,
        actionsHeight: root.querySelector('.equip-detail-actions').getBoundingClientRect().height,
        gridBox: { y: gridBox.y, height: gridBox.height },
        gridVisibleRatio: gridBox.height ? visibleHeight / gridBox.height : 0,
        contentScrollTop: content.scrollTop,
      };
    });
    expect(comparisonMetrics.gridVisibleRatio, `comparison grid should be fully visible on ${vp.name}`).toBe(1);
    expect(comparisonMetrics.contentScrollTop, `comparison should not require content scrolling on ${vp.name}`).toBe(0);
    console.log(`[ISSUE-740 AFTER IDENTIFIED] ${vp.width}x${vp.height} ${JSON.stringify(comparisonMetrics)}`);

    const backButton = page.getByRole('button', { name: '一覧へ戻る' });
    await expect(backButton).toBeVisible();
    expect((await backButton.boundingBox()).height, `back button should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
    await backButton.click();
    await expect(overlay.locator('.equip-detail-placeholder')).toContainText('装備品を選択してください');
    await expect(overlay.locator('.equip-bag-section .equip-item-row')).toHaveCount(2);
    await expect(overlay.locator('.equip-equipped-row')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
  });
}

for (const vp of EQUIPMENT_SHORT_VIEWPORTS) {
  test(`Workshop enhancement action is reachable at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      state.party = [createSoloCharacter('Fighter')];
      state.metaMaterials = { '鉄片': 2, '魔石片': 1 };
      state.inventory = [{
        kind: 'equipment', instanceId: 'ui_low_height_enhance', baseId: 'SHORT_SWORD', rarity: 'common', level: 1,
        identified: true, enhanceLevel: 0, affixes: []
      }];
      openEquipOverlay(0);
    });

    await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
    const enhanceButton = page.locator('.equip-enhance-section').getByRole('button', { name: '強化する' });
    await enhanceButton.scrollIntoViewIfNeeded();
    const box = await enhanceButton.boundingBox();
    expect(box?.height, `enhancement action should keep --tap-min on ${vp.name}`).toBeGreaterThanOrEqual(44);
    expect(box?.y, `enhancement action should be inside the viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
    expect(box?.y + box?.height, `enhancement action should fit the viewport on ${vp.name}`).toBeLessThanOrEqual(vp.height);
    await enhanceButton.click();
    await expect.poll(() => page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.inventory[0].enhanceLevel;
    })).toBe(1);
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
      openSubmenu('workshop_main', '工房 - 広がった可能性');
    });

    await expect(page.locator('.workshop-node')).toHaveCount(11);

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
