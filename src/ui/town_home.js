import { state, getStartingKit } from "../state.js";
import { formatFeatProgress, getNearestFeats, listFeats } from "../systems/feats.js";
import { getOpenFacilityOrder, listFacilityNodes, listTownFacilities } from "../systems/facilities.js";
import { getNextGuidebookPage, listGuidebookPages } from "../systems/guidebook.js";
import { formatDungeonFloor } from "../rules/dungeons.js";
import {
  TOWN_BUILDING_AREAS, TOWN_FACILITY_PLOTS, getFacilityArea, paintTownScene, toSceneBox
} from "./town_scene.js";

function outcomeLabel(run) {
  if (run?.outcome === "death" || run?.returnReason === "gameover") return "死亡";
  if (run?.outcome === "abandon" || run?.returnReason === "abandon") return "断念";
  if (run?.returnReason === "escape_scroll") return "帰還の翼で帰還";
  if (run?.returnReason === "milestone_portal") return "帰還の門から帰還";
  if (run?.returnReason === "surface") return "歩いて地上へ帰還";
  return "帰還";
}

function outcomeClass(run) {
  const outcome = outcomeLabel(run);
  return outcome === "死亡" ? "death" : outcome === "断念" ? "abandon" : "returned";
}

function floorLabel(floor) {
  return Number(floor) > 0 ? formatDungeonFloor(Number(floor)) : "未記録";
}

function fragmentNode() {
  return typeof document.createDocumentFragment === "function"
    ? document.createDocumentFragment()
    : document.createElement("span");
}

function runFactLabel(run) {
  const startingKit = run?.startingKit ? getStartingKit(run.startingKit)?.name : null;
  if (startingKit) return `開始キット: ${startingKit}`;
  const representative = run?.representativeItem?.name || run?.meaningfulItemHistory?.[0]?.name;
  if (representative) return `この冒険を象徴する品: ${representative}`;
  return "記録に残した";
}

function returnedMaterialCount(run) {
  return Object.values(run?.bankedMaterials || {}).reduce(
    (total, quantity) => total + Math.max(0, Number(quantity) || 0), 0
  );
}

function getLastRunSummary(run) {
  if (!run) {
    const empty = document.createElement("p");
    empty.className = "town-last-run-empty";
    empty.textContent = "まだ冒険の記録はありません。次の冒険が最初の一頁になります。";
    return empty;
  }

  const outcome = outcomeLabel(run);
  const lost = outcome === "死亡" || outcome === "断念";
  const status = document.createElement("div");
  status.className = `town-last-run-status ${outcomeClass(run)}`;
  const statusLabel = document.createElement("strong");
  statusLabel.textContent = outcome;
  const detail = document.createElement("span");
  detail.textContent = `${floorLabel(run.deepestFloor)}まで / ${runFactLabel(run)}`;
  status.appendChild(statusLabel);
  status.appendChild(detail);
  const fact = document.createElement("p");
  fact.className = "town-last-run-fact";
  // Carried-in supplies are mentioned only when the run had some to lose or
  // bring back.
  const materials = `素材 ${returnedMaterialCount(run)}個`;
  if (lost) {
    fact.textContent = run.lostSupplyCount > 0
      ? `${materials}を持ち帰り、未使用の持ち込み品は失いました。`
      : `${materials}を持ち帰りました。`;
  } else {
    fact.textContent = run.returnedSupplyCount > 0
      ? `${materials}と未使用の持ち込み品を持ち帰りました。`
      : `${materials}を持ち帰りました。`;
  }
  const fragment = fragmentNode();
  fragment.appendChild(status);
  fragment.appendChild(fact);
  return fragment;
}

// Without a recorded run there is no adventure record to read yet, so the
// castle entry is presented as the records/settings visit it still is.
const CASTLE_ENTRY_COPY = {
  record: { label: "冒険記録を見る", detail: "おしろ — 何が起きたか" },
  empty: { label: "おしろを訪ねる", detail: "通算記録と設定" },
};

function renderCastleEntry(hasRecord) {
  const castle = document.getElementById("btn-town-castle");
  if (typeof castle?.querySelector !== "function") return;
  const copy = hasRecord ? CASTLE_ENTRY_COPY.record : CASTLE_ENTRY_COPY.empty;
  const label = castle.querySelector("[data-town-castle-label]");
  const detail = castle.querySelector("[data-town-castle-detail]");
  if (label) label.textContent = copy.label;
  if (detail) detail.textContent = copy.detail;
}

// The tavern counts the feats; its board's nearest notice is told in a line
// under the picture, so the town always shows something within reach (#2007,
// #2107). The full list is inside the tavern.
function renderFeatSummary() {
  const entries = listFeats(state.feats);
  const detail = typeof document.querySelector === "function"
    ? document.querySelector("[data-town-feats-detail]")
    : null;
  if (detail) detail.textContent = `達成 ${entries.filter(entry => entry.completed).length} / ${entries.length}`;
  const line = document.getElementById("town-board-line");
  if (!line) return;
  const [nearest] = getNearestFeats(state.feats, null, 1);
  line.hidden = !nearest;
  if (!nearest) return;
  line.setAttribute?.("data-feat-id", nearest.feat.id);
  line.textContent = `酒場の掲示板には「${nearest.feat.name}」（${formatFeatProgress(nearest.feat, nearest.progress)}）の貼り紙。`;
}

