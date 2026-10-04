import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS } from './ui-ux-helpers.js';

async function waitForControlsReady(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.controlsGuardUntil <= performance.now();
  })).toBe(true);
}

for (const vp of VIEWPORTS) {
  test.describe(`UIUX Mobile One-Handed Operation tests on ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.goto('/');
      await expect(page.locator('#btn-town-dungeon')).toBeVisible();
    });

    test('Check visible interactive controls meet a 44x44px activation area and key actions are reachable @visual', async ({ page }) => {
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

          expect(box.width, `Button "${text}" (id: ${id}, class: ${className}) on ${screenName} should be >= 44px wide. Found: ${box.width}px`).toBeGreaterThanOrEqual(44);
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
        await expect(page.locator('#submenu-controls')).toBeVisible();
        await verifyScreenButtons('Workshop Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await expect(page.locator('#town-controls')).toBeVisible();
      }

      // 3. Archives Screen
      const archivesBtn = page.locator('#btn-town-archives');
      if (await archivesBtn.isVisible()) {
        await archivesBtn.click();
        await expect(page.locator('#archives-overlay')).toBeVisible();
        await verifyScreenButtons('Archives Screen');
        const backBtn = page.locator('button:has-text("閉じる"):visible, #btn-submenu-back:visible').first();
        await backBtn.click();
        await expect(page.locator('#town-controls')).toBeVisible();
      }

    });

    test('Dungeon exploration controls stay compact after entering the dungeon @visual', async ({ page }) => {
      await page.locator('#btn-town-dungeon').click();
      await expect(page.locator('#submenu-controls')).toBeVisible();
      await page.getByRole('button', { name: /鋼の前線キット/ }).click();
      await page.locator('#btn-kit-confirm').click();
      await page.getByRole('button', { name: '迷宮へ向かう' }).click();
      await expect(page.locator('#explore-controls')).toBeVisible();

      // Exploring is touch on the world; every other action is in the satchel
      // opened from the adventurer's card.
      await expect(page.locator('#explore-satchel button:visible')).toHaveCount(0);
      await page.locator('#character-panel').click();
      const exploreButtons = await page.locator('#explore-satchel button:visible').all();
      expect(exploreButtons.length).toBe(5);
      for (const btn of exploreButtons) {
        const box = await btn.boundingBox();
        const text = (await btn.textContent()).trim();
        expect(box.width, `Explore button "${text}" should remain wide enough to tap on ${vp.name}`).toBeGreaterThanOrEqual(44);
        expect(box.height, `Explore button "${text}" should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
    });

    test('Few-button submenu rows do not stretch to fill the panel @visual', async ({ page }) => {
      await page.evaluate(async () => {
        const { openSubmenu } = await import('/src/navigation.js');
        openSubmenu('enter_dungeon_select', '迷宮へ入る準備：');
      });
      const dungeonStartButton = page.getByRole('button', { name: '迷宮へ入る' });
      await expect(dungeonStartButton).toBeVisible();

      const box = await dungeonStartButton.boundingBox();
      expect(box.height, `Few-button submenu row should stay compact on ${vp.name}`).toBeLessThanOrEqual(64);
      expect(box.width, `Few-button submenu row should remain wide enough to tap on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(box.height, `Few-button submenu row should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
    });

    test('Result screen expands by collapsing logs and controls @visual', async ({ page }) => {
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
        const { updateUI } = await import('/src/ui.js');

        state.party = [(await import('/src/state.js')).createStartingKitCharacter('arcana')];
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
      expect(layout.button.width, `Result return button should remain wide enough to tap on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(layout.button.height, `Result return button should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(layout.button.top, `Result return button should stay in bottom thumb zone on ${vp.name}`).toBeGreaterThan(vp.height * 0.5);
      expect(layout.party.bottom, `Solo HUD should stay visible below result viewport on ${vp.name}`).toBeLessThanOrEqual(layout.height);
    });

    test('Standalone safe-area chest menu keeps solo HUD visible @visual', async ({ page }) => {
      await page.addStyleTag({
        content: `:root { --safe-area-top: 59px; --safe-area-bottom: 34px; }`,
      });
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
        const { openChestMenu } = await import('/src/chest.js');

        state.party = [(await import('/src/state.js')).createStartingKitCharacter('arcana')];
        // A full bag keeps the pending-reward surface on screen (#1835).
        state.inventory = Array.from({ length: 20 }, () => 'HEAL_POTION');
        state.gameState = 'combat';
        state.floor = 5;
        state.currentRun = createDefaultCurrentRun();
        state.floorChestsOpened = [0, 0, 0, 0, 2];
        state.floorChestsTotal = [3, 3, 3, 3, 4];
        state.chestState = {
          x: state.x,
          y: state.y,
          trap: 'poison needle',
          trapSign: 'danger',
          trapSignAccuracy: 0.70,
          item: 'HEAL_POTION',
          lootHint: { label: '古い魔力', aura: 'medium' },
        };
        openChestMenu();
      });

      await expect(page.locator('#submenu-controls')).toBeVisible();
      await expect(page.locator('.chest-info-panel')).toContainText('罠の気配: 危険な気配');
      await expect(page.locator('.chest-info-panel')).toContainText('見立て: 怪しい');
      await expect(page.locator('.chest-info-panel')).toContainText('開けるときの自動解除: 約25%');
      await expect(page.getByRole('button', { name: '開ける', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'キットを使って開ける' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '立ち去る' })).toBeVisible();

      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openChestMenu } = await import('/src/chest.js');
        state.inventory.push('TRAP_KIT');
        openChestMenu();
      });
      await expect(page.getByRole('button', { name: 'キットを使って開ける' })).toBeVisible();

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
            .map((el) => ({
              text: el.textContent,
              rect: el.getBoundingClientRect().toJSON(),
              disabled: el.disabled,
              recommended: el.dataset.recommended === 'true',
            })),
          detailsOpen: document.querySelector('.chest-details')?.open ?? null,
          characterCards: Array.from(document.querySelectorAll('#character-hud .character-card'))
            .map((el) => el.getBoundingClientRect().toJSON()),
          height: window.innerHeight,
          hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      expect(layout.eventMode, `Chest menu should add event-mode on ${vp.name}`).toBe(true);
      expect(layout.logDisplay, `Chest menu should keep the transient log strip on ${vp.name}`).not.toBe('none');
      expect(layout.resultLogDisplay, `Chest result should keep the transient log strip on ${vp.name}`).not.toBe('none');
      expect(Math.abs(layout.viewport.height - layout.resultViewport.height), `Chest decision should keep the dungeon stage stable on ${vp.name}`).toBeLessThanOrEqual(1);
      expect(layout.header.top, `Header should clear standalone top safe area on ${vp.name}`).toBeGreaterThanOrEqual(59);
      expect(layout.goal.top, `Goal overlay should stay inside the dungeon stage on ${vp.name}`).toBeGreaterThanOrEqual(layout.viewport.top);
      expect(layout.goal.right, `Goal overlay should stay inside the viewport width on ${vp.name}`).toBeLessThanOrEqual(layout.width || vp.width);
      expect(layout.party.bottom, `Solo HUD should clear standalone bottom safe area on ${vp.name}`).toBeLessThanOrEqual(layout.height - 34);
      expect(layout.buttons).toHaveLength(3);
      expect(layout.buttons.map(button => button.text)).toEqual([
        '開ける', 'キットを使って開ける', '立ち去る',
      ]);
      expect(layout.hasHorizontalOverflow, `Chest menu should not create horizontal overflow on ${vp.name}`).toBe(false);
      for (const button of layout.buttons.filter(button => !button.disabled)) {
        expect(button.rect.width, `Chest action buttons should remain wide enough to tap on ${vp.name}`).toBeGreaterThanOrEqual(44);
        expect(button.rect.height, `Chest action buttons should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
      expect(layout.buttons.filter(button => button.recommended).map(button => button.text)).toEqual(['開ける']);
      expect(layout.detailsOpen, `Trap details should start collapsed on ${vp.name}`).toBe(false);
      expect(layout.options.bottom, `Scrollable chest actions should stay within controls on ${vp.name}`).toBeLessThanOrEqual(layout.controls.bottom);
      const recommended = layout.buttons.find(button => button.recommended);
      expect(recommended.rect.bottom, `Recommended chest action should be visible without scrolling on ${vp.name}`).toBeLessThanOrEqual(layout.options.bottom + 1);
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

      const gedHpBeforeTrap = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return state.party[0].hp;
      });
      // Force the automatic disarm to fail so the trap fires deterministically.
      // Object rewards continue through the shared pending-reward resolution surface.
      await page.evaluate(() => { Math.random = () => 0.99; });
      await page.getByRole('button', { name: '開ける', exact: true }).click();
      await expect(page.locator('#submenu-title')).toContainText('発見した戦果を解決');
      await expect(page.locator('.pending-reward-card')).toHaveCount(1);
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.locator('#log-content')).toContainText('宝箱を開けた瞬間、罠 [毒針] が作動した！');
      await expect(page.locator('#log-content')).toContainText(/冒険者は\d+のダメージを受けた/);
      const gedHpAfterTrap = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return state.party[0].hp;
      });
      expect(gedHpAfterTrap).toBeLessThan(gedHpBeforeTrap);
      expect(gedHpAfterTrap).toBeGreaterThanOrEqual(0);
      await expect(page.locator('#log-content')).toContainText('宝箱から素材束');
      await expect(page.locator('#game-container')).toHaveClass(/event-mode/);
      await expect(page.locator('.pending-reward-card')).toBeVisible();
      const rewardLayout = await page.evaluate(() => ({
        controls: document.querySelector('#controls-panel').getBoundingClientRect().toJSON(),
        // Measure each action after scrolling it into view so the result does not
        // depend on scroll position inherited from the previous chest surface.
        buttons: Array.from(document.querySelectorAll('#submenu-options button')).map(button => {
          button.scrollIntoView({ block: 'nearest' });
          return { text: button.textContent, rect: button.getBoundingClientRect().toJSON() };
        }),
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      expect(rewardLayout.hasHorizontalOverflow, `Pending reward surface should not overflow on ${vp.name}`).toBe(false);
      for (const button of rewardLayout.buttons) {
        expect(button.rect.width, `Pending reward action "${button.text}" should remain wide enough to tap on ${vp.name}`).toBeGreaterThanOrEqual(44);
        expect(button.rect.height, `Pending reward action "${button.text}" should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
        expect(button.rect.bottom, `Pending reward action "${button.text}" should stay within controls on ${vp.name}`).toBeLessThanOrEqual(rewardLayout.controls.bottom);
      }
    });

    test('Dungeon event submenus keep the transient log strip accessible @visual', async ({ page }) => {
      await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { openSubmenu } = await import('/src/navigation.js');
        const { updateUI } = await import('/src/ui.js');

        Math.random = () => 0.1;
        state.party = [(await import('/src/state.js')).createStartingKitCharacter('arcana')];
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
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.getByRole('button', { name: '泉の水を飲む' })).toBeVisible();
      await page.getByRole('button', { name: '泉の水を飲む' }).click();
      await expect(page.locator('#game-container')).not.toHaveClass(/event-mode/);
      await expect(page.locator('#log-panel')).toBeVisible();
      await expect(page.locator('#log-content')).toContainText('泉の水は清らかだった');
      await expect(page.getByRole('button', { name: '探索に戻る' })).toHaveCount(0);
      await expect(page.locator('#explore-controls')).toHaveClass(/active/);


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
      await expect(page.locator('.milestone-disclosure')).toHaveCount(0);
      const stairsLayout = await page.evaluate(() => ({
        buttons: Array.from(document.querySelectorAll('#submenu-options button'))
          .map((button) => button.getBoundingClientRect().toJSON()),
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      expect(stairsLayout.hasHorizontalOverflow).toBe(false);
      expect(stairsLayout.buttons).toHaveLength(2);
      for (const button of stairsLayout.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
      await waitForControlsReady(page);
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
      await expect(page.getByRole('button', { name: /へ降りる$/ })).toBeVisible();
      await waitForControlsReady(page);
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

    test('Milestone stairs disclose facility state without adding actions', async ({ page }) => {
      const observed = await page.evaluate(async () => {
        const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
        const { checkCellEvents, executeEnterDungeon } = await import('/src/movement.js');

        state.party = [createStartingKitCharacter('vanguard')];
        state.gameState = 'town';
        executeEnterDungeon(1);

        const map = state.maps[0].map(row => row.map(cell => ({ ...cell })));
        const points = [];
        for (let y = 1; y < map.length - 1 && points.length < 2; y++) {
          for (let x = 1; x < map[y].length - 1 && points.length < 2; x++) {
            if (map[y][x].type === 'empty' && !map[y][x].event) points.push({ x, y });
          }
        }
        const [merchant, portal] = points;
        map[merchant.y][merchant.x] = {
          ...map[merchant.y][merchant.x], event: 'event_merchant', milestoneFloor: 5,
        };
        map[portal.y][portal.x] = {
          ...map[portal.y][portal.x], event: 'return_portal', milestoneFloor: 5,
        };
        state.maps[4] = map;
        state.visitedMaps[4] = map.map(row => row.map(() => false));
        state.visitedMaps[4][portal.y][portal.x] = true;
        const stairs = map.flatMap((row, y) => row.map((cell, x) => (
          cell.type === 'stairs-down' ? { x, y } : null
        ))).find(Boolean);
        state.floor = 5;
        state.x = stairs.x;
        state.y = stairs.y;
        state.currentRun = createDefaultCurrentRun();
        state.gameState = 'explore';

        checkCellEvents();
        const locked = {
          text: document.querySelector('.milestone-disclosure')?.textContent || '',
          merchant: document.querySelector('[data-facility="event_merchant"]')?.textContent || '',
          portal: document.querySelector('[data-facility="return_portal"]')?.textContent || '',
          actionCount: document.querySelectorAll('.milestone-disclosure button').length,
          allButtons: document.querySelectorAll('#submenu-options button').length,
          descendDisabled: document.querySelector('#submenu-options button')?.disabled || false,
        };

        state.currentRun.defeatedMilestones = [5];
        checkCellEvents();
        const unlocked = document.querySelector('.milestone-disclosure')?.textContent || '';

        executeEnterDungeon(5);
        const clearedEntryNotice = document.querySelector('#floor-entry-stinger')?.textContent || '';
        state.currentRun = createDefaultCurrentRun();
        const { showFloorEntryStinger } = await import('/src/ui.js');
        showFloorEntryStinger(5, true);
        const lockedEntryNotice = document.querySelector('#floor-entry-stinger')?.textContent || '';
        return { locked, unlocked, clearedEntryNotice, lockedEntryNotice };
      });

      expect(observed.locked.text).toContain('階層守護者・深層商人・帰還の門');
      expect(observed.locked.merchant).toContain('未訪問');
      expect(observed.locked.merchant).toContain('守護者を倒すと開く');
      expect(observed.locked.portal).toContain('訪問済み');
      expect(observed.locked.portal).toContain('守護者を倒すと開く');
      expect(observed.locked.actionCount).toBe(0);
      expect(observed.locked.allButtons).toBe(2);
      expect(observed.locked.descendDisabled).toBe(true);
      expect(observed.unlocked).toContain('利用可能');
      expect(observed.unlocked).not.toContain('守護者を倒すと開く');
      expect(observed.clearedEntryNotice).toContain('階層守護者は撃破済み');
      expect(observed.lockedEntryNotice).toContain('階層守護者・深層商人・帰還の門');
    });

    test('Run stake summary appears only at retreat decisions', async ({ page }) => {
      const observed = await page.evaluate(async () => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { menuContext, openSubmenu } = await import('/src/navigation.js');
        const { updateUI } = await import('/src/ui.js');

        state.party = [createStartingKitCharacter('vanguard')];
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

        openSubmenu('milestone_portal', 'B5F帰還の門');
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
        expect(surface.text).toContain('素材 10個・未使用品 0個');
        expect(surface.text).toMatch(/生還すれば持ち帰る\s*素材 10個・未使用品 0個/);
        expect(surface.text).toMatch(/死ねば・断念すれば失う\s*素材 9個・未使用品 0個/);
        expect(surface.text).not.toMatch(/危険|確率|推奨|%/);
        expect(surface.box.left).toBeGreaterThanOrEqual(0);
        expect(surface.box.right).toBeLessThanOrEqual(vp.width);
        for (const button of surface.buttons) {
          expect(button.box.width).toBeGreaterThanOrEqual(44);
          expect(button.box.height).toBeGreaterThanOrEqual(44);
          expect(button.box.left).toBeGreaterThanOrEqual(0);
          expect(button.box.right).toBeLessThanOrEqual(vp.width);
        }
      }
      expect(observed.portal.buttons.map(button => button.text)).toContain(
        '素材と持ち込み品を持って帰還'
      );
      expect(observed.portal.buttons.map(button => button.text)).not.toContain(
        '撤退して素材を100%、戦果を選んで持ち帰る'
      );
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

        state.party = [(await import('/src/state.js')).createStartingKitCharacter('arcana')];
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
        state.party = [(await import('/src/state.js')).createStartingKitCharacter('arcana')];
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
      expect((await rest.boundingBox()).width).toBeGreaterThanOrEqual(44);
      expect((await rest.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await rest.click();
      await expect(page.locator('#log-content')).toContainText('野営地で休息した');

      await page.evaluate(async () => {
        const { openSubmenu } = await import('/src/navigation.js');
        openSubmenu('event_camp', '野営地');
      });
      await expect(page.getByText('すでに今回の遠征中に休息した')).toBeVisible();
      await expect(page.getByRole('button', { name: '休息する' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '休息せず進む' })).toBeVisible();
    });

    test('Milestone floor entry opens Camp before exploration and both choices finish the entry', async ({ page }) => {
      const started = await page.evaluate(async () => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { startCampEntryIfEligible } = await import('/src/movement.js');
        state.party = [createStartingKitCharacter('vanguard')];
        state.floor = 6;
        state.gameState = 'explore';
        state.currentRun = createDefaultCurrentRun();
        state.currentRun.defeatedMilestones = [5];
        return startCampEntryIfEligible(6);
      });
      expect(started).toBe(true);
      await expect(page.getByRole('button', { name: '休息する' })).toBeVisible();
      await expect(page.getByRole('button', { name: '休息せず進む' })).toBeVisible();
      await waitForControlsReady(page);
      await page.getByRole('button', { name: '休息する' }).click();

      const afterRest = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return {
          gameState: state.gameState,
          pending: state.currentRun.pendingCampEntryFloor,
          completed: state.currentRun.completedCampEntryFloors,
        };
      });
      expect(afterRest).toEqual({ gameState: 'explore', pending: null, completed: [6] });

      const secondStarted = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { startCampEntryIfEligible } = await import('/src/movement.js');
        state.floor = 11;
        state.gameState = 'explore';
        state.currentRun.defeatedMilestones = [10];
        return startCampEntryIfEligible(11);
      });
      expect(secondStarted).toBe(true);
      await expect(page.getByRole('button', { name: '休息せず進む' })).toBeVisible();
      await waitForControlsReady(page);
      await page.getByRole('button', { name: '休息せず進む' }).click();
      const afterContinue = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return {
          gameState: state.gameState,
          pending: state.currentRun.pendingCampEntryFloor,
          completed: state.currentRun.completedCampEntryFloors,
        };
      });
      expect(afterContinue).toEqual({ gameState: 'explore', pending: null, completed: [6, 11] });
    });

    test('Standalone safe-area town home is one page scroll with a pinned primary action @visual', async ({ page }) => {
      await page.addStyleTag({
        content: `:root { --safe-area-top: 59px; --safe-area-bottom: 34px; }`,
      });
      await expect(page.locator('#town-controls')).toBeVisible();
      await expect(page.locator('#character-panel')).toBeHidden();

      const measure = () => page.evaluate(() => {
        const container = document.getElementById('game-container');
        const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
        const nestedScrollers = Array.from(container.querySelectorAll('*'))
          .filter((el) => el.offsetParent && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
          .map((el) => el.id || el.className);
        return {
          viewportHeight: window.innerHeight,
          scrollTop: container.scrollTop,
          scrollable: container.scrollHeight > container.clientHeight,
          nestedScrollers,
          primary: rect('#btn-town-dungeon'),
          last: rect('#btn-town-workshop'),
          dock: rect('.town-primary-dock'),
          safeBottomStrip: getComputedStyle(container, '::after').position,
        };
      });

      const initial = await measure();
      expect(initial.nestedScrollers, `Town home should not nest a second scroll area on ${vp.name}`).toEqual([]);
      expect(initial.primary.bottom, `Primary town action should be reachable without scrolling on ${vp.name}`).toBeLessThanOrEqual(initial.viewportHeight);
      expect(initial.primary.top).toBeGreaterThanOrEqual(0);

      await page.locator('#game-container').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(page.locator('#btn-town-workshop')).toBeVisible();

      const scrolled = await measure();
      expect(scrolled.scrollTop > 0 || !scrolled.scrollable).toBe(true);
      expect(scrolled.primary.bottom, `Primary town action should stay pinned after scrolling on ${vp.name}`).toBeLessThanOrEqual(scrolled.viewportHeight);
      expect(scrolled.last.bottom, `Last town card should clear the pinned primary dock on ${vp.name}`).toBeLessThanOrEqual(scrolled.dock.top + 1);
      // An absolute safe-area strip would scroll into the middle of the page.
      expect(scrolled.safeBottomStrip, `Safe-area strip should stay pinned to the viewport on ${vp.name}`).toBe('fixed');
    });

    test('Starting kit selection starts exactly one Lv1 solo character', async ({ page }) => {
      await page.locator('#btn-town-dungeon').click();
      await expect(page.locator('#submenu-title')).toContainText('開始キットを選択');
      await page.getByRole('button', { name: /軽装探索キット/ }).click();
      await page.locator('#btn-kit-confirm').click();
      await page.getByRole('button', { name: '迷宮へ向かう' }).click();
      await expect(page.locator('#explore-controls')).toBeVisible();
      const character = await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        return { count: state.party.length, startingKit: state.party[0].startingKit, level: state.party[0].level };
      });
      expect(character).toEqual({ count: 1, startingKit: 'scout', level: 1 });
      await expect(page.locator('#character-hud .character-card')).toHaveCount(1);
      await expect(page.locator('#character-hud')).not.toContainText('戦士');
    });
  });
}
