import { test, expect } from './fixtures/browser-health.js';

// Danger red is reserved for damage or high-loss actions.
// Safe combat commands and the chest "leave" choice must not read as danger.

async function readButtonStyles(page, selector) {
  return page.evaluate((sel) => {
    const danger = getComputedStyle(document.documentElement).getPropertyValue('--semantic-danger').trim();
    const probe = document.createElement('span');
    probe.style.color = danger;
    document.body.appendChild(probe);
    const dangerRgb = getComputedStyle(probe).color.match(/\d+/g).slice(0, 3).join(',');
    probe.remove();
    const rgb = (value) => (value.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number).join(',');
    return [...document.querySelectorAll(sel)]
      .filter(el => getComputedStyle(el).display !== 'none' && !el.hidden)
      .map((el) => {
        const style = getComputedStyle(el);
        return {
          id: el.id,
          text: el.textContent.trim(),
          dangerText: rgb(style.color) === dangerRgb,
          dangerBorder: rgb(style.borderTopColor) === dangerRgb,
          filled: style.backgroundImage.includes('gradient'),
        };
      });
  }, selector);
}

test.describe('Danger color is limited to high-risk actions @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?renderer=pixi');
  });

  test('combat dock keeps safe commands neutral and one filled primary', async ({ page }, testInfo) => {
    await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { combatSelection } = await import('/src/combat.js');
      const { updateUI } = await import('/src/ui.js');
      state.party = [createStartingKitCharacter('arcana'), createStartingKitCharacter('vanguard')];
      state.currentRun = createDefaultCurrentRun();
      state.inventory = ['HEAL_POTION'];
      state.gameState = 'combat';
      state.transitioning = false;
      state.combatState = {
        phase: 'choose_actions',
        monsters: [
          { name: '検証敵', level: 1, hp: 80, maxHp: 100, magicResist: 0, color: '#ff3b30', spriteType: 'biter', tags: [] },
          { name: '検証敵 B', level: 1, hp: 60, maxHp: 60, magicResist: 0, color: '#00e5ff', spriteType: 'kobold', tags: [] },
        ],
        roundNumber: 1,
        isAuto: false,
        pendingOutcome: null,
        lastActions: null,
      };
      Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', itemKey: '', itemIdx: -1, prevGameState: null });
      combatSelection.charIdx = 0;
      combatSelection.actions = [];
      updateUI();
    });
    await expect(page.locator('#btn-combat-run')).toBeVisible();

    const buttons = await readButtonStyles(page, '#combat-controls .btn');
    const byId = Object.fromEntries(buttons.map(b => [b.id, b]));
    for (const id of ['btn-combat-spell', 'btn-combat-item', 'btn-combat-defend', 'btn-combat-run']) {
      expect(byId[id], `${id} should be visible`).toBeTruthy();
      expect(byId[id].dangerText, `${id} text must not use danger color`).toBe(false);
      expect(byId[id].dangerBorder, `${id} border must not use danger color`).toBe(false);
      expect(byId[id].filled, `${id} must not be filled`).toBe(false);
    }
    expect(buttons.filter(b => b.filled).map(b => b.id)).toEqual(['btn-combat-fight']);

    const path = testInfo.outputPath('issue-1743-combat-dock-390.png');
    await testInfo.attach('issue-1743-combat-dock-390', { body: await page.screenshot({ path }), contentType: 'image/png' });
  });

  test('chest panel keeps leave neutral and smash as danger', async ({ page }, testInfo) => {
    await page.evaluate(async () => {
      const { state, createStartingKitCharacter } = await import('/src/state.js');
      const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
      const { openChestMenu } = await import('/src/chest.js');
      state.party = [createStartingKitCharacter('arcana')];
      state.gameState = 'combat';
      state.floor = 1;
      state.currentRun = createDefaultCurrentRun();
      state.inventory = [];
      state.chestState = {
        x: state.x,
        y: state.y,
        trap: 'poison needle',
        identifiedTrap: 'poison needle',
        inspected: true,
        inspectChance: 0.3,
        item: 'HEAL_POTION',
      };
      openChestMenu();
    });
    await expect(page.getByRole('button', { name: '立ち去る' })).toBeVisible();

    const buttons = await readButtonStyles(page, '#submenu-options button');
    const byText = Object.fromEntries(buttons.map(b => [b.text, b]));
    expect(byText['叩き壊す'].dangerText, 'smash keeps danger text').toBe(true);
    for (const text of ['立ち去る', '宝箱を開ける', '解除する']) {
      expect(byText[text].dangerText, `${text} text must not use danger color`).toBe(false);
      expect(byText[text].dangerBorder, `${text} border must not use danger color`).toBe(false);
    }
    expect(buttons.filter(b => b.filled).length).toBeLessThanOrEqual(1);

    const path = testInfo.outputPath('issue-1743-chest-panel-390.png');
    await testInfo.attach('issue-1743-chest-panel-390', { body: await page.screenshot({ path }), contentType: 'image/png' });
  });
});
