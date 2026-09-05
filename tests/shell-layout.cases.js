import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568' },
  { width: 360, height: 800, name: '360x800' },
  { width: 390, height: 844, name: '390x844' },
  { width: 430, height: 932, name: '430x932' },
];

async function seedState(page, mode) {
  await page.evaluate(async (nextMode) => {
    const { state, createDefaultCurrentRun, createSoloCharacter } = await import('/src/state.js');
    const { menuContext, openSubmenu } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');

    state.party = [createSoloCharacter(nextMode === 'spell' ? 'Mage' : 'Fighter')];
    state.currentRun = createDefaultCurrentRun();
    state.inventory = Array.from({ length: nextMode === 'inventory' ? 20 : 3 }, () => 'HEAL_POTION');
    state.gameState = 'explore';
    state.transitioning = false;
    state.activeTrapState = null;
    state.combatState = null;
    menuContext.type = '';
    menuContext.prevGameState = null;

    if (nextMode === 'town') {
      state.gameState = 'town';
      state.currentRun = null;
      updateUI();
    } else if (nextMode === 'explore') {
      updateUI();
    } else if (nextMode === 'combat') {
      state.gameState = 'combat';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: '検証敵', hp: 10, maxHp: 10, atk: 1, def: 1 }],
        isAuto: false,
      };
      updateUI();
    } else if (nextMode === 'trap') {
      state.gameState = 'trap_encounter';
      state.activeTrapState = {
        trap: { type: 'poison needle', state: 'discovered', floorId: 'B1' },
        successRate: 50,
        expectedEffect: 'ダメージ',
        revealLevel: 3,
      };
      updateUI();
    } else if (nextMode === 'result') {
      state.gameState = 'result';
      state.currentRun.returnReason = 'stairs';
      state.currentRun.deepestFloor = 1;
      updateUI();
    } else if (nextMode === 'inventory') {
      openSubmenu('item_inventory', 'バッグ');
    } else if (nextMode === 'spell') {
      openSubmenu('spell_caster_select', '魔法');
    } else if (nextMode === 'equip') {
      state.gameState = 'equip_overlay';
      updateUI();
    }
  }, mode);
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() || null;
    const visible = element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(visible)
      .map(element => ({
        id: element.id,
        text: element.textContent.trim().replace(/\s+/g, ' '),
        rect: element.getBoundingClientRect().toJSON(),
        disabled: element.disabled === true,
      }));
    const overflow = Array.from(document.querySelectorAll('body *'))
      .filter(visible)
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      })
      .slice(0, 5)
      .map(element => ({ id: element.id, className: element.className, rect: element.getBoundingClientRect().toJSON() }));
    const activeOverlay = ['equip-overlay', 'spell-overlay', 'combat-overlay', 'archives-overlay', 'result-overlay']
      .map(id => document.getElementById(id))
      .find(element => element && visible(element));
    const scrollRegions = ['.town-grid', '#submenu-options', '.spell-item-list', '.equip-item-list', '.equip-equipped-section']
      .map(selector => document.querySelector(selector))
      .filter(element => element && visible(element))
      .map(element => ({
        selector: element.id ? `#${element.id}` : `.${element.className.split(/\s+/)[0]}`,
        rect: element.getBoundingClientRect().toJSON(),
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
    return {
      header: rect('#game-header'),
      controls: rect('#controls-panel'),
      party: rect('#character-panel'),
      overlay: activeOverlay?.getBoundingClientRect().toJSON() || null,
      buttons,
      overflow,
      scrollRegions,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`Common shell invariants hold at ${viewport.name} with safe area @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });

    for (const mode of ['town', 'explore', 'combat', 'trap', 'result', 'inventory', 'spell', 'equip']) {
      await seedState(page, mode);
      const layout = await readLayout(page);

      expect(layout.scrollWidth, `${mode} horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.overflow, `${mode} visible overflow`).toEqual([]);
      expect(layout.viewportMeta, `${mode} keeps browser zoom available`).not.toMatch(/(?:maximum-scale|user-scalable\s*=\s*no)/i);
      for (const button of layout.buttons) {
        expect(button.rect.height, `${mode} ${button.id || button.text} tap height`).toBeGreaterThanOrEqual(44);
      }
      expect(layout.header.top, `${mode} header clears safe area`).toBeGreaterThanOrEqual(59);
      if (!layout.overlay) {
        expect(layout.party.bottom, `${mode} party clears home indicator`).toBeLessThanOrEqual(viewport.height - 34 + 1);
      }
      if (layout.controls && !layout.overlay) {
        expect(layout.controls.bottom, `${mode} controls stay above party HUD`).toBeLessThanOrEqual(layout.party.top + 1);
      }

      for (const region of layout.scrollRegions) {
        expect(region.rect.left, `${mode} ${region.selector} scroll region left edge`).toBeGreaterThanOrEqual(-1);
        expect(region.rect.right, `${mode} ${region.selector} scroll region right edge`).toBeLessThanOrEqual(viewport.width + 1);
      }

      if (mode === 'town' || mode === 'inventory') {
        const selector = mode === 'town' ? '.town-grid' : '#submenu-options';
        const region = page.locator(selector);
        await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
        const lastButton = region.locator('button').last();
        const lastButtonBox = await lastButton.boundingBox();
        const regionBox = await region.boundingBox();
        expect(lastButtonBox, `${mode} last list action exists`).not.toBeNull();
        expect(regionBox, `${mode} scroll region exists`).not.toBeNull();
        expect(lastButtonBox.y + lastButtonBox.height, `${mode} last list action reachable`)
          .toBeLessThanOrEqual(regionBox.y + regionBox.height + 1);
      }
    }
  });
}