let renderedFacilitySignature = null;

function placeOver(element, area) {
  if (!element?.style) return;
  Object.assign(element.style, toSceneBox(area));
}

// Each building's button covers the building drawn in the picture.
function placeBuildings() {
  if (typeof document.querySelectorAll !== "function") return;
  document.querySelectorAll("[data-town-building]").forEach(building => {
    const area = TOWN_BUILDING_AREAS[building.getAttribute("data-town-building")];
    if (area) placeOver(building, area);
  });
}

// One house per facility along the front street: lit once its keeper is home,
// dark with "？？？" while the next keeper still waits below (#2009, #2018,
// #2107). The hint for the one still waiting is pinned to the board as a rumour.
function renderFacilities() {
  const container = document.getElementById("town-facilities");
  if (!container) return;
  const entries = listTownFacilities(state.feats);
  const signature = entries
    .map(({ facility, open }) => `${facility.id}:${open ? listFacilityNodes(facility.id, { facilities: state.facilities, feats: state.feats, metaMaterials: {} }).filter(entry => entry.bought).length : "locked"}:${getOpenFacilityOrder(state.facilities, facility.id) ? "order" : ""}`)
    .join("|");
  if (signature === renderedFacilitySignature && container.firstChild) return;
  renderedFacilitySignature = signature;
  const picture = document.getElementById("town-scene-picture");
  if (picture) {
    const statuses = TOWN_FACILITY_PLOTS.map((_, index) => {
      const entry = entries[index];
      return entry ? (entry.open ? "open" : "waiting") : "empty";
    });
    paintTownScene(picture, statuses);
  }
  placeBuildings();
  const nodes = entries.map(({ facility, open }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `town-building town-facility${open ? "" : " is-locked"}`;
    button.setAttribute?.("data-facility-id", facility.id);
    button.setAttribute?.("data-facility-open", String(open));
    button.disabled = !open;
    placeOver(button, getFacilityArea(index));
    const name = document.createElement("span");
    name.className = "town-plaque";
    const detail = document.createElement("span");
    detail.className = "sr-only";
    if (open) {
      const bought = listFacilityNodes(facility.id, { facilities: state.facilities, feats: state.feats, metaMaterials: {} })
        .filter(entry => entry.bought).length;
      name.textContent = facility.name;
      const ordering = getOpenFacilityOrder(state.facilities, facility.id) ? "・仕込み中" : "";
      // Who is there and how much of what they offer is in place.
      const total = facility.nodes.length;
      const progress = bought >= total
        ? "すべて解放した"
        : bought > 0 ? `${total}つのうち${bought}つを解放` : "まだ何も解放していない";
      detail.textContent = `${facility.keeper}がいる。${progress}${ordering}`;
    } else {
      name.textContent = "？？？";
      detail.textContent = facility.lockedHint;
    }
    button.appendChild(name);
    button.appendChild(detail);
    return button;
  });
  container.replaceChildren(...nodes);
  renderRumors(entries);
}

// Whoever still waits below is a rumour told under the previous run.
function renderRumors(entries) {
  const container = document.getElementById("town-rumors");
  if (!container) return;
  const waiting = entries.find(entry => !entry.open);
  container.textContent = waiting ? `噂では、${waiting.facility.lockedHint}` : "";
  container.hidden = !waiting;
}

function renderGuidebookEntry() {
  const detail = typeof document.querySelector === "function"
    ? document.querySelector("[data-town-guidebook-detail]")
    : null;
  if (!detail) return;
  const pages = listGuidebookPages(state.guidebook);
  const fragments = Math.max(0, Math.floor(Number(state.guidebook?.fragments) || 0));
  const next = getNextGuidebookPage(state.guidebook);
  const ready = next && fragments >= next.cost ? "・解読できる頁がある" : "";
  detail.textContent = `断片 ${fragments}枚・解読 ${pages.filter(entry => entry.decoded).length} / ${pages.length}頁${ready}`;
}

export function renderTownHome() {
  renderFeatSummary();
  renderFacilities();
  renderGuidebookEntry();
  const summary = document.getElementById("town-last-run-summary");
  if (!summary) return;
  const lastRun = Array.isArray(state.runHistory) ? state.runHistory[0] : null;
  summary.replaceChildren(getLastRunSummary(lastRun));
  const section = typeof summary.closest === "function" ? summary.closest(".town-home-last-run") : null;
  if (section?.dataset) section.dataset.empty = lastRun ? "false" : "true";
  renderCastleEntry(Boolean(lastRun));
}
