import { test, expect } from './fixtures/browser-health.js';
import { waitForAppStart } from './ui-ux-helpers.js';

// Dungeons (#2060): the town offers a choice of five-floor dungeons instead of
// a start floor. A run ends on the fifth floor of its dungeon, and beating a
// dungeon's guardian and coming home opens the next one.

// With a remembered preparation the town opens the preparation screen
// directly; a new save chooses a kit first.
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

async function quietRun(page) {
  // Fights and traps are not what these tests are about.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.repelTurns = 999;
    state.encounterQuietSteps = 999;
  });
}

async function waitForFloor(page, floor) {
  await page.evaluate(async (target) => {
    const { state } = await import('/src/state.js');
    await new Promise(resolve => {
      const timer = setInterval(() => {
        if (state.floor === target && !state.transitioning) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  }, floor);
}

async function descendTo(page, floor) {
  await page.evaluate(async (target) => {
    const { descendToFloor } = await import('/src/movement.js');
    descendToFloor(target);
  }, floor);
  await waitForFloor(page, floor);
}

async function ascendTo(page, floor) {
  await page.evaluate(async (target) => {
    const { ascendToFloor } = await import('/src/movement.js');
    ascendToFloor(target);
  }, floor);
  await waitForFloor(page, floor);
}

// Stand on the first cell that matches and let the cell respond.
async function standOn(page, match) {
  await page.evaluate(async ({ type, event }) => {
    const { state } = await import('/src/state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    const fits = cell => (type ? cell.type === type : cell.event === event);
    const y = state.map.findIndex(row => row.some(fits));
    state.y = y;
    state.x = state.map[y].findIndex(fits);
    checkCellEvents();
  }, match);
}

async function logText(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.logs.map(entry => (typeof entry === 'string' ? entry : entry.text || entry.message || '')).join('\n');
  });
}

test('A new save can enter only the collapsed mine and sees what opens the others', async ({ page }) => {
  await page.goto('/?renderer=pixi');
  await openPreparation(page);

  await expect(page.locator('.solo-start-floor-heading')).toContainText('行き先を選ぶ');
  const open = page.locator('button.solo-start-floor-option');
  await expect(open).toHaveCount(1);
  await expect(open).toContainText('崩れた坑道');
  // One dungeon open: it is chosen already, so the confirm button is ready.
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  await expect(open).toHaveAttribute('data-start-floor', '1');
  await expect(page.locator('#btn-departure-start')).toBeEnabled();

  const closed = page.locator('.solo-start-dungeon-closed li');
  await expect(closed).toHaveCount(5);
  await expect(closed.nth(0)).toContainText('忘れられた地下墓地');
  await expect(closed.nth(0)).toContainText('崩れた坑道の守護者を倒して生還すると開く');
  for (const [index, name] of [[1, '大裂溝の巣窟'], [2, '水没した魔導書庫'], [3, '竜火の鍛造殿'], [4, '深淵の玉座']]) {
    await expect(closed.nth(index)).toContainText(name);
    await expect(closed.nth(index)).toContainText('まだ道が開いていない');
  }
  // A closed dungeon is not something to press.
  await expect(page.locator('.solo-start-dungeon-closed button')).toHaveCount(0);

  await expect(page.locator('.solo-preparation-floor')).toContainText('行き先');
  await expect(page.locator('.solo-preparation-floor')).toContainText('崩れた坑道');
  await expect(page.locator('#submenu-options')).not.toContainText('開始階');
});

test('The dungeon ends on its fifth floor, and walking home with the treasure opens the catacomb', async ({ page }) => {
  await page.goto('/?renderer=pixi');
  await openPreparation(page);
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  await quietRun(page);
  await expect(page.locator('#location-label')).toContainText('B1F');

  for (const floor of [2, 3, 4, 5]) await descendTo(page, floor);

  // Before the guardian falls the stairs are sealed and say why.
  await standOn(page, { type: 'stairs-down' });
  await expect(page.locator('#submenu-title')).toHaveText('封じられた下り階段');
  await expect(page.getByRole('button', { name: 'この先の道はまだ開いていない' })).toBeDisabled();
  await expect(page.getByTestId('stairs-dungeon-end-note')).toContainText('守護者を倒して至宝を取り、上り階段を歩いて地上へ戻る');
  await expect(async () => {
    await page.getByRole('button', { name: '降りずに進む' }).click({ timeout: 1000 });
    await expect(page.locator('#explore-controls')).toBeVisible({ timeout: 1000 });
  }).toPass();

  // The guardian falls: nothing is saved yet, and the player is told what coming home will do.
  const afterGuardian = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { applyPendingOutcomeRewards } = await import('/src/combat_ui/outcome_rewards.js');
    const y = state.map.findIndex(row => row.some(cell => cell.event === 'boss'));
    state.y = y;
    state.x = state.map[y].findIndex(cell => cell.event === 'boss');
    const lines = applyPendingOutcomeRewards(state, { kind: 'milestoneVictory', floor: 5 });
    const { descendToFloor } = await import('/src/movement.js');
    descendToFloor(6);
    return { lines, unlocked: [...state.unlockedMilestones], floor: state.floor, transitioning: state.transitioning === true };
  });
  expect(afterGuardian.lines).toContain('生きて帰れば、忘れられた地下墓地への道が開く。');
  expect(afterGuardian.unlocked).toEqual([]);
  expect(afterGuardian.floor).toBe(5);
  expect(afterGuardian.transitioning).toBe(false);
  await page.evaluate(async () => (await import('/src/ui.js')).updateUI());
  await expect(page.locator('.goal-text')).toContainText('至宝を持って');
  await expect(page.locator('.goal-text')).toContainText('地下4階）へ戻る');

  await standOn(page, { type: 'stairs-down' });
  await expect(page.locator('#submenu-title')).toHaveText('封じられた下り階段');
  await expect(page.getByTestId('stairs-round-trip-note')).toContainText('上り階段を歩いて地上へ戻る');
  await expect(async () => {
    await page.getByRole('button', { name: '降りずに進む' }).click({ timeout: 1000 });
    await expect(page.locator('#explore-controls')).toBeVisible({ timeout: 1000 });
  }).toPass();

  // There is no gate (#2062): walk back up and out with the treasure.
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.map.flat().some(cell => cell.event === 'return_portal'))).toBe(false);
  for (const floor of [4, 3, 2, 1]) await ascendTo(page, floor);
  await quietRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.roamingMonsters = state.roamingMonsters.filter(monster => !monster.hunter);
    state.currentRun.roundTrip.hunterEntry = null;
  });
  await standOn(page, { type: 'stairs-up' });
  await expect(page.locator('#submenu-title')).toHaveText('地上への上り階段');
  await expect(async () => {
    await page.locator('[data-stairs-up="surface"]').click({ timeout: 1000 });
    await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 1000 });
  }).toPass();

  const result = page.locator('#result-overlay');
  await expect(result).toBeVisible();
  await expect(result.locator('.result-title')).toContainText('坑道 B5F');
  await expect(result).toContainText('忘れられた地下墓地への道が開いた');
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.unlockedMilestones)).toEqual([5]);

  // Back in the town the catacomb can be chosen, and it starts at its own first floor with a fresh adventurer.
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();
  await openPreparation(page);
  const open = page.locator('button.solo-start-floor-option');
  await expect(open).toHaveCount(2);
  await expect(open.nth(0)).toContainText('崩れた坑道');
  await expect(open.nth(0)).toContainText('踏破済み');
  await expect(open.nth(1)).toContainText('まだ踏破していない');
  await expect(open.nth(1)).toContainText('忘れられた地下墓地');
  // The catacomb's one rule shows on its card (#2063); the mine has none yet.
  await expect(open.nth(1).locator('.solo-start-dungeon-rule')).toHaveText(/^呪い：/);
  await expect(open.nth(0).locator('.solo-start-dungeon-rule')).toHaveCount(0);
  await expect(page.locator('.solo-start-dungeon-closed li')).toHaveCount(4);
  await expect(async () => {
    await open.nth(1).click({ timeout: 1000 });
    await expect(page.locator('button.solo-start-floor-option').nth(1)).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  }).toPass();
  await expect(page.locator('.solo-preparation-floor')).toContainText('忘れられた地下墓地');
  // There is no rule to choose: every run is a round trip (#2062).
  await expect(page.locator('.solo-start-rule-option')).toHaveCount(0);
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  await expect(page.locator('#location-label')).toContainText('B1F');
  await expect(page.locator('#location-label')).toContainText('忘れられた地下墓地');

  const start = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxHp } = await import('/src/data.js');
    return {
      floor: state.floor,
      startFloor: state.currentRun.startFloor,
      level: state.party[0].level,
      maxHp: getCharMaxHp(state.party[0]),
      baseline: state.currentRun.phase4cV1Baseline,
      defeated: [...state.currentRun.defeatedMilestones],
      hasGuardianBelow: state.currentRun.defeatedMilestones.includes(10)
    };
  });
  expect(start.floor).toBe(6);
  expect(start.startFloor).toBe(6);
  expect(start.level).toBe(1);
  expect(start.baseline).toBe(0);
  expect(start.defeated).toEqual([]);
  expect(await logText(page)).toContain('忘れられた地下墓地');
  await expect(page.locator('.goal-text')).toContainText('地下2階');
});

