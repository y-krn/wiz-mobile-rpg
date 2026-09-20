import { test, expect } from './fixtures/browser-health.js';

const HOSTILE = '<img src=x onerror="globalThis.__xss = 1"><b>evil</b>';

test('combat and solo UI render hostile character, monster, and item text literally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const evidence = await page.evaluate(async hostile => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { ITEMS } = await import('/src/data/items.js');
    const { menuContext } = await import('/src/navigation.js');
    const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
    const { updateUI } = await import('/src/ui.js');
    const item = ITEMS.HEAL_POTION;
    const originalItemName = item.name;
    const originalItemDescription = item.desc;
    const character = createStartingKitCharacter('arcana');
    character.name = hostile;
    state.party = [character];
    state.inventory = ['HEAL_POTION'];
    state.combatState = {
      monsters: [{ name: hostile, hp: 20, maxHp: 20, status: 'ok' }],
      phase: 'choose_actions'
    };
    state.gameState = 'submenu';
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0;
    state.y = 0;
    state.dir = 0;
    state.transitioning = false;
    window.__xss = 0;

    updateUI();
    const hud = document.querySelector('#character-hud');
    const characterEvidence = {
      text: hud?.querySelector('.character-identity strong')?.textContent,
      image: Boolean(hud?.querySelector('img')),
      bold: Boolean(hud?.querySelector('b')),
    };

    menuContext.prevGameState = 'combat';
    menuContext.type = 'combat_spell';
    menuContext.actorIdx = 0;
    renderCombatOverlay();
    const monsterCard = document.querySelector('.combat-enemy-info-name');
    const monsterEvidence = {
      text: monsterCard?.textContent,
      image: Boolean(monsterCard?.querySelector('img')),
      bold: Boolean(monsterCard?.querySelector('b')),
    };

    item.name = hostile;
    item.desc = hostile;
    menuContext.type = 'combat_item';
    renderCombatOverlay();
    const itemCard = document.querySelector('.combat-item-card.item');
    const itemEvidence = {
      name: itemCard?.querySelector('.item-card-title')?.textContent,
      description: itemCard?.querySelector('.item-card-desc')?.textContent,
      image: Boolean(itemCard?.querySelector('img')),
      bold: Boolean(itemCard?.querySelector('b')),
    };
    item.name = originalItemName;
    item.desc = originalItemDescription;
    return { characterEvidence, monsterEvidence, itemEvidence, xss: window.__xss };
  }, HOSTILE);

  expect(evidence).toEqual({
    characterEvidence: { text: HOSTILE, image: false, bold: false },
    monsterEvidence: { text: HOSTILE, image: false, bold: false },
    itemEvidence: { name: HOSTILE, description: HOSTILE, image: false, bold: false },
    xss: 0,
  });
});
