import assert from "node:assert/strict";

const facade = await import("../../../src/enemy_presentation_palette.js");
const owner = await import("../../../src/enemy_presentation_palette.ts");

const expected = [
  ["flash-bat", [0x274147, 0x426367, 0x4f9ca0, 0x8be6df, 0x695842, 0x05070a]],
  ["powder-bat", [0x274147, 0x426367, 0x4f9ca0, 0xb07b58, 0x865b43, 0x05070a]],
  ["biter", [0x4a493b, 0x69674e, 0x798b77, 0x9da889, 0x81704d, 0x05070a]],
  ["mud-slime", [0x4d4935, 0x716b4b, 0x7d8867, 0xa6c4aa, 0x836d48, 0x05070a]],
  ["split-slime", [0x3d4b45, 0x5e7063, 0x789084, 0x9ac8b8, 0x6d725b, 0x05070a]],
  ["rat-pack", [0x4b4139, 0x69584a, 0x7c7564, 0xb09a7d, 0x7c654e, 0x05070a]],
  ["sleep-spore", [0x4c4354, 0x6a5a72, 0x7b6c85, 0xb19ac2, 0x806a7c, 0x05070a]],
  ["mud-cursed-child", [0x4b433b, 0x6a5d4d, 0x7b6f60, 0xae8b66, 0x7a6147, 0x05070a]],
  ["kobold-scout", [0x493a34, 0x685047, 0x816653, 0xb27b57, 0x865d46, 0x05070a]],
  ["goblin-caster", [0x294147, 0x5a5062, 0x65928e, 0x8be6df, 0x665366, 0x05070a]],
  ["rusted-shield", [0x4b4743, 0x6a625b, 0x718a87, 0x8be6df, 0x855a43, 0x05070a]],
  ["small", [0x3f464c, 0x5d6870, 0x70858a, 0x9bb7b6, 0x62676b, 0x05070a]],
  ["humanoid", [0x3f4546, 0x5d6362, 0x71807e, 0x9aa9a1, 0x64615a, 0x05070a]],
  ["brute", [0x4b4742, 0x676057, 0x787d77, 0x9b8068, 0x765846, 0x05070a]],
  ["caster", [0x304346, 0x584f60, 0x668f8b, 0x8be6df, 0x68556c, 0x05070a]],
  ["boss", [0x424346, 0x626168, 0x777f82, 0xa68a70, 0x7e5d4a, 0x05070a]]
];
const fields = ["main", "secondary", "rim", "accent", "material", "dark"];

assert.deepEqual(Object.keys(facade), ["ENEMY_RECIPE_PALETTES"]);
assert.deepEqual(Object.keys(owner), ["ENEMY_RECIPE_PALETTES"]);
assert.strictEqual(facade.ENEMY_RECIPE_PALETTES, owner.ENEMY_RECIPE_PALETTES);

const palettes = owner.ENEMY_RECIPE_PALETTES;
assert.deepEqual(Object.keys(palettes), expected.map(([key]) => key));
assert.equal(Object.isFrozen(palettes), true);
for (const key of Object.keys(palettes)) {
  assert.deepEqual(Object.getOwnPropertyDescriptor(palettes, key), {
    value: palettes[key],
    writable: false,
    enumerable: true,
    configurable: false
  }, `${key} descriptor`);
}
for (const [key, values] of expected) {
  const palette = palettes[key];
  assert.deepEqual(Object.keys(palette), fields, `${key} field insertion order`);
  assert.deepEqual(fields.map(field => palette[field]), values, `${key} baseline values`);
  assert.equal(Object.isFrozen(palette), true, `${key} palette frozen`);
  for (const field of fields) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(palette, field), {
      value: values[fields.indexOf(field)],
      writable: false,
      enumerable: true,
      configurable: false
    }, `${key}.${field} descriptor`);
  }
}

assert.deepEqual(Object.keys(palettes), expected.map(([key]) => key));
assert.notStrictEqual(palettes["powder-bat"], palettes["flash-bat"]);
assert.deepEqual(
  [palettes["powder-bat"].material, palettes["powder-bat"].accent],
  [0x865b43, 0xb07b58]
);
assert.equal(palettes["flash-bat"].material, 0x695842);
assert.equal(new Set(Object.values(palettes)).size, expected.length);
assert.equal(palettes["missing-recipe"], undefined);
console.log("ENEMY PRESENTATION PALETTE CONTRACT TEST PASSED");
