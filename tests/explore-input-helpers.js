// Exploration is played by touching the world (src/ui/world_gestures.js):
// tap the corridor to step forward, tap near an edge to turn, swipe down to
// step back, sweep far sideways to turn around, hold to search, and open the
// satchel from the adventurer's card. These helpers drive those real
// gestures so browser tests exercise the same input a player uses.

const COACH_KEY = 'mobile_wiz_rpg_world_gesture_coach_v1';

// Pre-dismiss the first-descent hint so it never covers a test screenshot.
export async function skipWorldCoach(page) {
  await page.addInitScript((key) => {
    try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ }
  }, COACH_KEY);
}

async function worldBox(page) {
  const box = await page.locator('#dungeon-canvas').boundingBox();
  if (!box) throw new Error('dungeon canvas is not visible');
  return box;
}

export async function tapWorld(page, across = 0.5, down = 0.62) {
  const box = await worldBox(page);
  await page.mouse.click(box.x + box.width * across, box.y + box.height * down);
}

async function dragWorld(page, from, to) {
  const box = await worldBox(page);
  const point = ([x, y]) => [box.x + box.width * x, box.y + box.height * y];
  const [startX, startY] = point(from);
  const [endX, endY] = point(to);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 6 });
  await page.mouse.up();
}

export async function exploreMove(page, action) {
  if (action === 'forward') return tapWorld(page, 0.5);
  if (action === 'turn-left') return tapWorld(page, 0.08);
  if (action === 'turn-right') return tapWorld(page, 0.92);
  if (action === 'backward') return dragWorld(page, [0.5, 0.55], [0.5, 0.75]);
  if (action === 'turn-around') return dragWorld(page, [0.9, 0.62], [0.1, 0.62]);
  throw new Error(`unknown exploration move: ${action}`);
}

export async function holdToSearch(page) {
  const box = await worldBox(page);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.62);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

export async function openSatchel(page) {
  const open = await page.locator('#game-container').getAttribute('data-satchel');
  if (open !== 'open') await page.locator('#character-panel').click();
  await page.locator('#explore-satchel').waitFor({ state: 'visible' });
}

// Opens the satchel and returns the locator of one of its actions
// (#btn-search, #btn-inspect, #btn-cast, #btn-item, #btn-explore-management).
export async function satchelAction(page, selector) {
  await openSatchel(page);
  return page.locator(selector);
}
