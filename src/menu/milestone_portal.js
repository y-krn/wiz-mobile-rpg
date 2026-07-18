import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";

export function renderMilestonePortal(optGrid) {
  optGrid.innerHTML = "";
  const retreat = document.createElement("button");
  retreat.type = "button";
  retreat.className = "btn btn-neon btn-block milestone-portal-action";
  retreat.textContent = "撤退して素材を100%持ち帰る";
  retreat.addEventListener("click", () => triggerRunResult("milestone_portal"));
  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "btn btn-block milestone-portal-action";
  continueButton.textContent = "探索を続ける";
  continueButton.addEventListener("click", closeSubmenu);
  optGrid.append(retreat, continueButton);
}
