import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 320, height: 568 },
];

async function openWorkshop(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');

    state.gameState = 'town';
    state.metaMaterials = { '獣の牙': 20, '鉄片': 10 };
    state.workshop = { ranks: {} };
    openSubmenu('workshop_main', '工房 - 恒久アンロック');
  });
  await expect(page.locator('#submenu-options.workshop-grid')).toBeVisible();
}

async function scrollWorkshopToBottom(page) {
  return page.locator('#submenu-options').evaluate((grid) => {
    grid.scrollTop = grid.scrollHeight;
    const hud = grid.querySelector('.materials-hud');
    const gridBox = grid.getBoundingClientRect();
    const hudBox = hud.getBoundingClientRect();
    const backgroundColor = getComputedStyle(hud).backgroundColor;
    const colorChannels = backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
    return {
      alpha: colorChannels.length === 4 ? colorChannels[3] : 1,
      backgroundColor,
      gridTop: gridBox.top,
      hudTop: hudBox.top,
      hudBottom: hudBox.bottom,
      position: getComputedStyle(hud).position,
      scrollTop: grid.scrollTop,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`Workshop materials stay visible at ${viewport.width}x${viewport.height} @visual`, async ({ page }) => {
    await openWorkshop(page, viewport);

    const assertStickyBalance = async () => {
      const layout = await scrollWorkshopToBottom(page);
      expect(layout.scrollTop).toBeGreaterThan(0);
      expect(layout.position).toBe('sticky');
      expect(layout.hudTop).toBeGreaterThanOrEqual(layout.gridTop - 1);
      expect(layout.hudTop).toBeLessThanOrEqual(layout.gridTop + 1);
      expect(layout.hudBottom).toBeLessThanOrEqual(viewport.height);
      expect(layout.alpha, `HUD background ${layout.backgroundColor} must be opaque`).toBe(1);
    };

    await assertStickyBalance();

    await page.getByRole('button', { name: /軽量武器候補/ }).click();
    await expect(page.locator('.materials-hud')).toContainText('獣の牙:16 / 鉄片:8');
    await assertStickyBalance();
  });

  test(`Workshop list keeps readable nodes at ${viewport.width}x${viewport.height} @visual`, async ({ page }) => {
    await openWorkshop(page, viewport);

    const grid = page.locator('#submenu-options.workshop-grid');
    const layout = await grid.evaluate((element) => {
      element.scrollTop = 0;
      const gridBox = element.getBoundingClientRect();
      const hudBox = element.querySelector('.materials-hud').getBoundingClientRect();
      const backBox = document.getElementById('btn-submenu-back').getBoundingClientRect();
      const visibleTop = Math.max(gridBox.top, hudBox.bottom);
      const visibleBottom = gridBox.bottom;
      const maxScrollTop = element.scrollHeight - element.clientHeight;
      const nodeIntervals = Array.from(element.querySelectorAll('.workshop-node')).map((node) => {
        const nodeBox = node.getBoundingClientRect();
        const contentFits = Array.from(node.children).length >= 3
          && Array.from(node.children).every((child) => {
            const childBox = child.getBoundingClientRect();
            return childBox.top >= nodeBox.top - 1 && childBox.bottom <= nodeBox.bottom + 1;
          });
        return {
          start: nodeBox.bottom - visibleBottom,
          end: nodeBox.top - visibleTop,
          contentFits,
        };
      }).filter(({ start, end, contentFits }) => contentFits && end >= start - 1)
        .map(({ start, end }) => ({
          start: Math.max(0, start),
          end: Math.min(maxScrollTop, end),
        }))
        .sort((left, right) => left.start - right.start);
      const uncoveredScrollRanges = [];
      let coveredUntil = 0;
      nodeIntervals.forEach(({ start, end }) => {
        if (start > coveredUntil + 1) uncoveredScrollRanges.push([coveredUntil, start]);
        coveredUntil = Math.max(coveredUntil, end);
      });
      if (coveredUntil < maxScrollTop - 1) uncoveredScrollRanges.push([coveredUntil, maxScrollTop]);

      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        uncoveredScrollRanges,
        gridBox: { top: gridBox.top, bottom: gridBox.bottom },
        backBox: { top: backBox.top, bottom: backBox.bottom, height: backBox.height },
      };
    });

    expect(layout.clientHeight, `Workshop list should show at least two nodes on ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(240);
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    expect(layout.uncoveredScrollRanges, `Every workshop scroll position should contain a complete node on ${viewport.width}x${viewport.height}`).toEqual([]);
    expect(layout.backBox.height).toBeGreaterThanOrEqual(44);
    expect(layout.backBox.bottom).toBeLessThanOrEqual(viewport.height + 1);

    const scrollPositions = [
      0,
      Math.floor((layout.scrollHeight - layout.clientHeight) / 2),
      layout.scrollHeight - layout.clientHeight,
    ];
    for (const scrollTop of scrollPositions) {
      const visibleNodeCount = await grid.evaluate((element, requestedScrollTop) => {
        element.scrollTop = requestedScrollTop;
        const gridBox = element.getBoundingClientRect();
        const hudBox = element.querySelector('.materials-hud').getBoundingClientRect();
        const visibleTop = Math.max(gridBox.top, hudBox.bottom);
        const visibleBottom = gridBox.bottom;

        return Array.from(element.querySelectorAll('.workshop-node')).filter((node) => {
          const nodeBox = node.getBoundingClientRect();
          const contentFits = Array.from(node.children).length >= 3
            && Array.from(node.children).every((child) => {
              const childBox = child.getBoundingClientRect();
              return childBox.top >= nodeBox.top - 1 && childBox.bottom <= nodeBox.bottom + 1;
            });
          return nodeBox.top >= visibleTop - 1
            && nodeBox.bottom <= visibleBottom + 1
            && contentFits;
        }).length;
      }, scrollTop);

      expect(visibleNodeCount, `A complete workshop node should be readable at scrollTop=${scrollTop} on ${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(1);
    }
  });
}
