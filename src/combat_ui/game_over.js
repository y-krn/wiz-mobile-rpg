import { playSound } from "../audio.js";
import { triggerRunResult } from "../result.js";

export function triggerGameOver() {
  playSound("game_over");
  triggerRunResult("gameover");
  // Hide normal back button
  const backBtn = document.getElementById("btn-submenu-back");
  if (backBtn) {
    backBtn.style.display = "none";
  }
}
