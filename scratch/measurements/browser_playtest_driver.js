/* global window, document, PointerEvent, MouseEvent, setTimeout */
// Browser-side playtest driver (#1799). Loaded as a module into the running
// game (Vite dev server) by run_browser_playtest.js, or manually from public/.
// It drives the real game: movement through handleMove, everything else by
// clicking the rendered buttons, so combat/traps/chests use production logic.
//
// Known shortcuts (keep them in mind when reading results):
// - pathfinding reads the whole internal map (a human has to explore);
// - equipment policy uses domain APIs (identify / loadout commit) instead of
//   the equipment overlay, with the same one-turn cost as the overlay;
// - no human judgement for Guard in ordinary fights, except the Guard-then-
//   technique rhythm of the Riposte Core.
//
// Run policy (W.__playRun options; all are measurement policy, not game rules):
// - explore: HP share under which the bot stops exploring a floor.
// - recovery ('on' | 'off' | 'always'): with 'on', a floor that can still give
//   HP back for walking unvisited cells is not left just because HP is under
//   `explore`, unless HP is under 30% (where the bot can only flee a fight).
//   'always' drops that 30% limit; 'off' leaves as soon as HP is under `explore`.
// - rooms ('leave' | 'use' | 'rescue'): what to do in special rooms. 'use'
//   takes what helps this run (a supply, a rest, a grave, a temper); 'rescue'
//   also frees keepers and turns back to walk out with them.
// - cores ('on' | 'off'): Core-specific combat habits (Riposte, Blood).
// - Every run is a round trip (#2062): once the bot holds the treasure or has
//   decided to turn back it walks to the up stairs of each floor and out at
//   the top. (`roundTrip` is kept in the policy for old command lines only.)
// - turnBack: HP share under which a round-trip run with no potion and nothing
//   left to heal with turns back (0 = never turn back on its own).

const S = await import('/src/state.js');
const M = await import('/src/movement.js');
const MAPU = await import('/src/rules/map_movement.ts');
const GIMMICKS = await import('/src/rules/traversal_gimmicks.js');
const DATA = await import('/src/data.js');
const PREVIEW = await import('/src/rules/equipment_preview.js');
const LOADOUT = await import('/src/rules/loadout_transaction.js');
const LOADOUT_COMMIT = await import('/src/systems/loadout_transaction.ts');
const EQUIP_ACTIONS = await import('/src/systems/equipment_actions.ts');
const HANDS = await import('/src/rules/equipment_hands.ts');
const REWARDS = await import('/src/pending_rewards.js');
const RECOVERY = await import('/src/systems/exploration_recovery.js');
const FACILITIES = await import('/src/systems/facilities.js');
const FACILITY_DATA = await import('/src/data/facilities.js');
const DUNGEON_RULES = await import('/src/rules/dungeons.js');

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
// Real (unscaled) sleep when the runner accelerates timers.
const sl = ms => new Promise(r => (window.__realSetTimeout || setTimeout)(r, ms));
const st = () => S.state;
const W = window;
const txt = l => typeof l === 'string' ? l : (l.text || l.message || '');
const P = () => st().party[0];
const POLICY_DEFAULTS = { explore: 0.6, maxFloor: null, recovery: 'on', rooms: 'use', cores: 'on', roundTrip: 'on', turnBack: 0.3, dungeon: 'mine' };
// A dungeon is five floors (#2060); a run is named by the running number of its first floor.
const DUNGEON_ENTRY = { mine: 1, catacomb: 6, nest: 11, library: 16 };
const entryFloorOf = dungeon => DUNGEON_ENTRY[dungeon] || Math.max(1, Math.floor(Number(dungeon)) || 1);
const localFloor = floor => ((Math.max(1, Number(floor) || 1) - 1) % 5) + 1;
const atDungeonBottom = () => localFloor(st().floor) === 5;
W.__policy = { ...POLICY_DEFAULTS };
const hasCore = id => W.__policy.cores !== 'off' && Boolean(DATA.getCharCoreParams?.(P(), id));
const guardianDown = () => Boolean(st().currentRun?.defeatedMilestones?.includes(st().floor));
const companionNames = () => FACILITIES.getEscortNames?.(st().currentRun) || '';

// Per-run bookkeeping of the run policy.
const resetPolicyState = () => {
  W.__eliteFlees = {}; W.__fightElite = {}; W.__merchantDone = {}; W.__merchantTries = {}; W.__portalTries = {}; W.__keeperTries = {};
  W.__roomActions = []; W.__purchases = []; W.__bloodUses = 0; W.__riposteGuards = 0;
};
resetPolicyState();

W.__S = S; W.__M = M;
W.__journal = [];
W.__lootLog = [];
W.__equipLog = [];

// ---------- reading ----------
W.__status = () => { const s = st(); const p = P(); return `F${s.floor} (${s.x},${s.y}) gs=${s.gameState} HP${p?.hp}/${p ? DATA.getCharMaxHp(p) : '-'} MP${p?.mp}/${p ? DATA.getCharMaxMp(p) : '-'} Lv${p?.level}`; };
W.__log = (n = 6) => st().logs.slice(-n).map(txt).join(' / ');
W.__btns = () => [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled).map(b => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
W.__screen = (a = 0, b = 60) => document.body.innerText.split('\n').filter(l => l.trim()).slice(a, b).join('\n');
W.__mons = () => st().combatState.monsters.map(m => `${m.name}(hp${m.maxHp} atk${m.atk} def${m.def}${m.traits?.length ? ' ' + m.traits.join('/') : ''})`).join(', ');
const describeItem = it => typeof it === 'string'
  ? it
  : `${it.baseId}[${it.rarity}]${(it.affixes || []).map(a => ` ${a.kind}:${a.id}${a.value !== undefined ? '=' + a.value : ''}`).join('')}${it.curseEffectId ? ' CURSE:' + it.curseEffectId : ''}`;
W.__describeItem = describeItem;

// ---------- clicking ----------
W.__click = async (re) => {
  const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled)
    .find(b => (typeof re === 'string' ? b.textContent.includes(re) : re.test(b.textContent)));
  if (!b) return 'NOBTN: ' + W.__btns().join('|');
  b.click(); await sl(150); return 'ok';
};
const interactiveRank = e => (e.closest('button,[role=button],[tabindex]') ? 0 : 1);
W.__tap = async (t) => {
  const els = [...document.querySelectorAll('button,[role=button],[tabindex],div,li,span')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.textContent.includes(t); })
    // Shortest text first; among equals a control wins over the wrapper around it.
    .sort((a, b) => a.textContent.length - b.textContent.length || interactiveRank(a) - interactiveRank(b));
  const el = els[0]; if (!el) return 'NO ' + t;
  const tgt = el.closest('button,[role=button],[tabindex]') || el; const r = tgt.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  tgt.dispatchEvent(new PointerEvent('pointerdown', o)); tgt.dispatchEvent(new MouseEvent('mousedown', o));
  tgt.dispatchEvent(new PointerEvent('pointerup', o)); tgt.dispatchEvent(new MouseEvent('mouseup', o)); tgt.dispatchEvent(new MouseEvent('click', o));
  await sl(500); return 'ok ' + t;
};

