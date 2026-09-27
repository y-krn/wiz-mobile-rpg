import { test, expect } from './fixtures/browser-health.js';

// #1819: author `display` rules such as `.btn { display: flex }` must never
// override the `hidden` attribute.
async function visibleHiddenElements(page) {
  return page.evaluate(() => [...document.querySelectorAll('[hidden]')]
    .filter(el => getComputedStyle(el).display !== 'none')
    .map(el => el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`));
}

async function seedState(page, gameState) {
  await page.evaluate(async (mode) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('arcana')];
    state.currentRun = mode === 'town' ? null : createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    })));
    state.maps[0] = state.map;
    state.visitedMap = state.map.map(row => row.map(() => true));
    state.visitedMaps[0] = state.visitedMap;
    state.transitioning = false;
    state.combatState = mode === 'combat' ? {
      phase: 'choose_actions',
      monsters: [{ name: '検証敵', level: 1, hp: 50, maxHp: 50, magicResist: 0, color: '#ff3b30', spriteType: 'biter', tags: [] }],
      roundNumber: 1,
      isAuto: false,
      pendingOutcome: null,
      lastActions: null,
    } : null;
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', itemKey: '', itemIdx: -1, prevGameState: null });
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    state.gameState = mode;
    updateUI();
  }, gameState);
  await page.waitForTimeout(100);
}

test('hidden attribute always wins over author display rules @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  for (const gameState of ['town', 'explore', 'combat']) {
    await seedState(page, gameState);
    expect(await visibleHiddenElements(page), gameState).toEqual([]);
  }

  // The default run profile gives no weapon technique, so the button must
  // stay hidden instead of rendering as an empty, inert `.btn`.
  const hasTechnique = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getTechniqueStatus } = await import('/src/rules/technique_rules.js');
    return Boolean(getTechniqueStatus(state, 0).technique);
  });
  expect(hasTechnique).toBe(false);
  const technique = page.locator('#btn-combat-technique');
  await expect(technique).toHaveAttribute('hidden', '');
  await expect(technique).toBeHidden();
  await expect(page.locator('#btn-combat-fight')).toBeVisible();
});
