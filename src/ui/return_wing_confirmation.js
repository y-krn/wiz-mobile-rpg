import { state } from "../state.js";
import { requestConfirmation } from "./confirm_dialog.js";
import { getRunMaterialStake, getUnusedDepartureItemCount } from "./run_stakes.js";

export function confirmReturnWing() {
  const { currentTotal } = getRunMaterialStake();
  const itemCount = getUnusedDepartureItemCount();
  return requestConfirmation({
    title: "帰還の翼を使う",
    message: `素材 ${currentTotal}個と未使用の持ち込み品 ${itemCount}個を持ち帰って帰還する。死亡・断念では素材の一部と持ち込み品を失う。`,
    confirmLabel: "帰還する"
  }).then(confirmed => Boolean(confirmed && state.currentRun));
}
