import { state } from "../state.js";
import { requestConfirmation } from "./confirm_dialog.js";
import { getRunMaterialStake, getUnusedDepartureItemCount } from "./run_stakes.js";
import { getEscortNames } from "../systems/facilities.js";

export function confirmReturnWing({ excludedInventoryIndex = null } = {}) {
  const { currentTotal } = getRunMaterialStake();
  const itemCount = getUnusedDepartureItemCount(
    state.currentRun,
    state.inventory,
    excludedInventoryIndex
  );
  const storageMax = Number.isFinite(state.storageMax) ? Math.max(0, Math.floor(state.storageMax)) : 30;
  const storageSlots = Math.max(0, storageMax - (Array.isArray(state.storage) ? state.storage.length : 0));
  const overflowCount = Math.max(0, itemCount - storageSlots);
  const overflowMessage = overflowCount > 0
    ? ` 倉庫満杯のため未使用品 ${overflowCount}個は戻らない。`
    : "";
  // The Wing carries one person (#2062): the treasure and a keeper stay.
  const roundTrip = state.currentRun?.roundTrip;
  const escort = getEscortNames(state.currentRun);
  const leftBehind = roundTrip
    ? [roundTrip.treasure ? "至宝" : "", escort ? escort : ""].filter(Boolean)
    : [];
  const leftMessage = leftBehind.length > 0
    ? ` 翼が運ぶのはひとりだけ。${leftBehind.join("と")}は迷宮に残る。`
    : "";
  return requestConfirmation({
    title: "帰還の翼を使う",
    message: `素材 ${currentTotal}個と未使用の持ち込み品 ${itemCount}個を持ち帰って帰還する。死亡・断念では素材の一部と持ち込み品を失う。${leftMessage}${overflowMessage}`,
    confirmLabel: "帰還する"
  }).then(confirmed => Boolean(confirmed && state.currentRun));
}
