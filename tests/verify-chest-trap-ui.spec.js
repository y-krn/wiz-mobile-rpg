import { test, expect } from '@playwright/test';

test('Verify Chest Trap Inspection and Disarm Button UI state flow (with trap)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 13 width
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForTimeout(1000);

  // 1. Initial State Setup (With trap: poison needle)
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    
    state.party = [
      {
        name: "Robin",
        class: "Thief",
        level: 1,
        hp: 15,
        maxHp: 15,
        status: "ok",
        equipment: { weapon: null, shield: null, armor: null }
      }
    ];
    // Force transition to chest menu
    setupChestState("poison needle", 100, null);
  });

  await page.waitForTimeout(1000);

  // 2. Before Inspection UI verification
  const btnInspect = page.locator('#btn-chest-inspect');
  const btnDisarm = page.locator('#btn-chest-disarm');

  await expect(btnInspect).toBeVisible();
  await expect(btnInspect).toBeEnabled();

  await expect(btnDisarm).toBeVisible();
  await expect(btnDisarm).toHaveText("解除（要調査）");
  await expect(btnDisarm).toBeDisabled();

  // 3. Perform inspection
  await btnInspect.click();
  await page.waitForTimeout(1000);

  // 4. After Inspection UI verification
  const btnInspectAfter = page.locator('#btn-chest-inspect');
  await expect(btnInspectAfter).toBeVisible();
  await expect(btnInspectAfter).toBeDisabled();

  const identifiedTrap = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.chestState.identifiedTrap;
  });

  // Find the disarm button again to check its new text and state
  const btnDisarmAfter = page.locator('#btn-chest-disarm');
  const disarmText = await btnDisarmAfter.textContent();
  console.log(`Disarm button text after inspection (trap case): ${disarmText}`);

  if (identifiedTrap === "none") {
    await expect(btnDisarmAfter).toHaveText("解除不要");
    await expect(btnDisarmAfter).toBeDisabled();
  } else {
    await expect(btnDisarmAfter).toHaveText("解除する");
    await expect(btnDisarmAfter).toBeEnabled();

    // Click "解除する" to open disarmer select submenu
    await btnDisarmAfter.click();
    await page.waitForTimeout(1000);

    // Verify back button is visible and click it
    const btnBack = page.locator('#btn-submenu-back');
    await expect(btnBack).toBeVisible();
    await btnBack.click();
    await page.waitForTimeout(1000);

    // Verify we returned to chest menu and elements are redrawn
    const btnInspectBack = page.locator('#btn-chest-inspect');
    await expect(btnInspectBack).toBeVisible();
    await expect(btnInspectBack).toBeDisabled();
  }

});

test('Verify Chest Trap Inspection and Disarm Button UI state flow (no trap)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 13 width
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForTimeout(1000);

  // 1. Initial State Setup (No trap: none)
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    
    state.party = [
      {
        name: "Robin",
        class: "Thief",
        level: 1,
        hp: 15,
        maxHp: 15,
        status: "ok",
        equipment: { weapon: null, shield: null, armor: null }
      }
    ];
    // Force transition to chest menu
    setupChestState("none", 100, null);
  });

  await page.waitForTimeout(1000);

  // 2. Before Inspection UI verification
  const btnInspect = page.locator('#btn-chest-inspect');
  const btnDisarm = page.locator('#btn-chest-disarm');

  await expect(btnInspect).toBeVisible();
  await expect(btnInspect).toBeEnabled();

  await expect(btnDisarm).toBeVisible();
  await expect(btnDisarm).toHaveText("解除（要調査）");
  await expect(btnDisarm).toBeDisabled();

  // 3. Perform inspection
  await btnInspect.click();
  await page.waitForTimeout(1000);

  // 4. After Inspection UI verification
  const btnInspectAfter = page.locator('#btn-chest-inspect');
  await expect(btnInspectAfter).toBeVisible();
  await expect(btnInspectAfter).toBeDisabled();

  const identifiedTrap = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.chestState.identifiedTrap;
  });

  // Find the disarm button again
  const btnDisarmAfter = page.locator('#btn-chest-disarm');
  const disarmText = await btnDisarmAfter.textContent();
  console.log(`Disarm button text after inspection (no trap case): ${disarmText}`);

  if (identifiedTrap === "none") {
    await expect(btnDisarmAfter).toHaveText("解除不要");
    await expect(btnDisarmAfter).toBeDisabled();
  } else {
    await expect(btnDisarmAfter).toHaveText("解除する");
    await expect(btnDisarmAfter).toBeEnabled();
  }

});
