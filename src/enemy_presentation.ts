// balance-impact: none — symbolic enemy presentation metadata only.
//
// Production enemies are procedural Pixi recipes. The rejected illustrated
// WebP set remains in the repository as historical visual evidence, but is
// deliberately not imported or preloaded by the runtime.

type EnemyArchetype = "small" | "humanoid" | "brute" | "caster" | "boss";
type EnemyRecipeKey =
  | "flash-bat" | "powder-bat" | "biter" | "mud-slime" | "split-slime"
  | "rat-pack" | "sleep-spore" | "mud-cursed-child" | "kobold-scout"
  | "goblin-caster" | "rusted-shield"
  | "skeleton" | "zombie" | "orc" | "ghost" | "wisp" | "spider" | "rabbit" | "demon" | "dragon"
  | "werewolf" | "living-armor"
  | EnemyArchetype;
type IncludesLike = { includes(value: string): unknown };
type EnemyPresentationInput = {
  name?: unknown;
  spriteType?: unknown;
  isBoss?: unknown;
  isMidboss?: unknown;
  isRare?: unknown;
  spell?: unknown;
  traits?: unknown;
  tags?: unknown;
};
type PresentationProfile = {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
  scale: number;
  label?: string;
  recipe: EnemyRecipeKey;
  combatRole?: "strong" | "guardian";
};

export const ENEMY_RECIPE_KEYS = Object.freeze({
  flashBat: "flash-bat",
  powderBat: "powder-bat",
  biter: "biter",
  mudSlime: "mud-slime",
  splitSlime: "split-slime",
  ratPack: "rat-pack",
  sleepSpore: "sleep-spore",
  mudCursedChild: "mud-cursed-child",
  koboldScout: "kobold-scout",
  goblinCaster: "goblin-caster",
  rustedShield: "rusted-shield",
  skeleton: "skeleton",
  zombie: "zombie",
  orc: "orc",
  ghost: "ghost",
  wisp: "wisp",
  spider: "spider",
  rabbit: "rabbit",
  demon: "demon",
  dragon: "dragon",
  werewolf: "werewolf",
  livingArmor: "living-armor",
  small: "small",
  humanoid: "humanoid",
  brute: "brute",
  caster: "caster",
  boss: "boss"
} as const);

const PRESENTATION_DEFAULTS: Readonly<Omit<PresentationProfile, "label" | "recipe">> = Object.freeze({
  width: 140,
  height: 125,
  maxWidth: 140,
  maxHeight: 125,
  scale: 1
});

const ARCHETYPE_PRESENTATIONS: Readonly<Record<EnemyArchetype, Readonly<PresentationProfile>>> = Object.freeze({
  small: Object.freeze({ ...PRESENTATION_DEFAULTS, width: 150, height: 100, maxWidth: 150, maxHeight: 170, scale: 0.55, label: "small", recipe: ENEMY_RECIPE_KEYS.small }),
  humanoid: Object.freeze({ ...PRESENTATION_DEFAULTS, width: 136, height: 190, maxWidth: 183, maxHeight: 256, scale: 0.75, label: "humanoid", recipe: ENEMY_RECIPE_KEYS.humanoid }),
  brute: Object.freeze({ ...PRESENTATION_DEFAULTS, width: 170, height: 210, maxWidth: 170, maxHeight: 256, scale: 0.82, label: "brute", recipe: ENEMY_RECIPE_KEYS.brute }),
  caster: Object.freeze({ ...PRESENTATION_DEFAULTS, width: 150, height: 182, maxWidth: 150, maxHeight: 256, scale: 0.72, label: "caster", recipe: ENEMY_RECIPE_KEYS.caster }),
  boss: Object.freeze({ ...PRESENTATION_DEFAULTS, width: 190, height: 220, maxWidth: 210, maxHeight: 256, scale: 0.82, label: "boss", recipe: ENEMY_RECIPE_KEYS.boss })
});

export const ENEMY_ARCHETYPES = ARCHETYPE_PRESENTATIONS;

export const ENEMY_UNIQUE_RECIPES: Readonly<Record<string, EnemyRecipeKey>> = Object.freeze({
  "フラッシュバット": ENEMY_RECIPE_KEYS.flashBat,
  "火薬コウモリ": ENEMY_RECIPE_KEYS.powderBat,
  "かみつき蟲": ENEMY_RECIPE_KEYS.biter,
  "マッドスライム": ENEMY_RECIPE_KEYS.mudSlime,
  "分裂スライム": ENEMY_RECIPE_KEYS.splitSlime,
  "群れネズミ": ENEMY_RECIPE_KEYS.ratPack,
  "まどろみ胞子": ENEMY_RECIPE_KEYS.sleepSpore,
  "泥の呪い子": ENEMY_RECIPE_KEYS.mudCursedChild,
  "コボルトの斥候": ENEMY_RECIPE_KEYS.koboldScout,
  "ゴブリンの呪術師": ENEMY_RECIPE_KEYS.goblinCaster,
  "錆びた盾兵": ENEMY_RECIPE_KEYS.rustedShield
});

// Compatibility name retained for callers that used the old registry export.
// Values are recipe keys, never asset URLs.
export const ENEMY_UNIQUE_ASSETS = ENEMY_UNIQUE_RECIPES;

const BRUTE_NAMES = ["ジャイアント", "巨躯", "ゴーレム", "アーマー", "ストーン", "石像", "番犬"];
const HUMANOID_TYPES = new Set(["skeleton", "zombie", "orc", "kobold"]);
const CASTER_TYPES = new Set(["mage", "spirit", "wisp"]);
const SMALL_TYPES = new Set(["biter", "bat", "rabbit", "spider"]);

