import assert from "node:assert/strict";
import * as facade from "../../../src/ui/bag_summary.js";
import * as owner from "../../../src/ui/bag_summary.ts";

assert.deepEqual(Object.keys(facade), ["createBagCapacitySummary"]);
assert.deepEqual(Object.keys(owner), ["createBagCapacitySummary"]);
assert.equal(facade.createBagCapacitySummary, owner.createBagCapacitySummary);

function installDocument({ missingDataset = false } = {}) {
  const created = [];
  globalThis.document = {
    createElement(tagName) {
      const element = {
        tagName,
        className: "",
        textContent: "",
        children: [],
        attributes: {},
        dataset: missingDataset ? undefined : {},
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
      };
      created.push(element);
      return element;
    },
  };
  return created;
}

function inspect(inventory, options) {
  installDocument();
  const summary = facade.createBagCapacitySummary(inventory, options);
  const heading = summary.children[0];
  const slots = summary.children.find(child => child.className === "bag-slot-grid");
  const note = summary.children.find(child => child.className === "bag-capacity-note");
  const slotElements = slots?.children ?? [];
  return {
    summary,
    heading,
    slots,
    note,
    slotElements,
    used: summary.dataset.usedSlots,
    capacity: summary.dataset.capacity,
    remaining: heading.children[1].textContent,
    occupied: slotElements.filter(slot => slot.className.endsWith("occupied")).length,
  };
}

const empty = inspect();
assert.equal(empty.used, "0");
assert.equal(empty.capacity, "20");
assert.equal(empty.remaining, "空き20枠・戦果の余地");
assert.equal(empty.summary.className, "bag-capacity-summary");
assert.equal(empty.summary.attributes.role, "status");
assert.equal(empty.summary.attributes["aria-label"], "バッグ 0/20枠");
assert.deepEqual(empty.summary.children.map(child => child.className), [
  "bag-capacity-heading", "bag-slot-grid", "bag-capacity-note",
]);
assert.equal(empty.slots.attributes["aria-hidden"], "true");
assert.equal(empty.slotElements.length, 20);
assert.deepEqual(empty.slotElements.map(slot => slot.dataset.slotIndex), Array.from({ length: 20 }, (_, i) => String(i)));
assert.equal(empty.note.textContent, "装備中の品はバッグ枠外。バッグ内の品だけがこの20枠を使います。");

const sparse = Array(3);
const before = sparse.slice();
const three = inspect(sparse);
assert.equal(three.used, "3");
assert.equal(three.remaining, "空き17枠・戦果の余地");
assert.equal(three.occupied, 3);
assert.deepEqual(sparse, before);

for (const [inventory, used, remaining, occupied, full] of [
  [Array(20), "20", "空きなし", 20, true],
  [Array(22), "22", "空きなし", 20, true],
  [{ length: 7 }, "0", "空き20枠・戦果の余地", 0, false],
]) {
  const result = inspect(inventory);
  assert.equal(result.used, used);
  assert.equal(result.remaining, remaining);
  assert.equal(result.occupied, occupied);
  assert.equal(result.heading.children[1].className, `bag-capacity-space ${full ? "full" : ""}`.trim());
  assert.equal(result.summary.attributes["aria-label"], `バッグ ${used}/20枠`);
}

const customized = inspect(["item"], { className: "custom", note: "custom note" });
assert.equal(customized.summary.className, "bag-capacity-summary custom");
assert.equal(customized.note.textContent, "custom note");
const hiddenSlots = inspect(["item"], { showSlots: false });
assert.deepEqual(hiddenSlots.summary.children.map(child => child.className), ["bag-capacity-heading", "bag-capacity-note"]);
assert.equal(hiddenSlots.slots, undefined);
const hiddenNote = inspect(["item"], { showNote: false });
assert.deepEqual(hiddenNote.summary.children.map(child => child.className), ["bag-capacity-heading", "bag-slot-grid"]);
assert.equal(hiddenNote.note, undefined);
assert.equal(inspect(["item"], { showSlots: 0, showNote: "" }).note, undefined);

const fallbackCreated = installDocument({ missingDataset: true });
const fallback = facade.createBagCapacitySummary(["item"]);
assert.equal(fallback.dataset.usedSlots, "1");
const fallbackSlots = fallback.children[1];
assert.deepEqual(fallbackSlots.children.map(slot => slot.dataset.slotIndex), Array.from({ length: 20 }, (_, i) => String(i)));
assert.equal(fallbackCreated.length, 26);

const freshA = inspect([]).summary;
const freshB = inspect([]).summary;
assert.notEqual(freshA, freshB);
assert.notEqual(freshA.children[1], freshB.children[1]);
assert.throws(() => facade.createBagCapacitySummary([], null), TypeError);
const optionError = new Error("option getter");
assert.throws(() => facade.createBagCapacitySummary([], {
  get className() { throw optionError; },
}), error => error === optionError);
const revokedInventory = Proxy.revocable([], {});
revokedInventory.revoke();
assert.throws(() => facade.createBagCapacitySummary(revokedInventory.proxy), TypeError);

console.log("[PASS] bag summary owner and facade preserve the legacy DOM contract");
