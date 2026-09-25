import { test, expect } from './fixtures/browser-health.js';

// Combat cause and effect at phone size: damage numbers sit over the enemy
// that took the hit, party hits show on the HUD and the view edge, and the
// round's enemy actions stay readable after playback.
const VIEWPORT = { width: 390, height: 844 };

const MONSTER = { level: 1, hp: 10, maxHp: 10, color: '#6b6b2a', spriteType: 'biter' };

async function seedCombat(page, names) {
  await page.evaluate(async (monsterNames) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.gameState = 'combat';
    state.transitioning = false;
    state.combatState = {
      phase: 'choose_actions',
      isAuto: false,
      monsters: monsterNames.map(name => ({ ...window.__combatFeedbackMonster, name }))
    };
    updateUI();
    dungeonRenderer.damageTexts = [];
    dungeonRenderer.draw();
  }, names);
}

async function readFloatingText(page, text, target) {
  return page.evaluate(async ({ text: label, target: targetIndex }) => {
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    dungeonRenderer.addDamageText(label, '#6b6b2a', { target: targetIndex });
    dungeonRenderer.draw();
    const entry = dungeonRenderer.damageTexts.at(-1);
    const bounds = entry.textObject.getBounds();
    const layout = getCombatMonsterLayout(dungeonRenderer.getRenderInput().combatMonsters, dungeonRenderer.viewport);
    return {
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      fontSize: entry.textObject.style.fontSize,
      fill: entry.textObject.style.fill,
      strokeWidth: entry.textObject.style.stroke?.width,
      slots: layout.map(({ monsterIndex, cx, cy, slotWidth }) => ({ monsterIndex, cx, cy, slotWidth }))
    };
  }, { text, target });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript((monster) => { window.__combatFeedbackMonster = monster; }, MONSTER);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
});

test('damage number sits over the single enemy with readable size and contrast at 390x844', async ({ page }, testInfo) => {
  await seedCombat(page, ['かみつき蟲']);
  const floating = await readFloatingText(page, '9', 0);
  const [slot] = floating.slots;
  const centerX = floating.bounds.x + floating.bounds.width / 2;
  const centerY = floating.bounds.y + floating.bounds.height / 2;

  expect(Math.abs(centerX - slot.cx)).toBeLessThan(slot.slotWidth * 0.25);
  // Over the enemy body, not the ceiling band.
  expect(centerY).toBeGreaterThan(VIEWPORT.height * 0.4);
  expect(Math.abs(centerY - slot.cy)).toBeLessThan(VIEWPORT.height * 0.12);
  expect(floating.fontSize).toBeGreaterThanOrEqual(28);
  expect(floating.bounds.height).toBeGreaterThanOrEqual(28);
  // Light fill on a dark stroke regardless of the enemy's own color.
  expect(floating.fill).not.toBe('#6b6b2a');
  expect(floating.strokeWidth).toBeGreaterThanOrEqual(5);

  const shot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('combat-feedback-single-390.png') });
  await testInfo.attach('combat-feedback-single-390', { body: shot, contentType: 'image/png' });
});

test('damage numbers identify which of several enemies was hit at 390x844', async ({ page }, testInfo) => {
  await seedCombat(page, ['かみつき蟲', 'コボルトの斥候', '群れネズミ']);
  const floating = await readFloatingText(page, '7', 2);
  const centerX = floating.bounds.x + floating.bounds.width / 2;
  const target = floating.slots.find(({ monsterIndex }) => monsterIndex === 2);
  expect(Math.abs(centerX - target.cx)).toBeLessThan(target.slotWidth / 2);
  for (const other of floating.slots.filter(({ monsterIndex }) => monsterIndex !== 2)) {
    expect(Math.abs(centerX - other.cx)).toBeGreaterThan(other.slotWidth / 2);
  }

  const hit = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.triggerHitFeedback(220, 2);
    return dungeonRenderer.hitTarget;
  });
  expect(hit).toBe(2);

  const shot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('combat-feedback-trio-390.png') });
  await testInfo.attach('combat-feedback-trio-390', { body: shot, contentType: 'image/png' });
});

test('floating numbers reuse one Text for their lifetime and release it on expiry', async ({ page }) => {
  await seedCombat(page, ['かみつき蟲']);
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.addDamageText('5', '#ff3b30', { target: 0 });
    dungeonRenderer.draw();
    const first = dungeonRenderer.damageTexts[0].textObject;
    const ys = [first.position.y];
    for (let frame = 0; frame < 5; frame += 1) {
      dungeonRenderer.update(100);
      dungeonRenderer.draw();
      ys.push(dungeonRenderer.damageTexts[0].textObject.position.y);
    }
    const sameText = dungeonRenderer.damageTexts[0].textObject === first;
    const layerChildren = dungeonRenderer.floatingTextLayer.children.length;
    dungeonRenderer.update(2000);
    dungeonRenderer.draw();
    return {
      sameText,
      rose: ys.at(-1) < ys[0],
      layerChildren,
      afterExpiry: dungeonRenderer.floatingTextLayer.children.length,
      entries: dungeonRenderer.damageTexts.length,
      destroyed: first.destroyed
    };
  });
  expect(evidence).toEqual({ sameText: true, rose: true, layerChildren: 1, afterExpiry: 0, entries: 0, destroyed: true });
});

