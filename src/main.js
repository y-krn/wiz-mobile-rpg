import "./sentry.js"; // 最初に実行してエラーフックを張る
import { initGame } from "./game.js";

// Bootstrap the Wiz-Mobile RPG
window.addEventListener("DOMContentLoaded", () => {
  initGame();
});
