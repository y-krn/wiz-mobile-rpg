// Floor and chest traps are separate codex entries. Older saves keyed chest
// traps by bare name and folded floor traps into them; those records are
// dropped on load (the trap codex was reset with #1939). This module has no
// imports so the default state can use it without an import cycle.
export const CODEX_CHEST_TRAP_IDS = Object.freeze([
  "chest:poison needle", "chest:flash bomb", "chest:corrosion", "chest:teleporter", "chest:mimic"
] as const);
export const CODEX_FLOOR_TRAP_IDS = Object.freeze([
  "floor:damage", "floor:mpDrain", "floor:alarm", "floor:pitfall"
] as const);
export const CODEX_TRAP_IDS = Object.freeze([
  ...CODEX_CHEST_TRAP_IDS,
  ...CODEX_FLOOR_TRAP_IDS
] as const);

export function getChestTrapCodexId(trap: unknown): string {
  return `chest:${String(trap)}`;
}

export function getFloorTrapCodexId(trapType: unknown): string {
  return `floor:${String(trapType)}`;
}
