import {
  createBagCapacitySummary as createFromOwner,
  type BagCapacitySummaryOptions,
} from "../../../../src/ui/bag_summary";
import { createBagCapacitySummary as createFromFacade } from "../../../../src/ui/bag_summary.js";

export function exerciseBagSummaryTypes(inventory: unknown): HTMLElement[] {
  const sparseInventory: unknown[] = Array(3);
  const options: BagCapacitySummaryOptions = {
    className: "fixture",
    note: "fixture note",
    showSlots: false,
    showNote: true,
  };
  const ownerSummary: HTMLElement = createFromOwner(sparseInventory, options);
  const facadeSummary: HTMLElement = createFromFacade(inventory, {
    className: 1,
    note: null,
    showSlots: "truthy",
  });
  const defaultSummary: HTMLElement = createFromFacade();
  return [ownerSummary, facadeSummary, defaultSummary];
}
