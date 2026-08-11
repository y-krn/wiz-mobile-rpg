// sim-scope: run — #494 EV戦闘方針の逃走閾値掃引
/* global process */

process.env.ISSUE494_MODE = "1";

// Delegates to the generateRunFloor-backed runner: import("./sim_depth_material_ev.js").
const { main } = await import("./sim_issue_489_heal_flee_threshold.js");

await main();
