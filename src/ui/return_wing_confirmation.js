import { state } from "../state.js";
import { requestConfirmation } from "./confirm_dialog.js";
import { getRunMaterialStake, getUnusedDepartureItemCount } from "./run_stakes.js";

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
  return requestConfirmation({
    title: "帰還の翼を使う",
    message: `素材 ${currentTotal}個と未使用の持ち込み品 ${itemCount}個を持ち帰って帰還する。死亡・断念では素材の一部と持ち込み品を失う。${overflowMessage}`,
    confirmLabel: "帰還する"
  }).then(confirmed => Boolean(confirmed && state.currentRun));
}
