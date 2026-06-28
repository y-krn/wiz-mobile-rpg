import { EXP_LEVELS } from "../data/progression.js";
import { rollInclusive, pickClassGrowthStat } from "../rules/leveling.js";
import { getCharMaxHp, getCharMaxMp } from "../rules/character_stats.js";

export function checkCharLevelUp(char, { rng = Math.random } = {}) {
  const nextLvl = char.level + 1;
  if (nextLvl >= EXP_LEVELS.length) return false; // Max level reached

  // Ninja requires 1.5x EXP
  const req = char.class === "Ninja" ? Math.floor(EXP_LEVELS[nextLvl] * 1.5) : EXP_LEVELS[nextLvl];
  if (char.exp >= req) {
    char.level = nextLvl;
    
    // Gain HP
    let hpGain = 0;
    if (char.class === "Fighter") hpGain = rollInclusive(7, 9, rng);
    else if (char.class === "Thief") hpGain = rollInclusive(5, 7, rng);
    else if (char.class === "Priest") hpGain = rollInclusive(4, 6, rng);
    else if (char.class === "Mage") hpGain = rollInclusive(3, 5, rng);
    else if (char.class === "Samurai") hpGain = rollInclusive(6, 8, rng);
    else if (char.class === "Bishop") hpGain = rollInclusive(4, 6, rng);
    else if (char.class === "Ranger") hpGain = rollInclusive(5, 7, rng);
    else if (char.class === "Ninja") hpGain = rollInclusive(5, 7, rng);
    
    const oldMaxHp = getCharMaxHp(char);
    char.maxHp += hpGain;
    const newMaxHp = getCharMaxHp(char);
    char.hp += (newMaxHp - oldMaxHp);

    // Gain MP
    const oldMaxMp = getCharMaxMp(char);
    let mpIncreased = false;
    if (char.class === "Priest") {
      char.maxMp += 2;
      mpIncreased = true;
    } else if (char.class === "Mage") {
      char.maxMp += 3;
      mpIncreased = true;
    } else if (char.class === "Bishop") {
      char.maxMp += rollInclusive(1, 2, rng);
      mpIncreased = true;
    } else if (char.class === "Samurai" || char.class === "Ranger") {
      if (char.level >= 3) {
        if (char.maxMp === 0) {
          char.maxMp = 1;
        } else {
          char.maxMp += 1;
        }
        mpIncreased = true;
      }
    }
    if (mpIncreased) {
      const newMaxMp = getCharMaxMp(char);
      char.mp += (newMaxMp - oldMaxMp);
    }

    // Gain Stats
    if (char.level % 3 === 0) {
      const stat = pickClassGrowthStat(char.class, rng);
      char[stat] += 1;
    }

    // Learn spells
    if (!char.spells) char.spells = [];
    if (char.class === "Priest") {
      if (char.level === 2 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS", "DIALKO", "LATUMOFIS");
      }
      if (char.level === 3 && !char.spells.includes("LOMILWA")) {
        char.spells.push("LOMILWA");
      }
      if (char.level === 4 && !char.spells.includes("MABARRIER")) {
        char.spells.push("MABARRIER");
      }
      if (char.level === 8 && !char.spells.includes("DIALMA")) {
        char.spells.push("DIALMA");
      }
      if (char.level === 9 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
    } else if (char.class === "Mage") {
      if (char.level === 2 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 3) {
        if (!char.spells.includes("KATINO")) char.spells.push("KATINO");
        if (!char.spells.includes("MAHALITO")) char.spells.push("MAHALITO");
      }
      if (char.level === 4) {
        if (!char.spells.includes("MASFEAL")) char.spells.push("MASFEAL");
        if (!char.spells.includes("MONTINO")) char.spells.push("MONTINO");
      }
      if (char.level === 5 && !char.spells.includes("MORLIS")) {
        char.spells.push("MORLIS");
      }
      if (char.level === 6 && !char.spells.includes("MADALTO")) {
        char.spells.push("MADALTO");
      }
      if (char.level === 8 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    } else if (char.class === "Samurai") {
      if (char.level === 3) {
        char.spells.push("HALITO", "DUMAPIC");
      }
      if (char.level === 4 && !char.spells.includes("LAHALITO")) {
        char.spells.push("LAHALITO");
      }
      if (char.level === 5) {
        if (!char.spells.includes("KATINO")) char.spells.push("KATINO");
        if (!char.spells.includes("MAHALITO")) char.spells.push("MAHALITO");
      }
      if (char.level === 6 && !char.spells.includes("MONTINO")) {
        char.spells.push("MONTINO");
      }
      if (char.level === 7 && !char.spells.includes("MORLIS")) {
        char.spells.push("MORLIS");
      }
      if (char.level === 7 && !char.spells.includes("MADALTO")) {
        char.spells.push("MADALTO");
      }
      if (char.level === 9 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    } else if (char.class === "Ranger") {
      if (char.level === 3) {
        char.spells.push("DIOS", "MILWA", "DIURCO", "BADIOS");
      }
      if (char.level === 4 && !char.spells.includes("MADIOS")) {
        char.spells.push("MADIOS", "DIALKO", "LATUMOFIS");
      }
      if (char.level === 5) {
        if (!char.spells.includes("LOMILWA")) char.spells.push("LOMILWA");
        if (!char.spells.includes("MABARRIER")) char.spells.push("MABARRIER");
      }
      if (char.level === 8 && !char.spells.includes("DIALMA")) {
        char.spells.push("DIALMA");
      }
      if (char.level === 10 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
    } else if (char.class === "Bishop") {
      if (char.level === 2) {
        ["MILWA", "DIURCO", "BADIOS", "DUMAPIC"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 3) {
        ["MADIOS", "DIALKO", "LATUMOFIS", "LAHALITO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 4) {
        ["LOMILWA", "KATINO", "MASFEAL", "MABARRIER"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 5) {
        ["MAHALITO", "MONTINO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 6 && !char.spells.includes("MORLIS")) {
        char.spells.push("MORLIS");
      }
      if (char.level === 7) {
        ["DIALMA", "MADALTO"].forEach(s => {
          if (!char.spells.includes(s)) char.spells.push(s);
        });
      }
      if (char.level === 9 && !char.spells.includes("KADORTO")) {
        char.spells.push("KADORTO");
      }
      if (char.level === 10 && !char.spells.includes("TILTOWAIT")) {
        char.spells.push("TILTOWAIT");
      }
    }
    return true;
  }
  return false;
}
