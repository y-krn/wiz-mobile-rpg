import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 320, height: 568 },
];

async function installCombat(page, mode = 'combat_target', profile = 'all') {
  await page.evaluate(async ({ combatMode, combatProfile }) => {
      const { state } = await import('/src/state.js');
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
    state.party = [{
      name: 'Arthur',
      class: 'Mage',
      hp: 20,
      maxHp: 20,
      mp: 20,
      maxMp: 20,
      status: 'ok',
      spells: ['HALITO', 'LAHALITO']
    }];
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
        : combatMode === 'combat_spell' ? [wisp, golem] : [wisp, golem, slime],
      phase: 'choose_actions'
    };
    state.gameState = 'submenu';
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
  test(`combat resistance disclosure is readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await installCombat(page, 'combat_target', 'wisp');

    const overlay = page.locator('#combat-overlay');
    const wisp = overlay.locator('.combat-target-card.enemy', { hasText: 'ウィル・オー・ウィスプ' });
    await expect(wisp).toBeVisible();
    await expect(wisp.locator('.card-title')).toBeVisible();
    await expect(wisp.locator('[data-resistance-type="magic"]')).toContainText('ほとんど効かない');
    await expect(wisp.locator('[data-resistance-type="physical"]')).toContainText('未判明');
    await expectWithinViewport(wisp, viewport, 'wisp target card');

    await page.screenshot({
      path: `output/playwright/combat-resistance-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });

    await installCombat(page);
    const golem = overlay.locator('.combat-target-card.enemy', { hasText: 'アイアンゴーレム' });
    const slime = overlay.locator('.combat-target-card.enemy', { hasText: 'マッドスライム' });
    await expect(wisp).toBeVisible();
    await expect(golem).toBeVisible();
    await expect(slime).toBeVisible();
    await expect(wisp.locator('.card-title')).toBeVisible();
    await expect(golem.locator('.card-title')).toBeVisible();
    await expect(slime.locator('.card-title')).toBeVisible();
    await expect(wisp.locator('[data-resistance-type="magic"]')).toContainText('ほとんど効かない');
    await expect(wisp.locator('[data-resistance-type="physical"]')).toContainText('未判明');
    await expect(golem.locator('[data-resistance-type="magic"]')).toContainText('弱点');
    await expect(golem.locator('[data-resistance-type="physical"]')).toContainText('ほとんど効かない');
    await expect(slime).not.toContainText('弱点');
    await expect(slime).not.toContainText('効きにくい');
    await expect(slime).toContainText('未判明');
    await expectWithinViewport(wisp, viewport, 'wisp target card');
    await expectWithinViewport(golem, viewport, 'golem target card');
    await expectWithinViewport(slime, viewport, 'unknown target card');

    await overlay.evaluate(element => {
      element.style.filter = 'grayscale(1)';
    });
    await expect(wisp.locator('[data-resistance-type="magic"]')).toContainText('ほとんど効かない');
    await expect(golem.locator('[data-resistance-type="magic"]')).toContainText('弱点');
    await expect(golem.locator('[data-resistance-type="physical"]')).toContainText('ほとんど効かない');
    await expectWithinViewport(wisp, viewport, 'grayscale wisp target card');
    await expectWithinViewport(golem, viewport, 'grayscale golem target card');
  });

  test(`spell selection shows enemy resistance information at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await installCombat(page, 'combat_spell');

    const panel = page.locator('#combat-overlay .combat-enemy-info');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('敵の耐性情報');
    await expect(panel).toContainText('ウィル・オー・ウィスプ');
    await expect(panel).toContainText('ほとんど効かない');
    await expect(panel).toContainText('アイアンゴーレム');
    await expect(panel).toContainText('弱点');
    await expectWithinViewport(panel, viewport, 'enemy information panel');
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
  await expect(detail).toContainText('呪文：ほとんど効かない');
  await expect(detail).toContainText('物理：やや効きにくい');
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
