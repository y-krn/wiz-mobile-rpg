import { state, getStartingKit } from "../state.js";
import { getNearestFeats, listFeats } from "../systems/feats.js";
import { createFeatCard } from "./feat_card.js";
import { getOpenFacilityOrder, listFacilityNodes, listTownFacilities } from "../systems/facilities.js";
import { getNextGuidebookPage, listGuidebookPages } from "../systems/guidebook.js";
import { getDungeonForFloor, getDungeonFloor } from "../rules/dungeons.js";
import { MATERIAL_TYPES } from "../data/materials.js";
import { getRunLossCopy, hasMaterialRecord } from "./run_loss_copy.js";

function outcomeLabel(run) {
  if (run?.outcome === "death" || run?.returnReason === "gameover") return "死亡";
  if (run?.outcome === "abandon" || run?.returnReason === "abandon") return "断念";
  if (run?.returnReason === "escape_scroll") return "帰還の翼で帰還";
  if (run?.returnReason === "milestone_portal") return "帰還の門から帰還";
  if (run?.returnReason === "surface") return "歩いて地上へ帰還";
  return run?.outcome === "retreat" || run?.result === "returned" ? "生還" : "結果未記録";
}

function outcomeClass(run) {
  const outcome = outcomeLabel(run);
  return outcome === "死亡" ? "death" : outcome === "断念" ? "abandon" : outcome === "結果未記録" ? "unknown" : "returned";
}

