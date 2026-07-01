import { state, addLog } from "../state.js";
import { createRng } from "../seed_rng.js";

export const OMEN_EFFECT_LIMITS = {
  maxWeightMultiplier: 1.25,
  maxRerolls: 1,
  changesEncounterRate: false,
  changesChestCount: false,
  changesUnidentifiedDropRate: false,
  changesGoldOrExp: false
};

export const OMEN_FEEDBACK_RULES = {
  reinforceMatchedResultWithLog: true,
  revealExactOdds: false,
  guaranteeMatchedResult: false,
  allowResultSpecificFlavor: true
};

export const OMENS = [
  { id: "claw_marks", text: "壁に細い爪痕が続いている。" },
  { id: "scorched_floor", text: "床石が黒く焦げている。" },
  { id: "broken_sigil", text: "聖印が削られている。" },
  { id: "blood_chest", text: "宝箱の前で血が乾いている。" },
  { id: "dry_bell", text: "乾いた鈴の音がする。" },
  { id: "stale_air", text: "空気が重く、息が詰まる。" },
  { id: "cold_draft", text: "背後から冷たい風が吹く。" },
  { id: "iron_dust", text: "床に鉄粉が積もっている。" }
];

export const OMEN_DETAILS = {
  claw_marks: {
    name: "細い爪痕",
    trend: "獣系敵がやや多い。",
    counter: "獣の強烈な物理攻撃に備え、盾兵による護衛や十分な物理防御を確保せよ。",
    matchText: "壁の爪痕と同じ幅の傷を持つ獣が現れた。"
  },
  scorched_floor: {
    name: "焦げた床石",
    trend: "炎の罠や火炎を使う敵がやや多い。",
    counter: "火炎耐性を高める装備、回復呪文の準備、危険な罠を回避する早期撤退判断が有効。",
    matchText: "焦げ跡の先で、床石が赤く瞬いた。"
  },
  broken_sigil: {
    name: "削られた聖印",
    trend: "アンデッドや悪魔系がやや多い。",
    counter: "不浄な存在に効果的な僧侶の対魔スペルや、聖耐性防具を準備せよ。",
    matchText: "削られた聖印の近くで、不浄な気配が具現化した。"
  },
  blood_chest: {
    name: "乾いた血痕",
    trend: "危険な罠を持つ宝箱がやや多い。",
    counter: "宝箱の強引な開封を避け、盗賊による慎重な罠鑑定と解除を徹底せよ。",
    matchText: "乾いた血痕のそばで、錠前が不自然に沈んだ。"
  },
  dry_bell: {
    name: "乾いた鈴の音",
    trend: "希少な魔物や異常遭遇が発生しやすい。",
    counter: "メタルパピーなどの珍しい出会いに備え、素早い対応と逃走阻止を意識せよ。",
    matchText: "澄んだ鈴の音が、希少な出会いを告げるように響いた。"
  },
  stale_air: {
    name: "重い空気",
    trend: "毒や麻痺の罠、状態異常を付与する敵がやや多い。",
    counter: "毒避け・麻痺避け特性の装備や、解毒・解麻痺呪文および薬品の備蓄が有効。",
    matchText: "重い空気が淀み、仕掛けの隙間から不気味な気配が漏れた。"
  },
  cold_draft: {
    name: "冷たい風",
    trend: "霊体系の魔物や、空間を歪める罠（テレポーター）がやや多い。",
    counter: "物理抵抗を持つ霊体に有効な魔術スペルや、テレポーター被弾時の位置把握手段を用意せよ。",
    matchText: "冷たい風が吹き抜け、空間の歪みがかすかに揺れた。"
  },
  iron_dust: {
    name: "積もった鉄粉",
    trend: "鎧やゴーレム系の強固な敵がやや多い。",
    counter: "打撃武器や、物理防御を無視できる攻撃呪文、侍のカタナなどが有効。",
    matchText: "床の鉄粉が、重い足音に震えた。"
  }
};

export function getOmenForFloor(seed, floor) {
  if (!seed) return null;
  const floorSeed = `${seed}-omen-floor-${floor}`;
  const rng = createRng(floorSeed);
  const idx = Math.floor(rng() * OMENS.length);
  return OMENS[idx];
}

