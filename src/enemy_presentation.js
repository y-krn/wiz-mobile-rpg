// balance-impact: none — visual metadata only; combat rules and state are unchanged.
// Production enemy presentation metadata. Assets are repository-authored,
// transparent generated raster cutouts with no external game-art dependency.

const ASSETS = Object.freeze({
  small: new URL("./assets/enemies/generated/small.webp", import.meta.url).href,
  humanoid: new URL("./assets/enemies/generated/humanoid.webp", import.meta.url).href,
  brute: new URL("./assets/enemies/generated/brute.webp", import.meta.url).href,
  caster: new URL("./assets/enemies/generated/caster.webp", import.meta.url).href,
  boss: new URL("./assets/enemies/generated/boss.webp", import.meta.url).href
});

// Name-specific art is the production path. Archetypes remain useful for
// sizing and for a bounded emergency fallback, but must not erase species
// identity when a named cutout exists.
export const ENEMY_UNIQUE_ASSETS = Object.freeze({
  "かみつき蟲": new URL("./assets/enemies/generated/unique/biter.webp", import.meta.url).href,
  "火薬コウモリ": new URL("./assets/enemies/generated/unique/powder-bat.webp", import.meta.url).href,
  "マッドスライム": new URL("./assets/enemies/generated/unique/mud-slime.webp", import.meta.url).href,
  "分裂スライム": new URL("./assets/enemies/generated/unique/split-slime.webp", import.meta.url).href,
  "群れネズミ": new URL("./assets/enemies/generated/unique/rat-pack.webp", import.meta.url).href,
  "まどろみ胞子": new URL("./assets/enemies/generated/unique/sleep-spore.webp", import.meta.url).href,
  "泥の呪い子": new URL("./assets/enemies/generated/unique/mud-cursed-child.webp", import.meta.url).href,
  "コボルトの斥候": new URL("./assets/enemies/generated/unique/kobold-scout.webp", import.meta.url).href,
  "ゴブリンの呪術師": new URL("./assets/enemies/generated/unique/goblin-shaman.webp", import.meta.url).href,
  "フラッシュバット": new URL("./assets/enemies/generated/unique/flash-bat.webp", import.meta.url).href,
  "錆びた盾兵": new URL("./assets/enemies/generated/unique/rusted-shield.webp", import.meta.url).href
});

export const ENEMY_ARCHETYPES = Object.freeze({
  small: Object.freeze({
    asset: ASSETS.small,
    width: 150,
    height: 100,
    maxWidth: 256,
    maxHeight: 170,
    scale: 0.55,
    label: "small"
  }),
  humanoid: Object.freeze({
    asset: ASSETS.humanoid,
    width: 136,
    height: 190,
    maxWidth: 183,
    maxHeight: 256,
    scale: 0.75,
    label: "humanoid"
  }),
  brute: Object.freeze({
    asset: ASSETS.brute,
    width: 170,
    height: 210,
    maxWidth: 170,
    maxHeight: 256,
    scale: 0.82,
    label: "brute"
  }),
  caster: Object.freeze({
    asset: ASSETS.caster,
    width: 150,
    height: 182,
    maxWidth: 212,
    maxHeight: 256,
    scale: 0.72,
    label: "caster"
  }),
  boss: Object.freeze({
    asset: ASSETS.boss,
    width: 166,
    height: 200,
    maxWidth: 213,
    maxHeight: 256,
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

function resolveUniqueAssetName(name) {
  if (ENEMY_UNIQUE_ASSETS[name]) return name;

  // Split children keep their combat-facing display name, but inherit the
  // parent's production cutout so a slime never falls through to the generic
  // small-creature fallback after splitting.
  const splitChild = name.match(/^(.*)の分裂体\d+$/);
  if (splitChild && ENEMY_UNIQUE_ASSETS[splitChild[1]]) return splitChild[1];

  return null;
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
  const base = ENEMY_ARCHETYPES[archetype];
  const uniqueName = typeof monster.name === "string" ? resolveUniqueAssetName(monster.name) : null;
  const uniqueAsset = uniqueName ? ENEMY_UNIQUE_ASSETS[uniqueName] : null;
  return {
    archetype,
    assetKey: uniqueAsset ? `enemy:${uniqueName}` : archetype,
    ...base,
    asset: uniqueAsset || base.asset
  };
}
