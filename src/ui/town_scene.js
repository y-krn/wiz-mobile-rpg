// The town home as a place (#2107): a storybook pixel picture of the mining
// town (painted by town_art.js). Each building is the way into its screen:
// the buttons laid over the picture cover the buildings themselves, and their
// names hang as small painted boards.
import { TOWN_ART_HEIGHT, TOWN_ART_WIDTH, paintTownArt } from "./town_art.js";

export const TOWN_SCENE_WIDTH = TOWN_ART_WIDTH;
export const TOWN_SCENE_HEIGHT = TOWN_ART_HEIGHT;

// What each building covers, in scene pixels. A button fills that box.
export const TOWN_BUILDING_AREAS = Object.freeze({
  castle: Object.freeze({ x: 2, y: 34, w: 54, h: 86 }),
  mine: Object.freeze({ x: 74, y: 82, w: 32, h: 40 }),
  tavern: Object.freeze({ x: 114, y: 66, w: 64, h: 60 }),
  archives: Object.freeze({ x: 2, y: 124, w: 32, h: 46 }),
  guidebook: Object.freeze({ x: 34, y: 124, w: 30, h: 46 }),
  workshop: Object.freeze({ x: 112, y: 126, w: 66, h: 50 })
});

// Six houses along the front street, one per keeper who can be brought home.
export const TOWN_FACILITY_PLOTS = Object.freeze([16, 46, 76, 106, 136, 166]);
export const TOWN_FACILITY_AREA = Object.freeze({ y: 186, w: 28, h: 40 });

export function toSceneBox({ x, y, w, h }) {
  return {
    left: `${(x / TOWN_SCENE_WIDTH) * 100}%`,
    top: `${(y / TOWN_SCENE_HEIGHT) * 100}%`,
    width: `${(w / TOWN_SCENE_WIDTH) * 100}%`,
    height: `${(h / TOWN_SCENE_HEIGHT) * 100}%`
  };
}

export function getFacilityArea(index) {
  const cx = TOWN_FACILITY_PLOTS[index] ?? TOWN_FACILITY_PLOTS.at(-1);
  return { x: cx - TOWN_FACILITY_AREA.w / 2, y: TOWN_FACILITY_AREA.y, w: TOWN_FACILITY_AREA.w, h: TOWN_FACILITY_AREA.h };
}

/**
 * Paint the town picture into `host` as a pixel canvas scaled up without
 * smoothing. `facilityStatuses` lists "open", "waiting" or "empty" per plot.
 */
export function paintTownScene(host, facilityStatuses = []) {
  if (!host || typeof document?.createElement !== "function") return;
  let canvas = host.querySelector?.("canvas.town-scene-picture");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "town-scene-picture";
    canvas.width = TOWN_ART_WIDTH;
    canvas.height = TOWN_ART_HEIGHT;
    canvas.setAttribute?.("aria-hidden", "true");
    host.replaceChildren?.(canvas);
  }
  const context = canvas.getContext?.("2d");
  if (!context || typeof ImageData !== "function") return;
  const { width, height, pixels } = paintTownArt(facilityStatuses, TOWN_FACILITY_PLOTS);
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
}
