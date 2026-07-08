import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844, name: 'iPhone 13' },
  { width: 360, height: 800, name: 'Galaxy S20' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
];

const PARTY_HUD_VIEWPORTS = [
  { width: 402, height: 874, name: 'iPhone 16 Pro standalone', safeArea: true },
  { width: 375, height: 667, name: 'iPhone SE' },
  ...VIEWPORTS,
];

const PARTY_HUD_STATES = ['town', 'explore', 'combat', 'submenu', 'trap_encounter'];

for (const vp of PARTY_HUD_VIEWPORTS) {
  test.describe(`Party HUD MP visibility on ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.goto('/');
      if (vp.safeArea) {
        await page.addStyleTag({
          content: `:root { --safe-area-top: 59px; --safe-area-bottom: 34px; }`,
        });
      }
    });

    for (const gameState of PARTY_HUD_STATES) {
      test(`MP row remains visible in ${gameState}`, async ({ page }) => {
        await page.evaluate(async (nextGameState) => {
          const { state } = await import('/src/state.js');
          const { getCharMaxMp } = await import('/src/data.js');
          const { menuContext } = await import('/src/navigation.js');
          const { updateUI } = await import('/src/ui.js');

          state.party = state.roster.slice(0, 4);
          state.party.forEach((char) => {
            char.hp = Math.max(1, char.hp);
            char.mp = getCharMaxMp(char);
          });
          state.gameState = nextGameState;
          state.combatState = {
            phase: 'choose_actions',
            enemies: [],
            monsters: [],
            playerActions: [],
          };
          menuContext.type = 'camp_main';
          menuContext.prevGameState = 'explore';
          state.activeTrapState = {
            trap: {
              type: 'mpDrain',
              state: 'discovered',
              floorId: 'B1',
              difficulty: 1,
            },
            successRate: 80,
            expectedEffect: 'MP減少',
          };

          updateUI();
        }, gameState);

        const hud = await page.evaluate(async () => {
          const { state } = await import('/src/state.js');
          const { isSpellcaster } = await import('/src/data.js');
          const panel = document.querySelector('#party-panel').getBoundingClientRect();
          return {
            panel: panel.toJSON(),
            rows: Array.from(document.querySelectorAll('#party-grid .party-card')).map((card, idx) => {
              const mpRow = card.querySelector('.mp-row');
              const mpValue = card.querySelector('.mp-row .bar-value');
              const mpFill = card.querySelector('.mp-row .bar-fill.mp');
              const cardRect = card.getBoundingClientRect();
              const rowRect = mpRow.getBoundingClientRect();
              const valueRect = mpValue.getBoundingClientRect();
              const fillRect = mpFill.getBoundingClientRect();
              return {
                name: state.party[idx].name,
                spellcaster: isSpellcaster(state.party[idx]),
                value: mpValue.textContent,
                visibility: getComputedStyle(mpRow).visibility,
                card: cardRect.toJSON(),
                row: rowRect.toJSON(),
                valueBox: valueRect.toJSON(),
                fill: fillRect.toJSON(),
              };
            }),
          };
        });

        expect(hud.rows).toHaveLength(4);
        expect(hud.panel.bottom, `Party HUD should stay inside viewport on ${vp.name}/${gameState}`).toBeLessThanOrEqual(vp.height - (vp.safeArea ? 34 : 0));
        if (gameState !== 'town') {
          expect(hud.panel.height, `Compact party HUD should keep the 56px height budget on ${vp.name}/${gameState}`).toBeLessThanOrEqual(56.5);
        }

        for (const row of hud.rows) {
          expect(row.row.height, `MP placeholder row should keep layout height for ${row.name} on ${vp.name}/${gameState}`).toBeGreaterThan(0);
          expect(row.row.top, `MP row should not clip above card for ${row.name} on ${vp.name}/${gameState}`).toBeGreaterThanOrEqual(row.card.top - 0.5);
          expect(row.row.bottom, `MP row should not clip below card for ${row.name} on ${vp.name}/${gameState}`).toBeLessThanOrEqual(row.card.bottom + 0.5);
          expect(row.row.bottom, `MP row should not clip below HUD for ${row.name} on ${vp.name}/${gameState}`).toBeLessThanOrEqual(hud.panel.bottom + 0.5);

          if (row.spellcaster) {
            expect(row.visibility, `Spellcaster MP row should be visible for ${row.name} on ${vp.name}/${gameState}`).toBe('visible');
            expect(row.value, `Spellcaster MP value should be shown for ${row.name} on ${vp.name}/${gameState}`).not.toBe('');
            expect(row.valueBox.width, `Spellcaster MP value should have visible width for ${row.name} on ${vp.name}/${gameState}`).toBeGreaterThan(0);
            expect(row.fill.width, `Spellcaster MP bar should have visible fill for ${row.name} on ${vp.name}/${gameState}`).toBeGreaterThan(0);
          } else {
            expect(row.visibility, `Non-spellcaster MP row should remain a hidden placeholder for ${row.name} on ${vp.name}/${gameState}`).toBe('hidden');
          }
        }
      });
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
    { name: 'training', selector: '#training-overlay' },
    { name: 'shop', selector: '#shop-overlay' },
    { name: 'equip', selector: '#equip-overlay' },
    { name: 'spell', selector: '#spell-overlay' },
    { name: 'camp', selector: '#camp-overlay' },
    { name: 'archives', selector: '#archives-overlay' },
    { name: 'contracts', selector: '#contracts-overlay' },
    { name: 'warehouse', selector: '#warehouse-overlay' },
  ];

  for (const overlayCase of overlayCases) {
    await page.evaluate(async (name) => {
      const overlays = [
        'training-overlay',
        'shop-overlay',
        'equip-overlay',
        'spell-overlay',
        'camp-overlay',
        'archives-overlay',
        'contracts-overlay',
        'warehouse-overlay',
      ];
      overlays.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      const { state } = await import('/src/state.js');
      const { getCharMaxMp } = await import('/src/data.js');
      const { openSubmenu } = await import('/src/navigation.js');

      state.party = state.roster.slice(0, 4);
      state.party.forEach((char) => {
        char.hp = Math.max(1, char.hp);
        char.mp = getCharMaxMp(char);
        char.maxMp = getCharMaxMp(char);
      });

      if (name === 'training') {
        openSubmenu('party_assemble', '訓練場 - パーティ編成:');
      } else if (name === 'shop') {
        openSubmenu('shop_main', 'ボルタック商店 - アイテムの売買:');
      } else if (name === 'equip') {
        const { openEquipOverlay } = await import('/src/equip.js');
        openEquipOverlay(0);
      } else if (name === 'spell') {
        openSubmenu('spell_caster_select', '呪文選択:');
      } else if (name === 'camp') {
        const { openCampMenu } = await import('/src/camp.js');
        openCampMenu();
      } else if (name === 'archives') {
        const { openArchivesOverlay } = await import('/src/ui.js');
        openArchivesOverlay();
      } else if (name === 'contracts') {
        const { openContractsOverlay } = await import('/src/ui.js');
        openContractsOverlay();
      } else if (name === 'warehouse') {
        const { openWarehouseOverlay } = await import('/src/ui.js');
        openWarehouseOverlay();
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
          const isScrollRow = el.classList.contains('shop-item-row') ||
            el.classList.contains('equip-item-row') ||
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
        let buttons = await page.locator('button:visible, [role="button"]:visible, .btn:visible, .shop-item-row:visible, .equip-item-row:visible, .char-row:visible, .archives-tab:visible').all();
        
        // Active overlay detection to avoid back-button pollution
        const activeOverlayId = await page.evaluate(() => {
          const overlays = [
            'combat-overlay', 'result-overlay', 'training-overlay', 'shop-overlay',
            'equip-overlay', 'spell-overlay', 'camp-overlay', 'archives-overlay',
            'contracts-overlay', 'warehouse-overlay'
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
              return el.closest('.combat-overlay-container, .result-overlay-container, .training-overlay-container, .shop-overlay-container, .equip-overlay-container, .spell-overlay-container, .camp-overlay-container, .archives-overlay-container, .contracts-overlay-container, .warehouse-overlay-container') !== null;
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

      // 2. Training Screen
      const trainingBtn = page.locator('#btn-town-training');
      if (await trainingBtn.isVisible()) {
        await trainingBtn.click();
        await page.waitForTimeout(500);

        // Debug helper: select character and add to party so camp/equip screen can be opened
        const charRow = page.locator('.char-row').first();
        if (await charRow.isVisible()) {
          await charRow.click();
          await page.waitForTimeout(200);
          const addBtn = page.locator('button:has-text("加える"):visible').first();
          if (await addBtn.isVisible()) {
            await addBtn.click();
            await page.waitForTimeout(200);
          }
        }

        await verifyScreenButtons('Training Screen');
        // Back
        const backBtn = page.locator('#btn-submenu-back:visible, .btn-camp-close:visible, button:has-text("戻る"):visible, button:has-text("閉じる"):visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      // 3. Shop Screen
      const shopBtn = page.locator('#btn-town-shop');
      if (await shopBtn.isVisible()) {
        await shopBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Shop Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      // 4. Equip Screen
      const equipBtn = page.locator('#btn-town-camp');
      if (await equipBtn.isVisible()) {
        await equipBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Equip Screen');
        const backBtn = page.locator('button:has-text("戻る"):visible, button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      // 5. Archives Screen
      const archivesBtn = page.locator('#btn-town-archives');
      if (await archivesBtn.isVisible()) {
        await archivesBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Archives Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      // 6. Contracts Screen
      const contractsBtn = page.locator('#btn-town-contracts');
      if (await contractsBtn.isVisible()) {
        await contractsBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Contracts Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible, button:has-text("街に戻る"):visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }

      // 7. Warehouse Screen
      const warehouseBtn = page.locator('#btn-town-warehouse');
      if (await warehouseBtn.isVisible()) {
        await warehouseBtn.click();
        await page.waitForTimeout(500);
        await verifyScreenButtons('Warehouse Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible, button:has-text("街に戻る"):visible').first();
        await backBtn.click();
        await page.waitForTimeout(500);
      }
    });

    test('Dungeon exploration controls stay compact after entering the dungeon', async ({ page }) => {
      await page.locator('#btn-town-training').click();
      await expect(page.locator('#training-overlay')).toBeVisible();
      await page.locator('.char-row').first().click();
      await page.locator('button:has-text("加える"):visible').first().click();
      await page.locator('button:has-text("閉じる"):visible').first().click();
      await expect(page.locator('#town-controls')).toBeVisible();

      await page.locator('#btn-town-dungeon').click();
      if (await page.locator('#submenu-controls').isVisible()) {
        await page.getByRole('button', { name: '地下1階から潜る' }).click();
      }
      await expect(page.locator('#explore-controls')).toBeVisible();

      const panelBox = await page.locator('#controls-panel').boundingBox();
      expect(panelBox.height, `Explore controls panel should stay compact on ${vp.name}`).toBeLessThanOrEqual(130);

      const exploreButtons = await page.locator('#explore-controls button:visible').all();
      expect(exploreButtons.length).toBe(9);
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
      const dungeonStartButton = page.getByRole('button', { name: '地下1階から潜る' });
      await expect(dungeonStartButton).toBeVisible();

      const box = await dungeonStartButton.boundingBox();
      expect(box.height, `Few-button submenu row should stay compact on ${vp.name}`).toBeLessThanOrEqual(64);
      expect(box.height, `Few-button submenu row should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
    });

    test('Standalone safe-area chest menu keeps HUD and party visible', async ({ page }) => {
      await page.addStyleTag({
        content: `:root { --safe-area-top: 59px; --safe-area-bottom: 34px; }`,
      });
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
        const { openChestMenu } = await import('/src/chest.js');

        state.party = state.roster.slice(0, 4);
        state.gameState = 'combat';
        state.floor = 5;
        state.currentRun = createDefaultCurrentRun();
        state.floorChestsOpened = [0, 0, 0, 0, 2];
        state.floorChestsTotal = [3, 3, 3, 3, 4];
        state.chestState = {
          x: state.x,
          y: state.y,
          trap: 'flash bomb',
          identifiedTrap: 'flash bomb',
          inspected: true,
          inspectChance: 0.85,
          gold: 120,
          item: 'POTION',
          lootHint: { label: '古い魔力', aura: 'medium' },
        };
        openChestMenu();
      });

      await expect(page.locator('#submenu-controls')).toBeVisible();
      await expect(page.locator('#btn-chest-inspect')).toBeVisible();

      const layout = await page.evaluate(() => {
        const rect = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.getBoundingClientRect().toJSON() : null;
        };
        return {
          header: rect('#game-header'),
          goal: rect('#goal-banner'),
          viewport: rect('#viewport-panel'),
          controls: rect('#controls-panel'),
          party: rect('#party-panel'),
          partyCards: Array.from(document.querySelectorAll('#party-grid .party-card'))
            .map((el) => el.getBoundingClientRect().toJSON()),
          height: window.innerHeight,
        };
      });

      expect(layout.header.top, `Header should clear standalone top safe area on ${vp.name}`).toBeGreaterThanOrEqual(59);
      expect(layout.goal.bottom, `Goal banner should not be covered by viewport on ${vp.name}`).toBeLessThanOrEqual(layout.viewport.top);
      expect(layout.party.bottom, `Party HUD should clear standalone bottom safe area on ${vp.name}`).toBeLessThanOrEqual(layout.height - 34);
      expect(layout.partyCards).toHaveLength(4);
      for (const card of layout.partyCards) {
        expect(card.bottom, `Party card should remain inside party panel on ${vp.name}`).toBeLessThanOrEqual(layout.party.bottom);
      }
      expect(layout.controls.bottom, `Controls should not push party panel offscreen on ${vp.name}`).toBeLessThanOrEqual(layout.party.top);
    });

    test('Standalone safe-area town menu is scroll-contained above party HUD', async ({ page }) => {
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
          party: rect('#party-panel'),
          grid: rect('.town-grid'),
          scrollHeight: grid ? grid.scrollHeight : 0,
          clientHeight: grid ? grid.clientHeight : 0,
        };
      });

      expect(initialLayout.controls.bottom, `Town controls should not overlap party HUD on ${vp.name}`).toBeLessThanOrEqual(initialLayout.party.top);
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

    test('Party formation reordering works in adventure camp menu', async ({ page }) => {
      // 1. Add characters to party at Training Ground
      await page.locator('#btn-town-training').click();
      await expect(page.locator('#training-overlay')).toBeVisible();

      // Add character 1
      await page.locator('.char-row').nth(0).click();
      await page.waitForTimeout(100);
      await page.locator('button:has-text("加える"):visible').first().click();
      await page.waitForTimeout(200);

      // Add character 2
      await page.locator('.char-row').nth(0).click();
      await page.waitForTimeout(100);
      await page.locator('button:has-text("加える"):visible').first().click();
      await page.waitForTimeout(200);

      // Close training
      await page.locator('button:has-text("閉じる"):visible').first().click();
      await page.waitForTimeout(200);

      // 2. Enter Dungeon
      await page.locator('#btn-town-dungeon').click();
      if (await page.locator('#submenu-controls').isVisible()) {
        await page.getByRole('button', { name: '地下1階から潜る' }).click();
      }
      await expect(page.locator('#explore-controls')).toBeVisible();

      // 3. Open Camp
      await page.locator('#btn-camp').click();
      await expect(page.locator('#camp-overlay')).toBeVisible();

      // 4. Go to Formation Screen
      const btnFormation = page.locator('button:has-text("隊列変更"):visible');
      await expect(btnFormation).toBeVisible();
      await btnFormation.click();
      await page.waitForTimeout(200);

      // 5. Select character and perform swap
      const cards = page.locator('.camp-formation-card');
      await expect(cards).toHaveCount(4);

      // Get initial names
      const name1 = await cards.nth(0).locator('.camp-formation-name').textContent();
      const name2 = await cards.nth(1).locator('.camp-formation-name').textContent();

      // Select first character card
      await cards.nth(0).click();
      await expect(cards.nth(0)).toHaveClass(/selected/);

      // Click Down button
      const btnDown = page.locator('button:has-text("下へ"):visible');
      await expect(btnDown).toBeEnabled();
      await btnDown.click();
      await page.waitForTimeout(200);

      // Names should be swapped
      const newName1 = await cards.nth(0).locator('.camp-formation-name').textContent();
      const newName2 = await cards.nth(1).locator('.camp-formation-name').textContent();
      expect(newName1).toBe(name2);
      expect(newName2).toBe(name1);

      // Back to camp main
      const btnBack = page.locator('button:has-text("メニューに戻る"):visible');
      await btnBack.click();
      await page.waitForTimeout(200);
      await expect(btnFormation).toBeVisible();

      // Close camp
      const btnClose = page.locator('button:has-text("探索に戻る"):visible');
      await btnClose.click();
      await page.waitForTimeout(200);
      await expect(page.locator('#explore-controls')).toBeVisible();
    });
  });
}

test('Castle record submenus show a single back button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');

  await page.locator('#btn-town-castle').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();

  const recordButtons = [
    '死亡者・完全ロスト名簿',
    '遺留品情報確認',
    '全滅ログ確認',
  ];

  for (const label of recordButtons) {
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await expect(page.locator('#btn-submenu-back')).toBeVisible();
    await expect(page.locator('button:visible').filter({ hasText: '戻る' })).toHaveCount(1);
    await page.locator('#btn-submenu-back').click();
    await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  }
});