// ---------- movement ----------
W.__bfs = (goal, allowTraps = false, { throughRubble = false, ignoreElites = false } = {}) => {
  const s = st(); const H = s.map.length, Wd = s.map[0].length; const prev = new Map();
  const key = (x, y) => y * Wd + x; const q = [[s.x, s.y]]; prev.set(key(s.x, s.y), null);
  // Keep two cells from roaming elites; the fallback search (allowTraps) still
  // refuses to step onto an elite's own cell.
  const elites = (s.roamingMonsters || []).filter(m => m.floor === s.floor && m.hp !== 0 && !m.defeated);
  const eliteRadius = allowTraps ? 0 : 2;
  const nearElite = (x, y) => !ignoreElites && elites.some(m => Math.abs(m.x - x) + Math.abs(m.y - y) <= eliteRadius);
  const isRubble = cell => cell?.obstacle?.kind === GIMMICKS.TRAVERSAL_GIMMICKS.RUBBLE;
  while (q.length) {
    const [x, y] = q.shift();
    if (!(x === s.x && y === s.y) && goal(x, y)) {
      const path = []; let k = key(x, y);
      while (prev.get(k) !== null) { path.unshift(k); k = prev.get(k); }
      return path.map(k => [k % Wd, Math.floor(k / Wd)]);
    }
    const c = s.map[y][x];
    for (let d = 0; d < 4; d++) {
      if (c.walls[d] && !(c.secretDoor?.[d] && c.secretFound?.[d])) continue;
      if (!c.walls[d] && MAPU.isMapDirectionBlocked(s.map, x, y, d)) continue;
      const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= Wd || ny >= H) continue;
      const t = s.map[ny][nx].trap; if (t && t.state === 'discovered' && !allowTraps && !goal(nx, ny)) continue;
      // Rubble, a closed seal or a collapsed ledge stops the step; every required
      // cell stays reachable around them, so route past instead of digging.
      if (GIMMICKS.isTraversalObstacleBlocking(s.map[ny][nx]) && !(throughRubble && isRubble(s.map[ny][nx]))) continue;
      if (nearElite(nx, ny) && !goal(nx, ny)) continue;
      if (s.map[ny][nx].event === 'boss' && !goal(nx, ny)) continue;
      if (prev.has(key(nx, ny))) continue; prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  return null;
};
const goals = {
  // The guardian's cell is never "exploration": entering it starts the fight,
  // which only the guardian branch (after healing) should do.
  // A trap the adventurer has already noticed is not a place to explore either:
  // it is crossed only when it lies on the way to something else.
  frontier: (x, y) => !st().visitedMap[y][x] && st().map[y][x].event !== 'boss' && st().map[y][x].trap?.state !== 'discovered',
  stairs: (x, y) => st().map[y][x].type === 'stairs-down',
  stairsUp: (x, y) => st().map[y][x].type === 'stairs-up',
  boss: (x, y) => st().map[y][x].event === 'boss',
  // An unused spring or camp (camps rest once per floor per run).
  heal: (x, y) => {
    const e = st().map[y][x].event;
    return e === 'event_spring' || (e === 'event_camp' && !st().currentRun?.campRested?.[st().floor]);
  },
  merchant: (x, y) => st().map[y][x].event === 'event_merchant',
  // A room where someone still waits to be led home.
  keeper: (x, y) => { const room = st().map[y][x].specialRoom; return Boolean(room && !room.used && FACILITY_DATA.KEEPER_ROOM_FACILITY.has(room.kind)); },
  portal: (x, y) => st().map[y][x].event === 'return_portal',
  // Any cell except a roaming elite's own: one step of real movement.
  wander: (x, y) => !(st().roamingMonsters || []).some(m => m.floor === st().floor && m.x === x && m.y === y),
};
// A roaming elite on the only way: pace one step instead of turning in place,
// because some elites only move when the player moves.
const paceOnce = async () => {
  const s = st(); const w = await W.__walk('wander', 1);
  if (w !== 'maxsteps' && w !== 'at wander') { M.handleMove('turn-left'); await sl(20); while (s.transitioning) await sl(20); }
};
// Why a goal has no path: which relaxation would open one (journal only).
const noPathReason = goal => {
  if (W.__bfs(goal, true, { throughRubble: true })) return 'behind rubble';
  if (W.__bfs(goal, true, { ignoreElites: true })) return 'a roaming elite stands on the only way';
  if (W.__bfs(goal, true, { throughRubble: true, ignoreElites: true })) return 'behind rubble and a roaming elite';
  return 'no open way (seal, collapsed ledge, one-way passage or unfound secret door)';
};
// A roaming elite can patrol the only corridor to the stairs or the guardian.
// When waiting did not open the way, walk into it and fight (fleeing would
// leave it standing in the same corridor).
const forcePastElite = async goalName => {
  const s = st();
  if (!W.__bfs(goals[goalName], true, { throughRubble: true, ignoreElites: true })) return null;
  W.__fightElite[s.floor] = true;
  W.__journal.push(`-> ${goalName}: a roaming elite holds the only way, going through it ${W.__status()}`);
  return W.__walk(goalName, 250, null, { throughElites: true });
};
W.__walk = async (goalName = 'frontier', maxSteps = 200, stopWhen = null, { throughElites = false } = {}) => {
  const s = st(); let steps = 0; let pushes = 0;
  while (steps < maxSteps) {
    if (s.gameState !== 'explore') return 'STOP gs=' + s.gameState;
    // Rubble is dug only for a goal the run needs (stairs, guardian), never to explore.
    const digging = goalName !== 'frontier' && goalName !== 'wander';
    const path = W.__bfs(goals[goalName]) || W.__bfs(goals[goalName], true)
      || (digging ? W.__bfs(goals[goalName], true, { throughRubble: true }) : null)
      || (throughElites ? W.__bfs(goals[goalName], true, { throughRubble: true, ignoreElites: true }) : null);
    if (!path) return 'no path';
    const [nx, ny] = path[0]; const d = [0, 1, 2, 3].find(d => s.x + DX[d] === nx && s.y + DY[d] === ny); let g = 0;
    while (s.dir !== d && g++ < 4) { M.handleMove(((d - s.dir + 4) % 4) === 3 ? 'turn-left' : 'turn-right'); while (s.transitioning) await sl(20); await sl(10); }
    const bx = s.x, by = s.y; M.handleMove('forward'); while (s.transitioning) await sl(20); await sl(20); steps++;
    if (s.gameState !== 'explore') return 'STOP gs=' + s.gameState + ' after ' + steps;
    if (s.x === bx && s.y === by) {
      // Rubble takes a second push to start digging and a third to step in.
      if (GIMMICKS.isTraversalObstacleBlocking(s.map[ny][nx]) && pushes++ < 8) { if (pushes === 1) W.__journal.push(`dig rubble F${s.floor} at ${nx},${ny}`); continue; }
      if (pushes > 0 && !GIMMICKS.isTraversalObstacleBlocking(s.map[ny][nx]) && pushes++ < 10) continue;
      return 'blocked at ' + nx + ',' + ny;
    }
    pushes = 0;
    if (stopWhen?.()) return 'done after ' + steps;
    if (goalName !== 'frontier' && goals[goalName](s.x, s.y)) return 'at ' + goalName;
    if (W.__btns().some(t => /持つ|確定|開ける|立ち去る/.test(t))) return 'prompt after ' + steps;
  }
  return 'maxsteps';
};

// ---------- combat ----------
W.__cs = () => { const s = st(); const cs = s.combatState; if (!cs || s.gameState !== 'combat') return 'no combat gs=' + s.gameState; return `R${cs.roundNumber} ` + cs.monsters.map(m => `${m.name}${m.hp}/${m.maxHp}`).join(', ') + ' | ' + W.__status(); };
W.__act = async (...labels) => {
  const s = st(); const n0 = s.logs.length;
  for (const l of labels) { const r = await W.__click(l); if (r !== 'ok') return r; await sl(100); }
  for (let i = 0; i < 300; i++) { await sl(60); if (s.gameState !== 'combat') break; if (s.combatState?.phase === 'choose_actions' && W.__btns().some(t => t.includes('攻撃'))) break; }
  return s.logs.slice(n0).map(txt).join(' / ') + '\n=> ' + W.__cs();
};
W.__useHeal = async () => {
  const s = st(); const inv = s.inventory.filter(i => typeof i === 'string');
  const key = ['HEAL_POTION', 'GREATER_HEAL'].find(k => inv.includes(k)); if (!key) return false;
  const name = key === 'GREATER_HEAL' ? '上薬' : '傷薬';
  if (s.gameState === 'combat') {
    await W.__click('道具'); await sl(200); if (await W.__click(name) !== 'ok') { await W.__click('戻る'); return false; }
    await sl(200); await W.__click('冒険者');
    for (let i = 0; i < 100; i++) { await sl(60); if (s.gameState !== 'combat' || W.__btns().some(t => t.includes('攻撃'))) break; }
    return true;
  }
  await W.__click('バッグ'); await sl(300); if (await W.__click(name) !== 'ok') { await W.__click('戻る'); return false; }
  await sl(200); await W.__click('冒険者 (Lv'); await sl(300); await W.__click('戻る'); await sl(200); return true;
};
const castableSpell = () => {
  const p = P(); if (!p?.mediumState?.mediumKey || !(p.mp > 0)) return null;
  const runes = p.mediumState.socketedRunes || [];
  return runes.includes('RUNE_HALITO') ? 'HALITO' : null;
};
// The spell card shows the spell's label, not its key.
const spellLabel = key => DATA.SPELLS?.[key]?.label || key;
// Build vNext technique button (#1801): use it whenever it is ready and
// free; self techniques (focusMana) only when MP is missing.
const techniqueButton = () => {
  const btn = document.getElementById('btn-combat-technique');
  return btn && !btn.hidden ? btn : null;
};
const techniqueReady = () => {
  const btn = techniqueButton();
  if (!btn || btn.disabled || btn.classList.contains('is-unavailable')) return null;
  // On cooldown the button offers the Blood price (data-reason "HP5消費").
  // The price (12% of max HP) is more than an ordinary fight costs, so it is
  // paid only against a guardian, and only with half the HP left afterwards.
  const blood = /HP(\d+)消費/.exec(btn.getAttribute('data-reason') || '');
  if (blood && !(hasCore('CORE_BLOOD_TECH') && st().combatState?.isBoss
    && P().hp - Number(blood[1]) >= DATA.getCharMaxHp(P()) * 0.5)) return null;
  return btn;
};
const paysBlood = btn => /HP\d+消費/.test(btn.getAttribute('data-reason') || '');
// Riposte: Guard resets the technique and makes the next one hit 1.5x, so
// while the technique is cooling down the bot guards instead of attacking.
// A self technique (focus mana) gains nothing from it.
const riposteGuardDue = () => {
  const btn = techniqueButton();
  return Boolean(hasCore('CORE_GUARD_RIPOSTE') && btn && !/魔力集中/.test(btn.textContent) && !techniqueReady() && !P().riposteReady);
};
const attackTarget = async (alive, preferHigh = false) => {
  const t = [...alive].sort((a, b) => preferHigh ? b.hp - a.hp : a.hp - b.hp)[0];
  if (riposteGuardDue()) { W.__riposteGuards = (W.__riposteGuards || 0) + 1; return W.__act('防御'); }
  const tech = techniqueReady();
  const isSelfTech = tech && /魔力集中/.test(tech.textContent);
  if (tech && (!isSelfTech || P().mp < DATA.getCharMaxMp(P()))) {
    if (paysBlood(tech)) W.__bloodUses = (W.__bloodUses || 0) + 1;
    tech.click(); await sl(150);
    if (isSelfTech) { W.__techUses = (W.__techUses || 0) + 1; return W.__act(); }
    const telegraphing = alive.find(m => ['lahalitoQueued', 'madaltoQueued', 'chargeQueued', 'summonQueued', 'multiActionQueued', 'snipeQueued', 'selfDestructQueued'].some(f => m[f]));
    const target = telegraphing || t;
    W.__techUses = (W.__techUses || 0) + 1;
    if (W.__btns().some(b => b.includes('攻撃対象'))) return W.__act(target.name);
    return W.__act();
  }
  const spell = castableSpell();
  if (spell) {
    await W.__click('呪文'); await sl(150);
    if (await W.__click(spellLabel(spell)) === 'ok') { await sl(150); if (alive.length > 1 || W.__btns().some(b => b.includes('攻撃対象'))) return W.__act(t.name); return W.__act(); }
    await W.__click('戻る');
  }
  if (alive.length > 1) { await W.__click('攻撃'); await sl(150); return W.__act(t.name); }
  return W.__act('攻撃');
};
W.__fight = async () => {
  const s = st(); const hp0 = P().hp; const mons = W.__mons(); let r = 0; let note = '';
  // The mine's rule (#2063): count fights that broke out while loud noise hung on the floor.
  if ((s.noiseEvents || []).some(e => e.floor === s.floor && e.ttl > 0 && e.source !== 'encounter')) { W.__noiseFights = (W.__noiseFights || 0) + 1; note += ' [noise]'; }
  while (s.gameState === 'combat' && r++ < 40) {
    const alive = s.combatState.monsters.filter(m => m.hp > 0 && !m.fled);
    const enemyHp = alive.reduce((a, m) => a + m.hp, 0);
    // A roaming elite is an optional risk: leave at once, like a player would.
    if (s.combatState.isRoamingFlack && !W.__fightElite[s.floor]) {
      if (!note.includes('[flee-elite]')) { W.__eliteFlees[s.floor] = (W.__eliteFlees[s.floor] || 0) + 1; if (goingHome()) W.__returnFlees++; }
      await W.__act('逃走'); note += ' [flee-elite]'; continue;
    }
    if (P().hp <= DATA.getCharMaxHp(P()) * 0.3) {
      if (await W.__useHeal()) { note += ' [heal]'; continue; }
      // A forced elite fight is fought out: fleeing would not open the way.
      if (enemyHp > 12 && !s.combatState.isRoamingFlack) { await W.__act('逃走'); note += ' [flee]'; continue; }
    }
    await attackTarget(alive);
  }
  const line = `F${s.floor} ${mons}: R${r} HP ${hp0}->${P().hp}${note} ${s.gameState}`;
  W.__journal.push(line); return line;
};
W.__bossFight = async () => {
  const s = st(); let r = 0; let lastG = false; const hp0 = P().hp;
  const b0 = s.combatState.monsters.find(x => x.isBoss); const info = `${b0?.name} hp${b0?.maxHp} atk${b0?.atk}`;
  while (s.gameState === 'combat' && r++ < 60) {
    const boss = s.combatState.monsters.find(x => x.isBoss);
    const alive = s.combatState.monsters.filter(x => x.hp > 0 && !x.fled);
    const q = !lastG && boss && boss.hp > 0 && (boss.lahalitoQueued || boss.madaltoQueued || boss.crushStrikeQueued); lastG = q;
    if (P().hp < DATA.getCharMaxHp(P()) * 0.3 && await W.__useHeal()) continue;
    if (q) await W.__act('防御'); else await attackTarget(alive);
  }
  const line = `BOSS ${info}: R${r} HP ${hp0}->${P().hp} ${s.gameState} ${s.gameState !== 'result' ? 'WON' : 'LOST'}`;
  W.__journal.push(line); return line;
};

// ---------- special rooms, merchant, return gate ----------
const materialCount = () => Object.values(st().currentRun?.materials || {}).reduce((a, n) => a + (Number(n) || 0), 0);
// One action for a special room, or null to leave. Labels are the game's own.
// Optional fights, the oath, and options that only reveal the map (which the
// bot already reads) are never taken.
const roomChoice = buttons => {
  const mode = W.__policy.rooms;
  if (mode === 'leave') return null;
  const p = P(); const share = p.hp / DATA.getCharMaxHp(p);
  const safe = buttons.filter(t => !/強敵と戦う|誓約|立ち去る|献灯|写本|発破|鏡を覗く|鏡の回廊|見取り図/.test(t));
  const find = re => safe.find(t => re.test(t));
  const supply = find(/傷薬を受け取る/) || find(/を受け取る/);
  if (supply) return supply;
  const rest = find(/休む/); if (rest && share < 0.8) return rest;
  const grave = safe.find(t => /墓標に祈る/.test(t) && !/何も残っていない/.test(t)); if (grave) return grave;
  // The catacomb's altar can lift one known curse (#2063): worn pieces are
  // listed first, and lifting one keeps the better grade without its price.
  const uncurse = find(/の呪いを解く（素材(\d+)個）/);
  if (uncurse && materialCount() >= Number(/素材(\d+)個/.exec(uncurse)?.[1] || 0)) return uncurse;
  if (p.status && p.status !== 'ok') { const cleanse = find(/浄めを願う/); if (cleanse) return cleanse; }
  const improve = find(/鍛え直す|繕う/);
  if (improve) { const cost = Number(/素材(\d+)個/.exec(improve)?.[1] || 0); if (materialCount() >= cost * 2) return improve; }
  // Digging is loud; where noise brings monsters (the mine's rule, #2063) dig only when healthy.
  const veinShare = (W.__dungeonRule || '').startsWith('音：') ? 0.8 : 0.6;
  if (share >= veinShare) { const vein = find(/鉱脈を掘る/); if (vein) return vein; }
  if (mode === 'rescue') {
    const rescue = find(/助け出す|水を抜く|火を入れる/);
    if (rescue) return rescue;
    const blood = find(/封印を解く|生気を与える/);
    if (blood && share >= 0.7) return blood;
  }
  return null;
};
W.__room = async buttons => {
  const s = st(); const choice = roomChoice(buttons);
  const before = buttons.join('|'); const hp0 = P().hp; const mats0 = materialCount();
  const room = document.getElementById('submenu-title')?.textContent.trim() || '?';
  await W.__click(choice || '立ち去る');
  // A room that opened on a step swallows taps for a moment: wait until the
  // tap has visibly taken effect before recording it.
  for (let w = 0; w < 15 && s.gameState === 'submenu' && W.__btns().join('|') === before; w++) await sl(100);
  if (s.gameState === 'submenu' && W.__btns().join('|') === before) return;
  if (choice) {
    W.__roomActions.push({ floor: s.floor, room, action: choice });
    W.__journal.push(`room F${s.floor} ${room}: ${choice} HP ${hp0}->${P().hp} materials ${mats0}->${materialCount()}${companionNames() ? ` with ${companionNames()}` : ''}`);
  } else {
    // A chest whose "open" is disabled (paralysed) lands here too.
    W.__journal.push(`room F${s.floor} ${room}: left`);
  }
  await sl(200);
};
// Deep merchant: top the potions up to POTION_TARGET while the materials last
// (a potion costs one fang; the rest of the bag is left for loot).
const POTION_TARGET = 6;
const potionCount = () => st().inventory.filter(it => it === 'HEAL_POTION' || it === 'GREATER_HEAL').length;
W.__merchant = async () => {
  const s = st(); let bought = 0; const mats0 = materialCount();
  for (let i = 0; i < 12 && potionCount() < POTION_TARGET; i++) {
    const card = document.querySelector('.milestone-merchant-option[data-stock-id="heal_potion"]');
    if (!card || card.disabled) break;
    const had = potionCount();
    card.click(); await sl(150);
    const confirm = document.getElementById('btn-merchant-confirm');
    if (!confirm || confirm.disabled) continue; // input guard: try again
    confirm.click(); await sl(200);
    if (potionCount() > had) bought++;
  }
  if (bought > 0) W.__purchases.push({ floor: s.floor, item: 'HEAL_POTION', count: bought });
  // The merchant's cell can lie on the way: record the first visit and any purchase.
  if (bought > 0 || !W.__merchantDone[s.floor]) W.__journal.push(`merchant F${s.floor}: bought ${bought} potion(s), holding ${potionCount()}, materials ${mats0}->${materialCount()}`);
  W.__merchantDone[s.floor] = true;
  await W.__click('戻る'); for (let w = 0; w < 20 && s.gameState === 'submenu'; w++) await sl(100);
};
// Return gate: the way home from the bottom of a dungeon (#2060).
W.__portal = async buttons => {
  const s = st(); const floor = s.floor;
  if (atDungeonBottom() || (W.__policy.rooms === 'rescue' && companionNames())) {
    if (buttons.some(t => t.includes('素材と持ち込み品を持って帰還'))) { await W.__click('素材と持ち込み品を持って帰還'); await sl(300); }
    if (await W.__click('ここで帰還する') === 'ok') {
      for (let w = 0; w < 40 && s.gameState !== 'result'; w++) await sl(100);
      if (s.gameState === 'result') W.__journal.push(`portal F${floor}: returned${companionNames() ? ` with ${companionNames()}` : ''}`);
    }
    return;
  }
  await W.__click('戻る'); for (let w = 0; w < 20 && s.gameState === 'submenu'; w++) await sl(100);
};

// ---------- loot & equipment policy ----------
W.__chest = async () => {
  if (['paralyzed', 'paralyze', 'sleep'].includes(P().status)) { await W.__click('立ち去る'); await sl(200); W.__journal.push('chest skipped: incapacitated'); return; }
  // The chest menu offers open, an optional kit open, and leave; opening
  // disarms automatically, so the driver always opens.
  if (W.__btns().includes('開ける')) { await W.__click(/^開ける$/); await sl(1000); }
};
// Build seed choice: keep the option the gear score likes best.
W.__take = async () => {
  const bundle = st().currentRun?.pendingRewardBundle;
  if (bundle?.choiceRole) {
    const choices = bundle.entries.filter(e => e.role === bundle.choiceRole);
    const scored = choices.map(e => ({ e, score: scoreEquip(P(), e.item) ?? 0 }));
    const best = W.__equipPolicy === 'none' ? null : scored.sort((a, b) => b.score - a.score)[0];
    choices.forEach(e => { e.decision = e === best?.e ? 'take' : 'leave'; e.loadoutAction = null; });
    W.__seedChoice = { offered: choices.map(e => describeItem(e.item)), taken: best ? describeItem(best.e.item) : null };
    W.__journal.push(`SEED F${st().floor}: ${W.__seedChoice.offered.join(' | ')} -> ${W.__seedChoice.taken}`);
  }
  // When the rewards overflow the bag the game leaves every entry undecided and
  // the confirm button stays disabled: take the best ones that fit, leave the rest.
  const undecided = (bundle?.entries || []).filter(e => !['take', 'leave'].includes(e.decision));
  if (undecided.length) {
    const inv = st().inventory;
    const hasPortal = inv.some(it => DATA.getItemData?.(it)?.id === 'TOWN_PORTAL');
    bundle.discardIndexes ||= [];
    let free = BAG_LIMIT - inv.length + bundle.discardIndexes.length - bundle.entries.filter(e => e.decision === 'take').length;
    // Make room like a player would: leave identified gear that is no upgrade
    // (known curses first) before leaving any new reward behind.
    const junk = inv.map((it, i) => ({ i, score: scoreEquip(P(), it) ?? -Infinity }))
      .filter(({ i }) => !bundle.discardIndexes.includes(i) && EQUIP_TYPES.includes(itemType(inv[i])) && !isHidden(inv[i]))
      .filter(j => j.score < 0.5)
      .sort((a, b) => a.score - b.score);
    const dropped = junk.slice(0, Math.max(0, undecided.length - free));
    dropped.forEach(j => { bundle.discardIndexes.push(j.i); free++; });
    const value = e => (EQUIP_TYPES.includes(itemType(e.item)) && !isHidden(e.item) ? scoreEquip(P(), e.item) ?? 0 : 0);
    undecided.sort((a, b) => value(b) - value(a)).forEach(e => {
      e.loadoutAction = null;
      e.decision = free > 0 && !(hasPortal && DATA.getItemData?.(e.item)?.id === 'TOWN_PORTAL') ? 'take' : 'leave';
      if (e.decision === 'take') free--;
    });
    W.__journal.push(`BAG FULL F${st().floor}: took ${undecided.filter(e => e.decision === 'take').length}/${undecided.length}, dropped ${dropped.map(j => describeItem(inv[j.i])).join(', ') || 'nothing'}`);
  }
  REWARDS.openPendingRewardMenu(); await sl(200);
  await W.__click('この内容で確定する'); await sl(400);
};

const EQUIP_TYPES = ['weapon', 'armor', 'shield', 'accessory'];
const BAG_LIMIT = 20; // pending_rewards.js BAG_LIMIT (not exported)
const itemType = it => DATA.getItemData?.(it)?.type ?? null;
const isHidden = it => typeof it === 'object' && it && it.identified === false;
// Score from the game's own equipment preview rows. Combat stats dominate;
// HP counts at a lower rate; Cores (rule-changing effects) get a flat bonus and
// known curses a penalty. The weights are a crude stand-in for a player, not a
// balance claim.
// The weights follow how the adventurer fights: with a spell medium (wand,
// staff) in hand the magic stats count, otherwise the attack does.
const FIGHTER_WEIGHTS = { attack: 2, defense: 2, maxHp: 0.3, maxMp: 0, magic: 0, speed: 0.5, firstStrike: 0.3 };
const CASTER_WEIGHTS = { attack: 0.5, defense: 2, maxHp: 0.3, maxMp: 1, magic: 2, speed: 0.5, firstStrike: 0.3 };
const isMedium = it => DATA.getItemData?.(it)?.behaviorProfile === 'medium';
const isCaster = char => isMedium(char?.equipment?.weapon);
const weighRows = (rows, char) => {
  const weights = isCaster(char) ? CASTER_WEIGHTS : FIGHTER_WEIGHTS;
  return rows.reduce((a, r) => a + (typeof r.diff === 'number' ? r.diff * (weights[r.key] || 0) : 0), 0);
};
// A fighter does not trade the sword for a wand, nor a caster the wand for a
// sword: the swap changes what the adventurer can do, which the numbers miss.
const CURSE_LOCK_PENALTY = 4;
const changesFightingStyle = (char, it) => itemType(it) === 'weapon' && Boolean(char?.equipment?.weapon) && isMedium(it) !== isCaster(char);
const scoreEquip = (char, it) => {
  // A shield cannot go on next to a two-handed weapon (the loadout refuses it),
  // so it is no upgrade until the weapon changes.
  if (itemType(it) === 'shield' && HANDS.getEquipmentHands(char.equipment?.weapon) === 2) return null;
  // A known curse locks the slot, so it goes on only when clearly better: its
  // stats (the preview counts the curse's good and bad part) must beat the
  // slot by a margin that stands for being stuck with it (#2063).
  const knownCurse = Boolean(it && typeof it === 'object' && it.identified && it.curseEffectId);
  if (changesFightingStyle(char, it)) return null;
  const preview = PREVIEW.getEquipmentPreview(char, it, null, { floor: st().floor });
  if (!preview) return null;
  let score = weighRows(preview.rows, char);
  // Equipping a two-handed weapon also takes the shield off; the preview does not.
  if (preview.slot === 'weapon' && HANDS.getEquipmentHands(it) === 2 && char.equipment?.shield) {
    const off = PREVIEW.getUnequipPreview(char, 'shield', { floor: st().floor });
    if (off) score += weighRows(off.rows, char);
  }
  const extras = item => {
    if (!item || typeof item !== 'object') return 0;
    let v = 0;
    if ((item.affixes || []).some(a => a.kind === 'core')) v += 3;
    return v;
  };
  // Relative to what the slot holds now, so two Core items do not flip-flop.
  const current = preview.slot ? char.equipment?.[preview.slot] : null;
  score += extras(it) - extras(current);
  if (knownCurse) score -= CURSE_LOCK_PENALTY;
  return Math.round(score * 10) / 10;
};
// Policies: 'none' (never touch gear), 'greedy' (identify with powder when
// available, equip identified upgrades, socket runes; unidentified items are
// tried on and kept only if the visible ATK/DEF did not drop).
W.__equipPolicy = 'greedy';
W.__manageGear = async () => {
  if (W.__equipPolicy === 'none' || st().gameState !== 'explore') return;
  const s = st();
  // 1) identify
  for (let i = 0; i < s.inventory.length; i++) {
    const it = s.inventory[i];
    if (!isHidden(it) || !EQUIP_TYPES.includes(itemType(it))) continue;
    if ((s.identifyTickets || 0) < 1) break;
    const r = EQUIP_ACTIONS.identifyEquipmentAt({ inventoryIndex: i, actorIdx: 0 });
    if (r?.ok) W.__equipLog.push(`F${s.floor} identify ${describeItem(s.inventory[i])}`);
  }
  // 2) equip the best identified upgrade per slot, one commit per change
  for (let guard = 0; guard < 6; guard++) {
    const char = P(); const draft = LOADOUT.createLoadoutDraft(st()); let best = null;
    st().inventory.forEach((it, i) => {
      if (isHidden(it) || !EQUIP_TYPES.includes(itemType(it))) return;
      const score = scoreEquip(char, it);
      if (score === null || score < 0.5 || (best && score <= best.score)) return;
      // Skip what the loadout would refuse (curse lock, hands) instead of
      // retrying the same refused item every turn.
      if (!LOADOUT.getLoadoutEquipAvailability(draft, { actorIdx: 0, item: it }).ok) return;
      best = { i, score, it };
    });
    if (!best) break;
    const staged = LOADOUT.stageEquip(draft, { actorIdx: 0, inventoryIndex: best.i });
    if (!staged?.ok) { W.__equipLog.push(`F${st().floor} cannot equip ${describeItem(best.it)}: ${staged?.reason}`); break; }
    const res = LOADOUT_COMMIT.commitLoadoutDraft(staged.draft, { turnCost: 1, worldAction: 'explore' });
    if (!res?.ok || res.changed === false) { W.__equipLog.push(`F${st().floor} equip failed ${describeItem(best.it)} ${res?.reason || ''}`); break; }
    W.__equipLog.push(`F${st().floor} equip ${describeItem(best.it)} (+${best.score})`);
  }
  // 3) try one unidentified piece (costs a turn), keep only if ATK/DEF held up
  const idx = st().inventory.findIndex(it => isHidden(it) && ['weapon', 'armor', 'shield'].includes(itemType(it)) && !it.trialCount && !it.__skipTrial
    && !changesFightingStyle(P(), it));
  if (idx >= 0) {
    const before = DATA.getCharWeaponAtk(P()) + DATA.getCharDef(P());
    const item = st().inventory[idx];
    const draft = LOADOUT.createLoadoutDraft(st());
    const staged = LOADOUT.stageTrialEquip(draft, { actorIdx: 0, inventoryIndex: idx });
    const res = staged?.ok ? LOADOUT_COMMIT.commitLoadoutDraft(staged.draft, { turnCost: 1, worldAction: 'explore' }) : staged;
    if (!res?.ok) { item.trialCount = item.trialCount || 0; W.__equipLog.push(`F${st().floor} cannot try ${describeItem(item)}: ${res?.reason}`); item.__skipTrial = true; }
    if (res?.ok && res.changed !== false) {
      const after = DATA.getCharWeaponAtk(P()) + DATA.getCharDef(P());
      W.__equipLog.push(`F${st().floor} try ${describeItem(item)} ATK+DEF ${before}->${after}`);
      if (after < before) {
        // revert: re-equip whatever gives the best primary stat for that slot
        const slotType = itemType(item); const char = P(); let best = null;
        st().inventory.forEach((it, i) => { if (itemType(it) !== slotType || isHidden(it)) return; const sc = scoreEquip(char, it); if (sc !== null && (!best || sc > best.sc)) best = { i, sc }; });
        if (best) { const d2 = LOADOUT.createLoadoutDraft(st()); const s2 = LOADOUT.stageEquip(d2, { actorIdx: 0, inventoryIndex: best.i }); const r2 = s2?.ok ? LOADOUT_COMMIT.commitLoadoutDraft(s2.draft, { turnCost: 1, worldAction: 'explore' }) : s2; W.__equipLog.push(`F${st().floor} revert ${r2?.ok ? 'ok' : 'failed: ' + r2?.reason}`); }
      }
    }
  }
  // 4) socket spare runes into a free medium slot
  const p = P(); const medium = p.mediumState?.mediumKey;
  if (medium) {
    const runeIdx = st().inventory.findIndex(it => typeof it === 'string' && /^RUNE_/.test(it));
    if (runeIdx >= 0) {
      const draft = LOADOUT.createLoadoutDraft(st()); const staged = LOADOUT.stageSocketRune(draft, { actorIdx: 0, inventoryIndex: runeIdx });
      const rune = st().inventory[runeIdx]; const res = staged?.ok ? LOADOUT_COMMIT.commitLoadoutDraft(staged.draft, { turnCost: 1, worldAction: 'explore' }) : staged;
      W.__equipLog.push(`F${st().floor} socket ${rune}: ${res?.ok ? 'ok' : res?.reason}`);
    }
  }
};

// Every object that enters the bag (chest, drop, event) is logged once.
const seenLoot = new Set();
const trackInventory = () => {
  const s = st();
  for (const it of s.inventory) {
    const key = typeof it === 'object' ? it.instanceId : null;
    if (key && !seenLoot.has(key)) {
      seenLoot.add(key);
      W.__lootLog.push({ floor: s.floor, item: describeItem(it), core: (it.affixes || []).some(a => a.kind === 'core') });
    }
  }
  const runes = s.inventory.filter(it => typeof it === 'string' && /^RUNE_/.test(it)).length;
  if (runes > (W.__runeCount || 0)) W.__lootLog.push({ floor: s.floor, item: `rune x${runes - (W.__runeCount || 0)}`, core: false });
  W.__runeCount = runes;
  const p = P();
  if (p && p.hp > 0) W.__lastEquipment = Object.fromEntries(Object.entries(p.equipment || {}).map(([k, v]) => [k, v ? describeItem(v) : null]));
};

// ---------- round trip (#2066) ----------
const roundTrip = () => st().currentRun?.roundTrip || null;
// The run is on its way out: it holds the treasure, the dungeon is awake, or the bot decided to turn back.
const goingHome = () => { const rt = roundTrip(); return Boolean(rt && (rt.treasure || rt.awake || W.__turnBack)); };
const countSteps = () => {
  const run = st().currentRun; if (!run || run.returnReason) return;
  const steps = Number(run.steps) || 0; const key = `${goingHome() ? 'up' : 'down'}:${st().floor}`;
  W.__stepsBy[key] = (W.__stepsBy[key] || 0) + Math.max(0, steps - W.__lastSteps); W.__lastSteps = steps;
  const hunter = (st().roamingMonsters || []).find(m => m.hunter && m.floor === st().floor);
  if (hunter) { const d = Math.abs(hunter.x - st().x) + Math.abs(hunter.y - st().y); const f = st().floor; W.__hunterMin[f] = Math.min(W.__hunterMin[f] ?? 99, d); }
};
const turnBackNow = why => {
  if (W.__turnBack || !roundTrip()) return false;
  W.__turnBack = true; W.__turnBackAt = st().floor;
  W.__journal.push(`<<< turn back on F${st().floor}: ${why} ${W.__status()}`);
  return true;
};

// ---------- run loop ----------
// Walking unvisited cells gives HP back up to a per-floor allowance (#1993).
const walkingStillHeals = () => {
  const outlook = RECOVERY.getExplorationRecoveryOutlook(st());
  return Boolean(outlook && !outlook.suspended && outlook.hp > 0 && W.__bfs(goals.frontier));
};
// Hurt, and this floor still pays HP for walking unvisited cells. Under 30% HP
// the fight policy can only flee (and fleeing costs HP), so walking on is left
// to the 'always' policy.
const worthWalking = (policy, p = P()) => {
  if (policy.recovery === 'off') return false;
  const maxHp = DATA.getCharMaxHp(p);
  if (p.hp >= maxHp * policy.explore || (policy.recovery !== 'always' && p.hp < maxHp * 0.3)) return false;
  return walkingStillHeals();
};
// When to stop exploring a floor and take the stairs.
const stopExploring = (policy, p) => {
  if (policy.explore === 0) return true;
  // Two escapes from a roaming elite on one floor: it is hunting, so leave.
  if ((W.__eliteFlees[st().floor] || 0) >= 2) return true;
  // Hurt: stay only while walking gives HP back (descending does not heal).
  if (p.hp < DATA.getCharMaxHp(p) * policy.explore) return !worthWalking(policy, p);
  // Healthy: keep exploring, except on a cleared milestone floor.
  return guardianDown();
};
// What is left to do on a cleared milestone floor before leaving it.
const postGuardianErrand = () => {
  const s = st(); if (!guardianDown()) return null;
  if (!W.__merchantDone[s.floor] && (W.__merchantTries[s.floor] || 0) < 2 && potionCount() < POTION_TARGET
    && (s.currentRun?.materials?.['獣の牙'] || 0) > 0 && W.__bfs(goals.merchant)) return 'merchant';
  if (W.__policy.rooms === 'rescue' && companionNames() && (W.__portalTries[s.floor] || 0) < 2 && W.__bfs(goals.portal)) return 'portal';
  // A run saved before #2062 (no round trip) still leaves by the gate.
  if (atDungeonBottom() && !roundTrip() && (W.__portalTries[s.floor] || 0) < 8 && W.__bfs(goals.portal)) return 'portal';
  return null;
};
W.__auto = async (policy = W.__policy, maxIter = 600) => {
  const s = st();
  for (let i = 0; i < maxIter; i++) {
    trackInventory(); countSteps();
    const b = W.__btns(); const p = P();
    if (s.gameState === 'result' || p.hp <= 0) return p.hp > 0 ? 'returned' : 'dead';
    if (s.gameState === 'combat') { if (s.combatState?.isBoss) await W.__bossFight(); else await W.__fight(); continue; }
    if (s.gameState === 'trap_encounter') {
      await W.__click(b.includes('解除する') ? '解除する' : b.includes('縁を伝う') ? '縁を伝う' : b.find(t => !/ON|⛶/.test(t) && t));
      await sl(700); W.__journal.push('trap F' + s.floor + ': ' + W.__log(1)); continue;
    }
    if (b.includes('開ける') && b.includes('立ち去る')) { await W.__chest(); continue; }
    if (REWARDS.hasPendingRewardBundle(s)) {
      await W.__take();
      if (REWARDS.hasPendingRewardBundle(s)) { W.__journal.push('!! stuck reward ' + b.join('|')); return 'stuck'; }
      continue;
    }
    if (b.some(t => t.includes('泉の水を飲む'))) { await W.__click('泉の水を飲む'); await sl(600); W.__journal.push('spring F' + s.floor + ': ' + W.__log(1)); continue; }
    if (b.some(t => t.includes('探索に戻る'))) { await W.__click('探索に戻る'); await sl(200); continue; }
    if (b.some(t => t === '休息する')) { await W.__click('休息する'); await sl(400); W.__journal.push('camp F' + s.floor + ': ' + W.__log(1)); continue; }
    if (b.some(t => t.includes('休息せず進む'))) { await W.__click('休息せず進む'); await sl(300); continue; }
    // Round trip: the up-stairs menu. Climb (or walk out) when going home, otherwise stay.
    const upButton = document.querySelector('[data-stairs-up]');
    if (s.gameState === 'submenu' && upButton && upButton.offsetParent) {
      if (goingHome()) {
        const f0 = s.floor; const kind = upButton.dataset.stairsUp;
        upButton.click();
        for (let w = 0; w < 60 && s.gameState !== 'result' && (s.floor === f0 || s.transitioning); w++) await sl(80);
        await sl(200);
        if (s.floor !== f0 && s.gameState !== 'result') W.__journal.push(`<<< F${s.floor} ${W.__status()}`);
        if (kind === 'surface' && s.gameState === 'result') W.__journal.push(`surface: walked out${roundTrip()?.treasure ? ' with the treasure' : ''}`);
      } else { await W.__click('とどまる'); await sl(200); }
      continue;
    }
    if (b.some(t => t.includes('降りずに進む')) && !b.some(t => t.includes('へ降りる'))) {
      // milestone floor with an undefeated guardian: commit to fighting it
      // (the explore step below walks there, resuming after interruptions)
      await W.__click('降りずに進む'); for (let w = 0; w < 30 && s.gameState !== 'explore'; w++) await sl(80);
      W.__guardianFloor = s.floor;
      continue;
    }
    if (b.some(t => t.includes('へ降りる'))) {
      if (policy.maxFloor && s.floor >= policy.maxFloor) return 'maxFloor';
      if (!postGuardianErrand() && (stopExploring(policy, p) || W.__bfs(goals.frontier) === null)) {
        const f0 = s.floor; await W.__click('へ降りる'); for (let w = 0; w < 60 && s.floor === f0; w++) await sl(80); await sl(200);
        if (s.floor !== f0) W.__journal.push(`>>> F${s.floor} ${W.__status()}`);
        continue;
      }
      await W.__click('降りずに進む'); await sl(200); continue;
    }
    if (s.gameState === 'submenu' && document.querySelector('.milestone-merchant-option')) { await W.__merchant(); continue; }
    if (s.gameState === 'submenu' && b.some(t => t.includes('素材と持ち込み品を持って帰還') || t.includes('ここで帰還する'))) { await W.__portal(b); continue; }
    if (s.gameState === 'submenu' && b.some(t => t === '戻る')) {
      await W.__click('戻る'); for (let w = 0; w < 20 && s.gameState === 'submenu'; w++) await sl(100);
      // A menu can reopen another (merchant after a guardian): retry a few times.
      if (s.gameState !== 'submenu' || (W.__backTries = (W.__backTries || 0) + 1) <= 5) continue;
      W.__journal.push('!! submenu back x' + W.__backTries + ' ' + W.__log(3));
    }
    // Special rooms (biome rooms, keepers, rebuilt facilities): the room policy decides.
    if (s.gameState === 'submenu' && b.includes('立ち去る') && !b.includes('開ける')) { await W.__room(b); continue; }
    if (s.gameState === 'equip_overlay') { await W.__click('キャンセル'); await W.__click('閉じる'); await sl(200); continue; }
    if (s.gameState !== 'explore') { W.__journal.push('!! stuck gs=' + s.gameState + ' ' + b.join('|')); return 'stuck'; }
    W.__backTries = 0;
    await W.__manageGear();
    if (W.__guardianFloor === s.floor && !s.currentRun?.defeatedMilestones?.includes(s.floor)) {
      const maxHp = DATA.getCharMaxHp(P());
      // Walking unvisited cells is the free heal: spend it before potions.
      if (worthWalking(policy)) {
        const h = await W.__walk('frontier', 150, () => !worthWalking(policy));
        W.__journal.push(`-> walk to recover before guardian: ${h} ${W.__status()}`);
        if (!h.startsWith('blocked') && h !== 'no path') continue;
      }
      while (P().hp < maxHp * 0.6 && await W.__useHeal()) await sl(100);
      // Out of potions and badly hurt: try an unused spring or camp, at most
      // twice per floor. Detours cost HP on the way (and springs heal only 40%
      // of the time), so a looser rule burned runs out before the guardian.
      const detours = W.__healDetours[s.floor] || 0;
      if (P().hp < maxHp * 0.35 && detours < 2 && W.__bfs(goals.heal)) {
        W.__healDetours[s.floor] = detours + 1;
        const h = await W.__walk('heal', 250); W.__journal.push(`-> heal before guardian: ${h} ${W.__status()}`);
        continue;
      }
      if (roundTrip() && P().hp < maxHp * W.__policy.turnBack && potionCount() === 0 && turnBackNow('too hurt for the guardian')) continue;
      if (W.__turnBack) { W.__guardianFloor = null; continue; }
      let r = await W.__walk('boss', 250);
      for (let w = 0; r === 'no path' && w < 40 && s.gameState === 'explore'; w++) { await paceOnce(); r = await W.__walk('boss', 250); }
      W.__journal.push(`-> guardian: ${r} ${W.__status()}`);
      if (r === 'no path') {
        const reason = noPathReason(goals.boss);
        const forced = await forcePastElite('boss');
        if (forced === null || forced === 'no path') { W.__journal.push(`!! guardian unreachable: ${reason}`); return 'stuck'; }
      }
      continue;
    }
    // The milestone floor is done: stock up at the merchant once, then leave
    // (through the gate with a rescued keeper, otherwise down the stairs).
    const errand = postGuardianErrand();
    if (errand === 'merchant') {
      W.__merchantTries[s.floor] = (W.__merchantTries[s.floor] || 0) + 1;
      const m = await W.__walk('merchant', 250); W.__journal.push(`-> merchant: ${m} ${W.__status()}`);
      continue;
    }
    if (roundTrip() && goingHome()) {
      if (goals.stairsUp(s.x, s.y)) await paceOnce();
      let h = await W.__walk('stairsUp', 250);
      if (h === 'no path') { for (let w = 0; h === 'no path' && w < 20 && s.gameState === 'explore'; w++) { await paceOnce(); h = await W.__walk('stairsUp', 250); } }
      if (h === 'no path') { const forced = await forcePastElite('stairsUp'); if (forced === null || forced === 'no path') { W.__journal.push('!! no way up: ' + noPathReason(goals.stairsUp)); return 'stuck'; } }
      if (h === 'at stairsUp' && s.gameState === 'explore') { M.handleMove('turn-left'); await sl(100); M.handleMove('turn-right'); await sl(200); if (s.gameState === 'explore') { await paceOnce(); } }
      continue;
    }
    if (errand === 'portal') {
      W.__portalTries[s.floor] = (W.__portalTries[s.floor] || 0) + 1;
      const g = await W.__walk('portal', 250); W.__journal.push(`-> return gate: ${g} ${W.__status()}`);
      continue;
    }
    if (p.hp < DATA.getCharMaxHp(p) * 0.4 && await W.__useHeal()) continue;
    // Rescue policy: someone waits on this floor, so go there before anything else.
    if (W.__policy.rooms === 'rescue' && (W.__keeperTries[s.floor] || 0) < 8 && (goals.keeper(s.x, s.y) || W.__bfs(goals.keeper))) {
      W.__keeperTries[s.floor] = (W.__keeperTries[s.floor] || 0) + 1;
      // An interrupted rescue leaves the bot standing in the room: step out and back in.
      if (goals.keeper(s.x, s.y)) await paceOnce();
      const k = await W.__walk('keeper', 250); W.__journal.push(`-> keeper room: ${k} ${W.__status()}`);
      continue;
    }
    // Rescue policy: a keeper only counts when walked out, so turn back with them.
    if (W.__policy.rooms === 'rescue' && roundTrip() && !goingHome() && companionNames()
      && turnBackNow('a keeper follows')) continue;
    if (roundTrip() && !goingHome() && p.hp < DATA.getCharMaxHp(p) * W.__policy.turnBack && potionCount() === 0 && !worthWalking(policy, p)
      && turnBackNow('badly hurt, nothing left to heal with')) continue;
    const wantStairs = stopExploring(policy, p);
    let r = await W.__walk(wantStairs && W.__bfs(goals.stairs) ? 'stairs' : 'frontier', 150);
    if (r === 'no path') r = await W.__walk('stairs', 150);
    if (r === 'at stairs') { M.handleMove('turn-left'); await sl(100); M.handleMove('turn-right'); await sl(200); }
    if (r === 'no path' && (W.__waitTurns = (W.__waitTurns || 0) + 1) <= 40) {
      await paceOnce();
      continue;
    }
    if (r === 'no path') {
      const reason = noPathReason(goals.stairs);
      const forced = await forcePastElite('stairs');
      if (forced !== null && forced !== 'no path') continue;
      W.__journal.push(`!! no path: ${reason}`); return 'stuck';
    }
    if (r === 'maxsteps' || r.startsWith('blocked')) { W.__journal.push(`!! ${r}`); return 'stuck'; }
    W.__waitTurns = 0;
  }
  return 'maxIter';
};

// ---------- run start (seedable) ----------
const KIT_NAMES = { vanguard: '鋼の前線キット', scout: '軽装探索キット', devotion: '祈りの旅装キット', arcana: '術式の旅装キット' };
// There is a single run rule set (#1815); there is no mode picker.
W.__startRun = async ({ kit = 'vanguard', seed = null, roundTrip = false, dungeon = 'mine' } = {}) => {
  if (W.__btns().some(t => t.includes('街へ戻る'))) { await W.__click('街へ戻る'); await sl(1000); }
  // Measurement shortcut: a later dungeon is opened directly instead of being
  // earned, so it can be measured with a fresh adventurer from a new save.
  const entry = entryFloorOf(dungeon);
  if (entry > 1) st().unlockedMilestones = [...new Set([...(st().unlockedMilestones || []), entry - 1])].sort((a, b) => a - b);
  for (let t = 0; t < 4 && !document.querySelector('button.solo-start-floor-option'); t++) {
    await W.__tap('準備を整える'); await sl(300); await W.__tap(KIT_NAMES[kit] || kit); await sl(300); await W.__tap('このキットで準備へ'); await sl(500);
  }
  if (!document.querySelector('button.solo-start-floor-option')) return { ok: false, reason: 'no start floor options; gs=' + st().gameState };
  const fb = document.querySelector(`button.solo-start-floor-option[data-start-floor="${entry}"]`); if (!fb) return { ok: false, reason: `dungeon ${dungeon} is not open` };
  fb.click(); await sl(300);
  if (roundTrip) { const rule = document.querySelector('.solo-start-rule-option'); if (rule && rule.getAttribute('aria-pressed') !== 'true') { rule.click(); await sl(300); } }
  // Fix the map seed: runSeed = `${state.seed}:run:${Date.now()}` at entry.
  const realNow = Date.now;
  // The likely Core families (#2061) follow the save seed: drop the draw made
  // with the page's random seed so the run takes the one for this seed.
  if (seed !== null) { st().seed = `PT-${seed}`; st().coreFamilies = null; Date.now = () => 1700000000000; }
  try { await W.__click('迷宮へ向かう'); for (let i = 0; i < 40 && st().gameState !== 'explore'; i++) await sl(100); }
  finally { Date.now = realNow; }
  W.__journal = []; W.__lootLog = []; W.__equipLog = []; W.__runeCount = 0; W.__lastEquipment = null; W.__techUses = 0; W.__seedChoice = null; W.__guardianFloor = null; W.__healDetours = {}; seenLoot.clear();
  resetPolicyState();
  W.__turnBack = false; W.__hunterMin = {}; W.__stepsBy = {}; W.__lastSteps = 0; W.__returnFlees = 0; W.__turnBackAt = null; W.__noiseFights = 0;
  W.__dungeonRule = DUNGEON_RULES.getDungeonRule(st().floor)?.line || '';
  trackHpLedger();
  const run = st().currentRun;
  // Fingerprint of the first floor's layout so before/after runs can prove they share maps.
  let h = 2166136261; for (const row of st().map) for (const c of row) for (const w of c.walls) { h ^= w ? 1 : 0; h = Math.imul(h, 16777619) >>> 0; }
  return { ok: st().floor === entry, entry, runSeed: run?.runSeed, mapFingerprint: h.toString(16), maxHp: DATA.getCharMaxHp(P()), mp: P().mp, maxMp: DATA.getCharMaxMp(P()) };
};

// Where HP went, by floor and leg (`down:3`, `up:3`) and by source: combat
// (losses and heals inside a fight), poison, trap (trap prompts), event
// (rooms, springs, chests), step (anything else while walking, e.g. a hidden
// floor trap) and heal (walking recovery, potions and rests outside combat).
function trackHpLedger() {
  W.__hpLedger = {};
  clearInterval(W.__hpLedgerTimer);
  let lastHp = P()?.hp; let sawCombat = false;
  const ledgerKey = () => `${goingHome() ? 'up' : 'down'}:${localFloor(st().floor)}`;
  // Changes outside combat are named from the log lines the game writes
  // with them, read on the next tick.
  const pending = [];
  const nameFromLog = ({ delta, state }) => {
    const text = (st().logs || []).slice(-4).map(txt).join(' ');
    if (delta > 0) return /傷薬|上薬|薬/.test(text) ? 'potion' : /休|野営|眠/.test(text) ? 'rest' : /泉/.test(text) ? 'spring' : 'walkHeal';
    if (/毒のダメージ/.test(text)) return 'poison';
    if (/宝箱|針|爆|閃光/.test(text) && state !== 'explore') return 'chestTrap';
    if (/泉|水/.test(text)) return 'spring';
    if (state === 'trap_encounter' || /罠|落とし穴|足場/.test(text)) return 'floorTrap';
    if (state === 'explore') return 'step';
    return 'room';
  };
  const record = (delta, source, key = ledgerKey()) => {
    if (!delta) return;
    const row = W.__hpLedger[key] ||= {};
    row[source] = (row[source] || 0) + delta;
  };
  // Combat works on a copy of the character and swaps it back in, so a
  // change seen only when the object is swapped belongs to that fight; other
  // changes are caught by a setter on whichever object is current.
  const install = () => {
    while (pending.length) { const change = pending.shift(); record(change.delta, nameFromLog(change), change.key); }
    const s = st(); const p = P();
    if (s.gameState === 'combat') sawCombat = true;
    if (!p || Object.getOwnPropertyDescriptor(p, 'hp')?.set) return;
    record(p.hp - lastHp, sawCombat || s.gameState === 'combat' ? 'combat' : 'swap');
    sawCombat = false;
    let hp = p.hp; lastHp = hp;
    Object.defineProperty(p, 'hp', {
      configurable: true, enumerable: true,
      get: () => hp,
      set: next => {
        const delta = next - hp; hp = next;
        if (P() !== p) return;
        lastHp = hp;
        const state = st().gameState;
        if (state === 'combat') record(delta, 'combat');
        else pending.push({ delta, state, key: ledgerKey() });
      }
    });
  };
  install();
  W.__hpLedgerTimer = setInterval(install, 20);
}

// One complete run; returns a plain JSON summary.
W.__playRun = async ({ kit = 'vanguard', seed = null, equip = 'greedy', ...policyOptions } = {}) => {
  W.__equipPolicy = equip;
  // Unset options keep their defaults (the runner passes null for "not given").
  W.__policy = { ...POLICY_DEFAULTS, ...Object.fromEntries(Object.entries(policyOptions).filter(([, v]) => v !== null && v !== undefined)) };
  const { explore, maxFloor } = W.__policy;
  const start = await W.__startRun({ kit, seed, roundTrip: W.__policy.roundTrip === 'on', dungeon: W.__policy.dungeon });
  if (!start.ok) return { start, error: 'start failed' };
  let end = '';
  for (let i = 0; i < 8 && st().gameState !== 'result'; i++) { end = await W.__auto(W.__policy); if (end !== 'maxIter') break; }
  const s = st(); const d = s.deathLogs?.at(-1);
  return {
    seed, kit, explore, equip, policy: { ...W.__policy }, start, end,
    deepest: s.currentRun?.deepestFloor ?? s.floor,
    // The floor inside the dungeon (1-5), and whether the run beat the guardian and came home.
    depth: localFloor(s.currentRun?.deepestFloor ?? s.floor),
    cleared: s.gameState === 'result' && (P()?.hp ?? 0) > 0 && (s.currentRun?.defeatedMilestones || []).some(f => localFloor(f) === 5),
    guardian: W.__journal.filter(j => j.startsWith('BOSS')),
    level: P()?.level, died: s.gameState === 'result' && (P()?.hp ?? 0) <= 0,
    returned: s.gameState === 'result' && (P()?.hp ?? 0) > 0,
    companions: companionNames() || null,
    roomActions: W.__roomActions, purchases: W.__purchases,
    roundTrip: roundTrip() ? { ...roundTrip() } : null, turnBackAt: W.__turnBackAt, stepsBy: { ...W.__stepsBy }, noiseFights: W.__noiseFights || 0, hpLedger: W.__hpLedger, maxHp: P() ? DATA.getCharMaxHp(P()) : null, hunterMin: { ...W.__hunterMin }, returnFlees: W.__returnFlees || 0, returnReason: s.currentRun?.returnReason || null,
    eliteFlees: { ...W.__eliteFlees }, eliteFightsForced: Object.keys(W.__fightElite || {}).map(Number), bloodUses: W.__bloodUses || 0, riposteGuards: W.__riposteGuards || 0,
    cause: s.gameState === 'result' ? d?.cause : null,
    finalEquipment: W.__lastEquipment || null,
    techniqueUses: W.__techUses || 0, seedChoice: W.__seedChoice,
    likelyCoreFamilies: P()?.likelyCoreFamilies || null,
    journal: W.__journal, loot: W.__lootLog, equipLog: W.__equipLog
  };
};

// Warp straight to a guardian with a fixed Lv/HP (not a full-run result).
W.__bossTest = async ({ floor = 5, level = 3, maxHp = 55, hp = 40, seed = null } = {}) => {
  const s = st();
  if (!['explore', 'submenu'].includes(s.gameState)) { const r = await W.__startRun({ seed }); if (!r.ok) return r; }
  M.descendToFloor(floor); for (let i = 0; i < 40 && s.floor !== floor; i++) await sl(100); await sl(300);
  const p = P(); p.level = level; p.maxHp = maxHp; p.hp = hp; s.repelTurns = 999;
  s.roamingMonsters = (s.roamingMonsters || []).filter(m => m.floor !== floor);
  for (let i = 0; i < 300 && s.gameState !== 'combat'; i++) {
    const b = W.__btns();
    if (s.gameState === 'trap_encounter') { await W.__click(b.includes('解除する') ? '解除する' : '縁を伝う'); await sl(500); continue; }
    if (s.gameState === 'submenu') { for (const l of ['立ち去る', '降りずに進む', '探索に戻る', '戻る']) if (b.some(t => t.includes(l))) { await W.__click(l); break; } await sl(250); continue; }
    if (s.gameState !== 'explore') { await sl(150); continue; }
    const r = await W.__walk('boss', 1); if (r === 'no path') await sl(200);
  }
  if (s.gameState !== 'combat') return { error: 'guardian not reached', status: W.__status() };
  await sl(300);
  return { result: await W.__bossFight(), status: W.__status() };
};

export default 'loaded';
