// The town home as a place (#2107): a dusk picture of the mining town drawn
// on a coarse pixel grid. Each building is the way into its screen: the
// buttons laid over the picture cover the buildings themselves, and their
// names hang as small painted boards. The picture is static SVG; smoke,
// lamplight and sparks move by CSS only, and stop under reduced motion.

export const TOWN_SCENE_WIDTH = 180;
export const TOWN_SCENE_HEIGHT = 260;

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

const INK = "#1d1420";
const C = Object.freeze({
  skyTop: "#2a2350",
  skyMid: "#5a3f6e",
  skyLow: "#c0607a",
  skyGlow: "#f2a65a",
  star: "#fff3c4",
  farHill: "#6a5a86",
  nearHill: "#3f3552",
  rock: "#2c2438",
  snow: "#d9d2e8",
  ground: "#3b3a4a",
  groundLit: "#5b5262",
  cobble: "#6e6370",
  cobbleLit: "#8f7f80",
  wallWarm: "#c9a27a",
  wallStone: "#8c8496",
  wallStoneDark: "#6b6378",
  timber: "#4a2e24",
  roofRed: "#8e3b3b",
  roofBlue: "#3d5a86",
  roofSlate: "#4a4458",
  roofPurple: "#5e4a7a",
  window: "#ffd27a",
  windowCore: "#fff3c4",
  glow: "#ffb347",
  dark: "#241c2c",
  fire: "#ff8a3d",
  leaf: "#2f4a3a",
  paper: "#efe2c4"
});

function px(x, y, w, h, fill, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;
}

function poly(points, fill, extra = "") {
  return `<polygon points="${points}" fill="${fill}"${extra}/>`;
}

// A lit window with a soft spill of light under it.
function litWindow(x, y, w = 4, h = 5) {
  return [
    px(x - 1, y - 1, w + 2, h + 2, C.window, ` opacity="0.14" class="town-flicker"`),
    px(x, y, w, h, C.window),
    px(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 3), C.windowCore),
    px(x + Math.floor(w / 2), y, 1, h, C.timber, ` opacity="0.6"`)
  ].join("");
}

function darkWindow(x, y, w = 4, h = 5) {
  return px(x, y, w, h, C.dark);
}

function smoke(x, y, delay = 0) {
  return `<g class="town-smoke" style="animation-delay:${delay}s">${[
    px(x, y, 3, 3, "#9a8fa8", ` opacity="0.7"`),
    px(x + 2, y - 5, 4, 3, "#9a8fa8", ` opacity="0.5"`),
    px(x - 1, y - 10, 4, 4, "#9a8fa8", ` opacity="0.35"`)
  ].join("")}</g>`;
}

function sky() {
  const bands = [[0, 30, C.skyTop], [30, 26, "#3a2f60"], [56, 20, C.skyMid], [76, 16, "#8a4d78"], [92, 12, C.skyLow], [104, 10, C.skyGlow]];
  const stars = [[12, 8], [30, 20], [44, 6], [66, 14], [98, 5], [118, 18], [134, 9], [162, 26], [172, 6], [84, 26], [24, 34], [148, 38]];
  return [
    ...bands.map(([y, h, fill]) => px(0, y, TOWN_SCENE_WIDTH, h, fill)),
    ...stars.map(([x, y], index) => px(x, y, 1, 1, C.star, index % 3 === 0 ? ` class="town-twinkle"` : "")),
    px(150, 14, 8, 8, "#f6e7c1"),
    px(148, 16, 2, 4, "#f6e7c1"),
    px(154, 14, 4, 3, C.skyTop, ` opacity="0.55"`)
  ].join("");
}

function mountains() {
  return [
    poly("0,104 18,86 30,92 48,72 62,84 76,66 90,52 104,64 120,58 138,76 152,70 168,84 180,80 180,118 0,118", C.farHill),
    poly("86,56 90,52 94,56 92,57 90,55 88,57", C.snow),
    poly("40,118 60,96 74,88 90,74 106,86 120,96 140,118", C.nearHill),
    poly("62,118 74,98 90,88 106,98 118,118", C.rock)
  ].join("");
}

function mine() {
  return [
    // Timbered portal with a lantern either side.
    px(76, 96, 28, 24, C.timber),
    px(80, 100, 20, 20, "#0c0810"),
    px(82, 98, 16, 2, "#0c0810"),
    px(74, 94, 32, 3, "#6b4632"),
    px(76, 97, 2, 23, "#6b4632"),
    px(102, 97, 2, 23, "#6b4632"),
    px(72, 100, 2, 2, C.glow, ` class="town-flicker"`),
    px(71, 98, 4, 6, C.glow, ` opacity="0.25" class="town-flicker"`),
    px(106, 100, 2, 2, C.glow, ` class="town-flicker"`),
    px(105, 98, 4, 6, C.glow, ` opacity="0.25" class="town-flicker"`),
    // Rails into the town.
    px(86, 120, 1, 56, "#7a7380"),
    px(93, 120, 1, 56, "#7a7380"),
    ...[122, 128, 134, 140, 146, 152, 158, 164, 170].map(y => px(84, y, 12, 1, "#5a4034")),
    // A cart left at the mouth.
    px(96, 112, 8, 5, "#5a4a52"),
    px(97, 117, 2, 2, INK),
    px(102, 117, 2, 2, INK),
    px(97, 110, 6, 2, "#8a7a6a")
  ].join("");
}

