// balance-impact: none — canonical elite perception contracts and runtime behavior only.

export type ElitePerception =
  | "sound"
  | "blind_charge"
  | "vibration"
  | "standard"
  | "afterimage";

export interface ElitePerceptionPlayer {
  x: number;
  y: number;
  dir: number;
  dx: readonly number[];
  dy: readonly number[];
}

export interface ElitePerceptionMonster {
  x: number;
  y: number;
  floor: number;
  perception?: string | null;
}

export interface ElitePerceptionNoise {
  x: number;
  y: number;
  floor: number;
  ttl: number;
}

export interface ElitePerceptionGridCell {
  walls?: readonly boolean[];
}

export type ElitePerceptionGrid = readonly (readonly (ElitePerceptionGridCell | null | undefined)[] | null | undefined)[];

export interface GetPerceptionIntentInput {
  monster: ElitePerceptionMonster;
  player: ElitePerceptionPlayer;
  noise?: ElitePerceptionNoise | null;
  playerMoved: boolean;
  grid: ElitePerceptionGrid;
  rangeMultiplier?: number;
}

export interface PerceptionIntent {
  target: ElitePerceptionPlayer | ElitePerceptionNoise | null;
  speed: number;
  detected: boolean;
}

export const ELITE_PERCEPTIONS: ElitePerception[] = ["sound", "blind_charge", "vibration", "standard", "afterimage"];

export const ELITE_PERCEPTION_HINTS: Record<ElitePerception, string> = {
  sound: "音に反応するようだ",
  blind_charge: "完全に盲目だが、音へ激しく突進する",
  vibration: "床の振動を捉え、静止した相手を見失う",
  standard: "距離で獲物を捉える",
  afterimage: "正面から見られている間は動けない"
};

function normalizePerception(value: unknown): ElitePerception {
  switch (value) {
    case "sound":
    case "blind_charge":
    case "vibration":
    case "standard":
    case "afterimage":
      return value;
    default:
      return "standard";
  }
}

export function isInPlayerLineOfSight(
  player: ElitePerceptionPlayer,
  monster: ElitePerceptionMonster,
  grid: ElitePerceptionGrid
): boolean {
  let x = player.x;
  let y = player.y;
  while (grid[y]?.[x] && grid[y]?.[x]?.walls?.[player.dir] === false) {
    x += player.dx[player.dir];
    y += player.dy[player.dir];
    if (x === monster.x && y === monster.y) return true;
  }
  return false;
}

export function getPerceptionIntent({
  monster,
  player,
  noise,
  playerMoved,
  grid,
  rangeMultiplier = 1
}: GetPerceptionIntentInput): PerceptionIntent {
  const perception = normalizePerception(monster.perception);
  const distance = Math.abs(monster.x - player.x) + Math.abs(monster.y - player.y);
  const baseRange = perception === "vibration" ? 6 : (perception === "sound" || perception === "blind_charge" ? 1 : 4);
  const detectionRange = Math.max(1, Math.floor(baseRange * rangeMultiplier));

  if (perception === "sound" || perception === "blind_charge") {
    if (distance <= detectionRange) return { target: player, speed: 1, detected: true };
    if (noise?.floor === monster.floor && noise.ttl > 0) {
      return { target: noise, speed: perception === "blind_charge" ? 2 : 1, detected: true };
    }
    return { target: null, speed: 1, detected: false };
  }
  if (perception === "vibration") {
    if (playerMoved && distance <= detectionRange) return { target: player, speed: 1, detected: true };
    return { target: null, speed: 1, detected: false };
  }
  if (perception === "afterimage") {
    if (rangeMultiplier < 1 && distance > detectionRange) {
      return { target: null, speed: 1, detected: false };
    }
    const watched = isInPlayerLineOfSight(player, monster, grid);
    return { target: watched ? null : player, speed: watched ? 0 : 2, detected: !watched };
  }
  return { target: distance <= detectionRange ? player : null, speed: 1, detected: distance <= detectionRange };
}
