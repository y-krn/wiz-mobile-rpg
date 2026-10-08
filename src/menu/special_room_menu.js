// Biome special rooms (#1965): one choice menu per room kind. Each option
// spends something the run already tracks (turns and noise, materials, HP,
// or a fight) and the room is used once.
import { state, addLog, saveAutosave, markMapChanged, addInventoryItem, hasInventorySpace } from "../state.js";
import { playSound } from "../audio.js";
import { closeSubmenu } from "../navigation.js";
import { getCharMaxHp, getCharMaxMp } from "../data.js";
import { getCharEquipmentDef, getCharWeaponAtk } from "../rules/character_stats.js";
import { addRunFragments } from "../systems/guidebook.js";
import { convertToEquipObject } from "../craft.js";
import { replaceRunObjectLoot } from "../state/run_loot.js";
import { syncMediumState } from "../rules/magic_rules.js";
import { getItemData } from "../rules/item_rules.js";
import { getTotalMaterialCount, spendAnyMaterials } from "../rules/material_rules.js";
import { hasStatusEffect, removeStatusEffect, STATUS_EFFECT_IDS } from "../combat_logic/status_effects.js";
import { consumeExplorationTurn, createNoiseEvent, getCurrentExplorationCell } from "../movement.js";
import { generateChestMaterials } from "../chest.js";
import { startCombat } from "../combat.js";
import { applyMirrorVision } from "../state/run_floor_state.js";
import { CHAPEL_OFFERING_LIMIT, KEEPER_ROOM_FACILITY } from "../data/facilities.js";
import { isFacilityNodeBought } from "../systems/facilities.js";
import { normalizeCompanions, normalizeFacilitiesState } from "../state/facilities_state.js";
import { ITEMS } from "../data/items.js";
import { purifyEquipmentCurse } from "../systems/identification.js";
import {
  ALTAR_CLEANSE_MATERIAL_COST,
  ALTAR_UNCURSE_MATERIAL_COST,
  COPY_FRAGMENTS,
  COPY_TURNS,
  HAMMOCK_REST_TURNS,
  MENDING_BATTLES,
  MENDING_MATERIAL_COST,
  FORGE_MATERIAL_COST,
  FORGE_TEMPER_BATTLES,
  GALLERY_VISION_FLOORS,
  OUTPOST_BLAST_NOISE_TTL,
  OUTPOST_SUPPLY_ITEM_IDS,
  READING_TURNS,
  REFORGE_MATERIAL_COST,
  REFORGE_MAX_LEVEL,
  SMITH_TEMPER_BATTLES,
  SPECIAL_ROOMS,
  VEIN_AMBUSH_CHANCE,
  VEIN_DIG_TURNS,
  VEIN_MATERIAL_BONUS,
  applyArmorMend,
  applyForgeTemper,
  applyOffering,
  cleanseAltarStatuses,
  clearFloorRubble,
  describeDirection,
  getAltarBloodCost,
  getAltarCursedItems,
  getArmorMendAmount,
  getHammockRestAmount,
  getForgeTemperAmount,
  getMirrorHpCost,
  getOfferingChoices,
  getReadingRoomTargets,
  getReforgedLevel,
  getRescueBloodCost,
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

// The line logged on entering a room sets the scene. The menu text names the
// choice and what it leads to; costs and gains sit on the buttons. What is
// carried is mentioned only when it falls short.
function addMaterialShortage(optGrid, text, cost) {
  const materials = runMaterialCount();
  if (materials < cost) addDescription(optGrid, `${text}（手持ち${materials}個）。`);
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
  addLog(`鉱脈から素材を掘り出した：${text}`);
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
function addAltarOptions(optGrid, cell) {
  const hero = getHero();
  const statuses = hero ? CLEANSABLE_STATUSES.filter(id => hasStatusEffect(hero, id)) : [];
  const materials = runMaterialCount();
  const maxHp = hero ? getCharMaxHp(hero) : 0;
  const maxMp = hero ? getCharMaxMp(hero) : 0;
  const bloodCost = hero ? getAltarBloodCost(hero, maxHp) : 0;
  addButton(optGrid, `浄めを願う（素材${ALTAR_CLEANSE_MATERIAL_COST}個）`, () => {
    const paid = payRunMaterials(ALTAR_CLEANSE_MATERIAL_COST);
    if (!paid) return;
    const cleared = cleanseAltarStatuses(hero, { hasStatusEffect, removeStatusEffect, ids: CLEANSABLE_STATUSES });
    playSound("heal");
    addLog(`祭壇に${paid}を捧げた。${cleared.length > 0 ? "体を蝕んでいたものが消え去った。" : "清らかな光に包まれた。"}`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || statuses.length === 0 || materials < ALTAR_CLEANSE_MATERIAL_COST });
  // The catacomb's rule (#2063): the altar can lift one known curse instead.
  getAltarCursedItems(hero, state.inventory).forEach(({ item }) => {
    const name = getItemData(item).name;
    addButton(optGrid, `${name}の呪いを解く（素材${ALTAR_UNCURSE_MATERIAL_COST}個）`, () => {
      const paid = payRunMaterials(ALTAR_UNCURSE_MATERIAL_COST);
      if (!paid) return;
      purifyEquipmentCurse(item);
      playSound("heal");
      addLog(`祭壇に${paid}を捧げた。${name}から呪いが抜けた。`);
      finishRoom(cell);
      closeSubmenu();
    }, { disabled: materials < ALTAR_UNCURSE_MATERIAL_COST });
  });
  addButton(optGrid, `血の祝福を受ける（HP${bloodCost}）`, () => {
    hero.hp -= bloodCost;
    hero.mp = maxMp;
    playSound("heal");
    addLog(`祭壇に血を捧げた。HPが${bloodCost}減り、MPが満ちた。`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || maxMp <= 0 || bloodCost <= 0 || hero.mp >= maxMp });
  return bloodCost;
}

function renderAltar(optGrid, cell) {
  addDescription(optGrid, "浄めは体を蝕むものを消し、血の祝福はMPを満たす。呪いと分かった装備なら、その呪いも解ける。祭壇が応えるのは一度きり。");
  addAltarOptions(optGrid, cell);
}

// Chapel altar (#2018): the altar's own options, an offering that sends one
// kind of carried material home for good, and (once bought) the grave that
// returns part of what the last death lost. One answer per run, like the altar.
function renderChapelAltar(optGrid, cell) {
  const run = state.currentRun;
  const hasGrave = isFacilityNodeBought(state.facilities, "chapel_grave");
  addDescription(optGrid, `浄めは体を蝕むものを消し、血の祝福はMPを満たす。献灯で街へ送った素材は、この先で死んでも失わない。${hasGrave ? "墓標に祈れば、前の死で失った素材が戻る。" : ""}祭壇が応えるのは、この冒険で一度きり。`);
  addAltarOptions(optGrid, cell);
  const choices = getOfferingChoices(run?.materials, CHAPEL_OFFERING_LIMIT);
  choices.forEach(choice => {
    const button = addButton(optGrid, `献灯：${choice.name} ${choice.quantity}個を街へ送る`, () => {
      const offering = applyOffering(run.materials, run.offeredMaterials, choice.name, CHAPEL_OFFERING_LIMIT);
      if (!offering) return;
      run.materials = offering.materials;
      run.offeredMaterials = offering.offered;
      playSound("item");
      addLog(`献灯台に${choice.name}を${offering.sent}個供えた。灯とともに街へ届けられる（確定）。`);
      finishRoom(cell);
      closeSubmenu();
    });
    button.setAttribute?.("data-offering-material", choice.name);
  });
  if (choices.length === 0) addDescription(optGrid, "手持ちの素材がなく、献灯はできない。");
  if (!hasGrave) return;
  const grave = normalizeFacilitiesState(state.facilities).grave;
  const graveText = Object.entries(grave).map(([name, quantity]) => `${name} x${quantity}`).join(", ");
  const graveButton = addButton(optGrid, graveText ? `墓標に祈る（${graveText}）` : "墓標に祈る（何も残っていない）", () => {
    grantRunMaterials(grave);
    state.facilities = { ...normalizeFacilitiesState(state.facilities), grave: {} };
    playSound("item");
    addLog(`墓標に祈った。前の死で失った素材が手元に戻った：${graveText}`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !graveText });
  graveButton.setAttribute?.("data-chapel-grave", graveText ? "filled" : "empty");
}

// Brood chamber: smash the eggs to wake the keeper; its hoard is a chest.
function renderBroodChamber(optGrid, cell) {
  addDescription(optGrid, "卵を壊せば、巣の主が目を覚ます。手強い相手だ。倒せば、卵室に積まれた荷が手に入る。逃げたら、卵室はもう使えない。");
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
  addDescription(optGrid, "鍛え直した武器は、しばらくのあいだ威力が増す。");
  addMaterialShortage(optGrid, "くべる素材が足りない", FORGE_MATERIAL_COST);
  addButton(optGrid, `武器を鍛え直す（素材${FORGE_MATERIAL_COST}個・${FORGE_TEMPER_BATTLES}戦のあいだ攻撃力+${bonus}）`, () => {
    const paid = payRunMaterials(FORGE_MATERIAL_COST);
    if (!paid) return;
    const temper = applyForgeTemper(hero, weaponAtk);
    playSound("item");
    addLog(`炉に${paid}をくべた。武器が赤く輝く！（攻撃力+${temper.bonus}、${temper.battles}戦）`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || hero.forgeTemper || materials < FORGE_MATERIAL_COST });
}

// Smith's forge (#2021): the temper holds longer, or (once bought) the
// equipped weapon is reforged one grade up. Either one spends the room.
function renderSmithForge(optGrid, cell) {
  const hero = getHero();
  const weaponAtk = hero ? getCharWeaponAtk(hero) : 0;
  const bonus = getForgeTemperAmount(weaponAtk);
  const materials = runMaterialCount();
  const canReforge = isFacilityNodeBought(state.facilities, "smith_reforge");
  const weapon = hero?.equipment?.weapon || null;
  const reforgedLevel = weapon ? getReforgedLevel(weapon) : null;
  addDescription(optGrid, canReforge
    ? `武器を鍛え直すか、打ち直すか、どちらか一方。鍛え直しはしばらくのあいだ攻撃力を上げ、打ち直しは武器そのものを一段強くする（+${REFORGE_MAX_LEVEL}まで）。`
    : "この炉で鍛え直した武器は、いつもより長く威力が続く。");
  addMaterialShortage(optGrid, "くべる素材が足りない", FORGE_MATERIAL_COST);
  addButton(optGrid, `武器を鍛え直す（素材${FORGE_MATERIAL_COST}個・${SMITH_TEMPER_BATTLES}戦のあいだ攻撃力+${bonus}）`, () => {
    const paid = payRunMaterials(FORGE_MATERIAL_COST);
    if (!paid) return;
    const temper = applyForgeTemper(hero, weaponAtk, SMITH_TEMPER_BATTLES);
    playSound("item");
    addLog(`鍛冶師の炉に${paid}をくべた。武器が赤く輝く！（攻撃力+${temper.bonus}、${temper.battles}戦）`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || hero.forgeTemper || materials < FORGE_MATERIAL_COST });
  if (!canReforge) return;
  const label = reforgedLevel === null
    ? (weapon ? `武器を打ち直す（これ以上は上がらない）` : "武器を打ち直す（武器を装備していない）")
    : `武器を打ち直す（素材${REFORGE_MATERIAL_COST}個・強化値+${reforgedLevel}へ）`;
  const reforgeButton = addButton(optGrid, label, () => {
    const paid = payRunMaterials(REFORGE_MATERIAL_COST);
    if (!paid) return;
    const reforged = convertToEquipObject(weapon);
    reforged.enhanceLevel = reforgedLevel;
    replaceRunObjectLoot(state, weapon, reforged);
    hero.equipment.weapon = reforged;
    // The weapon keeps its identity as a medium: its runes stay set.
    syncMediumState(hero, { preserveRunes: true });
    playSound("level_up");
    addLog(`鍛冶師の炉に${paid}をくべ、武器を打ち直した。${getItemData(reforged)?.name || "武器"}になった。`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || reforgedLevel === null || materials < REFORGE_MATERIAL_COST });
  reforgeButton.setAttribute?.("data-smith-reforge", "true");
}

// Oath altar (#2021): the mirror as before, or an oath: full recovery now,
// and nothing carried is banked if the run then dies or is abandoned. With
// the mirror gallery the vision is free and reaches two floors ahead.
function renderOathAltar(optGrid, cell) {
  const hero = getHero();
  const run = state.currentRun;
  const hasGallery = isFacilityNodeBought(state.facilities, "hall_gallery");
  const cost = hero && !hasGallery ? getMirrorHpCost(hero, getCharMaxHp(hero)) : 0;
  const maxHp = hero ? getCharMaxHp(hero) : 0;
  const maxMp = hero ? getCharMaxMp(hero) : 0;
  addDescription(optGrid, `鏡を覗くか、誓約を立てるか、どちらか一方。${hasGallery
    ? "回廊の鏡は生気を奪わず、2つ先の階まで下り階段の場所を映す。"
    : "鏡は生気と引き換えに、次の階の下り階段の場所を映す。"}誓約を立てればHPとMPがすべて戻るが、この冒険で死ぬか断念すると、手持ちの素材は1つも街に残らない。`);
  addButton(optGrid, hasGallery ? "鏡の回廊を覗く（2階先まで）" : `鏡を覗く（HP${cost}）`, () => {
    hero.hp -= cost;
    getSpecialRoom(cell).vision = hasGallery ? GALLERY_VISION_FLOORS : 1;
    finishRoom(cell);
    applyMirrorVision(state, state.floor + 1);
    playSound("bump");
    addLog(hasGallery
      ? "鏡の回廊を覗いた。次の階とその次の階の下り階段の景色が、目に焼き付いた。"
      : `鏡に生気を吸われた（HP-${cost}）。次の階の下り階段の景色が、目に焼き付いた。`);
    closeSubmenu();
  }, { disabled: !hero || (!hasGallery && cost <= 0) });
  const oathButton = addButton(optGrid, "誓約を立てる（HP・MP全回復／死ねば素材は残らない）", () => {
    hero.hp = maxHp;
    hero.mp = maxMp;
    run.oath = true;
    playSound("heal");
    addLog("祭壇に誓った。生きて帰る、と。傷が塞がり、力が満ちた。");
    addLog("誓約を立てた。この冒険で死ぬか断念すると、手持ちの素材は1つも街に残らない。");
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || !run || run.oath === true });
  oathButton.setAttribute?.("data-oath", "true");
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

/** What every rescue has in common, said in every keeper's room. */
const RESCUE_TERMS = "生きて街まで連れ帰れば、きっと力になってくれる。";

// A waiting keeper (#2009, #2018): free them and they follow. They only count
// as rescued once the run walks out of the dungeon with them (#2062).
function addCompanion(facility) {
  const run = state.currentRun;
  if (run) run.companions = normalizeCompanions([...(run.companions || []), facility.companion.id]);
  playSound("item");
  addLog(`${facility.companion.name}が同行する。連れて歩いて地上へ出れば、街に${facility.name}が開く。帰還の翼では連れて帰れない。戦いには加わらない。`);
}

// Digging costs turns and noise like a vein and can be interrupted; progress
// stays on the room.
function digOutKeeper(cell, facility) {
  const room = getSpecialRoom(cell);
  const turns = facility.site.rescue.turns;
  createNoiseEvent(state.x, state.y);
  addLog("崩れた岩を掘り始めた。つるはしの音が坑道に響く…");
  while ((room.progress || 0) < turns) {
    const turn = consumeExplorationTurn();
    room.progress = (room.progress || 0) + 1;
    markMapChanged();
    if (room.progress >= turns) break;
    if (!turn.ok || turn.wiped || turn.encounter || state.gameState !== "explore") {
      addLog(`掘り出しが中断された。残りは${turns - room.progress}手番分だ。`);
      saveAutosave();
      return;
    }
  }
  addLog(`${facility.companion.name}を掘り出した！「恩に着る。街まで連れて行ってくれ」`);
  addCompanion(facility);
  finishRoom(cell);
}

function renderDigRescue(optGrid, cell, facility) {
  const room = getSpecialRoom(cell);
  const left = facility.site.rescue.turns - (room.progress || 0);
  addDescription(optGrid, `${facility.companion.name}を掘り出すには時間がかかり、つるはしの音も響く。${RESCUE_TERMS}`);
  addButton(optGrid, `岩を掘って助け出す（${left}手番・物音）`, () => {
    closeSubmenu();
    digOutKeeper(cell, facility);
  });
}

// A seal or a mirror takes blood: a share of max HP, never the last point.
// The facility data words it; `{cost}` is the HP it takes right now.
function renderBloodRescue(optGrid, cell, facility) {
  const hero = getHero();
  const rescue = facility.site.rescue;
  const cost = hero ? getRescueBloodCost(hero, getCharMaxHp(hero), rescue.hpRate) : 0;
  const worded = text => text.replaceAll("{cost}", String(cost));
  addDescription(optGrid, `${worded(rescue.prompt)}${RESCUE_TERMS}`);
  addButton(optGrid, worded(rescue.action), () => {
    hero.hp -= cost;
    addLog(worded(rescue.done));
    addCompanion(facility);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || cost <= 0 });
  if (hero && cost <= 0) addDescription(optGrid, rescue.shortage);
}

// A cold furnace takes fuel: carried materials, like the forge's temper.
function renderFuelRescue(optGrid, cell, facility) {
  const cost = facility.site.rescue.materials;
  const materials = runMaterialCount();
  addDescription(optGrid, `炉に火を入れれば、鉄の扉が開いて${facility.companion.name}が出てこられる。${RESCUE_TERMS}`);
  addButton(optGrid, `素材をくべて火を入れる（素材${cost}個）`, () => {
    const paid = payRunMaterials(cost);
    if (!paid) return;
    addLog(`炉に${paid}をくべた。火が入り、鉄の扉が開いた。${facility.companion.name}が出てきた。「助かった。街まで頼む」`);
    addCompanion(facility);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: materials < cost });
  addMaterialShortage(optGrid, "くべる素材が足りない", cost);
}

// Draining a flooded room is quiet work: turns only, and it can be
// interrupted; progress stays on the room.
function drainForKeeper(cell, facility) {
  const room = getSpecialRoom(cell);
  const turns = facility.site.rescue.turns;
  addLog("水門の輪を回し始めた。水がゆっくりと引いていく…");
  while ((room.progress || 0) < turns) {
    const turn = consumeExplorationTurn();
    room.progress = (room.progress || 0) + 1;
    markMapChanged();
    if (room.progress >= turns) break;
    if (!turn.ok || turn.wiped || turn.encounter || state.gameState !== "explore") {
      addLog(`水抜きが中断された。残りは${turns - room.progress}手番分だ。`);
      saveAutosave();
      return;
    }
  }
  addLog(`水が引き、${facility.companion.name}が書棚から降りてきた。「助かった。街まで連れて行ってほしい」`);
  addCompanion(facility);
  finishRoom(cell);
}

function renderDrainRescue(optGrid, cell, facility) {
  const room = getSpecialRoom(cell);
  const left = facility.site.rescue.turns - (room.progress || 0);
  addDescription(optGrid, `水門を回せば水は抜け、${facility.companion.name}が降りてこられる。時間はかかるが、音は立たない。${RESCUE_TERMS}`);
  addButton(optGrid, `水門を回して水を抜く（${left}手番）`, () => {
    closeSubmenu();
    drainForKeeper(cell, facility);
  });
}

// The cocoon hangs in the brood chamber: cutting it wakes the keeper of the
// nest. The room is spent only by winning; `freeKeeperAfterFight` finishes
// the rescue from the victory.
function renderFightRescue(optGrid, cell, facility) {
  addDescription(optGrid, `繭の中にいるのは${facility.companion.name}だ。繭を切れば、巣の主が目を覚ます。手強い相手だ。倒せば${facility.companion.name}は自由になり、卵室に積まれた荷も手に入る。逃げても繭は残り、また挑める。${RESCUE_TERMS}`);
  addButton(optGrid, "繭を切る（強敵と戦う）", () => {
    closeSubmenu();
    addLog("繭に刃を入れた。奥で巨大な影が身を起こす！");
    startCombat(false, false, false, null, { broodChamber: true });
  });
}

const RESCUE_RENDERERS = {
  dig: renderDigRescue,
  blood: renderBloodRescue,
  drain: renderDrainRescue,
  fight: renderFightRescue,
  fuel: renderFuelRescue
};

function renderKeeperRoom(optGrid, cell) {
  const facility = KEEPER_ROOM_FACILITY.get(getSpecialRoom(cell).kind);
  RESCUE_RENDERERS[facility.site.rescue.kind]?.(optGrid, cell, facility);
}

// Weaver's hammock (#2019): a rest that takes turns, or (once bought) a mend
// that patches the armor for a few battles. Either one spends the room.
function restInHammock(cell) {
  const room = getSpecialRoom(cell);
  addLog("吊り寝床に体を預けた。糸がゆっくりと揺れる…");
  while ((room.progress || 0) < HAMMOCK_REST_TURNS) {
    const turn = consumeExplorationTurn();
    room.progress = (room.progress || 0) + 1;
    markMapChanged();
    if (room.progress >= HAMMOCK_REST_TURNS) break;
    if (!turn.ok || turn.wiped || turn.encounter || state.gameState !== "explore") {
      addLog(`休息が中断された。残りは${HAMMOCK_REST_TURNS - room.progress}手番分だ。`);
      saveAutosave();
      return;
    }
  }
  const hero = getHero();
  const healed = hero ? getHammockRestAmount(hero, getCharMaxHp(hero)) : 0;
  if (hero) hero.hp += healed;
  playSound("heal");
  addLog(`吊り寝床で休んだ。HPが${healed}回復した。`);
  finishRoom(cell);
}

function renderWeaverHammock(optGrid, cell) {
  const room = getSpecialRoom(cell);
  const hero = getHero();
  const left = HAMMOCK_REST_TURNS - (room.progress || 0);
  const healed = hero ? getHammockRestAmount(hero, getCharMaxHp(hero)) : 0;
  const canMend = isFacilityNodeBought(state.facilities, "weaver_mending");
  const materials = runMaterialCount();
  const equipmentDef = hero ? getCharEquipmentDef(hero) : 0;
  const mendBonus = getArmorMendAmount(equipmentDef);
  addDescription(optGrid, canMend
    ? "ひと休みするか、防具を繕ってもらうか、どちらか一方。使えるのは、この冒険で一度きり。"
    : "ここでひと休みできる。途中で魔物に襲われたら、休みは切り上げになる。使えるのは、この冒険で一度きり。");
  addButton(optGrid, `吊り寝床で休む（${left}手番・HP+${healed}）`, () => {
    closeSubmenu();
    restInHammock(cell);
  }, { disabled: !hero || healed <= 0 });
  if (!canMend) return;
  addMaterialShortage(optGrid, "繕ってもらうには素材が足りない", MENDING_MATERIAL_COST);
  const mendButton = addButton(optGrid, `防具を繕う（素材${MENDING_MATERIAL_COST}個・${MENDING_BATTLES}戦のあいだ防御力+${mendBonus}）`, () => {
    const paid = payRunMaterials(MENDING_MATERIAL_COST);
    if (!paid) return;
    const mend = applyArmorMend(hero, equipmentDef);
    playSound("item");
    addLog(`繕い台に${paid}を渡した。防具の綻びが繕われた！（防御力+${mend.bonus}、${mend.battles}戦）`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || Boolean(hero.armorMend) || materials < MENDING_MATERIAL_COST || (room.progress || 0) > 0 });
  mendButton.setAttribute?.("data-hammock-mend", "true");
}

// Scribe's reading room (#2019): the floor plan also shows the next floor's
// down stairs, or (once bought) a manuscript is copied for a fragment.
function renderScribeReadingRoom(optGrid, cell) {
  const canCopy = isFacilityNodeBought(state.facilities, "scribe_copy_desk");
  addDescription(optGrid, canCopy
    ? "見取り図を読むか、写本を写すか、どちらか一方。見取り図には、この階の下り階段と宝箱、それに次の階の下り階段が載っている。"
    : "見取り図には、この階の下り階段とまだ開けていない宝箱、それに次の階の下り階段が載っている。");
  addButton(optGrid, `見取り図を読む（${READING_TURNS}手番）`, () => {
    closeSubmenu();
    for (let turn = 0; turn < READING_TURNS; turn++) {
      const result = consumeExplorationTurn();
      if (!result.ok || result.wiped || state.gameState !== "explore") break;
    }
    const { stairs, chests } = getReadingRoomTargets(state.map);
    revealCells(state.visitedMap, [...stairs, ...chests]);
    // The next floor's stairs are shown when that floor is entered, the way
    // a mirror's vision is.
    getSpecialRoom(cell).vision = true;
    finishRoom(cell);
    applyMirrorVision(state, state.floor + 1);
    playSound("item");
    const stairsText = stairs[0] ? `下り階段は${describeDirection(state, stairs[0])}にある。` : "";
    addLog(`見取り図を写し取った。${stairsText}宝箱${chests.length}個の位置が地図に記された。次の階の下り階段も書き留めた。`);
  });
  if (!canCopy) return;
  const copyButton = addButton(optGrid, `写本を写す（${COPY_TURNS}手番・手引き書の断片${COPY_FRAGMENTS}枚）`, () => {
    closeSubmenu();
    for (let turn = 0; turn < COPY_TURNS; turn++) {
      const result = consumeExplorationTurn();
      if (!result.ok || result.wiped || state.gameState !== "explore") break;
    }
    const fragments = addRunFragments(state.currentRun, COPY_FRAGMENTS);
    finishRoom(cell);
    playSound("item");
    addLog(`写本台で頁を写し取った。手引き書の断片を${fragments}枚手に入れた（生還すれば持ち帰れる）。`);
  });
  copyButton.setAttribute?.("data-scribe-copy", "true");
}

// Miner outpost (#2010): one supply per run, or a blast once the guild sells
// it. Either one spends the room. The supply is dungeon loot: it is used in
// this run and never returns to storage.
function renderMinerOutpost(optGrid, cell) {
  const bagFull = !hasInventorySpace(state.inventory);
  const canBlast = isFacilityNodeBought(state.facilities, "miner_blast");
  addDescription(optGrid, canBlast
    ? "補給を1つ受け取るか、発破を頼むか、どちらか一方。応じてくれるのは、この冒険で一度きり。"
    : "補給を1つ分けてくれる。応じてくれるのは、この冒険で一度きり。");
  OUTPOST_SUPPLY_ITEM_IDS.forEach(itemId => {
    const name = String(ITEMS[itemId]?.name || itemId).replace(/\s*[（(].*?[）)]/g, "");
    addButton(optGrid, `${name}を受け取る`, () => {
      if (!addInventoryItem(itemId, { dungeonLoot: true, source: "special_room" })) return;
      playSound("item");
      addLog(`詰所の坑夫から${name}を受け取った。`);
      finishRoom(cell);
      closeSubmenu();
    }, { disabled: bagFull });
  });
  if (bagFull) addDescription(optGrid, "バッグが満杯で、補給は受け取れない。");
  if (!canBlast) return;
  addButton(optGrid, "発破を頼む（瓦礫を一掃・大きな物音）", () => {
    const cleared = clearFloorRubble(state.map);
    const { stairs } = getReadingRoomTargets(state.map);
    revealCells(state.visitedMap, stairs);
    createNoiseEvent(state.x, state.y, OUTPOST_BLAST_NOISE_TTL);
    playSound("bump");
    const stairsText = stairs[0] ? `下り階段は${describeDirection(state, stairs[0])}にある。` : "";
    addLog(`轟音が坑道を揺らした。${cleared > 0 ? `瓦礫${cleared}か所が吹き飛んだ。` : "この階に瓦礫は残っていなかった。"}${stairsText}`);
    addLog("発破の音が階じゅうに響いた。魔物が集まってくるかもしれない。");
    finishRoom(cell);
    closeSubmenu();
  });
}

const ROOM_RENDERERS = {
  [SPECIAL_ROOMS.MINE_VEIN]: renderMineVein,
  [SPECIAL_ROOMS.ALTAR]: renderAltar,
  [SPECIAL_ROOMS.BROOD_CHAMBER]: renderBroodChamber,
  [SPECIAL_ROOMS.READING_ROOM]: renderReadingRoom,
  [SPECIAL_ROOMS.FORGE]: renderForge,
  [SPECIAL_ROOMS.MIRROR_HALL]: renderMirrorHall,
  [SPECIAL_ROOMS.TRAPPED_FOREMAN]: renderKeeperRoom,
  [SPECIAL_ROOMS.MINER_OUTPOST]: renderMinerOutpost,
  [SPECIAL_ROOMS.SEALED_PRIEST]: renderKeeperRoom,
  [SPECIAL_ROOMS.CHAPEL_ALTAR]: renderChapelAltar,
  [SPECIAL_ROOMS.COCOONED_WEAVER]: renderKeeperRoom,
  [SPECIAL_ROOMS.WEAVER_HAMMOCK]: renderWeaverHammock,
  [SPECIAL_ROOMS.STRANDED_SCRIBE]: renderKeeperRoom,
  [SPECIAL_ROOMS.SCRIBE_READING_ROOM]: renderScribeReadingRoom,
  [SPECIAL_ROOMS.COLD_FORGE]: renderKeeperRoom,
  [SPECIAL_ROOMS.SMITH_FORGE]: renderSmithForge,
  [SPECIAL_ROOMS.MIRROR_CAPTIVE]: renderKeeperRoom,
  [SPECIAL_ROOMS.OATH_ALTAR]: renderOathAltar
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
