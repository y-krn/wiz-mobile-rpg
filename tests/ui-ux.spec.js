import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844, name: 'iPhone 13' },
  { width: 360, height: 800, name: 'Galaxy S20' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
];

const SOLO_HUD_VIEWPORTS = [
  { width: 402, height: 874, name: 'iPhone 16 Pro standalone', safeArea: true },
  { width: 375, height: 667, name: 'iPhone SE' },
  ...VIEWPORTS,
];

const SOLO_HUD_STATES = ['town', 'explore', 'combat', 'submenu'];

for (const vp of VIEWPORTS) {
  test(`Records, run quests, and result focus stay visible at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.gameState = 'town';
      state.currentRun = null;
      state.records = {
        deepestRetreat: 12,
        deepestDeath: 9,
        deepestByClass: { Mage: 12 },
        totalRuns: 7,
      };
      updateUI();
    });

    const recordsStrip = page.locator('#records-strip');
    await expect(recordsStrip).toBeVisible();
    await expect(recordsStrip).toContainText('撤退最深');
    await expect(recordsStrip).toContainText('B12F');
    await expect(recordsStrip).toContainText('死亡最深');
    const titleBox = await recordsStrip.boundingBox();
    expect(titleBox.x).toBeGreaterThanOrEqual(0);
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(vp.width);

    await page.evaluate(async () => {
      const { createDefaultCurrentRun, createSoloCharacter, state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.party = [createSoloCharacter('Mage')];
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.deepestFloor = 6;
      state.currentRun.quests = [{
        id: 'depth:1:5', templateId: 'reach_milestone', type: 'depth', name: '次の節目へ',
        description: '次の5階ごとの節目まで到達する。', targetValue: 5, currentValue: 5,
        completed: true, rewardClaimed: true, reward: { materials: { '鉄片': 3 } },
      }];
      state.gameState = 'explore';
      updateUI();
    });
    const questHud = page.locator('.quest-hud-list');
    await expect(questHud.getByText('次の節目へ')).toBeVisible();
    await expect(questHud.getByText('達成')).toBeVisible();
    await expect(page.locator('#btn-run-quests')).toHaveCount(0);
    const questHudBox = await questHud.boundingBox();
    expect(questHudBox.x).toBeGreaterThanOrEqual(0);
    expect(questHudBox.x + questHudBox.width).toBeLessThanOrEqual(vp.width);

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      const run = state.currentRun;
      run.returnReason = 'milestone_portal';
      run.deepestFloor = 13;
      run.materialsBeforeBanking = { '獣の牙': 5, '鉄片': 3 };
      run.bankedMaterials = { '獣の牙': 5, '鉄片': 3 };
      run.codexRewards = { '霊粉': 1 };
      run.recordResult = { updated: true, updates: ['撤退最深', 'Mage最深'], depth: 13 };
      state.gameState = 'result';
      updateUI();
    });

    const result = page.locator('#result-overlay');
    await expect(result).toBeVisible();
    await expect(result).toContainText('今回の深度 B13F');
    await expect(result).toContainText('NEW DEPTH RECORD');
    await expect(result).toContainText('素材収支');
    await expect(result).toContainText('ランクエスト');
    const button = page.locator('#btn-result-castle');
    const buttonBox = await button.boundingBox();
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.y).toBeGreaterThan(vp.height * 0.5);
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(vp.height);
  });
}

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

test('Three-column corridor renderer draws adjacent front walls', async ({ page }) => {
  await page.goto('/');
  const cyanPixels = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const makeCell = () => ({ walls: [false, false, false, false], type: 'empty' });

    state.gameState = 'explore';
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.maps[0] = Array.from({ length: 24 }, () => Array.from({ length: 24 }, makeCell));
    state.map[5][4].walls[0] = true;
    state.map[5][6].walls[0] = true;
    dungeonRenderer.draw();

    const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
    const countCyan = (centerX) => {
      const pixels = ctx.getImageData(centerX - 2, 55, 5, 150).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 1] > 180 && pixels[i + 2] > 180) count++;
      }
      return count;
    };

    return [countCyan(100), countCyan(300)];
  });

  expect(cyanPixels[0]).toBeGreaterThan(100);
  expect(cyanPixels[1]).toBeGreaterThan(100);
});

test('Five-column corridor renderer draws outer front walls', async ({ page }) => {
  await page.goto('/');
  const cyanPixels = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const makeCell = () => ({ walls: [false, false, false, false], type: 'empty' });

    state.gameState = 'explore';
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.maps[0] = Array.from({ length: 24 }, () => Array.from({ length: 24 }, makeCell));
    state.map[3][3].walls[0] = true;
    state.map[3][7].walls[0] = true;
    dungeonRenderer.draw();

    const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
    const countCyan = (centerX) => {
      const pixels = ctx.getImageData(centerX - 2, 100, 5, 60).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 1] > 180 && pixels[i + 2] > 180) count++;
      }
      return count;
    };

    const visible = [countCyan(50), countCyan(350)];

    state.map[5][5].walls[1] = true;
    state.map[5][5].walls[3] = true;
    dungeonRenderer.draw();

    return {
      visible,
      occluded: [countCyan(50), countCyan(350)],
    };
  });

  expect(cyanPixels.visible[0]).toBeGreaterThan(30);
  expect(cyanPixels.visible[1]).toBeGreaterThan(30);
  expect(cyanPixels.occluded[0]).toBeLessThan(10);
  expect(cyanPixels.occluded[1]).toBeLessThan(10);
});

for (const vp of VIEWPORTS) {
  test(`Combat canvas shows all monsters without mini-map at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
      const labels = [];
      let miniMapDraws = 0;
      const originalFillText = ctx.fillText.bind(ctx);
      const originalDrawMiniMap = dungeonRenderer.drawMiniMap;
      const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;

      ctx.fillText = (text, ...args) => {
        labels.push(String(text));
        return originalFillText(text, ...args);
      };
      dungeonRenderer.drawMiniMap = () => { miniMapDraws++; };
      dungeonRenderer.draw3DCorridors = () => {};

      state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
      state.party = [{ name: '勇者', hp: 10, maxHp: 10, status: 'ok' }];
      state.combatState = {
        phase: 'choose_actions',
        monsters: Array.from({ length: 6 }, (_, index) => ({
          name: `敵${index + 1}`,
          level: 1,
          hp: 10,
          maxHp: 10,
          color: '#ff3b30',
          spriteType: 'biter'
        }))
      };

      state.gameState = 'combat';
      dungeonRenderer.draw();
      const combatMiniMapDraws = miniMapDraws;

      state.gameState = 'submenu';
      menuContext.type = 'combat_target';
      menuContext.targetType = 'enemy';
      dungeonRenderer.draw();
      const submenuMiniMapDraws = miniMapDraws;
      renderCombatOverlay();
      const targetCards = document.querySelectorAll('#combat-overlay .combat-target-card.enemy').length;
      const rowTags = document.querySelectorAll('#combat-overlay .enemy-row-tag').length;

      state.gameState = 'explore';
      menuContext.type = '';
      dungeonRenderer.draw();

      ctx.fillText = originalFillText;
      dungeonRenderer.drawMiniMap = originalDrawMiniMap;
      dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;

      return {
        labels,
        combatMiniMapDraws,
        submenuMiniMapDraws,
        exploreMiniMapDraws: miniMapDraws,
        targetCards,
        rowTags
      };
    });

    for (let index = 1; index <= 6; index++) {
      expect(result.labels.some(label => label.includes(`敵${index}`))).toBe(true);
    }
    expect(result.combatMiniMapDraws).toBe(0);
    expect(result.submenuMiniMapDraws).toBe(0);
    expect(result.exploreMiniMapDraws).toBe(1);
    expect(result.targetCards).toBe(6);
    expect(result.rowTags).toBe(0);
  });
}

