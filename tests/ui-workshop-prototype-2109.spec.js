import { test, expect } from './fixtures/browser-health.js';
import { openDeparturePreparation } from './ui-ux-helpers.js';

// The workshop's prototypes (#2109): before departure, three Cores on plain
// bases; one may be taken for a few early materials and rides in the bag.
test('A workshop prototype is chosen in preparation, paid at departure, and carried in the bag', async ({ page }) => {
  await openDeparturePreparation(page, { width: 390, height: 844 });
  const section = page.locator('.solo-start-prototypes');
  await expect(section).toBeVisible();
  const options = section.locator('.solo-start-prototype-option');
  await expect(options).toHaveCount(3);

  const offer = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { canAffordPrototype, getPrototypeOffers } = await import('/src/systems/workshop_prototype.js');
    const first = getPrototypeOffers(state).find(candidate => canAffordPrototype(state.metaMaterials, candidate));
    return { ...first, before: { ...state.metaMaterials } };
  });
  const first = section.locator(`[data-prototype-family="${offer.familyId}"]`);
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.solo-preparation-prototype')).toContainText(offer.familyName);

  await page.locator('#btn-departure-start').click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state.js')).state.gameState)).toBe('explore');
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const prototype = state.inventory.find(item => item?.workshopPrototype);
    return {
      materials: { ...state.metaMaterials },
      prototype: prototype ? { baseId: prototype.baseId, cores: prototype.affixes.map(affix => affix.id) } : null
    };
  });
  expect(after.prototype).toEqual({ baseId: offer.baseId, cores: [offer.coreId] });
  for (const [name, quantity] of Object.entries(offer.cost)) {
    expect(after.materials[name]).toBe(offer.before[name] - quantity);
  }

  // The run saves and loads with the prototype in the bag.
  await page.reload();
  const reloaded = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.inventory.some(item => item?.workshopPrototype);
  });
  expect(reloaded).toBe(true);
});

test('The workshop says what it builds and shows the next prototypes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btn-town-workshop').click();
  await expect(page.locator('.workshop-purpose')).toContainText('試作品');
  await expect(page.locator('.workshop-prototypes li')).toHaveCount(3);
});
