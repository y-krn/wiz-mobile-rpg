import { closeSubmenu } from "../navigation.js";
import { triggerRunResult } from "../result.js";
import { createRunStakesSummary } from "../ui/run_stakes.js";
import { state } from "../state.js";
import { trackExplorationDecision } from "../telemetry.js";

export function renderMilestonePortal(optGrid) {
  optGrid.innerHTML = "";
  const retreat = document.createElement("button");
  retreat.type = "button";
  retreat.className = "btn btn-neon btn-block milestone-portal-action";
  retreat.textContent = "撤退して素材を100%、未確定戦果をすべて持ち帰る";
  retreat.addEventListener("click", () => {
    trackExplorationDecision("return", { state, source: "return_portal" });
    triggerRunResult("milestone_portal");
  });
  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "btn btn-block milestone-portal-action";
  continueButton.textContent = "探索を続ける";
  continueButton.addEventListener("click", () => {
    trackExplorationDecision("continue", { state, source: "return_portal" });
    closeSubmenu();
  });
  optGrid.append(createRunStakesSummary(), retreat, continueButton);
}