test('Archives list restores scroll after detail and resets on navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { MONSTERS, ITEMS } = await import('/src/data.js');
    const { openArchivesOverlay } = await import('/src/ui.js');

    state.codex.monsters = Object.fromEntries(
      MONSTERS.map((monster) => [monster.name, { encountered: 1, killed: 1 }]),
    );
    state.codex.equipment = Object.fromEntries(
      Object.entries(ITEMS)
        .filter(([, item]) => ['weapon', 'armor', 'shield', 'accessory'].includes(item.type))
        .map(([key]) => [key, {
          foundCount: 1,
          highestRarity: 'common',
          bestBonus: 0,
          affixesSeen: [],
          firstFoundAt: 'B1F',
        }]),
    );
    openArchivesOverlay();
  });

  const body = page.locator('#archives-overlay .archives-body');

  for (const tab of ['monsters', 'equipment']) {
    if (tab === 'equipment') {
      await page.getByRole('button', { name: '🛡️ 装備' }).click();
    }

    const initialScrollTop = await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(initialScrollTop).toBeGreaterThan(0);

    await page.locator('#archives-overlay .codex-row').last().click();
    const savedScrollTop = await page.evaluate(async () => {
      const { archivesState } = await import('/src/ui/archives_overlay.js');
      return archivesState.listScrollTop;
    });
    expect(savedScrollTop).toBeGreaterThan(0);
    await page.getByRole('button', { name: '一覧に戻る' }).click();
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(savedScrollTop);
  }

  await page.getByRole('button', { name: '👿 敵' }).click();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.getByRole('button', { name: '❌ 閉じる' }).click();
  await page.evaluate(async () => {
    const { openArchivesOverlay } = await import('/src/ui.js');
    openArchivesOverlay();
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
});

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
  test(`Floor identity fits ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { showFloorEntryStinger, updateUI } = await import('/src/ui.js');
      state.gameState = 'explore';
      state.currentRun = { floorsVisited: [1], deepestFloor: 1 };
      state.floor = 1;
      state.dungeonMemory = { traps: {}, mapFragments: {}, visitedFloors: [1] };
      updateUI();
      showFloorEntryStinger(16, true);
    });

    await expect(page.locator('#location-label')).toContainText('崩れた坑道');
    await expect(page.locator('#goal-banner')).toContainText('???（地下2階）');
    const stinger = page.locator('#floor-entry-stinger');
    await expect(stinger).toBeVisible();
    await expect(stinger).toContainText('水没した魔導書庫');
    const box = await stinger.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  });
}

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

    await expect(page.locator('.workshop-node')).toHaveCount(12);

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

for (const vp of SOLO_HUD_VIEWPORTS) {
  test.describe(`Solo HUD on ${vp.name} (${vp.width}x${vp.height})`, () => {
    for (const gameState of SOLO_HUD_STATES) {
      test(`shows one Mage with visible MP in ${gameState}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        if (vp.safeArea) {
          await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });
        }
        await page.evaluate(async (nextGameState) => {
          const { state, createSoloCharacter } = await import('/src/state.js');
          const { menuContext } = await import('/src/navigation.js');
          const { updateUI } = await import('/src/ui.js');
          state.party = [createSoloCharacter('Mage')];
          state.gameState = nextGameState;
          state.combatState = { phase: 'choose_actions', monsters: [], playerActions: [] };
          menuContext.type = nextGameState === 'submenu' ? 'item_inventory' : '';
          menuContext.prevGameState = 'explore';
          updateUI();
        }, gameState);

        const hud = await page.evaluate(() => {
          const panel = document.querySelector('#character-panel').getBoundingClientRect();
          const cards = Array.from(document.querySelectorAll('#character-hud .character-card'));
          const mpRow = cards[0].querySelector('.mp-row');
          return {
            panel: panel.toJSON(),
            cards: cards.map(card => card.getBoundingClientRect().toJSON()),
            mpHidden: mpRow.hidden,
            mpText: mpRow.querySelector('.bar-value').textContent,
          };
        });
        expect(hud.cards).toHaveLength(1);
        expect(hud.mpHidden).toBe(false);
        expect(hud.mpText).toMatch(/\d+\/\d+/);
        expect(hud.cards[0].bottom).toBeLessThanOrEqual(hud.panel.bottom + 0.5);
        expect(hud.panel.bottom).toBeLessThanOrEqual(vp.height - (vp.safeArea ? 34 : 0));
      });
    }
  });
}

