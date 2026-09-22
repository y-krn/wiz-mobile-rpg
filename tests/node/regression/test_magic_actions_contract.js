import assert from "node:assert/strict";
import * as magicActionsFacade from "../../../src/systems/magic_actions.js";
import * as magicActionsOwner from "../../../src/systems/magic_actions.ts";
import { ITEMS } from "../../../src/data.js";
import { createStartingKitCharacter, state } from "../../../src/state.js";
import { getActiveSpellKeys, syncMediumState } from "../../../src/rules/magic_rules.js";
import {
  socketRuneInputFixture,
  unsocketRuneInputFixture
} from "../fixtures/typescript/magic_actions_input.ts";

for (const exportName of ["socketRuneFromInventory", "unsocketRuneToInventory"]) {
  assert.strictEqual(
    magicActionsFacade[exportName],
    magicActionsOwner[exportName],
    `magic actions facade preserves ${exportName} identity`
  );
}

const previousParty = state.party;
const previousInventory = state.inventory;
const previousLogs = state.logs;
const writes = [];
globalThis.localStorage = {
  getItem: () => null,
  setItem: (key, value) => writes.push([key, value]),
  removeItem: () => {}
};

const character = createStartingKitCharacter("vanguard");
character.equipment.weapon = "WAND";
syncMediumState(character);
state.party = [character];
state.inventory = ["RUNE_HALITO"];
state.logs = [];

assert.deepEqual(magicActionsFacade.socketRuneFromInventory(), {
  ok: false,
  reason: "medium_or_rune_missing"
});
assert.deepEqual(magicActionsFacade.socketRuneFromInventory({ actorIdx: 4, inventoryIndex: 0 }), {
  ok: false,
  reason: "medium_or_rune_missing"
});
assert.deepEqual(magicActionsFacade.socketRuneFromInventory({ actorIdx: 0, inventoryIndex: 4 }), {
  ok: false,
  reason: "medium_or_rune_missing"
});
assert.deepEqual(magicActionsFacade.socketRuneFromInventory(socketRuneInputFixture), {
  ok: true,
  spellKey: "HALITO",
  runeSlots: 1
});
assert.deepEqual(state.inventory, []);
assert.deepEqual(getActiveSpellKeys(character), ["HALITO"]);
assert.equal(writes.length, 1, "socket success autosaves once");

state.inventory = ["RUNE_HALITO"];
assert.deepEqual(magicActionsFacade.socketRuneFromInventory({ actorIdx: 0, inventoryIndex: 0 }), {
  ok: false,
  reason: "already_socketed"
});
assert.deepEqual(state.inventory, ["RUNE_HALITO"]);
state.inventory = ["RUNE_DIOS"];
assert.deepEqual(magicActionsFacade.socketRuneFromInventory({ actorIdx: 0, inventoryIndex: 0 }), {
  ok: false,
  reason: "capacity"
});
assert.deepEqual(state.inventory, ["RUNE_DIOS"]);
assert.equal(writes.length, 1, "socket failures do not autosave");

assert.deepEqual(magicActionsFacade.unsocketRuneToInventory(), {
  ok: false,
  reason: "rune_missing"
});
assert.deepEqual(magicActionsFacade.unsocketRuneToInventory({ actorIdx: 0, spellKey: "DIOS" }), {
  ok: false,
  reason: "not_socketed"
});
assert.deepEqual(magicActionsFacade.unsocketRuneToInventory({ actorIdx: 0, spellKey: "NOT_A_RUNE" }), {
  ok: false,
  reason: "rune_missing"
});
assert.equal(writes.length, 1, "unsocket failures do not autosave");

state.inventory = Array(20).fill("HEAL_POTION");
assert.deepEqual(magicActionsFacade.unsocketRuneToInventory(unsocketRuneInputFixture), {
  ok: false,
  reason: "inventory_full"
});
assert.equal(state.logs.at(-1), "バッグが満杯のため、ルーンを外せません。");
assert.deepEqual(getActiveSpellKeys(character), ["HALITO"]);
assert.equal(writes.length, 1, "full inventory does not autosave");

state.inventory = [];
assert.deepEqual(magicActionsFacade.unsocketRuneToInventory(unsocketRuneInputFixture), {
  ok: true,
  spellKey: "HALITO"
});
assert.deepEqual(getActiveSpellKeys(character), []);
assert.deepEqual(state.inventory, ["RUNE_HALITO"]);
assert.equal(writes.length, 2, "unsocket success autosaves once");

assert.deepEqual(magicActionsFacade.socketRuneFromInventory({ actorIdx: 0, inventoryIndex: 0 }), {
  ok: true,
  spellKey: "HALITO",
  runeSlots: 1
});
assert.deepEqual(state.inventory, []);
assert.equal(writes.length, 3, "socket success autosaves once");

const halitoDefinition = ITEMS.RUNE_HALITO;
delete ITEMS.RUNE_HALITO;
assert.deepEqual(magicActionsFacade.unsocketRuneToInventory(unsocketRuneInputFixture), {
  ok: false,
  reason: "inventory_full"
});
ITEMS.RUNE_HALITO = halitoDefinition;
assert.deepEqual(getActiveSpellKeys(character), ["HALITO"]);
assert.deepEqual(state.inventory, []);
assert.equal(writes.length, 3, "rollback failure does not autosave");

state.party = previousParty;
state.inventory = previousInventory;
state.logs = previousLogs;

console.log("[PASS] magic actions facade, bounded input, mutation, failure, and autosave contracts");
