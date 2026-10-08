// The six dungeons, one per biome, in the order they open (#2058, #2060).
// `built` marks the dungeons a run can enter today; the others are shown as
// not yet open until they are tuned (#2064).
//
// `strength` multiplies the authored monster stats of that dungeon so that a
// fresh adventurer meets the same pressure on the same floor of any dungeon.
// The collapsed mine is the baseline (all 1). A later dungeon's monsters were
// authored for a character that had already cleared the ones before it.
// The roaming strong enemy (`elite*`) has its own multipliers: every dungeon's
// strong enemy was authored at about the mine's HP and attack, and only its
// defense grew. `entry` eases ordinary monsters' HP and attack on the first
// floor only, where the adventurer has nothing but the starting kit.
import { BIOMES } from "./biomes.js";

export const DUNGEON_FLOOR_COUNT = 5;

const BASELINE = Object.freeze({
  enemyHp: 1, enemyAtk: 1, enemyDef: 1, entry: 1,
  eliteHp: 1, eliteAtk: 1, eliteDef: 1,
  guardianHp: 1, guardianAtk: 1, guardianDef: 1
});

// `shortName` is the word a record uses in front of a floor: 坑道 B3F.
const DUNGEON_SETTINGS = Object.freeze({
  collapsed_mine: Object.freeze({ shortName: "坑道", built: true, strength: BASELINE }),
  forgotten_catacomb: Object.freeze({
    shortName: "地下墓地",
    built: true,
    strength: Object.freeze({
      enemyHp: 0.65, enemyAtk: 0.7, enemyDef: 0.5, entry: 0.85,
      eliteHp: 1, eliteAtk: 1, eliteDef: 0.3,
      guardianHp: 1, guardianAtk: 1, guardianDef: 0.5
    })
  }),
  rift_nest: Object.freeze({ shortName: "大裂溝" }),
  sunken_library: Object.freeze({ shortName: "書庫" }),
  dragon_forge: Object.freeze({ shortName: "鍛造殿" }),
  abyssal_throne: Object.freeze({ shortName: "玉座" })
});

export const DUNGEONS = Object.freeze(BIOMES.map((biome, index) => {
  const settings = DUNGEON_SETTINGS[biome.id];
  return Object.freeze({
    index,
    id: biome.id,
    name: biome.name,
    shortName: settings?.shortName || biome.name,
    eliteName: biome.eliteName,
    built: settings?.built === true,
    strength: settings?.strength || BASELINE
  });
}));
