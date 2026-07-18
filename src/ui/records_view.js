import { state } from "../state.js";

function floorText(value) {
  return value > 0 ? `B${value}F` : "未記録";
}

export function updateRecordsStrip() {
  const strip = document.getElementById("records-strip");
  if (!strip) return;
  const visible = state.gameState === "town";
  strip.hidden = !visible;
  if (!visible) return;
  const records = state.records || { deepestRetreat: 0, deepestDeath: 0, totalRuns: 0 };
  strip.innerHTML = `
    <span><small>撤退最深</small><strong>${floorText(records.deepestRetreat)}</strong></span>
    <span><small>死亡最深</small><strong>${floorText(records.deepestDeath)}</strong></span>
    <span><small>総潜行</small><strong>${records.totalRuns}</strong></span>
  `;
}
