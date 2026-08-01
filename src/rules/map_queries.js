export function findMapCellByType(grid, type) {
  if (!grid) return null;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y]?.[x]?.type === type) return { x, y };
    }
  }
  return null;
}
