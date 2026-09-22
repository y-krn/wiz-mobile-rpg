type MapCell = { readonly type?: unknown };
type MapGrid = readonly (readonly (MapCell | null | undefined)[] | null | undefined)[];

export function findMapCellByType(
  grid: MapGrid | null | undefined | false | 0 | "",
  type: unknown
): { x: number; y: number } | null {
  if (!grid) return null;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      if (grid[y]?.[x]?.type === type) return { x, y };
    }
  }
  return null;
}
