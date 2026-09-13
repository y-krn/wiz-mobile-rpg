import { state } from "../state.js";
import { getScreenViewState } from "../state/view_state.js";

function floorText(value) {
  return value > 0 ? `B${value}F` : "未記録";
}

export function updateRecordsStrip() {
  const strip = document.getElementById("records-strip");
  if (!strip) return;
  const visible = getScreenViewState(state, null).gameState === "town";
  strip.hidden = !visible;
  if (!visible) return;
  const records = state.records || { deepestRetreat: 0, deepestDeath: 0, totalRuns: 0 };
  const createRecord = (labelText, valueText) => {
    const item = document.createElement("span");
    const label = document.createElement("small");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText;
    item.appendChild(label);
    item.appendChild(value);
    return item;
  };
  strip.replaceChildren(
    createRecord("帰還最深", floorText(records.deepestRetreat)),
    createRecord("死亡最深", floorText(records.deepestDeath)),
    createRecord("総潜行", String(records.totalRuns))
  );
}
