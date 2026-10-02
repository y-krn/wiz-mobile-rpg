import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 320, height: 568 },
];

async function installCombat(page, mode = 'combat_target', profile = 'all') {
  await page.evaluate(async ({ combatMode, combatProfile }) => {
      const { state, createStartingKitCharacter } = await import('/src/state.js');
      const { getRuneItemId, syncMediumState } = await import('/src/rules/magic_rules.js');
      const { MONSTERS } = await import('/src/data.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');

    const copyMonster = name => {
      const template = MONSTERS.find(monster => monster.name === name);
      return { ...template, hp: template.hp, maxHp: template.hp, buffs: [] };
    };
    const wisp = copyMonster('ウィル・オー・ウィスプ');
    const golem = copyMonster('アイアンゴーレム');
    const slime = copyMonster('マッドスライム');
    const caster = createStartingKitCharacter('arcana');
    caster.name = 'Arthur';
    caster.equipment.weapon = 'ARCH_WAND';
    caster.equipment.shield = null;
    syncMediumState(caster);
    caster.mediumState.socketedRunes = ['HALITO', 'LAHALITO'].map(getRuneItemId);
    caster.hp = caster.maxHp = 20;
    caster.mp = caster.maxMp = 20;
    state.party = [caster];
    state.codex.monsters = {
      [wisp.name]: { encountered: 1, killed: 0, magicResistKnown: true },
      [golem.name]: { encountered: 1, killed: 0, magicResistKnown: true, physResistKnown: true },
      [slime.name]: { encountered: 1, killed: 0 }
    };
    if (combatProfile === 'wisp') {
      state.codex.monsters = {
        [wisp.name]: { encountered: 1, killed: 0, magicResistKnown: true }
      };
    }
    state.combatState = {
      monsters: combatProfile === 'wisp'
        ? [wisp]
        : [wisp, golem, slime],
      phase: 'choose_actions'
    };
    state.gameState = 'submenu';
    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.visitedMap = [[true]];
    state.x = 0;
    state.y = 0;
    state.dir = 0;
    state.transitioning = false;
    menuContext.prevGameState = 'combat';
    menuContext.type = combatMode;
    menuContext.targetType = 'enemy';
    menuContext.actorIdx = 0;
    renderCombatOverlay();
    updateUI();
  }, { combatMode: mode, combatProfile: profile });
}

async function expectWithinViewport(locator, viewport, label) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a visible bounding box`).not.toBeNull();
  expect(box.x, `${label} should not start offscreen`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${label} should not start above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} should fit the viewport width`).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height, `${label} should fit the viewport height`).toBeLessThanOrEqual(viewport.height + 1);
}

for (const viewport of VIEWPORTS) {
  // Resistances live in the archives; the spell hand keeps the world clear.
  test(`spell selection leaves enemy resistances to the archives at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await installCombat(page, 'combat_spell');
    await expect(page.locator('#combat-overlay .combat-item-card.spell').first()).toBeVisible();
    await expect(page.locator('#combat-overlay')).not.toContainText('ほとんど効かない');
    await expect(page.locator('#combat-overlay')).not.toContainText('弱点');
  });
}

test('archives discloses known resistances and tolerates legacy codex records', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');
    state.codex.monsters['ウィル・オー・ウィスプ'] = {
      encountered: 1,
      killed: 0,
      magicResistKnown: true,
      physResistKnown: true
    };
    openArchivesOverlay();
  });

  await page.locator('#archives-overlay .codex-row', { hasText: 'ウィル・オー・ウィスプ' }).click();
  const detail = page.locator('#archives-overlay .codex-detail');
  await expect(detail).toContainText('呪文');
  await expect(detail).toContainText('ほとんど効かない');
  await expect(detail).toContainText('物理');
  await expect(detail).toContainText('やや効きにくい');
  await expectWithinViewport(detail, { width: 390, height: 844 }, 'archives detail');

  await page.getByRole('button', { name: '一覧に戻る' }).click();
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openArchivesOverlay } = await import('/src/ui.js');
    state.codex.monsters['ウィル・オー・ウィスプ'] = { encountered: 1, killed: 0 };
    openArchivesOverlay();
  });
  await page.locator('#archives-overlay .codex-row', { hasText: 'ウィル・オー・ウィスプ' }).click();
  await expect(page.locator('#archives-overlay .codex-detail')).toBeVisible();
  await expect(page.locator('#archives-overlay .codex-detail')).not.toContainText('ほとんど効かない');
});
