// Rings on the enemies while a target is being chosen: the world shows what
// can be touched instead of a list. Positions come from the same combat
// layout the renderer hit-tests, so a ring sits exactly over a touch target.
import { dungeonRenderer } from "../renderer_runtime.js";
import { getCombatMonsterLayout } from "../rules/renderer_projection.js";

const RING_CLASS = "combat-aim-ring";

export function syncAimRings(active) {
  const host = typeof document !== "undefined" ? document.getElementById("viewport-panel") : null;
  if (!host || typeof host.querySelectorAll !== "function") return;
  host.querySelectorAll(`.${RING_CLASS}`).forEach((ring) => ring.remove());
  if (!active || !dungeonRenderer?.canvas || !dungeonRenderer.viewport) return;
  const canvasRect = dungeonRenderer.canvas.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const { width, height } = dungeonRenderer.viewport;
  if (!canvasRect.width || !canvasRect.height) return;
  const scale = Math.min(canvasRect.width / width, canvasRect.height / height);
  const offsetX = canvasRect.left - hostRect.left + (canvasRect.width - width * scale) / 2;
  const offsetY = canvasRect.top - hostRect.top + (canvasRect.height - height * scale) / 2;
  const monsters = dungeonRenderer.getRenderInput?.().combatMonsters || [];
  getCombatMonsterLayout(monsters, dungeonRenderer.viewport).forEach(({ hitRegion, monsterIndex }) => {
    const ring = document.createElement("span");
    ring.className = RING_CLASS;
    ring.dataset.monsterIndex = String(monsterIndex);
    ring.setAttribute("aria-hidden", "true");
    const size = Math.max(hitRegion.radiusX, hitRegion.radiusY) * 2 * scale;
    ring.style.left = `${offsetX + hitRegion.centerX * scale - size / 2}px`;
    ring.style.top = `${offsetY + hitRegion.centerY * scale - size / 2}px`;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    host.appendChild(ring);
  });
}
