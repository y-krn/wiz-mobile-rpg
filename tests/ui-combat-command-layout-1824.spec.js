import { test, expect } from './fixtures/browser-health.js';

// #1824: combat command buttons must keep the same position every turn so a
// repeated tap on the same spot never lands on a different command.
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 320, height: 568 },
];

const COMMAND_IDS = [
  'btn-combat-fight',
  'btn-combat-spell',
  'btn-combat-item',
  'btn-combat-repeat',
  'btn-combat-defend',
  'btn-combat-run',
  'btn-combat-cancel',
];

async function seedCombat(page) {
  await page.goto('/?renderer=pixi');
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('arcana')];
    state.currentRun = createDefaultCurrentRun();
    state.inventory = ['HEAL_POTION'];
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
    state.gameState = 'combat';
    state.transitioning = false;
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: '検証敵', level: 1, hp: 80, maxHp: 100, magicResist: 0, color: '#ff3b30', spriteType: 'biter', tags: [] }],
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
  await page.waitForTimeout(100);
}

// Applies one turn situation and returns every command button's rect.
async function applyTurn(page, turn) {
  return page.evaluate(async ({ turn, ids }) => {
    const { state } = await import('/src/state.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    const { getCharTechnique } = await import('/src/rules/technique_rules.js');
    state.combatState.lastActions = turn.lastActions;
    state.combatState.techniqueCooldowns = turn.cooldowns || {};
    combatSelection.charIdx = turn.charIdx;
    combatSelection.actions = turn.charIdx > 0 ? [{ type: 'defend', actorIdx: 0 }] : [];
    updateUI();
    const rects = {};
    for (const id of ids) {
      const rect = document.getElementById(id).getBoundingClientRect();
      rects[id] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    return {
      rects,
      hasTechnique: Boolean(getCharTechnique(state.party[0], state)),
      technique: (() => {
        const button = document.getElementById('btn-combat-technique');
        const rect = button.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        const lineTops = new Set([...range.getClientRects()].map(r => Math.round(r.top)));
        return {
          visible: !button.hidden,
          text: button.textContent,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          lines: lineTops.size,
          clipped: button.scrollWidth > button.clientWidth + 1,
        };
      })(),
      grid: document.querySelector('.combat-grid').getBoundingClientRect().toJSON(),
    };
  }, { turn, ids: COMMAND_IDS });
}

const TURNS = [
  { name: 'first turn, first actor', charIdx: 0, lastActions: null },
  { name: 'second actor (cancel usable)', charIdx: 1, lastActions: null },
  { name: 'repeat usable', charIdx: 0, lastActions: [{ type: 'defend', actorIdx: 0 }] },
  { name: 'repeat target vanished', charIdx: 0, lastActions: [{ type: 'fight', actorIdx: 0, targetIdx: 5 }] },
  { name: 'repeat usable, second actor', charIdx: 1, lastActions: [{ type: 'defend', actorIdx: 1 }] },
  { name: 'technique ready', charIdx: 0, lastActions: null },
  { name: 'technique cooling down, repeat usable', charIdx: 0, lastActions: [{ type: 'defend', actorIdx: 0 }], cooldowns: { 0: 3 } },
];

for (const viewport of VIEWPORTS) {
  test(`Combat commands keep fixed positions across turns ${viewport.width}x${viewport.height} @e2e`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedCombat(page);

    const baseline = await applyTurn(page, TURNS[0]);
    const techniqueRects = [];
    for (const turn of TURNS) {
      const current = await applyTurn(page, turn);
      expect(current.hasTechnique, turn.name).toBe(true);
      expect(current.grid, turn.name).toEqual(baseline.grid);
      for (const id of COMMAND_IDS) {
        expect(current.rects[id], `${turn.name}: ${id}`).toEqual(baseline.rects[id]);
      }
      expect(current.technique.visible, turn.name).toBe(true);
      expect(current.technique.lines, `${turn.name}: ${current.technique.text}`).toBe(1);
      expect(current.technique.clipped, `${turn.name}: ${current.technique.text}`).toBe(false);
      techniqueRects.push(current.technique.rect);
      for (const rect of Object.values(current.rects)) {
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      const shot = testInfo.outputPath(`issue-1824-${viewport.width}x${viewport.height}-${TURNS.indexOf(turn)}.png`);
      await page.screenshot({ path: shot });
      await testInfo.attach(`${viewport.width}x${viewport.height} ${turn.name}`, { path: shot, contentType: 'image/png' });
    }
    expect(techniqueRects.length).toBeGreaterThan(0);
    for (const rect of techniqueRects) expect(rect).toEqual(techniqueRects[0]);
  });
}

test('Unavailable combat commands stay visible, disabled, and explain why @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCombat(page);

  await applyTurn(page, TURNS[0]);
  const repeat = page.locator('#btn-combat-repeat');
  const cancel = page.locator('#btn-combat-cancel');
  await expect(repeat).toBeVisible();
  await expect(repeat).toBeDisabled();
  await expect(repeat).toHaveAttribute('data-reason', '前回なし');
  await expect(repeat).toHaveAttribute('aria-label', /使用不可: 前回の行動がありません/);
  await expect(cancel).toBeVisible();
  await expect(cancel).toBeDisabled();
  await expect(cancel).toHaveAttribute('data-reason', /\S/);

  await applyTurn(page, TURNS[3]);
  await expect(repeat).toBeDisabled();
  await expect(repeat).toHaveAttribute('data-reason', '条件不成立');

  await applyTurn(page, TURNS[2]);
  await expect(repeat).toBeEnabled();
  await expect(repeat).not.toHaveAttribute('data-reason', /./);

  await applyTurn(page, TURNS[5]);
  await expect(page.locator('#btn-combat-technique')).not.toHaveAttribute('data-reason', /./);

  await applyTurn(page, TURNS[1]);
  await expect(cancel).toBeEnabled();
  await expect(cancel).not.toHaveAttribute('data-reason', /./);
  expect(Number(await cancel.evaluate(el => getComputedStyle(el).opacity))).toBe(1);

  // A cooling-down technique stays in place but reads as unavailable.
  await applyTurn(page, TURNS[6]);
  const technique = page.locator('#btn-combat-technique');
  await expect(technique).toBeVisible();
  await expect(technique).toHaveText('見切り斬り');
  await expect(technique).toHaveAttribute('data-reason', 'あと3ターン');
  await expect(technique).toHaveClass(/is-unavailable/);
  expect(Number(await technique.evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(1);
  expect(Number(await cancel.evaluate(el => getComputedStyle(el).opacity))).toBeLessThan(1);
});
