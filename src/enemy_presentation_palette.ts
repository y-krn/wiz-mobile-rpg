// balance-impact: none — presentation palette metadata only.
// Browser-neutral enemy presentation metadata.
// Keep this module free of PixiJS and DOM dependencies so Node tests can
// validate the production palette contract without a browser environment.
import { ENEMY_SPECIES_DESIGNS, type EnemySpeciesRecipe } from "./enemy_species_designs";

type EnemyPalette = Readonly<{
  main: number;
  secondary: number;
  rim: number;
  accent: number;
  material: number;
  dark: number;
}>;

// Generic fallbacks remain available for unknown future species.
export const ENEMY_RECIPE_PALETTES = Object.freeze({
  demon: Object.freeze({ main: 0x806277, secondary: 0xbc99a8, rim: 0xbc99a8, accent: 0xffd09b, material: 0x607e98, dark: 0x15182b }),
  small: Object.freeze({ main: 0x6f89a0, secondary: 0xa8c5d1, rim: 0xa8c5d1, accent: 0xffd38a, material: 0xe5d6ac, dark: 0x15182b }),
  humanoid: Object.freeze({ main: 0x6d967b, secondary: 0xb6c99a, rim: 0xb6c99a, accent: 0xffd39c, material: 0x839fb2, dark: 0x15182b }),
  brute: Object.freeze({ main: 0x89979b, secondary: 0xc1ceca, rim: 0xc1ceca, accent: 0xf9dc9b, material: 0x9d8568, dark: 0x15182b }),
  boss: Object.freeze({ main: 0x77548d, secondary: 0xb59bc9, rim: 0xb59bc9, accent: 0xa2e2fa, material: 0xdac7a6, dark: 0x15182b }),
  ...Object.fromEntries(Object.entries(ENEMY_SPECIES_DESIGNS).map(([recipe, design]) => [recipe, design.palette])) as Record<EnemySpeciesRecipe, EnemyPalette>
} satisfies Record<string, EnemyPalette>);