function ground() {
  const cobbles = [];
  for (let row = 0; row < 14; row++) {
    const y = 122 + row * 10;
    const half = 10 + row * 4;
    for (let x = 90 - half; x < 90 + half; x += 6) {
      cobbles.push(px(Math.round(x + (row % 2) * 3), y, 4, 2, row > 8 ? C.cobbleLit : C.cobble, ` opacity="0.7"`));
    }
  }
  return [
    px(0, 118, TOWN_SCENE_WIDTH, TOWN_SCENE_HEIGHT - 118, C.ground),
    poly(`80,120 100,120 140,${TOWN_SCENE_HEIGHT} 40,${TOWN_SCENE_HEIGHT}`, C.groundLit),
    px(0, 178, TOWN_SCENE_WIDTH, 8, C.groundLit),
    ...cobbles
  ].join("");
}

function lampPost(x, y) {
  return [
    px(x - 4, y + 16, 9, 2, C.window, ` opacity="0.1"`),
    px(x, y + 2, 1, 16, INK),
    px(x - 1, y - 1, 3, 1, INK),
    px(x - 2, y - 2, 5, 5, C.window, ` opacity="0.1" class="town-flicker"`),
    px(x - 1, y, 3, 2, C.window, ` class="town-flicker"`)
  ].join("");
}

function castle() {
  const parts = [
    // Keep and towers.
    px(12, 62, 34, 56, C.wallStone),
    px(2, 46, 14, 72, C.wallStoneDark),
    px(42, 46, 14, 72, C.wallStoneDark),
    ...[2, 6, 10, 14].map(x => px(x, 43, 2, 3, C.wallStoneDark)),
    ...[42, 46, 50, 54].map(x => px(x, 43, 2, 3, C.wallStoneDark)),
    ...[12, 18, 24, 30, 36, 42].map(x => px(x, 59, 3, 3, C.wallStone)),
    poly("2,46 9,34 16,46", C.roofSlate),
    poly("42,46 49,34 56,46", C.roofSlate),
    // Banner.
    px(48, 24, 1, 12, INK),
    px(49, 24, 6, 4, "#b8484a"),
    // Gate with torches.
    px(24, 100, 10, 18, "#3a2620"),
    px(25, 98, 8, 2, "#3a2620"),
    px(21, 100, 1, 2, C.glow, ` class="town-flicker"`),
    px(36, 100, 1, 2, C.glow, ` class="town-flicker"`),
    litWindow(7, 60, 3, 5),
    litWindow(47, 60, 3, 5),
    litWindow(17, 74, 4, 6),
    litWindow(37, 74, 4, 6),
    darkWindow(7, 84, 3, 5),
    litWindow(47, 90, 3, 5),
    // Guard by the gate.
    px(16, 108, 3, 3, "#d8b08a"),
    px(15, 111, 5, 7, "#4a5a7a"),
    px(20, 104, 1, 14, "#8a8a92")
  ];
  return parts.join("");
}

function tavern() {
  return [
    smoke(166, 66, 0),
    px(164, 70, 6, 12, "#4a3a3a"),
    poly("114,86 146,68 178,86", C.roofRed),
    px(116, 84, 60, 2, "#6e2a2a"),
    px(118, 86, 56, 38, C.wallWarm),
    // Half-timbering.
    px(118, 86, 56, 2, C.timber),
    px(118, 104, 56, 2, C.timber),
    px(118, 86, 2, 38, C.timber),
    px(172, 86, 2, 38, C.timber),
    px(145, 86, 2, 18, C.timber),
    litWindow(124, 91, 6, 6),
    litWindow(160, 91, 6, 6),
    litWindow(124, 110, 6, 6),
    // Door with warm spill.
    px(148, 108, 10, 16, "#3a2620"),
    px(149, 109, 8, 15, C.glow, ` opacity="0.45" class="town-flicker"`),
    px(144, 124, 18, 4, C.glow, ` opacity="0.2" class="town-flicker"`),
    // The notice board with its papers.
    px(162, 108, 12, 10, "#5a3a28"),
    px(163, 109, 4, 4, C.paper),
    px(168, 110, 4, 3, C.paper),
    px(165, 114, 4, 3, C.paper),
    px(164, 118, 1, 6, "#5a3a28"),
    px(171, 118, 1, 6, "#5a3a28"),
    // Someone reading it.
    px(166, 116, 3, 3, "#d8b08a"),
    px(165, 119, 5, 6, "#5a4a6a"),
    // Barrels.
    px(120, 118, 5, 6, "#6b4632"),
    px(126, 119, 5, 5, "#6b4632"),
    px(120, 120, 5, 1, INK, ` opacity="0.5"`)
  ].join("");
}

