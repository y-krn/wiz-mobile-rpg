import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRecordsStripViewModel, RecordsStrip } from "../../../src/ui/records_strip.js";

const viewModel = createRecordsStripViewModel({
  deepestRetreat: 12,
  deepestDeath: 9,
  totalRuns: 7,
});

assert.deepEqual(viewModel.records, [
  // A record names its dungeon and the floor inside it (#2060).
  { key: "retreat", label: "帰還最深", value: "大裂溝 B2F" },
  { key: "death", label: "死亡最深", value: "地下墓地 B4F" },
  { key: "runs", label: "冒険の数", value: "7" },
]);
assert.equal(
  renderToStaticMarkup(createElement(RecordsStrip, { viewModel })),
  "<span><small>帰還最深</small><strong>大裂溝 B2F</strong></span><span><small>死亡最深</small><strong>地下墓地 B4F</strong></span><span><small>冒険の数</small><strong>7</strong></span>",
);

const emptyModel = createRecordsStripViewModel({ deepestRetreat: -1 });
assert.deepEqual(emptyModel.records, [
  { key: "retreat", label: "帰還最深", value: "未記録" },
  { key: "death", label: "死亡最深", value: "未記録" },
  { key: "runs", label: "冒険の数", value: "0" },
]);
console.log("[PASS] React records strip projects normalized records into read-only markup");
