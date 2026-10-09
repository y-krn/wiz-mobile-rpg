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
  guardianHp: 2, guardianAtk: 1.6, guardianDef: 1
});

// `shortName` is the word a record uses in front of a floor: 坑道 B3F.
// What each dungeon's floors are built from (#2064), read by the dungeon and
// never by a floor number running across dungeons. `mapTemplate` names a
// FLOOR_TEMPLATES entry (size, rooms, traps); `rareMaterial` is what a rare
// monster leaves and `guardianRareMaterial` what the guardian leaves. The
// values keep what the running floor gave before; each is revisited when its
// dungeon is opened.
const TABLES = Object.freeze({
  collapsed_mine: Object.freeze({ mapTemplate: "shallow", rareMaterial: "黒角", guardianRareMaterial: "黒角" }),
  forgotten_catacomb: Object.freeze({ mapTemplate: "shallow", rareMaterial: "黒角", guardianRareMaterial: "竜鱗" }),
  // The nest is as big as the first two: its difficulty is its rule (#2064).
  rift_nest: Object.freeze({ mapTemplate: "shallow", rareMaterial: "竜鱗", guardianRareMaterial: "竜鱗" }),
  sunken_library: Object.freeze({ mapTemplate: "shallow", rareMaterial: "竜鱗", guardianRareMaterial: "竜鱗" }),
  dragon_forge: Object.freeze({ mapTemplate: "deep", rareMaterial: "竜鱗", guardianRareMaterial: "竜鱗" }),
  abyssal_throne: Object.freeze({ mapTemplate: "deep", rareMaterial: "竜鱗", guardianRareMaterial: "竜鱗" })
});

const DUNGEON_SETTINGS = Object.freeze({
  collapsed_mine: Object.freeze({
    shortName: "坑道",
    built: true,
    strength: BASELINE,
    // The mine's rule (#2063): digging and drawn-out fights make noise, noise
    // lingers, and while it does ordinary monsters come as well as the strong
    // enemy.
    rule: Object.freeze({
      id: "noise",
      line: "音：掘る音と長引く戦いの音が、魔物を呼ぶ。静かに進むか、早く片づけるか。",
      noiseTurns: 8,
      noiseEncounterChance: 0.12,
      longFightRounds: 4
    })
  }),
  forgotten_catacomb: Object.freeze({
    shortName: "地下墓地",
    built: true,
    strength: Object.freeze({
      enemyHp: 0.65, enemyAtk: 0.7, enemyDef: 0.5, entry: 0.85,
      eliteHp: 1, eliteAtk: 1, eliteDef: 0.3,
      guardianHp: 2, guardianAtk: 1.6, guardianDef: 0.5
    }),
    // The catacomb's rule (#2063): finds are cursed more often, a cursed find
    // is one grade better for it, and only the altar and the merchant behind
    // the guardian lift a curse.
    rule: Object.freeze({
      id: "curse",
      line: "呪い：見つかる装備は呪い付きが多く、そのぶん一段強い。祭壇で清めるか、呪いごと使うか。",
      curseChance: 0.5
    })
  }),
  rift_nest: Object.freeze({
    shortName: "大裂溝",
    built: true,
    // The nest's monsters were authored for deeper floors: scaled to the
    // mine's averages (HP, attack, defence), its strong enemy to Flack's, so
    // a fresh adventurer meets the same pressure (#2064).
    strength: Object.freeze({
      enemyHp: 0.43, enemyAtk: 0.57, enemyDef: 0.33, entry: 0.85,
      eliteHp: 1, eliteAtk: 0.93, eliteDef: 0.5,
      guardianHp: 2.5, guardianAtk: 1.5, guardianDef: 1
    }),
    // The nest's rule (#2063): crumbling ledges are many, and a ledge falls
    // once crossed, so the way back is not the way down.
    rule: Object.freeze({
      id: "collapse",
      line: "崩落：渡った足場は落ちる。帰り道は行きと同じではない。どこを渡るかを選ぶ。",
      ledgesPerFloor: Object.freeze([3, 3, 4, 4, 4])
    })
  }),
  sunken_library: Object.freeze({
    shortName: "書庫",
    built: true,
    // Scaled to the mine's averages, its strong enemy to Flack's (#2064).
    strength: Object.freeze({
      enemyHp: 0.29, enemyAtk: 0.43, enemyDef: 0.2, entry: 0.85,
      // Its strong enemy casts the flame storm, which scales with attack: at
      // 0.8 it burns 8-18, where Flack's breath burns 10-23.
      eliteHp: 1, eliteAtk: 0.8, eliteDef: 0.33,
      guardianHp: 2.5, guardianAtk: 1.3, guardianDef: 1
    }),
    // The library's rule (#2063): the water rises with the turns spent on a
    // floor, so time is the resource (systems/rising_water.js).
    rule: Object.freeze({
      id: "water",
      line: "水位：長く留まるほど水が上がり、歩くのに手番がかかる。時間が資源。",
      riseEvery: 20,
      maxRises: 12
    })
  }),
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
    strength: settings?.strength || BASELINE,
    rule: settings?.rule || null,
    tables: TABLES[biome.id]
  });
}));
