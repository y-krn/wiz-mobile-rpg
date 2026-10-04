// Biome special rooms (#1965): one choice menu per room kind. Each option
// spends something the run already tracks (turns and noise, materials, HP,
// or a fight) and the room is used once.
import { state, addLog, saveAutosave, markMapChanged } from "../state.js";
import { playSound } from "../audio.js";
import { closeSubmenu } from "../navigation.js";
import { getCharMaxHp, getCharMaxMp } from "../data.js";
import { getCharWeaponAtk } from "../rules/character_stats.js";
import { getTotalMaterialCount, spendAnyMaterials } from "../rules/material_rules.js";
import { hasStatusEffect, removeStatusEffect, STATUS_EFFECT_IDS } from "../combat_logic/status_effects.js";
import { consumeExplorationTurn, createNoiseEvent, getCurrentExplorationCell } from "../movement.js";
import { generateChestMaterials } from "../chest.js";
import { startCombat } from "../combat.js";
import { applyMirrorVision } from "../state/run_floor_state.js";
import { COMPANIONS } from "../data/facilities.js";
import {
  ALTAR_CLEANSE_MATERIAL_COST,
  FORGE_MATERIAL_COST,
  FORGE_TEMPER_BATTLES,
  FOREMAN_DIG_TURNS,
  READING_TURNS,
  SPECIAL_ROOMS,
  VEIN_AMBUSH_CHANCE,
  VEIN_DIG_TURNS,
  VEIN_MATERIAL_BONUS,
  applyForgeTemper,
  cleanseAltarStatuses,
  describeDirection,
  getAltarBloodCost,
  getForgeTemperAmount,
  getMirrorHpCost,
  getReadingRoomTargets,
  getSpecialRoom,
  getSpecialRoomInfo,
  markSpecialRoomUsed,
  revealCells
} from "../rules/special_rooms.js";

const CLEANSABLE_STATUSES = [
  STATUS_EFFECT_IDS.POISONED,
  STATUS_EFFECT_IDS.BLIND,
  STATUS_EFFECT_IDS.SLEEP,
  STATUS_EFFECT_IDS.PARALYZED,
  STATUS_EFFECT_IDS.SILENCE
];

function getHero() {
  return state.party.find(char => char.status !== "dead") || null;
}

function addDescription(optGrid, text) {
  const info = document.createElement("p");
  info.className = "submenu-description";
  info.textContent = text;
  optGrid.appendChild(info);
}

function addButton(optGrid, label, onClick, { danger = false, disabled = false } = {}) {
  const button = document.createElement("button");
  button.className = `btn ${danger ? "btn-danger" : "btn-neon"} btn-block`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  optGrid.appendChild(button);
  return button;
}

function finishRoom(cell) {
  markSpecialRoomUsed(cell);
  markMapChanged();
  saveAutosave();
}

function grantRunMaterials(materials) {
  if (!state.currentRun) return;
  state.currentRun.materials ||= {};
  Object.entries(materials).forEach(([name, quantity]) => {
    state.currentRun.materials[name] = (state.currentRun.materials[name] || 0) + quantity;
  });
}

function payRunMaterials(total) {
  const result = spendAnyMaterials(state.currentRun?.materials, total);
  if (!result) return null;
  state.currentRun.materials = result.balance;
  return Object.entries(result.spent).filter(([, quantity]) => quantity > 0)
    .map(([name, quantity]) => `${name} x${quantity}`).join(", ");
}

function runMaterialCount() {
  return getTotalMaterialCount(state.currentRun?.materials);
}

// Mine vein: dig for materials. Each turn is noisy and can be interrupted;
// progress is kept on the room, and a finished dig may draw an ambush.
function digVein(cell) {
  const room = getSpecialRoom(cell);
  createNoiseEvent(state.x, state.y);
  addLog("鉱脈を掘り始めた。つるはしの音が坑道に響く…");
  while ((room.progress || 0) < VEIN_DIG_TURNS) {
    const turn = consumeExplorationTurn();
    room.progress = (room.progress || 0) + 1;
    markMapChanged();
    if (room.progress >= VEIN_DIG_TURNS) break;
    if (!turn.ok || turn.wiped || turn.encounter || state.gameState !== "explore") {
      addLog(`採掘が中断された。残りは${VEIN_DIG_TURNS - room.progress}手番分だ。`);
      saveAutosave();
      return;
    }
  }
  const materials = generateChestMaterials(state.floor, Math.random, VEIN_MATERIAL_BONUS);
  grantRunMaterials(materials);
  const text = Object.entries(materials).map(([name, quantity]) => `${name} x${quantity}`).join(", ");
  playSound("item");
  addLog(`鉱脈から素材を掘り出した！ [${text}]`);
  finishRoom(cell);
  if (Math.random() < VEIN_AMBUSH_CHANCE) {
    addLog("採掘の音を聞きつけて、魔物が這い出してきた！");
    startCombat(false);
  }
}

