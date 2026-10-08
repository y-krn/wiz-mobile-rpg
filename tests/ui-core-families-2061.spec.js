import { test, expect } from './fixtures/browser-health.js';

// Likely Core families (#2061): each open dungeon shows its three likely Core
// families where it is chosen, a run takes them with it, a run that reached
// the third floor redraws them, and a treasure carried out again fixes one
// family of one open dungeon before the next departure.

const FAMILY_NAMES = ['技', '構え', '血', '呪い', '罠', '忍び'];

async function openPreparation(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#btn-town-dungeon').click();
  const section = page.locator('.solo-start-floor-section');
  const kit = page.getByRole('button', { name: /鋼の前線キット/ }).first();
  await expect(section.or(kit).first()).toBeVisible();
  if (!(await section.isVisible())) {
    await kit.click();
    await page.locator('#btn-kit-confirm').click();
  }
  await expect(section).toBeVisible();
}

function familyNames(text) {
  return text.replace(/^出やすい Core：/, '').replace(/（.*$/, '').split('・');
}

test('Each open dungeon shows three likely Cores, and the run takes them with it', async ({ page }) => {
  await page.goto('/?renderer=pixi');
  await openPreparation(page);

  const line = page.locator('button.solo-start-floor-option .solo-start-dungeon-families');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('出やすい Core：');
  const names = familyNames(await line.textContent());
  expect(names).toHaveLength(3);
  names.forEach(name => expect(FAMILY_NAMES).toContain(name));
  const ids = (await line.getAttribute('data-families')).split(',');
  expect(ids).toHaveLength(3);
  // Nothing to fix without a treasure carried out again.
  await expect(page.locator('.solo-start-treasure-pin')).toHaveCount(0);

  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const taken = await page.evaluate(async () => (await import('/src/state.js')).state.party[0].likelyCoreFamilies);
  expect(taken).toEqual(ids);
});

test('A run that reached the third floor redraws, and a treasure carried out again fixes one family', async ({ page }) => {
  await page.goto('/?renderer=pixi');
  await openPreparation(page);
  const before = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    // The mine was cleared before; this run beats its guardian and comes home again.
    state.unlockedMilestones = [5];
    const draw = JSON.parse(JSON.stringify(state.coreFamilies));
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.deepestFloor = 5;
    state.currentRun.defeatedMilestones = [5];
    state.floor = 5;
    state.gameState = 'explore';
    triggerRunResult('milestone_portal');
    return draw;
  });

  const result = page.locator('#result-overlay');
  await expect(result).toBeVisible();
  await expect(result).toContainText('どの迷宮も、出やすい Core が変わった');
  await expect(result).toContainText('至宝の力');
  const after = await page.evaluate(async () => (await import('/src/state.js')).state.coreFamilies);
  expect(after.draws).toBe(before.draws + 1);
  expect(after.treasurePin).toBe(true);

  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();
  await openPreparation(page);
  const catacomb = page.locator('button.solo-start-floor-option[data-dungeon="forgotten_catacomb"]');
  await expect(async () => {
    await catacomb.click({ timeout: 1000 });
    await expect(page.locator('button.solo-start-floor-option[data-dungeon="forgotten_catacomb"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass();

  const pin = page.locator('.solo-start-treasure-pin');
  await expect(pin).toBeVisible();
  await expect(pin).toContainText('忘れられた地下墓地の出やすい Core を1つ');
  const drawn = (await page.locator('button.solo-start-floor-option[data-dungeon="forgotten_catacomb"] .solo-start-dungeon-families').getAttribute('data-families')).split(',');
  // A family already likely there is not a choice; a family locked by the Workshop is not offered.
  for (const id of drawn) await expect(pin.locator(`[data-family="${id}"]`)).toBeDisabled();
  await expect(pin.locator('[data-family="trap"]')).toHaveCount(0);
  const choice = pin.locator('button.solo-start-pin-option:not([disabled])').first();
  const familyId = await choice.getAttribute('data-family');
  await choice.click();

  await expect(page.locator('.solo-start-treasure-pin')).toHaveCount(0);
  const line = page.locator('button.solo-start-floor-option[data-dungeon="forgotten_catacomb"] .solo-start-dungeon-families');
  await expect(line).toContainText('は至宝で決めた');
  const fixed = (await line.getAttribute('data-families')).split(',');
  expect(fixed).toEqual([familyId, drawn[0], drawn[1]]);

  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const run = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { taken: state.party[0].likelyCoreFamilies, pin: state.coreFamilies.treasurePin };
  });
  expect(run.taken).toEqual(fixed);
  expect(run.pin).toBe(false);
});