for (const vp of VIEWPORTS) {
  test(`Warden confirmation controls stay tappable on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('/');

    const boxes = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { openSubmenu } = await import('/src/navigation.js');
      await import('/src/menu/submenu_router.js');

      state.gameState = 'explore';
      state.pendingWardenEncounter = { monsterId: 'B1_WARDEN', prevX: 1, prevY: 22 };
      openSubmenu('warden_confirm', '封印門の門番: 勝ち目は薄い');

      return Array.from(document.querySelectorAll('#submenu-options .btn')).map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          text: button.textContent,
          rect: rect.toJSON(),
          visible: getComputedStyle(button).display !== 'none',
        };
      });
    });

    expect(boxes.map((box) => box.text)).toEqual(['挑む', '引き返す']);
    for (const box of boxes) {
      expect(box.visible, `${box.text} should be visible on ${vp.name}`).toBe(true);
      expect(box.rect.height, `${box.text} should be at least 44px on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(box.rect.left, `${box.text} should stay inside viewport on ${vp.name}`).toBeGreaterThanOrEqual(0);
      expect(box.rect.right, `${box.text} should stay inside viewport on ${vp.name}`).toBeLessThanOrEqual(vp.width);
    }
  });
}

test('Standalone safe-area full-screen overlays keep controls outside system bars', async ({ page }) => {
  const safeAreaTop = 59;
  const safeAreaBottom = 34;
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.addStyleTag({
    content: `:root { --safe-area-top: ${safeAreaTop}px; --safe-area-bottom: ${safeAreaBottom}px; }`,
  });

  const overlayCases = [
    { name: 'equip', selector: '#equip-overlay' },
    { name: 'spell', selector: '#spell-overlay' },
    { name: 'archives', selector: '#archives-overlay' },
  ];

  for (const overlayCase of overlayCases) {
    await page.evaluate(async (name) => {
      const overlays = [
        'equip-overlay',
        'spell-overlay',
        'archives-overlay',
      ];
      overlays.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      const { state } = await import('/src/state.js');
      const { getCharMaxMp } = await import('/src/data.js');
      const { openSubmenu } = await import('/src/navigation.js');

      state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
      state.party.forEach((char) => {
        char.hp = Math.max(1, char.hp);
        char.mp = getCharMaxMp(char);
        char.maxMp = getCharMaxMp(char);
      });

      if (name === 'equip') {
        const { openEquipOverlay } = await import('/src/equip.js');
        openEquipOverlay(0);
      } else if (name === 'spell') {
        openSubmenu('spell_caster_select', '呪文選択:');
      } else if (name === 'archives') {
        const { openArchivesOverlay } = await import('/src/ui.js');
        openArchivesOverlay();
      }
    }, overlayCase.name);

    await expect(page.locator(overlayCase.selector)).toBeVisible();

    const layout = await page.evaluate((selector) => {
      const overlay = document.querySelector(selector);
      const rect = (el) => el.getBoundingClientRect().toJSON();
      const visibleChildren = Array.from(overlay.querySelectorAll('*'))
        .filter((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0 &&
            box.height > 0;
        });
      const topMost = visibleChildren
        .slice()
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      const bottomMostButton = Array.from(overlay.querySelectorAll('button, [role="button"], .btn'))
        .filter((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          const isScrollRow = el.classList.contains('equip-item-row') ||
            el.classList.contains('char-row');
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !isScrollRow &&
            box.width > 0 &&
            box.height > 0 &&
            box.top < window.innerHeight &&
            box.bottom > 0;
        })
        .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      return {
        overlay: rect(overlay),
        topMost: topMost ? rect(topMost) : null,
        bottomMostButton: bottomMostButton ? rect(bottomMostButton) : null,
        paddingTop: parseFloat(getComputedStyle(overlay).paddingTop),
        paddingBottom: parseFloat(getComputedStyle(overlay).paddingBottom),
        height: window.innerHeight,
      };
    }, overlayCase.selector);

    expect(layout.overlay.top, `${overlayCase.name} backdrop should cover the top safe-area strip`).toBe(0);
    expect(layout.overlay.bottom, `${overlayCase.name} backdrop should cover the bottom safe-area strip`).toBe(874);
    expect(layout.paddingTop, `${overlayCase.name} overlay should include top safe-area padding`).toBeGreaterThanOrEqual(safeAreaTop + 12);
    expect(layout.paddingBottom, `${overlayCase.name} overlay should include bottom safe-area padding`).toBeGreaterThanOrEqual(safeAreaBottom + 12);
    expect(layout.topMost.top, `${overlayCase.name} content should clear top safe area`).toBeGreaterThanOrEqual(safeAreaTop);
    expect(layout.bottomMostButton.bottom, `${overlayCase.name} controls should clear bottom safe area`).toBeLessThanOrEqual(layout.height - safeAreaBottom);
  }
});