function renderMineVein(optGrid, cell) {
  const room = getSpecialRoom(cell);
  const left = VEIN_DIG_TURNS - (room.progress || 0);
  addDescription(optGrid, `掘ると${left}手番かかり、物音が立つ。掘り終えると素材を得るが、音を聞きつけた魔物に襲われることがある。`);
  addButton(optGrid, `鉱脈を掘る（${left}手番）`, () => {
    closeSubmenu();
    digVein(cell);
  });
}

// Altar: a material-priced cleanse, or the blood blessing (HP into MP).
function renderAltar(optGrid, cell) {
  const hero = getHero();
  const statuses = hero ? CLEANSABLE_STATUSES.filter(id => hasStatusEffect(hero, id)) : [];
  const materials = runMaterialCount();
  const maxHp = hero ? getCharMaxHp(hero) : 0;
  const maxMp = hero ? getCharMaxMp(hero) : 0;
  const bloodCost = hero ? getAltarBloodCost(hero, maxHp) : 0;
  addDescription(optGrid, `浄め：素材${ALTAR_CLEANSE_MATERIAL_COST}個を捧げて状態異常を消す。血の祝福：HP${bloodCost}を捧げてMPを満たす。祭壇は一度しか応えない。`);
  addButton(optGrid, `浄めを願う（素材${ALTAR_CLEANSE_MATERIAL_COST}個）`, () => {
    const paid = payRunMaterials(ALTAR_CLEANSE_MATERIAL_COST);
    if (!paid) return;
    const cleared = cleanseAltarStatuses(hero, { hasStatusEffect, removeStatusEffect, ids: CLEANSABLE_STATUSES });
    playSound("heal");
    addLog(`祭壇に [${paid}] を捧げた。${cleared.length > 0 ? "体を蝕んでいたものが消え去った。" : "清らかな光に包まれた。"}`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || statuses.length === 0 || materials < ALTAR_CLEANSE_MATERIAL_COST });
  addButton(optGrid, `血の祝福を受ける（HP${bloodCost}）`, () => {
    hero.hp -= bloodCost;
    hero.mp = maxMp;
    playSound("heal");
    addLog(`祭壇に血を捧げた。HPが${bloodCost}減り、MPが満ちた。`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || maxMp <= 0 || bloodCost <= 0 || hero.mp >= maxMp });
}

// Brood chamber: smash the eggs to wake the keeper; its hoard is a chest.
function renderBroodChamber(optGrid, cell) {
  addDescription(optGrid, "卵を壊せば巣の主（この階のエリート級）が目を覚ます。倒せば卵室に積まれた荷（宝箱）が手に入る。逃げても卵室は二度と使えない。");
  addButton(optGrid, "卵を壊す（強敵と戦う）", () => {
    finishRoom(cell);
    closeSubmenu();
    addLog("卵を叩き割った。奥で巨大な影が身を起こす！");
    startCombat(false, false, false, null, { broodChamber: true });
  });
}

// Reading room: the floor plan marks the down stairs and unopened chests.
function renderReadingRoom(optGrid, cell) {
  addDescription(optGrid, `見取り図を読むと${READING_TURNS}手番かかる。この階の下り階段と、まだ開けていない宝箱の位置が地図に記される。`);
  addButton(optGrid, `見取り図を読む（${READING_TURNS}手番）`, () => {
    closeSubmenu();
    for (let turn = 0; turn < READING_TURNS; turn++) {
      const result = consumeExplorationTurn();
      if (!result.ok || result.wiped || state.gameState !== "explore") break;
    }
    const { stairs, chests } = getReadingRoomTargets(state.map);
    revealCells(state.visitedMap, [...stairs, ...chests]);
    finishRoom(cell);
    playSound("item");
    const stairsText = stairs[0] ? `下り階段は${describeDirection(state, stairs[0])}にある。` : "";
    addLog(`見取り図を写し取った。${stairsText}宝箱${chests.length}個の位置が地図に記された。`);
  });
}

// Forge: feed materials to temper the weapon for the next few battles.
function renderForge(optGrid, cell) {
  const hero = getHero();
  const weaponAtk = hero ? getCharWeaponAtk(hero) : 0;
  const bonus = getForgeTemperAmount(weaponAtk);
  const materials = runMaterialCount();
  addDescription(optGrid, `素材${FORGE_MATERIAL_COST}個をくべると、武器の攻撃力が+${bonus}される（次の${FORGE_TEMPER_BATTLES}戦）。所持素材：${materials}個`);
  addButton(optGrid, `武器を鍛え直す（素材${FORGE_MATERIAL_COST}個）`, () => {
    const paid = payRunMaterials(FORGE_MATERIAL_COST);
    if (!paid) return;
    const temper = applyForgeTemper(hero, weaponAtk);
    playSound("item");
    addLog(`炉に [${paid}] をくべた。武器が赤く輝く！（攻撃力+${temper.bonus}、${temper.battles}戦）`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || hero.forgeTemper || materials < FORGE_MATERIAL_COST });
}

// Mirror hall: pay HP to see where the next floor's down stairs lie.
function renderMirrorHall(optGrid, cell) {
  const hero = getHero();
  const cost = hero ? getMirrorHpCost(hero, getCharMaxHp(hero)) : 0;
  addDescription(optGrid, `鏡を覗くとHP${cost}を奪われる。代わりに、次の階の下り階段とその手前が地図に刻まれる。`);
  addButton(optGrid, `鏡を覗く（HP${cost}）`, () => {
    hero.hp -= cost;
    finishRoom(cell);
    applyMirrorVision(state, state.floor + 1);
    playSound("bump");
    addLog(`鏡に生気を吸われた（HP-${cost}）。次の階の下り階段の景色が、目に焼き付いた。`);
    closeSubmenu();
  }, { disabled: !hero || cost <= 0 });
}

// Trapped foreman (#2009): dig him out and he follows. Digging costs turns
// and noise like a vein and can be interrupted; progress stays on the room.
// He only counts as rescued once the run walks out by the Portal or the Wing.
function digOutForeman(cell) {
  const room = getSpecialRoom(cell);
  createNoiseEvent(state.x, state.y);
  addLog("崩れた岩を掘り始めた。つるはしの音が坑道に響く…");
  while ((room.progress || 0) < FOREMAN_DIG_TURNS) {
    const turn = consumeExplorationTurn();
    room.progress = (room.progress || 0) + 1;
    markMapChanged();
    if (room.progress >= FOREMAN_DIG_TURNS) break;
    if (!turn.ok || turn.wiped || turn.encounter || state.gameState !== "explore") {
      addLog(`掘り出しが中断された。残りは${FOREMAN_DIG_TURNS - room.progress}手番分だ。`);
      saveAutosave();
      return;
    }
  }
  if (state.currentRun) state.currentRun.companion = COMPANIONS.foreman.id;
  playSound("item");
  addLog(`${COMPANIONS.foreman.name}を掘り出した！「恩に着る。街まで連れて行ってくれ」`);
  addLog(`${COMPANIONS.foreman.name}が同行する。帰還の門か帰還の翼で生還すれば、街に坑夫組合が開く。`);
  finishRoom(cell);
}

function renderTrappedForeman(optGrid, cell) {
  const room = getSpecialRoom(cell);
  const left = FOREMAN_DIG_TURNS - (room.progress || 0);
  addDescription(optGrid, `崩れた岩の向こうに鉱夫頭が閉じ込められている。掘り出すと${left}手番かかり、物音が立つ。助けた後は同行するが、戦いには加わらない。生還して初めて救出になり、死ねば連れ帰れない。`);
  addButton(optGrid, `岩を掘って助け出す（${left}手番）`, () => {
    closeSubmenu();
    digOutForeman(cell);
  });
}

const ROOM_RENDERERS = {
  [SPECIAL_ROOMS.MINE_VEIN]: renderMineVein,
  [SPECIAL_ROOMS.ALTAR]: renderAltar,
  [SPECIAL_ROOMS.BROOD_CHAMBER]: renderBroodChamber,
  [SPECIAL_ROOMS.READING_ROOM]: renderReadingRoom,
  [SPECIAL_ROOMS.FORGE]: renderForge,
  [SPECIAL_ROOMS.MIRROR_HALL]: renderMirrorHall,
  [SPECIAL_ROOMS.TRAPPED_FOREMAN]: renderTrappedForeman
};

export function renderSpecialRoom(optGrid) {
  document.getElementById("btn-submenu-back").style.display = "none";
  const cell = getCurrentExplorationCell();
  const room = getSpecialRoom(cell);
  const render = room && !room.used ? ROOM_RENDERERS[room.kind] : null;
  if (render) render(optGrid, cell);
  const name = getSpecialRoomInfo(room?.kind)?.name || "部屋";
  addButton(optGrid, "立ち去る", () => {
    addLog(`${name}を後にした。`);
    closeSubmenu();
  }, { danger: true });
}
