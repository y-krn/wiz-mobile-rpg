import assert from "assert";
import { drawMiniMap } from "../../../src/minimap.js";
import { EVENT_TYPES } from "../../../src/data.js";

function createContext() {
  const commands = [];
  let currentFillStyle = "";
  let currentStrokeStyle = "";
  const ctx = {
    commands,
    save: () => commands.push({ name: "save" }),
    restore: () => commands.push({ name: "restore" }),
    beginPath: () => commands.push({ name: "beginPath" }),
    closePath: () => commands.push({ name: "closePath" }),
    clip: () => commands.push({ name: "clip" }),
    fill: () => commands.push({ name: "fill", fillStyle: currentFillStyle }),
    stroke: () => commands.push({ name: "stroke", strokeStyle: currentStrokeStyle }),
    fillRect: (...args) => commands.push({ name: "fillRect", args, fillStyle: currentFillStyle }),
    strokeRect: (...args) => commands.push({ name: "strokeRect", args, strokeStyle: currentStrokeStyle }),
    arc: (...args) => commands.push({ name: "arc", args, fillStyle: currentFillStyle }),
    fillText: (...args) => commands.push({ name: "fillText", args, fillStyle: currentFillStyle }),
    moveTo: (...args) => commands.push({ name: "moveTo", args }),
    lineTo: (...args) => commands.push({ name: "lineTo", args }),
    rect: (...args) => commands.push({ name: "rect", args }),
    setLineDash: (...args) => commands.push({ name: "setLineDash", args }),
    translate: (...args) => commands.push({ name: "translate", args }),
    rotate: (...args) => commands.push({ name: "rotate", args }),
    setTransform: (...args) => commands.push({ name: "setTransform", args }),
  };
  Object.defineProperties(ctx, {
    fillStyle: { get: () => currentFillStyle, set: value => { currentFillStyle = value; } },
    strokeStyle: { get: () => currentStrokeStyle, set: value => { currentStrokeStyle = value; } },
    lineWidth: { get: () => 0, set: () => {} },
    lineCap: { get: () => "", set: () => {} },
    lineJoin: { get: () => "", set: () => {} },
    shadowBlur: { get: () => 0, set: () => {} },
    shadowColor: { get: () => "", set: () => {} },
    font: { get: () => "", set: () => {} },
    textAlign: { get: () => "", set: () => {} },
    textBaseline: { get: () => "", set: () => {} },
  });
  return ctx;
}

function makeCell(overrides = {}) {
  return {
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: "empty",
    ...overrides,
  };
}

function makeInput(overrides = {}) {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => makeCell()));
  return {
    kind: "renderer-input",
    view: { hasMap: true },
    sceneVisibility: {
      showTownBackground: false,
      showCombat: false,
      showChest: false,
      showEventScene: false,
      showItemMenu: false,
    },
    floor: 1,
    x: 4,
    y: 4,
    dir: 0,
    map,
    visitedMap: Array.from({ length: 9 }, () => Array(9).fill(false)),
    mapFragments: [],
    lightTurns: 0,
    lightPower: null,
    roamingMonsters: [],
    hasArcaneSense: false,
    ...overrides,
  };
}

function draw(input) {
  const ctx = createContext();
  drawMiniMap(ctx, input);
  return ctx.commands;
}

function calls(commands, name) {
  return commands.filter(command => command.name === name);
}

const unknownInput = makeInput();
unknownInput.map[3][4].event = EVENT_TYPES.SPRING;
unknownInput.map[4][5].event = "retired_event";
unknownInput.map[5][4].type = "stairs-down";
const unknownCommands = draw(unknownInput);

assert.equal(calls(unknownCommands, "arc").length, 1, "unknown event and stairs draw no proximity arc; only player halo remains");
assert.equal(calls(unknownCommands, "fillText").length, 0, "unknown objects draw no marker text");
assert.equal(calls(unknownCommands, "strokeRect").length, 1, "unknown stairs draw no normal icon");

const knownInput = makeInput();
knownInput.visitedMap[3][4] = true;
knownInput.map[3][4].type = "stairs-down";
const knownCommands = draw(knownInput);
assert.equal(calls(knownCommands, "strokeRect").length, 2, "known stairs retain normal minimap icon");
assert.equal(calls(knownCommands, "lineTo").length >= 5, true, "known stairs retain stair icon path");

const unrelatedInput = makeInput();
unrelatedInput.map[3][4].event = EVENT_TYPES.BOSS;
unrelatedInput.map[4][5].event = EVENT_TYPES.MIDBOSS;
const unrelatedCommands = draw(unrelatedInput);
assert.equal(calls(unrelatedCommands, "arc").length, 3, "Boss/Midboss proximity cues remain");
assert.equal(calls(unrelatedCommands, "fill").filter(command => command.fillStyle.startsWith("rgba(217, 72, 59,")).length, 2, "Boss/Midboss red cue remains");

const discoveredInput = makeInput();
discoveredInput.map[4][5] = makeCell({
  blockEnter: [true, false, false, false],
  trap: { state: "discovered" },
});
const discoveredCommands = draw(discoveredInput);
assert.equal(calls(discoveredCommands, "fillText").some(command => command.args[0] === "!"), true, "discovered trap marker remains");
assert.equal(calls(discoveredCommands, "lineTo").length >= 3, true, "one-way marker remains");

// Legible scale: the panel frames ten 12px cells around the player, and the
// larger view still draws only visited/revealed cells (no hidden info leak).
const scaleInput = makeInput();
scaleInput.visitedMap[4][4] = true;
scaleInput.visitedMap[3][4] = true;
scaleInput.map[4][4] = makeCell({ walls: [false, true, true, true] });
scaleInput.map[3][4] = makeCell({ walls: [true, true, false, false] });
scaleInput.map[3][3] = makeCell({ walls: [true, false, true, true], trap: { state: "hidden" } });
scaleInput.map[0][0] = makeCell({ walls: [false, false, false, false], type: "stairs-down" });
const scaleCommands = draw(scaleInput);
const frame = calls(scaleCommands, "fillRect")[0];
assert.deepEqual(frame.args.slice(2), [124, 124], "minimap frame is 120px plus its border");
const cellFills = calls(scaleCommands, "fillRect").filter(command => command.fillStyle === "rgba(63, 185, 122, 0.26)");
assert.equal(cellFills.length, 2, "only the two visited cells are filled");
cellFills.forEach(command => assert.deepEqual(command.args.slice(2), [12, 12], "visited cells draw at 12px"));
assert.equal(calls(scaleCommands, "strokeRect").length, 1, "unvisited stairs stay hidden at the larger scale");
assert.equal(calls(scaleCommands, "fillText").length, 0, "hidden trap beyond an unvisited side passage stays hidden");
const [playerX, playerY] = calls(scaleCommands, "translate").at(-1).args;
assert.ok(playerX > frame.args[0] && playerX < frame.args[0] + frame.args[2], "player arrow stays inside the panel");
assert.ok(playerY > frame.args[1] && playerY < frame.args[1] + frame.args[3], "player arrow stays inside the panel");

console.log("MINIMAP VISIBILITY TEST PASSED");
