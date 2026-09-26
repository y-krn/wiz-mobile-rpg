import { ENEMY_RECIPE_PALETTES as ownerPalettes } from "../../src/enemy_presentation_palette";
import { ENEMY_RECIPE_PALETTES as facadePalettes } from "../../src/enemy_presentation_palette.js";

const ownerMain: number = ownerPalettes["flash-bat"].main;
const ownerMaterial: number = ownerPalettes["powder-bat"].material;
const facadeAccent: number = facadePalettes["powder-bat"].accent;

void [ownerMain, ownerMaterial, facadeAccent];