function floorLabel(floor) {
  const value = Number(floor);
  return Number.isInteger(value) && value > 0
    ? `${getDungeonForFloor(value).name} B${getDungeonFloor(value)}F`
    : "未記録";
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

// Only material names and finite quantities present in the saved record are shown.
function materialEntries(balance) {
  return MATERIAL_TYPES.flatMap(name => {
    const quantity = balance?.[name];
    return Number.isInteger(quantity) && quantity > 0 ? [[name, quantity]] : [];
  });
}

function materialText(balance) {
  return materialEntries(balance).map(([name, quantity]) => `${name} ×${quantity}`).join("、");
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
  const materials = materialText(run.bankedMaterials);
  const returnedSupplies = Number.isInteger(run.returnedSupplyCount) && run.returnedSupplyCount > 0
    ? run.returnedSupplyCount : 0;
  const safe = !lost && (run.outcome === "retreat" || run.result === "returned" ||
    ["surface", "escape_scroll", "milestone_portal"].includes(run.returnReason));
  if (lost) {
    const losses = getRunLossCopy(run).items;
    fact.classList?.add("town-last-run-loss");
    const label = document.createElement("strong");
    label.textContent = "失ったもの";
    const loss = document.createElement(losses.length ? "s" : "span");
    loss.textContent = losses.length ? losses.join("、") : "失った品の内訳は未記録。";
    fact.appendChild(label);
    fact.appendChild(loss);
  } else if (safe) {
    const emptyMaterials = hasMaterialRecord(run) ? "持ち帰った素材なし。" : "素材の内訳は未記録。";
    fact.textContent = materials
      ? `持ち帰ったもの：${materials}${returnedSupplies > 0 ? `、未使用の持ち込み品 ${returnedSupplies}個` : ""}`
      : returnedSupplies > 0
        ? `持ち帰ったもの：未使用の持ち込み品 ${returnedSupplies}個。${emptyMaterials}`
        : hasMaterialRecord(run) ? `生還しました。${emptyMaterials}`
          : "生還しました。持ち帰った品の内訳は記録されていません。";
  } else {
    fact.textContent = "持ち帰った品の記録はありません。";
  }
  const fragment = fragmentNode();
  fragment.appendChild(status);
  fragment.appendChild(fact);
  if (lost) {
    const preserved = document.createElement("p");
    preserved.className = "town-last-run-fact";
    preserved.textContent = `${getRunLossCopy(run).materials}冒険記録と偉業の進捗は残ります。`;
    fragment.appendChild(preserved);
  }
  return fragment;
}

// Without a recorded run there is no adventure record to read yet, so the
// castle entry is presented as the records/settings visit it still is.
const CASTLE_ENTRY_COPY = {
  record: { label: "城", detail: "冒険記録を見る" },
  empty: { label: "城", detail: "通算記録と設定" },
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

// The three unachieved feats closest to completion: the town always shows
// something within reach (#2007).
let renderedFeatSignature = null;

function renderFeatSummary() {
  const container = document.getElementById("town-feat-summary");
  if (!container) return;
  const entries = listFeats(state.feats);
  const nearest = getNearestFeats(state.feats, null, 3);
  // Rebuild only when what is shown changes: replacing the cards on every UI
  // update would disturb the town page's scroll position.
  const signature = [
    entries.filter(entry => entry.completed).length,
    ...nearest.map(({ feat, progress }) => `${feat.id}:${progress.current}`)
  ].join("|");
  if (signature === renderedFeatSignature && container.firstChild) return;
  renderedFeatSignature = signature;
  const nodes = nearest.map(({ feat, progress }) => createFeatCard({ feat, completed: false, progress }));
  if (nodes.length === 0) {
    const done = document.createElement("p");
    done.className = "town-feat-empty";
    done.textContent = "すべての偉業を達成した。";
    nodes.push(done);
  }
  container.replaceChildren(...nodes);
  const detail = typeof document.querySelector === "function"
    ? document.querySelector("[data-town-feats-detail]")
    : null;
  if (detail) {
    detail.textContent = `達成 ${entries.filter(entry => entry.completed).length} / ${entries.length}`;
  }
}

let renderedFacilitySignature = null;

// One slot per open facility, plus a silhouette with a hint for the next
// keeper to look for; afterwards it is the way in (#2009, #2018).
function renderFacilities() {
  const container = document.getElementById("town-facilities");
  if (!container) return;
  const entries = listTownFacilities(state.feats);
  const signature = entries
    .map(({ facility, open }) => `${facility.id}:${open ? listFacilityNodes(facility.id, { facilities: state.facilities, feats: state.feats, metaMaterials: {} }).filter(entry => entry.bought).length : "locked"}:${getOpenFacilityOrder(state.facilities, facility.id) ? "order" : ""}`)
    .join("|");
  if (signature === renderedFacilitySignature && container.firstChild) return;
  renderedFacilitySignature = signature;
  const nodes = entries.map(({ facility, open }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-neon btn-town town-facility${open ? "" : " is-locked"}`;
    button.setAttribute?.("data-facility-id", facility.id);
    button.setAttribute?.("data-facility-open", String(open));
    button.disabled = !open;
    const name = document.createElement("strong");
    const detail = document.createElement("span");
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

let renderedMaterialSignature = null;
let renderedRunSignature = null;

function renderMaterialSummary() {
  const container = document.getElementById("town-material-summary");
  if (!container) return;
  const entries = materialEntries(state.metaMaterials);
  const signature = JSON.stringify(entries);
  if (signature === renderedMaterialSignature && container.firstChild) return;
  renderedMaterialSignature = signature;
  const list = document.createElement("dl");
  list.className = "town-material-list";
  for (const [name, quantity] of entries) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const count = document.createElement("dd");
    term.textContent = name;
    count.textContent = `×${quantity}`;
    row.appendChild(term);
    row.appendChild(count);
    list.appendChild(row);
  }
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "town-material-empty";
    empty.textContent = "まだ素材はありません。生還して持ち帰った素材を、工房や施設で使えます。";
    container.replaceChildren(empty);
  } else {
    // All owned material kinds fit in this expanding list; none are silently omitted.
    container.replaceChildren(list);
  }
}

export function renderTownHome() {
  renderFeatSummary();
  renderFacilities();
  renderGuidebookEntry();
  renderMaterialSummary();
  const summary = document.getElementById("town-last-run-summary");
  if (!summary) return;
  const lastRun = Array.isArray(state.runHistory) ? state.runHistory[0] : null;
  const signature = JSON.stringify(lastRun);
  if (signature !== renderedRunSignature || !summary.firstChild) {
    renderedRunSignature = signature;
    summary.replaceChildren(getLastRunSummary(lastRun));
  }
  const section = typeof summary.closest === "function" ? summary.closest(".town-home-last-run") : null;
  if (section?.dataset) section.dataset.empty = lastRun ? "false" : "true";
  renderCastleEntry(Boolean(lastRun));
}
