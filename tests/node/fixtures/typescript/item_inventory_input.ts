import {
  getInventoryRemainingSlots,
  getInventoryUsedSlots,
  getUsableInventoryItems,
  hasInventorySpace
} from "../../../../src/rules/item_inventory.js";

const sparseInventory: unknown[] = new Array(4);
sparseInventory[0] = "HEAL_POTION";
sparseInventory[2] = { baseId: "HEAL_POTION" };
const inventory: unknown = sparseInventory;
const count: unknown = "2";

getInventoryUsedSlots(inventory);
getInventoryRemainingSlots(inventory);
hasInventorySpace(inventory, count);
getUsableInventoryItems(inventory);
