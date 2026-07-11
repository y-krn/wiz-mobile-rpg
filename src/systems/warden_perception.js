export const WARDEN_PERCEPTIONS = {
  1: "sound",
  2: "blind_charge",
  3: "vibration",
  4: "standard",
  5: "afterimage"
};

export const WARDEN_PERCEPTION_HINTS = {
  sound: "音に反応するようだ",
  blind_charge: "完全に盲目だが、音へ激しく突進する",
  vibration: "床の振動を捉え、静止した相手を見失う",
  standard: "距離で獲物を捉える",
  afterimage: "正面から見られている間は動けない"
};

export function getWardenPerception(floor) {
  return WARDEN_PERCEPTIONS[floor] || "standard";
}

export function isInPlayerLineOfSight(player, monster, grid) {
  let x = player.x;
  let y = player.y;
  while (grid[y]?.[x] && grid[y][x].walls?.[player.dir] === false) {
    x += player.dx[player.dir];
    y += player.dy[player.dir];
    if (x === monster.x && y === monster.y) return true;
  }
  return false;
}

export function getPerceptionIntent({ monster, player, noise, playerMoved, grid }) {
  const perception = monster.perception || "standard";
  const distance = Math.abs(monster.x - player.x) + Math.abs(monster.y - player.y);

  if (perception === "sound" || perception === "blind_charge") {
    if (distance <= 1) return { target: player, speed: 1, detected: true };
    if (noise?.floor === monster.floor && noise.ttl > 0) {
      return { target: noise, speed: perception === "blind_charge" ? 2 : 1, detected: true };
    }
    return { target: null, speed: 1, detected: false };
  }
  if (perception === "vibration") {
    if (playerMoved && distance <= 6) return { target: player, speed: 1, detected: true };
    return { target: null, speed: 1, detected: false };
  }
  if (perception === "afterimage") {
    const watched = isInPlayerLineOfSight(player, monster, grid);
    return { target: watched ? null : player, speed: watched ? 0 : 2, detected: !watched };
  }
  return { target: distance <= 4 ? player : null, speed: 1, detected: distance <= 4 };
}