test('An old save keeps the catacomb its beaten guardian opened, and its remembered start becomes a dungeon', async ({ page }) => {
  await page.goto('/?renderer=pixi');
  await waitForAppStart(page);
  await page.evaluate(async () => {
    const { state, saveGame } = await import('/src/state.js');
    saveGame();
    const { SAVE_KEYS } = await import('/src/save_keys.js');
    const data = JSON.parse(localStorage.getItem(SAVE_KEYS.save));
    // What the old start-floor choice left behind: B5F unlocked and last used.
    data.unlockedMilestones = [5];
    data.lastPreparation = { kitId: 'vanguard', startingGear: null, recipeIds: [], startFloor: 5 };
    localStorage.setItem(SAVE_KEYS.save, JSON.stringify(data));
    state.transitioning = true;
  });
  await page.reload();
  await waitForAppStart(page);

  const loaded = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { unlocked: state.unlockedMilestones, lastStart: state.lastPreparation?.startFloor };
  });
  expect(loaded.unlocked).toEqual([5]);
  expect(loaded.lastStart).toBe(1);

  await openPreparation(page);
  const open = page.locator('button.solo-start-floor-option');
  await expect(open).toHaveCount(2);
  await expect(open.nth(1)).toContainText('忘れられた地下墓地');
  await expect(page.locator('#submenu-options')).not.toContainText('から開始');
});
