const { generateRandomMap, getTrapChokeRate } = await import("../src/map_generator.js");

console.log("=== TRAP CHOKE DISTRIBUTION ===");
console.log("floor | traps | choke | actual | target | shortfall");

const FLOORS = [1, 3, 5, 8, 10, 12, 15, 20];
const SAMPLES = 100;

for (const floor of FLOORS) {
  let totalTraps = 0;
  let totalChoke = 0;
  let shortfalls = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const map = generateRandomMap(floor, null, `CHOKE_SIM_${floor}_${i}`);
    const meta = map.trapMeta;
    totalTraps += meta.total;
    totalChoke += meta.choke;
    if (meta.choke < meta.chokeTargeted) shortfalls++;
  }

  const actualRate = totalChoke / totalTraps;
  const targetRate = getTrapChokeRate(floor);
  console.log(
    `B${String(floor).padStart(2)}   | ` +
    `${(totalTraps / SAMPLES).toFixed(1).padStart(5)} | ` +
    `${(totalChoke / SAMPLES).toFixed(1).padStart(5)} | ` +
    `${actualRate.toFixed(3).padStart(6)} | ` +
    `${targetRate.toFixed(3).padStart(6)} | ` +
    `${((shortfalls / SAMPLES) * 100).toFixed(0).padStart(3)}%`
  );
}

console.log("\nshortfall = チョーク候補が目標数に届かなかったフロアの割合");
console.log("目標との乖離が大きい、またはshortfallが5割を超える深度は要調整。");
