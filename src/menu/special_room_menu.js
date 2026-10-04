// Biome special rooms (#1965): one choice menu per room kind. Each option
// spends something the run already tracks (turns and noise, materials, HP,
// or a fight) and the room is used once.
import { state, addLog, saveAutosave, markMapChanged, addInventoryItem, hasInventorySpace } from "../state.js";
import { playSound } from "../audio.js";
import { closeSubmenu } from "../navigation.js";
import { getCharMaxHp, getCharMaxMp } from "../data.js";
import { getCharEquipmentDef, getCharWeaponAtk } from "../rules/character_stats.js";
import { addRunFragments } from "../systems/guidebook.js";
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
import {
  ALTAR_CLEANSE_MATERIAL_COST,
  COPY_FRAGMENTS,
  COPY_TURNS,
  HAMMOCK_REST_TURNS,
  MENDING_BATTLES,
  MENDING_MATERIAL_COST,
  FORGE_MATERIAL_COST,
  FORGE_TEMPER_BATTLES,
  OUTPOST_BLAST_NOISE_TTL,
  OUTPOST_SUPPLY_ITEM_IDS,
  READING_TURNS,
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
  getArmorMendAmount,
  getHammockRestAmount,
  getForgeTemperAmount,
  getMirrorHpCost,
  getOfferingChoices,
  getReadingRoomTargets,
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
  return bloodCost;
}

function renderAltar(optGrid, cell) {
  const hero = getHero();
  const bloodCost = hero ? getAltarBloodCost(hero, getCharMaxHp(hero)) : 0;
  addDescription(optGrid, `浄め：素材${ALTAR_CLEANSE_MATERIAL_COST}個を捧げて状態異常を消す。血の祝福：HP${bloodCost}を捧げてMPを満たす。祭壇は一度しか応えない。`);
  addAltarOptions(optGrid, cell);
}

// Chapel altar (#2018): the altar's own options, an offering that sends one
// kind of carried material home for good, and (once bought) the grave that
// returns part of what the last death lost. One answer per run, like the altar.
function renderChapelAltar(optGrid, cell) {
  const run = state.currentRun;
  const hasGrave = isFacilityNodeBought(state.facilities, "chapel_grave");
  addDescription(optGrid, `浄め・血の祝福に加えて、献灯を選べる。献灯：手持ちの素材から1種類を最大${CHAPEL_OFFERING_LIMIT}個、街へ送る。送った素材は、その後に死んでも街に届く。${hasGrave ? "墓標に祈ると、前の死で失った素材の一部が戻る。" : ""}祭壇が応じるのは潜行ごとに1回だけ。`);
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
    addLog(`墓標に祈った。前の死で失った素材が手元に戻った。 [${graveText}]`);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !graveText });
  graveButton.setAttribute?.("data-chapel-grave", graveText ? "filled" : "empty");
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

// A waiting keeper (#2009, #2018): free them and they follow. They only count
// as rescued once the run walks out by the Portal or the Wing.
function addCompanion(facility) {
  const run = state.currentRun;
  if (run) run.companions = normalizeCompanions([...(run.companions || []), facility.companion.id]);
  playSound("item");
  addLog(`${facility.companion.name}が同行する。帰還の門か帰還の翼で生還すれば、街に${facility.name}が開く。`);
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
  addDescription(optGrid, `崩れた岩の向こうに${facility.companion.name}が閉じ込められている。掘り出すと${left}手番かかり、物音が立つ。助けた後は同行するが、戦いには加わらない。生還して初めて救出になり、死ねば連れ帰れない。`);
  addButton(optGrid, `岩を掘って助け出す（${left}手番）`, () => {
    closeSubmenu();
    digOutKeeper(cell, facility);
  });
}