test('reduced motion keeps damage and party-hit feedback readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedCombat(page, ['かみつき蟲']);
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.addDamageText('9', '#ff3b30', { target: 0 });
    dungeonRenderer.draw();
    const text = dungeonRenderer.damageTexts[0].textObject;
    const startY = text.position.y;
    dungeonRenderer.update(700);
    dungeonRenderer.draw();
    dungeonRenderer.triggerPartyHit();
    return {
      visibleAfter700ms: dungeonRenderer.damageTexts.length === 1 && text.alpha === 1,
      still: text.position.y === startY,
      partyHit: dungeonRenderer.partyHitTime > 0
    };
  });
  expect(evidence).toEqual({ visibleAfter700ms: true, still: true, partyHit: true });
});

test('party hit and the round enemy actions stay visible after playback at 390x844', async ({ page }, testInfo) => {
  await seedCombat(page, ['かみつき蟲', 'コボルトの斥候']);
  const partyHit = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { playBattleLogs } = await import('/src/combat_ui/battle_log_player.js');
    const hero = state.party[0].name;
    // Enemies act first; the party's own attack ends the round.
    playBattleLogs([
      { msg: `[ 敵 ] かみつき蟲の攻撃！${hero}に2のダメージ。`, presentationKind: 'damage-taken', floatText: '2', floatColor: '#ff3b30' },
      { msg: `[ 敵 ] コボルトの斥候は毒の牙を剥いた！${hero}は毒状態になった。`, presentationKind: 'damage-taken' },
      { msg: `[味方] ${hero}の攻撃！かみつき蟲に9のダメージ。`, presentationKind: 'damage-dealt', floatText: '9', floatColor: '#6b6b2a', floatTarget: 0 }
    ], 0);
    // The first entry plays synchronously; read before the ticker ages it.
    return dungeonRenderer.partyHitTime;
  });
  expect(partyHit).toBeGreaterThan(0);

  const hud = page.locator('#character-hud');
  await expect(hud).toHaveClass(/is-hit/);
  await expect(hud).toHaveAttribute('data-hit-damage', '-2');
  const badge = await hud.evaluate(element => getComputedStyle(element, '::after').content);
  expect(badge).toContain('-2');

  // Playback ends with the party's attack as the recent line.
  await expect(page.locator('#log-content .event-strip-item:last-child')).toContainText('一撃を加えた');
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#log-content .event-strip-item'))
    .filter(item => getComputedStyle(item).display !== 'none')
    .map(item => {
      const panel = document.querySelector('#log-panel').getBoundingClientRect();
      const rect = item.getBoundingClientRect();
      return {
        label: item.querySelector('.event-strip-item-label')?.textContent,
        text: item.textContent,
        insidePanel: rect.top >= panel.top - 1 && rect.bottom <= panel.bottom + 1
      };
    }));
  const enemyRow = rows.find(({ label }) => label === '敵');
  expect(enemyRow?.text).toContain('かみつき蟲');
  expect(enemyRow.insidePanel).toBe(true);
  expect(rows.at(-1).label).toBe('直近');
  expect(rows.at(-1).text).toContain('9');

  const shot = await page.screenshot({ path: testInfo.outputPath('combat-feedback-after-round-390.png') });
  await testInfo.attach('combat-feedback-after-round-390', { body: shot, contentType: 'image/png' });
});

test('production enemies carry a dark silhouette outline', async ({ page }) => {
  await seedCombat(page, ['かみつき蟲']);
  const outline = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const billboard = dungeonRenderer.layer('actors').children.find(child => child.label?.startsWith('enemy-procedural-'));
    const enemy = billboard.children[0];
    const [ring, body] = enemy.children;
    return {
      labels: enemy.children.map(child => child.label),
      copies: ring.children.length,
      partsPerCopy: ring.children[0].children.length,
      bodyParts: body.children.length,
      tint: ring.tint
    };
  });
  expect(outline.labels).toEqual(['enemy-outline', 'enemy-body']);
  expect(outline.copies).toBe(4);
  expect(outline.partsPerCopy).toBe(outline.bodyParts);
  expect(outline.tint).toBe(0x0b0910);
});
