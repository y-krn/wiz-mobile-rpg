/* global window, document, PointerEvent, MouseEvent, setTimeout */
// Browser-side playtest driver (#1799). Loaded as a module into the running
// game (Vite dev server) by run_playtest.mjs, or manually from public/.
// It drives the real game: movement through handleMove, everything else by
// clicking the rendered buttons, so combat/traps/chests use production logic.
//
// Known shortcuts (keep them in mind when reading results):
// - pathfinding reads the whole internal map (a human has to explore);
// - equipment policy uses domain APIs (identify / loadout commit) instead of
//   the equipment overlay, with the same one-turn cost as the overlay;
// - no human judgement for Guard in ordinary fights.

const S = await import('/src/state.js');
const M = await import('/src/movement.js');
const MAPU = await import('/src/rules/map_movement.ts');
const DATA = await import('/src/data.js');
const PREVIEW = await import('/src/rules/equipment_preview.js');
const LOADOUT = await import('/src/rules/loadout_transaction.js');
const LOADOUT_COMMIT = await import('/src/systems/loadout_transaction.ts');
const EQUIP_ACTIONS = await import('/src/systems/equipment_actions.ts');

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
// Real (unscaled) sleep when the runner accelerates timers.
const sl = ms => new Promise(r => (window.__realSetTimeout || setTimeout)(r, ms));
const st = () => S.state;
const W = window;
const txt = l => typeof l === 'string' ? l : (l.text || l.message || '');
const P = () => st().party[0];

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
W.__tap = async (t) => {
  const els = [...document.querySelectorAll('button,[role=button],[tabindex],div,li,span')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.textContent.includes(t); })
    .sort((a, b) => a.textContent.length - b.textContent.length);
  const el = els[0]; if (!el) return 'NO ' + t;
  const tgt = el.closest('button,[role=button],[tabindex]') || el; const r = tgt.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  tgt.dispatchEvent(new PointerEvent('pointerdown', o)); tgt.dispatchEvent(new MouseEvent('mousedown', o));
  tgt.dispatchEvent(new PointerEvent('pointerup', o)); tgt.dispatchEvent(new MouseEvent('mouseup', o)); tgt.dispatchEvent(new MouseEvent('click', o));
  await sl(500); return 'ok ' + t;
};

