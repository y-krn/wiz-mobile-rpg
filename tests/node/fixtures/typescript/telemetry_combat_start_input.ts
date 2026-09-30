import {
  buildCombatStartPayload,
  type CombatStartPayload,
  type CombatStartPayloadInput
} from "../../../../src/telemetry_combat_start.js";

export const combatStartPayloadInputFixture: CombatStartPayloadInput = {
  runId: "run-fixture",
  combatId: "combat-fixture",
  context: { contextOnly: "kept", floor: 99 },
  combat: {
    floor: 3,
    player: { hp: "12.5", mp: null },
    monsters: [{ name: "Goblin A" }],
    isBoss: 0,
    isMidboss: "yes",
    isRoamingFlack: false
  },
  maxEnemySnapshot: 8,
  normalizeEnemyId: name => name === "Goblin A" ? "Goblin" : "other"
};

export const combatStartPayloadFixture: CombatStartPayload =
  buildCombatStartPayload(combatStartPayloadInputFixture);
