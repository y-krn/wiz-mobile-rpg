import { state } from "../state.js";
import { getScreenViewState } from "../state/view_state.js";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { createRecordsStripViewModel, RecordsStrip } from "./records_strip.js";

let recordsStripHost = null;
let recordsStripRoot = null;

function getRecordsStripRoot(host) {
  if (recordsStripHost === host && recordsStripRoot) return recordsStripRoot;
  recordsStripRoot?.unmount();
  recordsStripHost = host;
  recordsStripRoot = createRoot(host);
  return recordsStripRoot;
}

export function updateRecordsStrip() {
  const strip = document.getElementById("records-strip");
  if (!strip) {
    recordsStripRoot?.unmount();
    recordsStripRoot = null;
    recordsStripHost = null;
    return;
  }
  const visible = getScreenViewState(state, null).gameState === "town";
  strip.hidden = !visible;
  if (!visible || strip.nodeType !== 1 || !strip.ownerDocument) return;
  const records = state.records || { deepestRetreat: 0, deepestDeath: 0, totalRuns: 0 };
  const viewModel = createRecordsStripViewModel(records);
  const root = getRecordsStripRoot(strip);
  flushSync(() => root.render(createElement(RecordsStrip, { viewModel })));
}