// ---------- movement ----------
W.__bfs = (goal, allowTraps = false) => {
  const s = st(); const H = s.map.length, Wd = s.map[0].length; const prev = new Map();
  const key = (x, y) => y * Wd + x; const q = [[s.x, s.y]]; prev.set(key(s.x, s.y), null);
  const elites = allowTraps ? [] : (s.roamingMonsters || []).filter(m => m.floor === s.floor && m.hp !== 0 && !m.defeated);
  const nearElite = (x, y) => elites.some(m => Math.abs(m.x - x) + Math.abs(m.y - y) <= 2);
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
      if (nearElite(nx, ny) && !goal(nx, ny)) continue;
      if (prev.has(key(nx, ny))) continue; prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  return null;
};
const goals = {
  frontier: (x, y) => !st().visitedMap[y][x],
  stairs: (x, y) => st().map[y][x].type === 'stairs-down',
  boss: (x, y) => st().map[y][x].event === 'boss',
};
W.__walk = async (goalName = 'frontier', maxSteps = 200) => {
  const s = st(); let steps = 0;
  while (steps < maxSteps) {
    if (s.gameState !== 'explore') return 'STOP gs=' + s.gameState;
    const path = W.__bfs(goals[goalName]) || W.__bfs(goals[goalName], true); if (!path) return 'no path';
    const [nx, ny] = path[0]; const d = [0, 1, 2, 3].find(d => s.x + DX[d] === nx && s.y + DY[d] === ny); let g = 0;
    while (s.dir !== d && g++ < 4) { M.handleMove(((d - s.dir + 4) % 4) === 3 ? 'turn-left' : 'turn-right'); while (s.transitioning) await sl(20); await sl(10); }
    const bx = s.x, by = s.y; M.handleMove('forward'); while (s.transitioning) await sl(20); await sl(20); steps++;
    if (s.gameState !== 'explore') return 'STOP gs=' + s.gameState + ' after ' + steps;
    if (s.x === bx && s.y === by) return 'blocked at ' + nx + ',' + ny;
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
const attackTarget = async (alive, preferHigh = false) => {
  const t = [...alive].sort((a, b) => preferHigh ? b.hp - a.hp : a.hp - b.hp)[0];
  const spell = castableSpell();
  if (spell) {
    await W.__click('魔法'); await sl(150);
    if (await W.__click(spell) === 'ok') { await sl(150); if (alive.length > 1 || W.__btns().some(b => b.includes('攻撃対象'))) return W.__act(t.name); return W.__act(); }
    await W.__click('戻る');
  }
  if (alive.length > 1) { await W.__click('攻撃'); await sl(150); return W.__act(t.name); }
  return W.__act('攻撃');
};
W.__fight = async () => {
  const s = st(); const hp0 = P().hp; const mons = W.__mons(); let r = 0; let note = '';
  while (s.gameState === 'combat' && r++ < 40) {
    const alive = s.combatState.monsters.filter(m => m.hp > 0 && !m.fled);
    const enemyHp = alive.reduce((a, m) => a + m.hp, 0);
    if (P().hp <= DATA.getCharMaxHp(P()) * 0.3) {
      if (await W.__useHeal()) { note += ' [heal]'; continue; }
      if (enemyHp > 12) { await W.__act('逃走'); note += ' [flee]'; continue; }
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

// ---------- loot & equipment policy ----------
W.__chest = async () => {
  if (['paralyzed', 'paralyze', 'sleep'].includes(P().status)) { await W.__click('立ち去る'); await sl(200); W.__journal.push('chest skipped: incapacitated'); return; }
  if (W.__btns().includes('調べる')) { await W.__click('調べる'); await sl(400); }
  if (W.__btns().some(t => t === '解除する')) { await W.__click('解除する'); await sl(1000); }
  else if (W.__btns().some(t => t.includes('宝箱を開ける'))) { await W.__click('宝箱を開ける'); await sl(1000); }
  await sl(300); if (W.__btns().some(t => t.includes('宝箱を開ける'))) { await W.__click('宝箱を開ける'); await sl(1000); }
};
W.__take = async () => { await W.__click('この内容で確定する'); await sl(400); };

const EQUIP_TYPES = ['weapon', 'armor', 'shield', 'accessory'];
const itemType = it => DATA.getItemData?.(it)?.type ?? null;
const isHidden = it => typeof it === 'object' && it && it.identified === false;
// Score from the game's own equipment preview rows. Combat stats dominate;
// HP counts at a lower rate; Cores (rule-changing effects) get a flat bonus and
// known curses a penalty. The weights are a crude stand-in for a player, not a
// balance claim.
const SCORE_WEIGHTS = { attack: 2, defense: 2, maxHp: 0.3, maxMp: 0.5, magic: 1, speed: 0.5, firstStrike: 0.3 };
const scoreEquip = (char, it) => {
  const preview = PREVIEW.getEquipmentPreview(char, it, null, { floor: st().floor });
  if (!preview) return null;
  let score = preview.rows.reduce((a, r) => a + (typeof r.diff === 'number' ? r.diff * (SCORE_WEIGHTS[r.key] || 0) : 0), 0);
  if (typeof it === 'object' && (it.affixes || []).some(a => a.kind === 'core')) score += 3;
  if (typeof it === 'object' && it.identified && it.curseEffectId) score -= 5;
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
    const char = P(); let best = null;
    st().inventory.forEach((it, i) => {
      if (isHidden(it) || !EQUIP_TYPES.includes(itemType(it))) return;
      const score = scoreEquip(char, it);
      if (score !== null && score > 0 && (!best || score > best.score)) best = { i, score, it };
    });
    if (!best) break;
    const draft = LOADOUT.createLoadoutDraft(st());
    const staged = LOADOUT.stageEquip(draft, { actorIdx: 0, inventoryIndex: best.i });
    if (!staged?.ok) { W.__equipLog.push(`F${st().floor} cannot equip ${describeItem(best.it)}: ${staged?.reason}`); break; }
    const res = LOADOUT_COMMIT.commitLoadoutDraft(staged.draft, { turnCost: 1, worldAction: 'explore' });
    if (!res?.ok || res.changed === false) { W.__equipLog.push(`F${st().floor} equip failed ${describeItem(best.it)} ${res?.reason || ''}`); break; }
    W.__equipLog.push(`F${st().floor} equip ${describeItem(best.it)} (+${best.score})`);
  }
  // 3) try one unidentified piece (costs a turn), keep only if ATK/DEF held up
  const idx = st().inventory.findIndex(it => isHidden(it) && ['weapon', 'armor', 'shield'].includes(itemType(it)) && !it.trialCount && !it.__skipTrial);
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

// ---------- run loop ----------
W.__auto = async (policy = { explore: 0.6 }, maxIter = 600) => {
  const s = st();
  for (let i = 0; i < maxIter; i++) {
    trackInventory();
    const b = W.__btns(); const p = P();
    if (s.gameState === 'result' || p.hp <= 0) return 'dead';
    if (s.gameState === 'combat') { if (s.combatState?.isBoss) await W.__bossFight(); else await W.__fight(); continue; }
    if (s.gameState === 'trap_encounter') {
      await W.__click(b.includes('解除する') ? '解除する' : b.includes('縁を伝う') ? '縁を伝う' : b.find(t => !/ON|⛶/.test(t) && t));
      await sl(700); W.__journal.push('trap F' + s.floor + ': ' + W.__log(1)); continue;
    }
    if (b.some(t => t.includes('宝箱を開ける'))) { await W.__chest(); continue; }
    if (b.some(t => t.includes('この内容で確定する'))) { await W.__take(); continue; }
    if (b.some(t => t.includes('泉の水を飲む'))) { await W.__click('泉の水を飲む'); await sl(600); W.__journal.push('spring F' + s.floor + ': ' + W.__log(1)); continue; }
    if (b.some(t => t.includes('探索に戻る'))) { await W.__click('探索に戻る'); await sl(200); continue; }
    if (b.some(t => t.includes('降りずに進む')) && !b.some(t => t.includes('へ降りる'))) {
      // milestone floor with an undefeated guardian: heal up, go fight it
      await W.__click('降りずに進む'); for (let w = 0; w < 30 && s.gameState !== 'explore'; w++) await sl(80);
      while (P().hp < DATA.getCharMaxHp(P()) * 0.6 && await W.__useHeal()) await sl(100);
      const r = await W.__walk('boss', 250); W.__journal.push(`-> guardian: ${r} ${W.__status()}`);
      continue;
    }
    if (b.some(t => t.includes('へ降りる'))) {
      const maxHp = DATA.getCharMaxHp(p);
      if (policy.maxFloor && s.floor >= policy.maxFloor) return 'maxFloor';
      if (policy.explore === 0 || p.hp < maxHp * policy.explore || W.__bfs(goals.frontier) === null) {
        const f0 = s.floor; await W.__click('へ降りる'); for (let w = 0; w < 60 && s.floor === f0; w++) await sl(80); await sl(200);
        W.__journal.push(`>>> F${s.floor} ${W.__status()}`); continue;
      }
      await W.__click('降りずに進む'); await sl(200); continue;
    }
    if (s.gameState === 'submenu' && b.some(t => t === '戻る')) { await W.__click('戻る'); await sl(200); if (s.gameState === 'explore') continue; }
    if (s.gameState === 'equip_overlay') { await W.__click('キャンセル'); await W.__click('閉じる'); await sl(200); continue; }
    if (s.gameState !== 'explore') { W.__journal.push('!! stuck gs=' + s.gameState + ' ' + b.join('|')); return 'stuck'; }
    await W.__manageGear();
    if (p.hp < DATA.getCharMaxHp(p) * 0.4 && await W.__useHeal()) continue;
    const wantStairs = policy.explore === 0 || p.hp < DATA.getCharMaxHp(p) * policy.explore;
    let r = await W.__walk(wantStairs && W.__bfs(goals.stairs) ? 'stairs' : 'frontier', 150);
    if (r === 'no path') r = await W.__walk('stairs', 150);
    if (r === 'at stairs') { M.handleMove('turn-left'); await sl(100); M.handleMove('turn-right'); await sl(200); }
    if (r === 'no path' || r === 'maxsteps' || r.startsWith('blocked')) { W.__journal.push('!! ' + r); return 'stuck'; }
  }
  return 'maxIter';
};

// ---------- run start (seedable) ----------
const KIT_NAMES = { vanguard: '鋼の前線キット', scout: '軽装探索キット', devotion: '祈りの旅装キット', arcana: '術式の旅装キット' };
W.__startRun = async ({ kit = 'vanguard', seed = null, trialIndex = 2 } = {}) => {
  if (W.__btns().some(t => t.includes('街へ戻る'))) { await W.__click('街へ戻る'); await sl(1000); }
  for (let t = 0; t < 4 && !document.querySelector('button.trial-profile-option'); t++) {
    await W.__tap('準備を整える'); await sl(300); await W.__tap(KIT_NAMES[kit] || kit); await sl(500);
  }
  let tb = [...document.querySelectorAll('button.trial-profile-option')][trialIndex];
  if (!tb) return { ok: false, reason: 'no trial options; gs=' + st().gameState };
  if (!tb.classList.contains('is-selected')) { tb.click(); for (let i = 0; i < 20; i++) { await sl(150); tb = [...document.querySelectorAll('button.trial-profile-option')][trialIndex]; if (tb?.classList.contains('is-selected')) break; } }
  const fb = [...document.querySelectorAll('button.solo-start-floor-option')].find(b => b.textContent.includes('B1F')); if (!fb) return { ok: false, reason: 'no B1 option' };
  fb.click(); await sl(300);
  // Fix the map seed: runSeed = `${state.seed}:run:${Date.now()}` at entry.
  const realNow = Date.now;
  if (seed !== null) { st().seed = `PT-${seed}`; Date.now = () => 1700000000000; }
  try { await W.__click('迷宮へ向かう'); for (let i = 0; i < 40 && st().gameState !== 'explore'; i++) await sl(100); }
  finally { Date.now = realNow; }
  W.__journal = []; W.__lootLog = []; W.__equipLog = []; W.__runeCount = 0; W.__lastEquipment = null; seenLoot.clear();
  const run = st().currentRun;
  // Fingerprint of the B1 layout so before/after runs can prove they share maps.
  let h = 2166136261; for (const row of st().map) for (const c of row) for (const w of c.walls) { h ^= w ? 1 : 0; h = Math.imul(h, 16777619) >>> 0; }
  return { ok: st().floor === 1 && run?.trialProfile !== 'normal', runSeed: run?.runSeed, mapFingerprint: h.toString(16), trialProfile: run?.trialProfile, maxHp: DATA.getCharMaxHp(P()), mp: P().mp, maxMp: DATA.getCharMaxMp(P()) };
};

// One complete run; returns a plain JSON summary.
W.__playRun = async ({ kit = 'vanguard', seed = null, explore = 0.6, maxFloor = null, equip = 'greedy' } = {}) => {
  W.__equipPolicy = equip;
  const start = await W.__startRun({ kit, seed });
  if (!start.ok) return { start, error: 'start failed' };
  let end = '';
  for (let i = 0; i < 8 && st().gameState !== 'result'; i++) { end = await W.__auto({ explore, maxFloor }); if (end !== 'maxIter') break; }
  const s = st(); const d = s.deathLogs?.at(-1);
  return {
    seed, kit, explore, equip, start, end,
    deepest: s.currentRun?.deepestFloor ?? s.floor,
    guardian: W.__journal.filter(j => j.startsWith('BOSS')),
    level: P()?.level, died: s.gameState === 'result' && (P()?.hp ?? 0) <= 0,
    cause: s.gameState === 'result' ? d?.cause : null,
    finalEquipment: W.__lastEquipment || null,
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
