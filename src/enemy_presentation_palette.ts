// balance-impact: none — presentation palette metadata only.
// Browser-neutral enemy presentation metadata.
// Keep this module free of PixiJS and DOM dependencies so Node tests can
// validate the production palette contract without a browser environment.

type EnemyPalette = Readonly<{
  main: number;
  secondary: number;
  rim: number;
  accent: number;
  material: number;
  dark: number;
}>;

const BLACK = 0x05070a;
const BODY = 0x274147;
const BODY_LIGHT = 0x426367;
const TEAL = 0x4f9ca0;
const CYAN = 0x8be6df;

const DEFAULT_PALETTE: EnemyPalette = Object.freeze({
  main: BODY,
  secondary: BODY_LIGHT,
  rim: TEAL,
  accent: CYAN,
  material: 0x695842,
  dark: BLACK
});

// Geometry is supplied by the Pixi renderer; these values are only the
// controlled material identity layer shared by browser and Node consumers.
export const ENEMY_RECIPE_PALETTES = Object.freeze({
  ["flash-bat"]: DEFAULT_PALETTE,
  ["powder-bat"]: Object.freeze({ ...DEFAULT_PALETTE, material: 0x865b43, accent: 0xb07b58 }),
  biter: Object.freeze({ main: 0x4a493b, secondary: 0x69674e, rim: 0x798b77, accent: 0x9da889, material: 0x81704d, dark: BLACK }),
  ["mud-slime"]: Object.freeze({ main: 0x4d4935, secondary: 0x716b4b, rim: 0x7d8867, accent: 0xa6c4aa, material: 0x836d48, dark: BLACK }),
  ["split-slime"]: Object.freeze({ main: 0x3d4b45, secondary: 0x5e7063, rim: 0x789084, accent: 0x9ac8b8, material: 0x6d725b, dark: BLACK }),
  ["rat-pack"]: Object.freeze({ main: 0x4b4139, secondary: 0x69584a, rim: 0x7c7564, accent: 0xb09a7d, material: 0x7c654e, dark: BLACK }),
  ["sleep-spore"]: Object.freeze({ main: 0x4c4354, secondary: 0x6a5a72, rim: 0x7b6c85, accent: 0xb19ac2, material: 0x806a7c, dark: BLACK }),
  ["mud-cursed-child"]: Object.freeze({ main: 0x4b433b, secondary: 0x6a5d4d, rim: 0x7b6f60, accent: 0xae8b66, material: 0x7a6147, dark: BLACK }),
  ["kobold-scout"]: Object.freeze({ main: 0x493a34, secondary: 0x685047, rim: 0x816653, accent: 0xb27b57, material: 0x865d46, dark: BLACK }),
  ["goblin-caster"]: Object.freeze({ main: 0x294147, secondary: 0x5a5062, rim: 0x65928e, accent: CYAN, material: 0x665366, dark: BLACK }),
  ["rusted-shield"]: Object.freeze({ main: 0x4b4743, secondary: 0x6a625b, rim: 0x718a87, accent: CYAN, material: 0x855a43, dark: BLACK }),
  // Family recipes: mid-value bodies with one saturated eye/cue color so the
  // deformed silhouettes read as creatures against the bright corridor.
  skeleton: Object.freeze({ main: 0x9a937c, secondary: 0xb3ab92, rim: 0x7d8a86, accent: CYAN, material: 0x7e5a44, dark: BLACK }),
  zombie: Object.freeze({ main: 0x5f6e52, secondary: 0x7c8a68, rim: 0x8a9a7c, accent: 0xd9e36a, material: 0x4f4660, dark: BLACK }),
  orc: Object.freeze({ main: 0x4f6040, secondary: 0x6b7d56, rim: 0x8a9aa0, accent: 0xf0c050, material: 0x6e4f3a, dark: BLACK }),
  ghost: Object.freeze({ main: 0x7a7f9c, secondary: 0x9ca2bd, rim: 0x8c93b3, accent: 0x9fe8ff, material: 0x5c6080, dark: BLACK }),
  wisp: Object.freeze({ main: 0x3f8f96, secondary: 0x8be6df, rim: 0x6fc4c4, accent: CYAN, material: 0x2f6a70, dark: BLACK }),
  spider: Object.freeze({ main: 0x3b3440, secondary: 0x5a5062, rim: 0x6e6478, accent: 0xe0584c, material: 0xa0503c, dark: BLACK }),
  rabbit: Object.freeze({ main: 0x9a8f84, secondary: 0xb4aa9c, rim: 0x8a8078, accent: 0xe0584c, material: 0xb07a7a, dark: BLACK }),
  demon: Object.freeze({ main: 0x6a3a44, secondary: 0x8a5058, rim: 0x9a6a70, accent: 0xffb040, material: 0x3a3030, dark: BLACK }),
  dragon: Object.freeze({ main: 0x6a3a34, secondary: 0xa88a5a, rim: 0x8a5a4a, accent: 0xffc040, material: 0xd8c8a0, dark: BLACK }),
  small: Object.freeze({ main: 0x3f464c, secondary: 0x5d6870, rim: 0x70858a, accent: 0x9bb7b6, material: 0x62676b, dark: BLACK }),
  humanoid: Object.freeze({ main: 0x3f4546, secondary: 0x5d6362, rim: 0x71807e, accent: 0x9aa9a1, material: 0x64615a, dark: BLACK }),
  brute: Object.freeze({ main: 0x4b4742, secondary: 0x676057, rim: 0x787d77, accent: 0x9b8068, material: 0x765846, dark: BLACK }),
  caster: Object.freeze({ main: 0x304346, secondary: 0x584f60, rim: 0x668f8b, accent: CYAN, material: 0x68556c, dark: BLACK }),
  boss: Object.freeze({ main: 0x424346, secondary: 0x626168, rim: 0x777f82, accent: 0xa68a70, material: 0x7e5d4a, dark: BLACK })
} satisfies Record<string, EnemyPalette>);