export function isMatchedMonster(omenId, monsters) {
  if (!monsters || monsters.length === 0) return false;
  return monsters.some(m => {
    switch (omenId) {
      case "claw_marks":
        return ["rabbit", "orc"].includes(m.spriteType) || 
               m.name.includes("ネズミ") || 
               m.name.includes("ワーウルフ") || 
               m.name.includes("犬");
      case "scorched_floor":
        return ["dragon", "wisp"].includes(m.spriteType) || 
               m.name.includes("火薬") || 
               m.name.includes("ドラゴン") || 
               m.name.includes("竜") || 
               m.name.includes("灰燼") || 
               ["HALITO", "LAHALITO", "MADALTO", "TILTOWAIT"].includes(m.spell);
      case "broken_sigil":
        return m.tags && (m.tags.includes("undead") || m.tags.includes("demon"));
      case "dry_bell":
        return m.isRare || m.name.includes("メタルパピー");
      case "stale_air":
        return m.isPoisonous || m.isParalyzing || 
               m.name.includes("毒") || m.name.includes("麻痺") || m.name.includes("蛆");
      case "cold_draft":
        return (m.tags && m.tags.includes("spirit")) || ["spirit", "wisp"].includes(m.spriteType);
      case "iron_dust":
        return m.name.includes("鎧") || m.name.includes("盾") || 
               m.name.includes("ゴーレム") || m.name.includes("石像") || 
               m.name.includes("ビートル") || m.name.includes("ガード") ||
               m.spriteType === "zombie" && (m.name.includes("ゴーレム") || m.name.includes("ガード") || m.name.includes("アーマー"));
      default:
        return false;
    }
  });
}

export function isMatchedTrap(omenId, trap) {
  if (!trap || trap === "none") return false;
  switch (omenId) {
    case "blood_chest":
      return true; // 罠があること自体が一致
    case "scorched_floor":
      return trap === "flash bomb";
    case "stale_air":
      return ["poison needle", "gas bomb"].includes(trap);
    case "cold_draft":
      return trap === "teleporter";
    default:
      return false;
  }
}

export function triggerOmenDiscovery(omenId, floor) {
  if (!state.codex) return;
  if (!state.codex.events) state.codex.events = {};
  if (!state.codex.events.omens) {
    state.codex.events.omens = {
      claw_marks: { count: 0, firstFloor: 0 },
      scorched_floor: { count: 0, firstFloor: 0 },
      broken_sigil: { count: 0, firstFloor: 0 },
      blood_chest: { count: 0, firstFloor: 0 },
      dry_bell: { count: 0, firstFloor: 0 },
      stale_air: { count: 0, firstFloor: 0 },
      cold_draft: { count: 0, firstFloor: 0 },
      iron_dust: { count: 0, firstFloor: 0 }
    };
  }
  const record = state.codex.events.omens[omenId];
  if (record) {
    if (record.count === 0) {
      record.firstFloor = floor;
    }
    record.count++;
  }
}

export function triggerOmenMatch(omenId) {
  if (!state.currentRun) return;
  if (!state.currentRun.matchedOmenFloors) {
    state.currentRun.matchedOmenFloors = [];
  }
  if (!state.currentRun.matchedOmenFloors.includes(state.floor)) {
    state.currentRun.matchedOmenFloors.push(state.floor);
    const details = OMEN_DETAILS[omenId];
    if (details && details.matchText) {
      addLog(`【予兆一致】${details.matchText}`);
    }
  }
}

export function checkFloorOmenMessage() {
  if (!state.currentRun) return;
  if (!state.currentRun.seenOmenFloors) {
    state.currentRun.seenOmenFloors = [];
  }
  const floor = state.floor;
  const omen = getOmenForFloor(state.seed, floor);
  if (omen && !state.currentRun.seenOmenFloors.includes(floor)) {
    addLog(`[予兆] ${omen.text}`);
    state.currentRun.seenOmenFloors.push(floor);
    triggerOmenDiscovery(omen.id, floor);
  }
}
