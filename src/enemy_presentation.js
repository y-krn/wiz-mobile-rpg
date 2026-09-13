// balance-impact: none — visual metadata only; combat rules and state are unchanged.
// Production enemy presentation metadata. Assets are repository-authored,
// transparent SVG cutouts with no external game-art dependency.

const ASSETS = Object.freeze({
  small: new URL("./assets/enemies/small.svg", import.meta.url).href,
  humanoid: new URL("./assets/enemies/humanoid.svg", import.meta.url).href,
  brute: new URL("./assets/enemies/brute.svg", import.meta.url).href,
  caster: new URL("./assets/enemies/caster.svg", import.meta.url).href,
  boss: new URL("./assets/enemies/boss.svg", import.meta.url).href
});

export const ENEMY_ARCHETYPES = Object.freeze({
  small: Object.freeze({
    asset: ASSETS.small,
    width: 104,
    height: 128,
    maxWidth: 170,
    maxHeight: 190,
    scale: 0.96,
    label: "small"
  }),
  humanoid: Object.freeze({
    asset: ASSETS.humanoid,
    width: 116,
    height: 168,
    maxWidth: 185,
    maxHeight: 235,
    scale: 0.92,
    label: "humanoid"
  }),
  brute: Object.freeze({
    asset: ASSETS.brute,
    width: 158,
    height: 190,
    maxWidth: 230,
    maxHeight: 245,
    scale: 0.88,
    label: "brute"
  }),
  caster: Object.freeze({
    asset: ASSETS.caster,
    width: 118,
    height: 180,
    maxWidth: 215,
    maxHeight: 235,
    scale: 0.9,
    label: "caster"
  }),
  boss: Object.freeze({
    asset: ASSETS.boss,
    width: 188,
    height: 220,
    maxWidth: 256,
    maxHeight: 250,
    scale: 0.78,
    label: "boss"
  })
});

const BRUTE_NAMES = ["ジャイアント", "巨躯", "ゴーレム", "アーマー", "ストーン", "石像", "番犬"];
const HUMANOID_TYPES = new Set(["skeleton", "zombie", "orc", "kobold"]);
const CASTER_TYPES = new Set(["mage", "spirit", "wisp"]);
const SMALL_TYPES = new Set(["biter", "bat", "rabbit", "spider"]);

function includesAny(value, words) {
  return words.some(word => value.includes(word));
}

export function getEnemyArchetype(monster = {}) {
  const name = typeof monster.name === "string" ? monster.name : "";
  const spriteType = typeof monster.spriteType === "string" ? monster.spriteType : "";
  if (monster.isBoss || monster.isMidboss || monster.isRare || spriteType === "dragon" || name.includes("竜")) return "boss";
  if (includesAny(name, BRUTE_NAMES)) return "brute";
  if (CASTER_TYPES.has(spriteType) || monster.spell || monster.traits?.includes("counterSpell")) return "caster";
  if (HUMANOID_TYPES.has(spriteType)) return "humanoid";
  if (SMALL_TYPES.has(spriteType)) return "small";
  if (monster.tags?.includes("demon") || monster.tags?.includes("dragon")) return "brute";
  return "small";
}

export function getEnemyPresentation(monster = {}) {
  const archetype = getEnemyArchetype(monster);
  return { archetype, ...ENEMY_ARCHETYPES[archetype] };
}
