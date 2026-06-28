import { MONSTERS, START_X, START_Y } from "../data.js";

export const ENCOUNTER_PACKS = {
  1: [
    { members: [{ name: "かみつき蟲", min: 1, max: 2 }] },
    { members: [{ name: "コボルトの斥候", min: 1, max: 2 }] },
    { members: [{ name: "マッドスライム", min: 1, max: 2 }] },
    { members: [{ name: "フラッシュバット", min: 1, max: 2 }] },
    { members: [{ name: "分裂スライム", min: 1, max: 2 }] },
    { members: [{ name: "錆びた盾兵", min: 1, max: 1 }, { name: "ゴブリンの呪術師", min: 1, max: 1 }] },
    { members: [{ name: "群れネズミ", min: 4, max: 6 }] },
    { members: [{ name: "火薬コウモリ", min: 1, max: 1 }] },
    { members: [{ name: "泥の呪い子", min: 1, max: 1 }] }
  ],
  2: [
    { members: [{ name: "リビングアーマー", min: 1, max: 1 }, { name: "ゴブリンの呪術師", min: 1, max: 1 }] },
    { members: [{ name: "ブラッドバット群", min: 4, max: 6 }] },
    { members: [{ name: "ゾンビ", min: 1, max: 1 }, { name: "ジャイアントスパイダー", min: 1, max: 1 }] },
    { members: [{ name: "針甲虫", min: 1, max: 1 }] },
    { members: [{ name: "呪いの小鏡", min: 1, max: 1 }] },
    { members: [{ name: "鉄皮のゴブリン", min: 1, max: 1 }, { name: "祈祷ゴブリン", min: 1, max: 1 }] },
    { members: [{ name: "マナドレイン", min: 1, max: 1 }] },
    { members: [{ name: "スケルトンアーチャー", min: 1, max: 1 }] },
    { members: [{ name: "煙幕盗賊", min: 1, max: 1 }, { name: "腐毒の蛆", min: 1, max: 2 }] }
  ],
  3: [
    { members: [{ name: "スピリット", min: 1, max: 1 }, { name: "はぐれ魔術師", min: 1, max: 1 }] },
    { members: [{ name: "呪文喰い", min: 1, max: 1 }, { name: "オークの戦士", min: 1, max: 1 }] },
    { members: [{ name: "カースドハンド", min: 1, max: 1 }, { name: "ゾンビ", min: 1, max: 1 }] },
    { members: [{ name: "アイアンゴーレム", min: 1, max: 1 }, { name: "はぐれ魔術師", min: 1, max: 1 }] },
    { members: [{ name: "霧 of 亡霊", min: 1, max: 1 }, { name: "骨の鼓手", min: 1, max: 1 }] }, // 待て、元の表記は？「霧の亡霊」！
    { members: [{ name: "オークの戦士", min: 1, max: 1 }, { name: "弱体の魔女", min: 1, max: 1 }] }
  ],
  4: [
    { members: [{ name: "ストーンガード", min: 1, max: 1 }] },
    { members: [{ name: "マスターメイジ", min: 1, max: 1 }] },
    { members: [{ name: "ウィル・オー・ウィスプ", min: 1, max: 1 }, { name: "バンシー", min: 1, max: 1 }] },
    { members: [{ name: "アースジャイアント", min: 1, max: 1 }, { name: "ポイズンジャイアント", min: 1, max: 1 }] },
    { members: [{ name: "ブラッドバット群", min: 4, max: 6 }] },
    { members: [{ name: "石像兵", min: 1, max: 1 }, { name: "魔鏡の司祭", min: 1, max: 1 }] },
    { members: [{ name: "鋼殻ビートル", min: 1, max: 1 }, { name: "弱体の魔女", min: 1, max: 1 }] },
    { members: [{ name: "血塗れの処刑人", min: 1, max: 1 }, { name: "沈黙の修道士", min: 1, max: 1 }] },
    { members: [{ name: "召喚する悪魔", min: 1, max: 1 }, { name: "魔防崩しの蛇", min: 1, max: 1 }] },
    { members: [{ name: "魔封じの目玉", min: 1, max: 1 }, { name: "解呪の司祭", min: 1, max: 1 }] }
  ],
  5: [
    { members: [{ name: "マスターデーモン", min: 1, max: 1 }, { name: "プリーストデーモン", min: 1, max: 1 }] },
    { members: [{ name: "ドラゴンワーム", min: 3, max: 4 }] },
    { members: [{ name: "レッドドラゴン", min: 1, max: 1 }, { name: "ワイバーン", min: 1, max: 1 }] },
    { members: [{ name: "ストーンガード", min: 1, max: 1 }] },
    { members: [{ name: "マスターデーモン", min: 1, max: 1 }] },
    { members: [{ name: "反逆の鎧", min: 1, max: 1 }] },
    { members: [{ name: "黒曜の魔導士", min: 1, max: 1 }] },
    { members: [{ name: "竜血の再生者", min: 1, max: 1 }, { name: "結界の守護者", min: 1, max: 1 }] },
    { members: [{ name: "双頭の番犬", min: 1, max: 1 }, { name: "命喰いの影", min: 1, max: 1 }] },
    { members: [{ name: "破滅の導師", min: 1, max: 1 }, { name: "盾持ちデーモン", min: 1, max: 1 }] },
    { members: [{ name: "深淵の分裂体", min: 1, max: 1 }, { name: "灰燼の術士", min: 1, max: 1 }] }
  ]
};