for (const vp of VIEWPORTS) {
  test.describe(`UIUX Mobile One-Handed Operation tests on ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.goto('/');
      await page.waitForTimeout(1000);
    });

    test('Check all visible buttons are at least 44px high and key actions are at the bottom', async ({ page }) => {
      // Wait for initial load
      await page.waitForTimeout(1000);

      const verifyScreenButtons = async (screenName) => {
        let buttons = await page.locator('button:visible, [role="button"]:visible, .btn:visible, .equip-item-row:visible, .char-row:visible, .archives-tab:visible').all();
        
        // Active overlay detection to avoid back-button pollution
        const activeOverlayId = await page.evaluate(() => {
          const overlays = [
            'combat-overlay', 'result-overlay',
            'equip-overlay', 'spell-overlay', 'archives-overlay',
          ];
          for (const id of overlays) {
            const el = document.getElementById(id);
            if (el && el.style.display !== 'none') {
              return id;
            }
          }
          return null;
        });

        if (activeOverlayId) {
          const filtered = [];
          for (const btn of buttons) {
            const inside = await btn.evaluate((el, id) => el.closest(`#${id}`) !== null, activeOverlayId);
            if (inside) filtered.push(btn);
          }
          buttons = filtered;
        } else {
          const filtered = [];
          for (const btn of buttons) {
            const inside = await btn.evaluate((el) => {
              return el.closest('.combat-overlay-container, .result-overlay-container, .equip-overlay-container, .spell-overlay-container, .archives-overlay-container') !== null;
            });
            if (!inside) filtered.push(btn);
          }
          buttons = filtered;
        }

        console.log(`Checking ${buttons.length} buttons on screen: ${screenName}`);
        for (const btn of buttons) {
          const text = (await btn.textContent()).trim();
          const id = await btn.getAttribute('id') || '';
          const className = await btn.getAttribute('class') || '';
          console.log(`  - Button: "${text}" (id: "${id}", class: "${className}")`);
        }
        
        for (const btn of buttons) {
          const box = await btn.boundingBox();
          if (!box) continue;
          
          const text = (await btn.textContent()).trim();
          const id = await btn.getAttribute('id') || '';
          const className = await btn.getAttribute('class') || '';

          // Check minimum height (ignore helper icons or very specific small tags if any, but regular buttons must be >= 44px)
          expect(box.height, `Button "${text}" (id: ${id}, class: ${className}) on ${screenName} should be >= 44px high. Found: ${box.height}px`).toBeGreaterThanOrEqual(44);

          // Verify if key action button is located in the bottom reach zone
          const isKeyAction = text.includes('戻る') || text.includes('閉じる') || text.includes('確定') || text.includes('決定') || text.includes('購入') || text.includes('売却') || text.includes('鑑定') || text.includes('唱える') || text.includes('加える') || text.includes('外す') || id.includes('btn-submenu-back') || className.includes('tab');
          if (isKeyAction) {
            const centerY = box.y + box.height / 2;
            const threshold = vp.height * 0.50; // In bottom 50% of the screen
            const isShopTab = className.includes('shop-tab');
            const isEquipTab = className.includes('equip-tab');
            if (!id.includes('btn-mute') && !id.includes('btn-shop-close') && !id.includes('btn-equip-close') && !isShopTab && !isEquipTab) {
              expect(centerY, `Key action button "${text}" (id: ${id}) on ${screenName} should be located in the bottom part of the screen (y: ${centerY}px, threshold: ${threshold}px)`).toBeGreaterThan(threshold);
            }
          }
        }

        const overflow = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const offenders = Array.from(document.querySelectorAll('body *'))
            .filter((el) => {
              const style = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                rect.width > 0 &&
                rect.height > 0 &&
                (rect.left < -1 || rect.right > viewportWidth + 1);
            })
            .slice(0, 5)
            .map((el) => {
              const rect = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                id: el.id,
                className: typeof el.className === 'string' ? el.className : '',
                left: rect.left,
                right: rect.right,
                width: rect.width,
              };
            });
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: viewportWidth,
            offenders,
          };
        });
        expect(overflow.scrollWidth, `${screenName} should not create horizontal page scroll on ${vp.name}`).toBeLessThanOrEqual(overflow.clientWidth + 1);
        expect(overflow.offenders, `${screenName} should not have visible elements overflowing horizontally on ${vp.name}`).toEqual([]);
      };

      // 1. Town Screen
      await verifyScreenButtons('Town Screen');

      // 2. Workshop Screen
      const workshopBtn = page.locator('#btn-town-workshop');
      if (await workshopBtn.isVisible()) {
        await workshopBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Workshop Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      // 3. Archives Screen
      const archivesBtn = page.locator('#btn-town-archives');
      if (await archivesBtn.isVisible()) {
        await archivesBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Archives Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

    });

    test('Dungeon exploration controls stay compact after entering the dungeon', async ({ page }) => {
      await page.locator('#btn-town-dungeon').click();
      await expect(page.locator('#submenu-controls')).toBeVisible();
      await page.getByRole('button', { name: /戦士/ }).click();
      await page.getByRole('button', { name: /B1Fから開始/ }).click();
      await expect(page.locator('#explore-controls')).toBeVisible();

      const panelBox = await page.locator('#controls-panel').boundingBox();
      expect(panelBox.height, `Explore controls panel should stay compact on ${vp.name}`).toBeLessThanOrEqual(130);

      const exploreButtons = await page.locator('#explore-controls button:visible').all();
      expect(exploreButtons.length).toBe(8);
      for (const btn of exploreButtons) {
        const box = await btn.boundingBox();
        const text = (await btn.textContent()).trim();
        expect(box.height, `Explore button "${text}" should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
    });

    test('Few-button submenu rows do not stretch to fill the panel', async ({ page }) => {
      await page.evaluate(async () => {
        const { openSubmenu } = await import('/src/navigation.js');
        openSubmenu('enter_dungeon_select', '迷宮へ入る準備：');
      });
      const dungeonStartButton = page.getByRole('button', { name: '迷宮へ入る' });
      await expect(dungeonStartButton).toBeVisible();

      const box = await dungeonStartButton.boundingBox();
      expect(box.height, `Few-button submenu row should stay compact on ${vp.name}`).toBeLessThanOrEqual(64);
      expect(box.height, `Few-button submenu row should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
    });

    test('Result screen expands by collapsing logs and controls', async ({ page }) => {
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
        const { updateUI } = await import('/src/ui.js');

        state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
        state.gameState = 'result';
        state.currentRun = createDefaultCurrentRun();
        state.currentRun.returnReason = 'stairs';
        state.currentRun.deepestFloor = 1;
        state.currentRun.dangerRank = 'E';
        state.currentRun.dangerLabel = '安全な偵察';
        for (let i = 0; i < 50; i++) {
          state.logs.push(`検証ログ ${i + 1}`);
        }
        updateUI();
      });

      await expect(page.locator('#result-overlay')).toBeVisible();

      const layout = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {
          containerHasResultMode: document.querySelector('#game-container').classList.contains('result-mode'),
          goalDisplay: getComputedStyle(document.querySelector('#goal-banner')).display,
          logDisplay: getComputedStyle(document.querySelector('#log-panel')).display,
          controlsDisplay: getComputedStyle(document.querySelector('#controls-panel')).display,
          viewport: rect('#viewport-panel'),
          overlay: rect('#result-overlay'),
          button: rect('#btn-result-castle'),
          party: rect('#character-panel'),
          height: window.innerHeight,
        };
      });

      expect(layout.containerHasResultMode).toBe(true);
      expect(layout.goalDisplay).toBe('none');
      expect(layout.logDisplay).toBe('none');
      expect(layout.controlsDisplay).toBe('none');
      expect(layout.viewport.height, `Result viewport should use most available height on ${vp.name}`).toBeGreaterThan(vp.height * 0.65);
      expect(layout.overlay.height, `Result overlay should fill expanded viewport on ${vp.name}`).toBeCloseTo(layout.viewport.height, 1);
      expect(layout.button.height, `Result return button should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(layout.button.top, `Result return button should stay in bottom thumb zone on ${vp.name}`).toBeGreaterThan(vp.height * 0.5);
      expect(layout.party.bottom, `Solo HUD should stay visible below result viewport on ${vp.name}`).toBeLessThanOrEqual(layout.height);
    });

    test('Standalone safe-area chest menu keeps solo HUD visible', async ({ page }) => {
      await page.addStyleTag({
        content: `:root { --safe-area-top: 59px; --safe-area-bottom: 34px; }`,
      });
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
        const { openChestMenu } = await import('/src/chest.js');

        state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
        state.gameState = 'combat';
        state.floor = 5;
        state.currentRun = createDefaultCurrentRun();
        state.floorChestsOpened = [0, 0, 0, 0, 2];
        state.floorChestsTotal = [3, 3, 3, 3, 4];
        state.chestState = {
          x: state.x,
          y: state.y,
          trap: 'poison needle',
          identifiedTrap: 'poison needle',
          inspected: true,
          inspectChance: 0.30,
          item: 'HEAL_POTION',
          lootHint: { label: '古い魔力', aura: 'medium' },
        };
        openChestMenu();
      });

      await expect(page.locator('#submenu-controls')).toBeVisible();
      await expect(page.locator('#btn-chest-inspect')).toBeVisible();
      await expect(page.locator('.chest-info-panel')).toContainText('信頼度 低');
      await expect(page.locator('.chest-info-panel')).toContainText('[!] 外れる可能性あり');
      await expect(page.getByRole('button', { name: '解除する' })).toBeVisible();
      await expect(page.getByRole('button', { name: '宝箱を開ける' })).toBeVisible();
      await expect(page.getByRole('button', { name: '叩き壊す' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'キットで解除' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '立ち去る' })).toBeVisible();

      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openChestMenu } = await import('/src/chest.js');
        state.inventory.push('TRAP_KIT');
        openChestMenu();
      });
      await expect(page.getByRole('button', { name: 'キットで解除' })).toBeVisible();

      const layout = await page.evaluate(async () => {
        const { menuContext } = await import('/src/navigation.js');
        const { updateUI } = await import('/src/ui.js');
        const rect = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.getBoundingClientRect().toJSON() : null;
        };
        const capture = () => ({
          eventMode: document.querySelector('#game-container').classList.contains('event-mode'),
          logDisplay: getComputedStyle(document.querySelector('#log-panel')).display,
          viewport: rect('#viewport-panel'),
        });
        const chestLayout = capture();
        menuContext.type = 'chest_result';
        updateUI();
        const resultLayout = capture();
        menuContext.type = 'chest_menu';
        updateUI();
        return {
          eventMode: chestLayout.eventMode,
          logDisplay: chestLayout.logDisplay,
          resultLogDisplay: resultLayout.logDisplay,
          resultViewport: resultLayout.viewport,
          header: rect('#game-header'),
          goal: rect('#goal-banner'),
          viewport: chestLayout.viewport,
          controls: rect('#controls-panel'),
          options: rect('#submenu-options'),
          optionsScrollHeight: document.querySelector('#submenu-options').scrollHeight,
          optionsClientHeight: document.querySelector('#submenu-options').clientHeight,
          party: rect('#character-panel'),
          buttons: Array.from(document.querySelectorAll('#submenu-options button'))
            .map((el) => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() })),
          characterCards: Array.from(document.querySelectorAll('#character-hud .character-card'))
            .map((el) => el.getBoundingClientRect().toJSON()),
          height: window.innerHeight,
          hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      expect(layout.eventMode, `Chest menu should add event-mode on ${vp.name}`).toBe(true);
      expect(layout.logDisplay, `Chest menu should hide inline logs on ${vp.name}`).toBe('none');
      expect(layout.resultLogDisplay, `Chest result should restore inline logs on ${vp.name}`).not.toBe('none');
      expect(layout.viewport.height, `Chest viewport should grow when logs are hidden on ${vp.name}`).toBeGreaterThan(layout.resultViewport.height);
      expect(layout.header.top, `Header should clear standalone top safe area on ${vp.name}`).toBeGreaterThanOrEqual(59);
      expect(layout.goal.bottom, `Goal banner should not be covered by viewport on ${vp.name}`).toBeLessThanOrEqual(layout.viewport.top);
      expect(layout.party.bottom, `Solo HUD should clear standalone bottom safe area on ${vp.name}`).toBeLessThanOrEqual(layout.height - 34);
      expect(layout.buttons).toHaveLength(6);
      expect(layout.buttons.map(button => button.text)).toEqual([
        '調査済み', '解除する', 'キットで解除', '宝箱を開ける', '叩き壊す', '立ち去る',
      ]);
      expect(layout.hasHorizontalOverflow, `Chest menu should not create horizontal overflow on ${vp.name}`).toBe(false);
      for (const button of layout.buttons) {
        expect(button.rect.height, `Chest action buttons should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
      expect(layout.options.bottom, `Scrollable chest actions should stay within controls on ${vp.name}`).toBeLessThanOrEqual(layout.controls.bottom);
      expect(layout.optionsScrollHeight, `Worst-case chest actions should scroll on ${vp.name}`).toBeGreaterThan(layout.optionsClientHeight);
      expect(layout.characterCards).toHaveLength(1);
      for (const card of layout.characterCards) {
        expect(card.bottom, `Character card should remain inside character panel on ${vp.name}`).toBeLessThanOrEqual(layout.party.bottom);
      }
      expect(layout.controls.bottom, `Controls should not push character panel offscreen on ${vp.name}`).toBeLessThanOrEqual(layout.party.top);

      const lastActionLayout = await page.getByRole('button', { name: '立ち去る' }).evaluate((button) => {
        button.scrollIntoView({ block: 'nearest' });
        return {
          button: button.getBoundingClientRect().toJSON(),
          options: document.querySelector('#submenu-options').getBoundingClientRect().toJSON(),
        };
      });
      expect(lastActionLayout.button.top, `Last chest action should scroll into view on ${vp.name}`).toBeGreaterThanOrEqual(lastActionLayout.options.top);
      expect(lastActionLayout.button.bottom, `Last chest action should scroll into view on ${vp.name}`).toBeLessThanOrEqual(lastActionLayout.options.bottom + 1);

      await page.getByRole('button', { name: '宝箱を開ける' }).click();
      await expect(page.locator('#submenu-title')).toContainText('宝箱を開けるキャラクターを選択');
      await expect(page.getByRole('button', { name: /Ged .*開ける/ })).toBeVisible();

      const openerLayout = await page.evaluate(() => {
        const controls = document.querySelector('#controls-panel').getBoundingClientRect().toJSON();
        return {
          controls,
          buttons: Array.from(document.querySelectorAll('#submenu-options button'))
            .map((el) => ({
              text: el.textContent,
              rect: el.getBoundingClientRect().toJSON(),
            })),
          hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      expect(openerLayout.buttons).toHaveLength(1);
      expect(openerLayout.hasHorizontalOverflow, `Chest opener select should not create horizontal overflow on ${vp.name}`).toBe(false);
      for (const button of openerLayout.buttons) {
        expect(button.rect.height, `Chest opener button "${button.text}" should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
        expect(button.rect.bottom, `Chest opener button "${button.text}" should stay within controls on ${vp.name}`).toBeLessThanOrEqual(openerLayout.controls.bottom);
      }

      await page.getByRole('button', { name: /Ged .*開ける/ }).click();
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.locator('#log-content')).toContainText('Gedは12のダメージを受けた');
      await expect(page.locator('#log-content')).toContainText('宝箱から素材束');
      await expect(page.locator('#game-container')).not.toHaveClass(/event-mode/);
    });

    test('Dungeon event submenus hide logs only until result phase', async ({ page }) => {
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openSubmenu } = await import('/src/navigation.js');
        const { updateUI } = await import('/src/ui.js');

        Math.random = () => 0.1;
        state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
        state.gameState = 'explore';
        state.floor = 2;
        state.inventory = [];
        state.activeMerchantStock = [
          { type: 'item', key: 'HEAL_POTION', price: 1, soldOut: false },
        ];
        state.map[state.y][state.x].event = 'event_spring';
        openSubmenu('event_spring', '怪しい泉を見つけた。澄んだ水が湧き出ている…');
        updateUI();
      });

      await expect(page.locator('#game-container')).toHaveClass(/event-mode/);
      await expect(page.locator('#log-panel')).toBeHidden();
      await expect(page.getByRole('button', { name: '泉の水を飲む' })).toBeVisible();
      await page.getByRole('button', { name: '泉の水を飲む' }).click();
      await expect(page.locator('#game-container')).not.toHaveClass(/event-mode/);
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.locator('#log-content')).toContainText('泉の水は清らかだった');
      await expect(page.getByRole('button', { name: '探索に戻る' })).toBeVisible();

      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openSubmenu } = await import('/src/navigation.js');
        state.map[state.y][state.x].event = 'event_tablet';
        openSubmenu('event_tablet', '謎の石碑が立っている。古代の文字が刻まれている…');
      });
      await expect(page.locator('#game-container')).toHaveClass(/event-mode/);
      await expect(page.locator('#log-panel')).toBeHidden();
      await expect(page.getByRole('button', { name: '文字を読む' })).toBeVisible();
      await page.getByRole('button', { name: '文字を読む' }).click();
      await expect(page.locator('#game-container')).not.toHaveClass(/event-mode/);
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.locator('#log-content')).toContainText('石碑の文字を解読した');
      await expect(page.getByRole('button', { name: '探索に戻る' })).toBeVisible();

      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state.js');
        const { checkCellEvents } = await import('/src/movement.js');
        const { updateUI } = await import('/src/ui.js');
        state.gameState = 'explore';
        state.floor = 5;
        const cell = state.map[state.y][state.x];
        state.currentRun = createDefaultCurrentRun();
        state.currentRun.defeatedMilestones = [5];
        state.currentRun.materials = { '霊粉': 2 };
        cell.type = 'passage';
        cell.message = null;
        cell.event = 'event_merchant';
        checkCellEvents();
        updateUI();
      });
      await expect(page.locator('#game-container')).toHaveClass(/event-mode/);
      await expect(page.locator('#log-panel')).toBeHidden();
      await expect(page.getByRole('button', { name: /鑑定粉/ })).toBeVisible();
      const merchantResult = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { gameState: state.gameState, event: state.map[state.y][state.x].event };
      });
      expect(merchantResult).toEqual({ gameState: 'submenu', event: 'event_merchant' });
    });

    test('Movement-triggered event and trap panels ignore immediate taps', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openGuardedSubmenu, openSubmenu } = await import('/src/navigation.js');
        const { startTrapEncounter } = await import('/src/systems/traps.js');

        const clickProbe = (panel) => {
          const button = document.createElement('button');
          let clicks = 0;
          button.addEventListener('click', () => clicks++);
          panel.appendChild(button);
          button.click();
          const immediate = clicks;
          state.controlsGuardUntil = performance.now() - 1;
          button.click();
          return { immediate, afterGuard: clicks };
        };

        state.gameState = 'explore';
        openGuardedSubmenu('event_spring', '怪しい泉');
        const event = clickProbe(document.getElementById('submenu-controls'));

        state.gameState = 'explore';
        openSubmenu('item_inventory', '共有バッグ');
        state.controlsGuardUntil = 0;
        const userSubmenu = clickProbe(document.getElementById('submenu-controls'));

        state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
        startTrapEncounter({ type: 'damage', state: 'discovered', floorId: 'B1', difficulty: 10 });
        const trap = clickProbe(document.getElementById('trap-controls'));
        return { event, userSubmenu, trap };
      });

      expect(result.event).toEqual({ immediate: 0, afterGuard: 1 });
      expect(result.userSubmenu).toEqual({ immediate: 1, afterGuard: 2 });
      expect(result.trap).toEqual({ immediate: 0, afterGuard: 1 });
    });

    test('Camp rest is thumb-safe and limited to once per run', async ({ page }) => {
      await page.evaluate(async () => {
        const { state, createDefaultCurrentRun } = await import('/src/state.js');
        const { getWardenGateId } = await import('/src/state/warden_gates.js');
        const { openSubmenu } = await import('/src/navigation.js');
        state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
        state.party.forEach(char => {
          char.hp = Math.max(1, Math.floor(char.maxHp / 2));
          char.mp = Math.floor(char.maxMp / 2);
        });
        state.floor = 2;
        state.gameState = 'explore';
        state.currentRun = createDefaultCurrentRun();
        state.openedGates = [getWardenGateId(2)];
        openSubmenu('event_camp', '野営地');
      });

      const rest = page.getByRole('button', { name: '休息する' });
      await expect(rest).toBeVisible();
      expect((await rest.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await rest.click();
      await expect(page.locator('#log-content')).toContainText('野営地で休息した');

      await page.evaluate(async () => {
        const { openSubmenu } = await import('/src/navigation.js');
        openSubmenu('event_camp', '野営地');
      });
      await expect(page.getByText('すでに今回の遠征中に休息した')).toBeVisible();
      await expect(page.getByRole('button', { name: '休息する' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '立ち去る' })).toBeVisible();
    });

    test('Standalone safe-area town menu is scroll-contained above solo HUD', async ({ page }) => {
      await page.addStyleTag({
        content: `:root { --safe-area-top: 59px; --safe-area-bottom: 34px; }`,
      });
      await expect(page.locator('#town-controls')).toBeVisible();

      const initialLayout = await page.evaluate(() => {
        const rect = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.getBoundingClientRect().toJSON() : null;
        };
        const grid = document.querySelector('.town-grid');
        return {
          controls: rect('#controls-panel'),
          party: rect('#character-panel'),
          grid: rect('.town-grid'),
          scrollHeight: grid ? grid.scrollHeight : 0,
          clientHeight: grid ? grid.clientHeight : 0,
        };
      });

      expect(initialLayout.controls.bottom, `Town controls should not overlap solo HUD on ${vp.name}`).toBeLessThanOrEqual(initialLayout.party.top);
      expect(initialLayout.grid.bottom, `Town grid should be clipped inside controls panel on ${vp.name}`).toBeLessThanOrEqual(initialLayout.controls.bottom);

      await page.locator('.town-grid').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      const lastButton = page.locator('#btn-town-archives');
      await expect(lastButton).toBeVisible();
      const scrolledLayout = await page.evaluate(() => {
        const grid = document.querySelector('.town-grid');
        const last = document.querySelector('#btn-town-archives');
        return {
          grid: grid ? grid.getBoundingClientRect().toJSON() : null,
          last: last ? last.getBoundingClientRect().toJSON() : null,
        };
      });

      expect(scrolledLayout.last.bottom, `Last town button should be reachable inside scrolled town grid on ${vp.name}`).toBeLessThanOrEqual(scrolledLayout.grid.bottom + 1);
      expect(scrolledLayout.last.top, `Last town button should remain below the top of the town grid on ${vp.name}`).toBeGreaterThanOrEqual(scrolledLayout.grid.top - 1);
    });

    test('Class selection starts exactly one Lv1 solo character', async ({ page }) => {
      await page.locator('#btn-town-dungeon').click();
      await expect(page.locator('#submenu-title')).toContainText('クラスを選択');
      await page.getByRole('button', { name: /盗賊/ }).click();
      await page.getByRole('button', { name: /B1Fから開始/ }).click();
      await expect(page.locator('#explore-controls')).toBeVisible();
      const character = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { count: state.party.length, className: state.party[0].class, level: state.party[0].level };
      });
      expect(character).toEqual({ count: 1, className: 'Thief', level: 1 });
      await expect(page.locator('#character-hud .character-card')).toHaveCount(1);
    });
  });
}

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
