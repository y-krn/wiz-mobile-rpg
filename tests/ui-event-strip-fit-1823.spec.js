import { test, expect } from './fixtures/browser-health.js';

// The event strip has a fixed height budget. Long rows are shortened to an
// explicit ellipsis or left out whole, never clipped mid-line, and the full
// text stays one tap away behind #btn-log-expand (#1823).
const WARNING = '[警告] 火薬コウモリの体が赤く膨らみ、爆ぜる寸前だ！';
const REWARD = '初めて倒した報酬：獣の牙×1';
const NEWEST = '[味方] 冒険者の攻撃！しかし群れネズミは霧のようにかわした！';
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 375, height: 667 }];

async function seedStrip(page, { mode, extraUnresolved = 0 }) {
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ mode, extraUnresolved, WARNING, REWARD, NEWEST }) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter, addLog, addEventLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.logs = [];
    state.transitioning = false;
    state.gameState = mode;
    state.combatState = mode === 'combat'
      ? {
        phase: 'choose_actions',
        isAuto: false,
        monsters: [{ name: '火薬コウモリ', level: 1, hp: 10, maxHp: 10, color: '#6b6b2a', spriteType: 'biter' }]
      }
      : null;
    for (let index = 0; index < extraUnresolved; index++) {
      addEventLog(`【気配】壁の向こうで何かが動いた。(${index + 1})`, { key: `fit-1823-${index}`, scope: 'floor:1' });
    }
    addEventLog(WARNING, { key: 'fit-1823-warning', scope: 'combat' });
    addEventLog(REWARD, { key: 'fit-1823-reward', scope: 'run', kind: 'result' });
    addLog(NEWEST);
    updateUI();
  }, { mode, extraUnresolved, WARNING, REWARD, NEWEST });
}

// Every shown row lies inside the strip's padding box, rows do not overlap,
// and a row whose text does not fit is marked as clamped (ellipsis).
async function readStrip(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#log-panel');
    const style = getComputedStyle(panel);
    const box = panel.getBoundingClientRect();
    const inner = {
      top: box.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth),
      bottom: box.bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth)
    };
    const rows = Array.from(document.querySelectorAll('#log-content .event-strip-item'))
      .filter(row => getComputedStyle(row).display !== 'none')
      .map(row => {
        const rect = row.getBoundingClientRect();
        const rowStyle = getComputedStyle(row);
        return {
          kind: row.dataset.eventKind,
          text: row.textContent,
          top: rect.top,
          bottom: rect.bottom,
          clamped: row.classList.contains('event-strip-item--clamped'),
          ellipsis: rowStyle.textOverflow === 'ellipsis' || rowStyle.webkitLineClamp !== 'none',
          cut: row.scrollHeight > row.clientHeight + 1 || row.scrollWidth > row.clientWidth + 1
        };
      });
    return {
      inner,
      rows,
      dropped: Number(document.querySelector('#btn-log-expand').dataset.hiddenCount || 0)
    };
  });
}

function expectReadable(strip) {
  expect(strip.rows.length).toBeGreaterThan(0);
  strip.rows.forEach((row, index) => {
    expect(row.top, `${row.kind} row top`).toBeGreaterThanOrEqual(strip.inner.top - 0.5);
    expect(row.bottom, `${row.kind} row bottom`).toBeLessThanOrEqual(strip.inner.bottom + 0.5);
    if (index > 0) expect(row.top).toBeGreaterThanOrEqual(strip.rows[index - 1].bottom);
    // Text that does not fit ends in an explicit ellipsis.
    if (row.cut) expect(row.ellipsis, `${row.kind} row ellipsis`).toBe(true);
  });
}

for (const viewport of VIEWPORTS) {
  const size = `${viewport.width}x${viewport.height}`;

  test(`combat event strip keeps a warning, a reward, and the newest line readable at ${size}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedStrip(page, { mode: 'combat' });
    const strip = await readStrip(page);
    expectReadable(strip);
    expect(strip.dropped).toBe(0);
    expect(strip.rows.map(row => row.kind)).toEqual(['unresolved', 'result', 'transient']);
    // The threat is shown in full; the newest line may end in an ellipsis.
    const warning = strip.rows[0];
    expect(warning.text).toContain('爆ぜる寸前だ！');
    expect(warning.cut).toBe(false);
    expect(strip.rows.at(-1).text).toContain('冒険者の攻撃');
    await testInfo.attach(`issue-1823-combat-${size}`, { body: await page.screenshot(), contentType: 'image/png' });

    await page.locator('#btn-log-expand').click();
    await expect(page.locator('#log-overlay-body')).toContainText('霧のようにかわした！');
    await expect(page.locator('#log-overlay-body')).toContainText('獣の牙×1');
  });

  test(`explore event strip keeps its budget and never cuts a row at ${size}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await seedStrip(page, { mode: 'explore' });
    await expect(page.locator('#game-container')).toHaveAttribute('data-explore-hud', /.+/);
    // The folded strip fits two one-line rows: the threat and the newest line.
    // The reward row is left out whole and counted on the full-log control.
    let strip = await readStrip(page);
    expectReadable(strip);
    expect(strip.rows.map(row => row.kind)).toEqual(['unresolved', 'transient']);
    expect(strip.dropped).toBe(1);
    await expect(page.locator('#btn-log-expand')).toHaveAttribute('data-hidden-count', '+1');
    await testInfo.attach(`issue-1823-explore-${size}`, { body: await page.screenshot(), contentType: 'image/png' });

    // Once the newest line clears, the reward row takes its place.
    await page.clock.runFor(4000);
    strip = await readStrip(page);
    expectReadable(strip);
    expect(strip.rows.map(row => row.kind)).toEqual(['unresolved', 'result']);
    expect(strip.dropped).toBe(0);
    await expect(page.locator('#btn-log-expand')).not.toHaveAttribute('data-hidden-count');
    await testInfo.attach(`issue-1823-explore-settled-${size}`, { body: await page.screenshot(), contentType: 'image/png' });
  });

  test(`over-budget event strip leaves out whole rows instead of cutting them at ${size}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedStrip(page, { mode: 'explore', extraUnresolved: 3 });
    const strip = await readStrip(page);
    expectReadable(strip);
    expect(strip.dropped).toBeGreaterThan(0);
    // The newest line and an unresolved threat stay; the older result goes first.
    expect(strip.rows.at(-1).text).toContain('冒険者の攻撃');
    expect(strip.rows.some(row => row.kind === 'unresolved')).toBe(true);
    expect(strip.rows.some(row => row.kind === 'result')).toBe(false);
  });
}