// A seal takes blood: a share of max HP, never the last point.
function renderBloodRescue(optGrid, cell, facility) {
  const hero = getHero();
  const cost = hero ? getRescueBloodCost(hero, getCharMaxHp(hero), facility.site.rescue.hpRate) : 0;
  addDescription(optGrid, `祭壇の封印の奥に${facility.companion.name}が閉じ込められている。封印は血でしか解けない（HP${cost}）。助けた後は同行するが、戦いには加わらない。生還して初めて救出になり、死ねば連れ帰れない。`);
  addButton(optGrid, `血を捧げて封印を解く（HP${cost}）`, () => {
    hero.hp -= cost;
    addLog(`封印に血を捧げた（HP-${cost}）。${facility.companion.name}が祭壇の奥から歩み出た。「助かりました。街までお連れください」`);
    addCompanion(facility);
    finishRoom(cell);
    closeSubmenu();
  }, { disabled: !hero || cost <= 0 });
  if (hero && cost <= 0) addDescription(optGrid, "いまのHPでは、封印に捧げる血が足りない。");
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
  addDescription(optGrid, `水の引かない閲覧室に${facility.companion.name}が取り残されている。水門を回して水を抜くと${left}手番かかる。物音は立たない。助けた後は同行するが、戦いには加わらない。生還して初めて救出になり、死ねば連れ帰れない。`);
  addButton(optGrid, `水門を回して水を抜く（${left}手番）`, () => {
    closeSubmenu();
    drainForKeeper(cell, facility);
  });
}

// The cocoon hangs in the brood chamber: cutting it wakes the keeper of the
// nest. The room is spent only by winning; `freeKeeperAfterFight` finishes
// the rescue from the victory.
function renderFightRescue(optGrid, cell, facility) {
  addDescription(optGrid, `繭の中に${facility.companion.name}が囚われている。繭を切れば巣の主（この階のエリート級）が目を覚ます。倒せば${facility.companion.name}は自由になり、卵室の荷（宝箱）も手に入る。逃げた場合は、繭は残り、もう一度挑める。助けた後は同行するが、戦いには加わらない。生還して初めて救出になり、死ねば連れ帰れない。`);
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
  fight: renderFightRescue
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
    ? `休む（${left}手番、HP+${healed}）か、防具を繕う（素材${MENDING_MATERIAL_COST}個、次の${MENDING_BATTLES}戦のあいだ防御力+${mendBonus}）か、どちらか一方を選べる。寝床が使えるのは潜行ごとに1回だけ。所持素材：${materials}個`
    : `休むと${left}手番かかり、HPが${healed}回復する。途中で魔物に襲われると中断する。寝床が使えるのは潜行ごとに1回だけ。`);
  addButton(optGrid, `吊り寝床で休む（${left}手番・HP+${healed}）`, () => {
    closeSubmenu();
    restInHammock(cell);
  }, { disabled: !hero || healed <= 0 });
  if (!canMend) return;
  const mendButton = addButton(optGrid, `防具を繕う（素材${MENDING_MATERIAL_COST}個・防御力+${mendBonus}）`, () => {
    const paid = payRunMaterials(MENDING_MATERIAL_COST);
    if (!paid) return;
    const mend = applyArmorMend(hero, equipmentDef);
    playSound("item");
    addLog(`繕い台に [${paid}] を渡した。防具の綻びが繕われた！（防御力+${mend.bonus}、${mend.battles}戦）`);
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
    ? `見取り図を読む（${READING_TURNS}手番）か、写本を写す（${COPY_TURNS}手番、手引き書の断片${COPY_FRAGMENTS}枚）か、どちらか一方を選べる。見取り図には、この階の下り階段と宝箱に加えて、次の階の下り階段も記されている。`
    : `見取り図を読むと${READING_TURNS}手番かかる。この階の下り階段と、まだ開けていない宝箱の位置に加えて、次の階の下り階段も地図に記される。`);
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
  const copyButton = addButton(optGrid, `写本を写す（${COPY_TURNS}手番・断片${COPY_FRAGMENTS}枚）`, () => {
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
    ? "補給を1つ受け取るか、発破を頼むか、どちらか一方を選べる。詰所が応じるのは潜行ごとに1回だけ。"
    : "補給を1つ受け取れる。詰所が応じるのは潜行ごとに1回だけ。");
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
    addLog("[物音] 発破の音が階じゅうに響いた。魔物が集まってくるかもしれない。");
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
  [SPECIAL_ROOMS.SCRIBE_READING_ROOM]: renderScribeReadingRoom
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
