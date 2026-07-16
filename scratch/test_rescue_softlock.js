import { state, canRecruitRescueNewcomer, isSoftlocked } from "../src/state.js";
import { getReviveCost } from "../src/rules/revive_rules.js";

let failed = 0;

function check(condition, label, detail = "") {
  if (condition) {
    console.log(`-> [PASS] ${label}`);
    return;
  }

  failed++;
  console.error(`-> [FAIL] ${label}${detail ? ` (${detail})` : ""}`);
}

function setRoster(roster, gold) {
  state.roster = roster;
  state.party = [];
  state.gold = gold;
}

const levelFiveDead = () => ({ name: "死亡者", class: "Fighter", level: 5, status: "dead" });

setRoster([levelFiveDead()], 300);
check(
  canRecruitRescueNewcomer() === true,
  "旧閾値帯域では救済新人を募集できる",
  `actual: ${canRecruitRescueNewcomer()}`
);
check(isSoftlocked() === true, "旧閾値帯域を詰みと判定する", `actual: ${isSoftlocked()}`);

setRoster([], 9999);
check(
  canRecruitRescueNewcomer() === true,
  "名簿が空なら救済新人を募集できる",
  `actual: ${canRecruitRescueNewcomer()}`
);

setRoster([levelFiveDead()], 500);
check(
  canRecruitRescueNewcomer() === false,
  "最安蘇生費を支払える場合は募集できない",
  `actual: ${canRecruitRescueNewcomer()}`
);
check(isSoftlocked() === false, "最安蘇生費を支払える場合は詰みでない", `actual: ${isSoftlocked()}`);

setRoster([
  { name: "生存者1", class: "Fighter", level: 1, status: "ok" },
  { name: "生存者2", class: "Priest", level: 1, status: "ok" }
], 0);
check(
  canRecruitRescueNewcomer() === false,
  "生存者2人以上では募集できない",
  `actual: ${canRecruitRescueNewcomer()}`
);

check(
  getReviveCost({ level: 5, status: "dead" }) === 500,
  "死亡蘇生費はレベル×100",
  `actual: ${getReviveCost({ level: 5, status: "dead" })}`
);
check(
  getReviveCost({ level: 5, status: "ash" }) === 1500,
  "灰蘇生費はレベル×300",
  `actual: ${getReviveCost({ level: 5, status: "ash" })}`
);

if (failed > 0) {
  console.error(`${failed}件の検証に失敗`);
  process.exit(1);
}

console.log("全滅救済・蘇生費検証: 全件成功");
