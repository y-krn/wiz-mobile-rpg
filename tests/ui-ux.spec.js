import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 390, height: 844, name: 'iPhone 13' },
  { width: 360, height: 800, name: 'Galaxy S20' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
];

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
      expect(exploreButtons.length).toBe(8);
      for (const btn of exploreButtons) {
        const box = await btn.boundingBox();
        const text = (await btn.textContent()).trim();
        expect(box.height, `Explore button "${text}" should remain tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
    });
  });
}
