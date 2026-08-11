import { test, expect } from '@playwright/test';
import { VIEWPORTS } from './ui-ux-helpers.js';
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

      const gedHpBeforeTrap = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return state.party[0].hp;
      });
      await page.getByRole('button', { name: /Ged .*開ける/ }).click();
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.locator('#log-content')).toContainText('宝箱を開けた瞬間、罠 [毒針] が作動した！');
      await expect(page.locator('#log-content')).toContainText(/Gedは\d+のダメージを受けた/);
      const gedHpAfterTrap = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return state.party[0].hp;
      });
      expect(gedHpAfterTrap).toBeLessThan(gedHpBeforeTrap);
      expect(gedHpAfterTrap).toBeGreaterThanOrEqual(0);
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

    test('Down stairs ask before descending and can be skipped', async ({ page }) => {
      const before = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state.js');
        const { checkCellEvents } = await import('/src/movement.js');
        const { updateUI } = await import('/src/ui.js');
        state.gameState = 'explore';
        state.floor = 2;
        state.currentRun = createDefaultCurrentRun();
        const cell = state.map[state.y][state.x];
        cell.type = 'stairs-down';
        cell.event = null;
        cell.message = null;
        checkCellEvents();
        updateUI();
        return { gameState: state.gameState, floor: state.floor, x: state.x, y: state.y };
      });
      expect(before).toMatchObject({ gameState: 'submenu', floor: 2 });

      await expect(page.getByRole('button', { name: '降りずに進む' })).toBeVisible();
      const stairsLayout = await page.evaluate(() => ({
        buttons: Array.from(document.querySelectorAll('#submenu-options button'))
          .map((button) => button.getBoundingClientRect().toJSON()),
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      expect(stairsLayout.hasHorizontalOverflow).toBe(false);
      expect(stairsLayout.buttons).toHaveLength(2);
      for (const button of stairsLayout.buttons) {
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '降りずに進む' }).click();

      const afterStay = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { gameState: state.gameState, floor: state.floor, x: state.x, y: state.y };
      });
      expect(afterStay).toMatchObject({ gameState: 'explore', floor: 2, x: before.x, y: before.y });

      await page.evaluate(async () => {
        const { checkCellEvents } = await import('/src/movement.js');
        const { updateUI } = await import('/src/ui.js');
        checkCellEvents();
        updateUI();
      });
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /へ降りる$/ }).click();
      await expect.poll(async () => page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return state.floor;
      })).toBe(3);

      const afterDescend = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { gameState: state.gameState, floor: state.floor };
      });
      expect(afterDescend.floor).toBe(3);
      expect(afterDescend.gameState).toBe('explore');
    });

    test('Run stake summary appears only at retreat decisions', async ({ page }) => {
      const observed = await page.evaluate(async () => {
        const { state, createDefaultCurrentRun, createSoloCharacter } = await import('/src/state.js');
        const { menuContext, openSubmenu } = await import('/src/navigation.js');
        const { updateUI } = await import('/src/ui.js');

        state.party = [createSoloCharacter('Fighter')];
        state.currentRun = createDefaultCurrentRun();
        state.currentRun.materials = { '獣の牙': 5, '鉄片': 3, '霊粉': 2 };
        state.gameState = 'explore';
        updateUI();
        const exploreSummaryCount = document.querySelectorAll('.run-stakes-summary').length;

        const readSurface = () => {
          const summary = document.querySelector('.run-stakes-summary');
          return {
            text: summary?.textContent || '',
            box: summary?.getBoundingClientRect().toJSON() || null,
            buttons: Array.from(document.querySelectorAll('#submenu-options button')).map(button => ({
              text: button.textContent,
              box: button.getBoundingClientRect().toJSON(),
            })),
          };
        };

        openSubmenu('stairs_down', 'B2Fへの下り階段');
        const stairs = readSurface();

        openSubmenu('milestone_portal', 'B5F帰還ポータル');
        const portal = readSurface();

        state.inventory = ['TOWN_PORTAL'];
        menuContext.itemKey = 'TOWN_PORTAL';
        menuContext.itemIdx = 0;
        openSubmenu('item_target_select', '帰還の翼の対象');
        const wing = readSurface();

        return { exploreSummaryCount, stairs, portal, wing };
      });

      expect(observed.exploreSummaryCount).toBe(0);
      for (const surface of [observed.stairs, observed.portal, observed.wing]) {
        expect(surface.text).toContain('今回の素材 10個');
        expect(surface.text).toMatch(/持ち帰れば\s*10個/);
        expect(surface.text).toMatch(/死ねば\s*9個失う/);
        expect(surface.text).not.toMatch(/危険|確率|推奨|%/);
        expect(surface.box.left).toBeGreaterThanOrEqual(0);
        expect(surface.box.right).toBeLessThanOrEqual(vp.width);
        for (const button of surface.buttons) {
          expect(button.box.height).toBeGreaterThanOrEqual(44);
          expect(button.box.left).toBeGreaterThanOrEqual(0);
          expect(button.box.right).toBeLessThanOrEqual(vp.width);
        }
      }
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
        const { openSubmenu } = await import('/src/navigation.js');
        state.party = [(await import('/src/state.js')).createSoloCharacter('Mage')];
        state.party.forEach(char => {
          char.hp = Math.max(1, Math.floor(char.maxHp / 2));
          char.mp = Math.floor(char.maxMp / 2);
        });
        state.floor = 2;
        state.gameState = 'explore';
        state.currentRun = createDefaultCurrentRun();
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