function archives() {
  return [
    // A domed hall of books, its lamp still burning.
    poly("4,134 32,120 60,134", C.roofBlue),
    px(28, 116, 8, 6, C.roofBlue),
    px(31, 112, 2, 4, C.window, ` class="town-flicker"`),
    px(6, 134, 52, 32, "#b8aa94"),
    px(6, 134, 52, 2, "#8a7c68"),
    ...[9, 18, 41, 50].map(x => px(x, 137, 4, 26, "#d8ccb4")),
    litWindow(24, 140, 4, 8),
    litWindow(34, 140, 4, 8),
    px(28, 152, 8, 14, "#3a2620"),
    // The guidebook's lectern by the door.
    px(44, 158, 8, 2, "#6b4632"),
    px(47, 160, 2, 6, "#6b4632"),
    px(45, 156, 6, 2, C.paper),
    lampPost(64, 140)
  ].join("");
}

function workshop() {
  return [
    smoke(158, 124, 1.2),
    px(156, 128, 7, 18, "#4a3a3a"),
    poly("112,146 140,132 170,146", C.roofSlate),
    px(114, 146, 54, 28, "#8a7060"),
    px(114, 146, 54, 2, C.timber),
    litWindow(120, 152, 6, 5),
    // Open forge door with the fire inside.
    px(140, 154, 14, 20, "#2a1810"),
    px(142, 164, 10, 6, C.fire, ` class="town-flicker"`),
    px(143, 162, 8, 2, C.glow, ` class="town-flicker"`),
    // Anvil and the smith at work.
    px(158, 168, 8, 3, "#3a3640"),
    px(160, 171, 4, 3, "#3a3640"),
    px(169, 160, 3, 3, "#d8b08a"),
    px(168, 163, 5, 8, "#5a3a2a"),
    px(165, 162, 4, 1, "#8a8a92"),
    `<g class="town-spark">${px(161, 165, 1, 1, C.window)}${px(164, 163, 1, 1, C.glow)}${px(159, 164, 1, 1, C.windowCore)}</g>`,
    lampPost(108, 152)
  ].join("");
}

// A lit house once its keeper is home, a dark shell while someone still waits
// below, an empty plot for the rest.
function facilityPlot(cx, status) {
  const x = cx - 13;
  const y = 196;
  if (status === "empty") {
    return [px(x + 2, y + 18, 22, 4, "#4a4652"), px(x + 4, y + 14, 1, 8, "#5a4a3a"), px(x + 20, y + 14, 1, 8, "#5a4a3a"), px(x + 4, y + 16, 17, 1, "#5a4a3a")].join("");
  }
  const lit = status === "open";
  return [
    poly(`${x - 1},${y} ${cx},${y - 10} ${x + 27},${y}`, lit ? C.roofPurple : "#3a3444"),
    px(x, y, 26, 22, lit ? "#d8c0a0" : "#5a5262"),
    px(x, y, 26, 1, lit ? C.timber : "#3a3444"),
    lit ? litWindow(x + 3, y + 4, 5, 5) : darkWindow(x + 3, y + 4, 5, 5),
    lit ? litWindow(x + 18, y + 4, 5, 5) : darkWindow(x + 18, y + 4, 5, 5),
    px(x + 10, y + 10, 6, 12, lit ? "#3a2620" : "#2a2430"),
    lit ? px(x + 6, y + 22, 14, 2, C.glow, ` opacity="0.22" class="town-flicker"`) : px(x + 5, y + 9, 16, 1, "#2a2430")
  ].join("");
}

function foreground() {
  return [
    px(0, 236, TOWN_SCENE_WIDTH, 24, "#1f1a26"),
    ...[0, 14, 30, 138, 154, 168].map((x, index) => px(x, 230 - (index % 2) * 3, 12, 10, C.leaf)),
    ...Array.from({ length: 12 }, (_, index) => px(44 + index * 8, 232, 1, 8, "#2a2230")),
    px(44, 234, 92, 1, "#2a2230"),
    lampPost(40, 214),
    lampPost(140, 214)
  ].join("");
}

/** The whole picture; `facilityStatuses` lists "open", "waiting" or "empty" per plot. */
export function renderTownSceneSvg(facilityStatuses = []) {
  const plots = TOWN_FACILITY_PLOTS.map((cx, index) => facilityPlot(cx, facilityStatuses[index] || "empty")).join("");
  return `<svg class="town-scene-picture" viewBox="0 0 ${TOWN_SCENE_WIDTH} ${TOWN_SCENE_HEIGHT}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${sky()}${mountains()}${ground()}${mine()}${castle()}${archives()}${tavern()}${workshop()}${plots}${foreground()}</svg>`;
}
