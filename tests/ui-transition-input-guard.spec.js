import { test, expect } from './fixtures/browser-health.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function seedExplore(page) {
  await page.goto('/?renderer=pixi');
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.controlsGuardUntil = 0;
    updateUI();
  });
  await expect(page.locator('#explore-controls')).toBeVisible();
}

// A real finger tap at the button's centre, fired as soon as the button is
// visible: no actionability retries that could hide a swallowed first tap.
async function tapOnce(page, selector) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

const gameState = page => page.evaluate(async () => (await import('/src/state.js')).state.gameState);

test('Bag, back, and equip each open with a single tap on mobile @smoke', async ({ page }) => {
  await seedExplore(page);

  await tapOnce(page, '#character-panel');
  await tapOnce(page, '#btn-inspect');
  await expect(page.locator('#submenu-controls')).toBeVisible();
  expect(await gameState(page)).toBe('submenu');
  await expect(page.locator('#submenu-controls')).not.toHaveAttribute('data-input-guard', /.*/);

  await tapOnce(page, '#btn-submenu-back');
  await expect(page.locator('#explore-controls')).toBeVisible();
  expect(await gameState(page)).toBe('explore');

  await tapOnce(page, '#character-panel');
  await tapOnce(page, '#btn-item');
  await expect(page.locator('#equip-overlay')).toBeVisible();
  await expect.poll(() => gameState(page)).toBe('equip_overlay');
});

test('Guarded submenu buttons look unavailable until the input guard releases @smoke', async ({ page }) => {
  await seedExplore(page);
  const submenu = page.locator('#submenu-controls');
  const back = page.locator('#btn-submenu-back');

  // Sample the guarded surface synchronously so the 350ms window cannot lapse
  // between the transition and the assertions.
  const guarded = await page.evaluate(async () => {
    const { openGuardedSubmenu } = await import('/src/navigation.js');
    const { state } = await import('/src/state.js');
    const armedAt = performance.now();
    openGuardedSubmenu('item_inventory', '共有バッグ');
    const dock = document.getElementById('submenu-controls');
    const backButton = document.getElementById('btn-submenu-back');
    const snapshot = {
      armedAt,
      inputGuard: dock.dataset.inputGuard ?? null,
      ariaBusy: dock.getAttribute('aria-busy'),
      opacity: Number(getComputedStyle(backButton).opacity),
    };
    // The guard itself stays: a tap while it is visibly active is swallowed.
    backButton.click();
    return { ...snapshot, stateAfterTap: state.gameState };
  });
  expect(guarded).toMatchObject({ inputGuard: 'active', ariaBusy: 'true', stateAfterTap: 'submenu' });
  expect(guarded.opacity).toBeLessThan(1);
  const armedAt = guarded.armedAt;

  await expect(submenu).not.toHaveAttribute('data-input-guard', /.*/);
  const releasedAfter = await page.evaluate(start => performance.now() - start, armedAt);
  const guardMs = await page.evaluate(async () => (await import('/src/controls_guard.js')).CONTROLS_GUARD_MS);
  expect(releasedAfter).toBeGreaterThanOrEqual(guardMs);
  await expect(submenu).not.toHaveAttribute('aria-busy', /.*/);
  expect(Number(await back.evaluate(el => getComputedStyle(el).opacity))).toBe(1);

  // Once the buttons look live again, one tap is enough.
  await tapOnce(page, '#btn-submenu-back');
  await expect(page.locator('#explore-controls')).toBeVisible();
  expect(await gameState(page)).toBe('explore');
});
