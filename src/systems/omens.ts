import { state, addLog } from "../state.js";
import { createRng } from "../seed_rng.js";

export type OmenId =
  | "claw_marks"
  | "scorched_floor"
  | "broken_sigil"
  | "blood_chest"
  | "dry_bell"
  | "stale_air"
  | "cold_draft"
  | "iron_dust";

export type OmenText =
  | "壁に細い爪痕が続いている。"
  | "床石が黒く焦げている。"
  | "聖印が削られている。"
  | "宝箱の前で血が乾いている。"
  | "乾いた鈴の音がする。"
  | "空気が重く、息が詰まる。"
  | "背後から冷たい風が吹く。"
  | "床に鉄粉が積もっている。";

export interface Omen {
  id: OmenId;
  text: OmenText;
}

export const OMENS: Omen[] = [
  { id: "claw_marks", text: "壁に細い爪痕が続いている。" },
  { id: "scorched_floor", text: "床石が黒く焦げている。" },
  { id: "broken_sigil", text: "聖印が削られている。" },
  { id: "blood_chest", text: "宝箱の前で血が乾いている。" },
  { id: "dry_bell", text: "乾いた鈴の音がする。" },
  { id: "stale_air", text: "空気が重く、息が詰まる。" },
  { id: "cold_draft", text: "背後から冷たい風が吹く。" },
  { id: "iron_dust", text: "床に鉄粉が積もっている。" }
];

export function getOmenForFloor(seed: unknown, floor: unknown): Omen | null {
  if (!seed) return null;
  const floorSeed = `${seed}-omen-floor-${floor}`;
  const rng = createRng(floorSeed);
  const idx = Math.floor(rng() * OMENS.length);
  return OMENS[idx];
}

export function checkFloorOmenMessage(): void {
  const floor = state.floor;
  const omen = getOmenForFloor(state.seed, floor);
  if (omen) {
    addLog(`[予兆] ${omen.text}`);
  }
}