// Unnamed enemies keep their archetype's size profile but borrow a creature
// family silhouette from their sprite type, so a zombie, an orc, and a ghost do
// not all collapse into the same generic archetype shape.
const SPRITE_FAMILY_RECIPES: Readonly<Record<string, EnemyRecipeKey>> = Object.freeze({
  skeleton: ENEMY_RECIPE_KEYS.skeleton,
  zombie: ENEMY_RECIPE_KEYS.zombie,
  orc: ENEMY_RECIPE_KEYS.orc,
  spirit: ENEMY_RECIPE_KEYS.ghost,
  wisp: ENEMY_RECIPE_KEYS.wisp,
  spider: ENEMY_RECIPE_KEYS.spider,
  rabbit: ENEMY_RECIPE_KEYS.rabbit,
  bat: ENEMY_RECIPE_KEYS.flashBat,
  flack: ENEMY_RECIPE_KEYS.demon,
  dragon: ENEMY_RECIPE_KEYS.dragon
});
const CASTER_FAMILY_TYPES = new Set(["spirit", "wisp"]);
const GOLEM_BODY_TYPES = new Set(["zombie", "skeleton", "orc", "kobold"]);

// A few creatures share a sprite type with an unrelated body (a werewolf is
// data-typed as an orc; haunted armor as a zombie). Their names carry the
// intended body, so these name cues win over the sprite-type family.
const NAME_FAMILY_RECIPES: ReadonlyArray<readonly [readonly string[], EnemyRecipeKey]> = Object.freeze([
  Object.freeze([Object.freeze(["ワーウルフ", "ウェアウルフ", "人狼"]), ENEMY_RECIPE_KEYS.werewolf] as const),
  Object.freeze([Object.freeze(["アーマー", "鎧"]), ENEMY_RECIPE_KEYS.livingArmor] as const)
]);

function resolveFamilyRecipe(archetype: EnemyArchetype, spriteType: unknown, name: string): EnemyRecipeKey {
  const named = NAME_FAMILY_RECIPES.find(([words]) => words.some(word => name.includes(word)));
  if (named) return named[1];
  const type = typeof spriteType === "string" ? spriteType : "";
  const family = Object.prototype.hasOwnProperty.call(SPRITE_FAMILY_RECIPES, type) ? SPRITE_FAMILY_RECIPES[type] : null;
  // Giants, golems, statues, and armor read as the brute golem. Creature
  // families whose name merely says "giant" (a giant spider) keep their body.
  if (archetype === "brute") return family && !GOLEM_BODY_TYPES.has(type) ? family : ENEMY_ARCHETYPES.brute.recipe;
  // Spell users keep the robed caster silhouette; ghosts and wisps keep theirs.
  if (archetype === "caster" && !CASTER_FAMILY_TYPES.has(type)) return ENEMY_ARCHETYPES.caster.recipe;
  return family || ENEMY_ARCHETYPES[archetype].recipe;
}

function includesAny(value: string, words: string[]): boolean {
  return words.some(word => value.includes(word));
}

export function getEnemyArchetype(monster: EnemyPresentationInput = {}): EnemyArchetype {
  const name = typeof monster.name === "string" ? monster.name : "";
  const spriteType = typeof monster.spriteType === "string" ? monster.spriteType : "";
  if (monster.isBoss || monster.isMidboss || monster.isRare || spriteType === "dragon" || name.includes("竜")) return "boss";
  if (includesAny(name, BRUTE_NAMES)) return "brute";
  if (CASTER_TYPES.has(spriteType) || monster.spell || (monster.traits as IncludesLike | null | undefined)?.includes("counterSpell")) return "caster";
  if (HUMANOID_TYPES.has(spriteType)) return "humanoid";
  if (SMALL_TYPES.has(spriteType)) return "small";
  if ((monster.tags as IncludesLike | null | undefined)?.includes("demon") || (monster.tags as IncludesLike | null | undefined)?.includes("dragon")) return "brute";
  return "small";
}

function resolveUniqueRecipe(name: string): { name: string; recipe: EnemyRecipeKey } | null {
  if (ENEMY_UNIQUE_RECIPES[name]) return { name, recipe: ENEMY_UNIQUE_RECIPES[name] };
  const splitChild = name.match(/^(.*)の分裂体\d+$/);
  if (splitChild && ENEMY_UNIQUE_RECIPES[splitChild[1]]) return { name: splitChild[1], recipe: ENEMY_UNIQUE_RECIPES[splitChild[1]] };
  return null;
}

export function getEnemyPresentation(monster: EnemyPresentationInput = {}) {
  const archetype = getEnemyArchetype(monster);
  const base = ENEMY_ARCHETYPES[archetype];
  const name = typeof monster.name === "string" ? monster.name : "";
  const unique = name ? resolveUniqueRecipe(name) : null;
  const recipe = unique?.recipe || resolveFamilyRecipe(archetype, monster.spriteType, name);
  const profile = unique ? { ...PRESENTATION_DEFAULTS, label: recipe, recipe } : { ...base, recipe };
  // Only the named encounter roles opt into the larger combat composition.
  // Other demons and bosses retain their archetype profile.
  const combatRole = name === "フラック" && monster.isRare ? "strong"
    : name === "デーモンガード" && (monster.isBoss || monster.isMidboss) ? "guardian" : null;
  const combatProfile = combatRole ? {
    ...profile, width: 116, height: 124, maxWidth: 116, maxHeight: 124,
    scale: combatRole === "guardian" ? 1.32 : 1.05, combatRole
  } : profile;
  return {
    ...combatProfile,
    archetype,
    recipe,
    assetKey: `recipe:${recipe}`,
    asset: null,
    uniqueName: unique?.name || null
  };
}

export function getEnemyRecipeKey(monster: EnemyPresentationInput = {}) {
  return getEnemyPresentation(monster).recipe;
}