export function getEnemyRow(monster) {
  return monster.row || "front";
}

export function generateEncounter(state, isBoss, isMidboss, isRoamingFlack) {
  const monsters = [];
  let isRare = false;

  if (isBoss) {
    const dragonTemplate = MONSTERS.find(m => m.name === "いにしえの竜");
    monsters.push({
      ...dragonTemplate,
      hp: dragonTemplate.hp,
      maxHp: dragonTemplate.hp
    });
  } else if (isMidboss) {
    const midbossTemplate = MONSTERS.find(m => m.name === "デーモンガード");
    monsters.push({
      ...midbossTemplate,
      hp: midbossTemplate.hp,
      maxHp: midbossTemplate.hp
    });
  } else if (isRoamingFlack) {
    const flackTemplate = MONSTERS.find(m => m.name === "フラック");
    monsters.push({
      ...flackTemplate,
      hp: flackTemplate.hp,
      maxHp: flackTemplate.hp
    });
  } else {
    // Regular random encounter
    const dist = Math.abs(state.x - START_X) + Math.abs(state.y - START_Y);
    
    let targetLevel = 1;
    if (state.floor === 1) {
      targetLevel = dist < 20 ? 1 : 2;
    } else if (state.floor === 2) {
      targetLevel = dist < 20 ? 2 : 3;
    } else if (state.floor === 3) {
      targetLevel = dist < 20 ? 3 : 4;
    } else if (state.floor === 4) {
      targetLevel = dist < 20 ? 4 : 6;
    } else if (state.floor === 5) {
      targetLevel = dist < 20 ? 6 : 7;
    }
    
    const rareChance = state.floor === 4 ? 0.18 : 0.08;
    const treasureCandidates = MONSTERS.filter(m => m.treasureRare && m.level <= targetLevel + 1);
    const isTreasureEncounter = (Math.random() < rareChance) && (treasureCandidates.length > 0);
    
    if (isTreasureEncounter) {
      isRare = true;
      const template = treasureCandidates[Math.floor(Math.random() * treasureCandidates.length)];
      monsters.push({
        ...template,
        hp: template.hp,
        maxHp: template.hp
      });
    } else {
      const floorPacks = ENCOUNTER_PACKS[state.floor] || ENCOUNTER_PACKS[1];
      const chosenPack = floorPacks[Math.floor(Math.random() * floorPacks.length)];
      
      const tempMonsters = [];
      chosenPack.members.forEach(member => {
        const template = MONSTERS.find(m => m.name === member.name);
        if (template) {
          const count = Math.floor(Math.random() * (member.max - member.min + 1)) + member.min;
          for (let i = 0; i < count; i++) {
            tempMonsters.push({
              ...template,
              hp: template.hp,
              maxHp: template.hp
            });
          }
        }
      });

      const nameCounts = {};
      tempMonsters.forEach(m => {
        nameCounts[m.name] = (nameCounts[m.name] || 0) + 1;
      });

      const currentNameIndices = {};
      tempMonsters.forEach(m => {
        const baseName = m.name;
        if (nameCounts[baseName] > 1) {
          currentNameIndices[baseName] = (currentNameIndices[baseName] || 0) + 1;
          const suffix = ` ${String.fromCharCode(64 + currentNameIndices[baseName])}`;
          m.name = baseName + suffix;
        }
        monsters.push(m);
      });
    }
  }

  return { monsters, isRare };
}
