import {
  ENEMY_ARCHETYPES as ownerArchetypes,
  ENEMY_RECIPE_KEYS as ownerKeys,
  ENEMY_UNIQUE_ASSETS as ownerAssets,
  ENEMY_UNIQUE_RECIPES as ownerRecipes,
  getEnemyArchetype as ownerGetArchetype,
  getEnemyPresentation as ownerGetPresentation,
  getEnemyRecipeKey as ownerGetRecipeKey
} from "../../src/enemy_presentation";
import {
  ENEMY_ARCHETYPES as facadeArchetypes,
  ENEMY_RECIPE_KEYS as facadeKeys,
  ENEMY_UNIQUE_ASSETS as facadeAssets,
  ENEMY_UNIQUE_RECIPES as facadeRecipes,
  getEnemyArchetype as facadeGetArchetype,
  getEnemyPresentation as facadeGetPresentation,
  getEnemyRecipeKey as facadeGetRecipeKey
} from "../../src/enemy_presentation.js";

const ordinaryInput = { name: "フラッシュバット", spriteType: "bat" };
const unknownInput: { name: unknown; spriteType: unknown; tags: unknown } = {
  name: "unknown-enemy",
  spriteType: 7,
  tags: "unvalidated"
};
const ownerArchetype: "boss" | "brute" | "caster" | "humanoid" | "small" = ownerGetArchetype(ordinaryInput);
const facadeArchetype: typeof ownerArchetype = facadeGetArchetype(unknownInput);
const ownerPresentation = ownerGetPresentation(ordinaryInput);
const facadePresentation = facadeGetPresentation(unknownInput);
const ownerRecipe: string = ownerGetRecipeKey(ordinaryInput);
const facadeRecipe: string = facadeGetRecipeKey(unknownInput);
const ownerDimension: number = ownerArchetypes.small.width;
const facadeDimension: number = facadeArchetypes.boss.maxHeight;
const ownerNamedRecipe: string | undefined = ownerRecipes[ordinaryInput.name];
const facadeNamedRecipe: string | undefined = facadeRecipes[ordinaryInput.name];
const ownerAssetAlias: typeof ownerRecipes = ownerAssets;
const facadeAssetAlias: typeof facadeRecipes = facadeAssets;
const ownerRecipeKey: string = ownerKeys.flashBat;
const facadeRecipeKey: string = facadeKeys.boss;

void [
  ownerArchetype, facadeArchetype, ownerPresentation, facadePresentation,
  ownerRecipe, facadeRecipe, ownerDimension, facadeDimension,
  ownerNamedRecipe, facadeNamedRecipe, ownerAssetAlias, facadeAssetAlias,
  ownerRecipeKey, facadeRecipeKey
];
