// sim_floor_density.js の100 seed平均クリティカル経路戦闘数を使う資源曲線概算。
// HPプールを100、1戦平均被害を最大HPの9%とし、B2/B4通過後に失った分の40%を回復する。
const EXPECTED_COMBATS = [2.47, 2.17, 2.80, 2.25, 2.40];
const DAMAGE_PER_COMBAT = 9;

function simulate(withCamps) {
  let hp = 100;
  return EXPECTED_COMBATS.map((combats, index) => {
    const floor = index + 1;
    hp -= combats * DAMAGE_PER_COMBAT;
    const beforeRest = hp;
    if (withCamps && (floor === 2 || floor === 4)) {
      hp += (100 - hp) * 0.4;
    }
    return { floor, beforeRest, afterRest: hp };
  });
}

const withoutCamps = simulate(false);
const withCamps = simulate(true);
console.log("camp recovery proxy (HP pool=100, average damage/combat=9)");
console.log("without camps B5 remaining:", withoutCamps.at(-1).afterRest.toFixed(1));
console.log("with camps B5 remaining:", withCamps.at(-1).afterRest.toFixed(1));
console.log("camp route:", withCamps.map(row => `B${row.floor}:${row.afterRest.toFixed(1)}`).join(" -> "));

if (withoutCamps.at(-1).afterRest >= 0) throw new Error("baseline should exhaust the proxy HP pool before B5 completion");
if (withCamps.at(-1).afterRest <= 0) throw new Error("camps should make B5 completion possible in the proxy");
if (withCamps.at(-1).afterRest >= 40) throw new Error("camps should not make B5 comfortable");
