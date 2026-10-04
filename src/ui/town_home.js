import { state, getStartingKit } from "../state.js";

function outcomeLabel(run) {
  if (run?.outcome === "death" || run?.returnReason === "gameover") return "死亡";
  if (run?.outcome === "abandon" || run?.returnReason === "abandon") return "断念";
  if (run?.returnReason === "escape_scroll") return "帰還の翼で帰還";
  if (run?.returnReason === "milestone_portal") return "帰還の門から帰還";
  return "帰還";
}

function outcomeClass(run) {
  const outcome = outcomeLabel(run);
  return outcome === "死亡" ? "death" : outcome === "断念" ? "abandon" : "returned";
}

function floorLabel(floor) {
  return Number(floor) > 0 ? `B${Number(floor)}F` : "未記録";
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
  return "潜行の事実を記録";
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
    empty.textContent = "まだ冒険の記録はありません。次の潜行が最初の一頁になります。";
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
  fact.textContent = lost
    ? `素材 ${returnedMaterialCount(run)}個を持ち帰り、未使用の持ち込み品は失いました。`
    : `素材 ${returnedMaterialCount(run)}個と未使用の持ち込み品を持ち帰りました。`;
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

export function renderTownHome() {
  const summary = document.getElementById("town-last-run-summary");
  if (!summary) return;
  const lastRun = Array.isArray(state.runHistory) ? state.runHistory[0] : null;
  summary.replaceChildren(getLastRunSummary(lastRun));
  const section = typeof summary.closest === "function" ? summary.closest(".town-home-last-run") : null;
  if (section?.dataset) section.dataset.empty = lastRun ? "false" : "true";
  renderCastleEntry(Boolean(lastRun));
}
