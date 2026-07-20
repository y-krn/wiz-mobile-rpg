import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "Galaxy S20", width: 360, height: 800 },
  { name: "iPhone 13", width: 390, height: 844 },
  { name: "iPhone 14 Pro Max", width: 430, height: 932 }
];

async function enterDiscoveredTrap(page, type) {
  await page.evaluate(async trapType => {
    const { state, createSoloCharacter } = await import("/src/state.js");
    const { handleMove } = await import("/src/movement.js");

    state.floor = 1;
    state.party = [createSoloCharacter("Thief")];
    state.gameState = "explore";
    state.transitioning = false;

    let edge = null;
    for (let y = 1; y < state.map.length - 1 && !edge; y++) {
      for (let x = 1; x < state.map[y].length - 1 && !edge; x++) {
        const cell = state.map[y][x];
        for (let dir = 0; dir < 4; dir++) {
          if (!cell.walls[dir] && !cell.blockEnter?.[dir]) {
            edge = { x, y, dir };
            break;
          }
        }
      }
    }
    if (!edge) throw new Error("No passable edge found for trap test");

    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const trapX = edge.x + dx[edge.dir];
    const trapY = edge.y + dy[edge.dir];
    state.x = edge.x;
    state.y = edge.y;
    state.dir = edge.dir;
    state.map[trapY][trapX].trap = {
      id: `browser_${trapType}`,
      floorId: "B1",
      position: { x: trapX, y: trapY },
      type: trapType,
      state: "discovered",
      difficulty: 30
    };

    handleMove("forward");
  }, type);
}

for (const viewport of VIEWPORTS) {
  test(`Trap choices use three thumb-safe actions on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");

    await expect(page.locator("#btn-trap-bypass")).toHaveCount(0);

    await enterDiscoveredTrap(page, "damage");
    await expect(page.locator("#btn-trap-disarm")).toHaveText("解除する");
    await expect(page.locator("#btn-trap-force")).toHaveText("強行突破");

    for (const id of ["#btn-trap-back", "#btn-trap-disarm", "#btn-trap-force"]) {
      const button = page.locator(id);
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(viewport.width);
    }

    await page.evaluate(async () => {
      const { handleTrapAction } = await import("/src/systems/traps.js");
      handleTrapAction("back");
    });
    await enterDiscoveredTrap(page, "pitfall");
    await expect(page.locator("#btn-trap-disarm")).toHaveText("縁を伝う");
    await expect(page.locator("#btn-trap-force")).toHaveText("飛び込む");
  });
}
