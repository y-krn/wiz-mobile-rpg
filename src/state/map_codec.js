// Compact, lossless save encoding for floor grids and visited maps (#1974).
//
// A floor grid stored as plain JSON cost about 110 KB, almost all of it four
// boolean arrays per cell and repeated nulls, so a deep run outgrew
// localStorage. The encoding keeps every cell exactly:
//
//   - walls, blockEnter, secretDoor, and secretFound pack into 16 bits
//     (four hex digits per cell);
//   - every other cell field (type, event, message, traps, gimmicks, special
//     rooms, ...) is kept as-is, but only for cells that differ from the
//     default { type: "empty", event: null, message: null }.
//
// The terrain stays in the save rather than being regenerated from the run
// seed, so changing the map generator can never alter a saved run. A grid
// whose cells do not fit the format is left in its plain form.

export const SAVE_GRID_FORMAT = "grid-v1";
export const SAVE_VISITED_FORMAT = "visited-v1";

const FLAG_FIELDS = ["walls", "blockEnter", "secretDoor", "secretFound"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFourBooleans(value) {
  return Array.isArray(value) && value.length === 4 && value.every(entry => typeof entry === "boolean");
}

function isDefaultRest(rest) {
  const keys = Object.keys(rest);
  return keys.length === 3 && rest.type === "empty" && rest.event === null && rest.message === null;
}

function isRectangularGrid(grid) {
  if (!Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) return false;
  const width = grid[0].length;
  return width > 0 && grid.every(row => Array.isArray(row) && row.length === width);
}

/** Encode one floor grid; returns the grid unchanged when it does not fit. */
export function encodeSaveGrid(grid) {
  if (!isRectangularGrid(grid)) return grid;
  const height = grid.length;
  const width = grid[0].length;
  let cells = "";
  const extras = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y][x];
      if (!isRecord(cell) || !FLAG_FIELDS.every(field => isFourBooleans(cell[field]))) return grid;
      let bits = 0;
      FLAG_FIELDS.forEach((field, fieldIndex) => {
        cell[field].forEach((flag, dir) => { if (flag) bits |= 1 << (fieldIndex * 4 + dir); });
      });
      cells += bits.toString(16).padStart(4, "0");
      const rest = {};
      Object.keys(cell).forEach(key => { if (!FLAG_FIELDS.includes(key)) rest[key] = cell[key]; });
      if (!isDefaultRest(rest)) extras[y * width + x] = rest;
    }
  }
  return { format: SAVE_GRID_FORMAT, width, height, cells, extras };
}

export function isEncodedSaveGrid(value) {
  return isRecord(value) && value.format === SAVE_GRID_FORMAT;
}

/** Decode one encoded floor grid; anything else passes through unchanged. */
export function decodeSaveGrid(value) {
  if (!isEncodedSaveGrid(value)) return value;
  const { width, height, cells } = value;
  const extras = isRecord(value.extras) ? value.extras : {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      typeof cells !== "string" || cells.length !== width * height * 4) {
    const error = new Error("Encoded save grid is malformed.");
    error.name = "MalformedSavePayloadError";
    throw error;
  }
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const bits = Number.parseInt(cells.slice(index * 4, index * 4 + 4), 16);
      const cell = {};
      FLAG_FIELDS.forEach((field, fieldIndex) => {
        cell[field] = [0, 1, 2, 3].map(dir => (bits & (1 << (fieldIndex * 4 + dir))) !== 0);
      });
      Object.assign(cell, isRecord(extras[index]) ? extras[index] : { type: "empty", event: null, message: null });
      row.push(cell);
    }
    grid.push(row);
  }
  return grid;
}

/** Encode a visited grid of booleans as a hex bit string. */
export function encodeVisitedGrid(visited) {
  if (!isRectangularGrid(visited) || !visited.every(row => row.every(value => typeof value === "boolean"))) return visited;
  const height = visited.length;
  const width = visited[0].length;
  let bits = "";
  let nibble = 0;
  let count = 0;
  visited.forEach(row => row.forEach(value => {
    if (value) nibble |= 1 << (count % 4);
    count += 1;
    if (count % 4 === 0) {
      bits += nibble.toString(16);
      nibble = 0;
    }
  }));
  if (count % 4 !== 0) bits += nibble.toString(16);
  return { format: SAVE_VISITED_FORMAT, width, height, bits };
}

export function decodeVisitedGrid(value) {
  if (!isRecord(value) || value.format !== SAVE_VISITED_FORMAT) return value;
  const { width, height, bits } = value;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      typeof bits !== "string" || bits.length !== Math.ceil((width * height) / 4)) {
    const error = new Error("Encoded visited grid is malformed.");
    error.name = "MalformedSavePayloadError";
    throw error;
  }
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const nibble = Number.parseInt(bits[Math.floor(index / 4)], 16);
      row.push((nibble & (1 << (index % 4))) !== 0);
    }
    grid.push(row);
  }
  return grid;
}

export function encodeSaveMaps(maps) {
  return Array.isArray(maps) ? maps.map(grid => encodeSaveGrid(grid)) : maps;
}

export function decodeSaveMaps(maps) {
  return Array.isArray(maps) ? maps.map(grid => decodeSaveGrid(grid)) : maps;
}

export function encodeVisitedMaps(visitedMaps) {
  return Array.isArray(visitedMaps) ? visitedMaps.map(grid => encodeVisitedGrid(grid)) : visitedMaps;
}

export function decodeVisitedMaps(visitedMaps) {
  return Array.isArray(visitedMaps) ? visitedMaps.map(grid => decodeVisitedGrid(grid)) : visitedMaps;
}
