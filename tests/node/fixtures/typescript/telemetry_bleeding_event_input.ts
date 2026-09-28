import type { BleedingEventInput } from "../../../../src/telemetry_bleeding_event.js";

export const bleedingEventInputFixture: BleedingEventInput = {
  event: "applied",
  safeEvents: new Set(["applied"]),
  safeReasons: new Set(["duration"]),
  safeSources: new Set(["bleedingAtk"]),
  getFloor: () => 2,
  getCharacter: () => null,
  getBuildSnapshotFields: () => ({}),
  getEnemyId: () => "いにしえの竜",
  getIsBoss: () => false,
  getIsMidboss: () => false,
  getRemainingTurns: () => 1,
  getPayoffDamage: () => 4,
  getReason: () => "duration",
  getSource: () => "bleedingAtk",
  getBuildKey: () => "bleedingAtk:12.50",
  getDamageContribution: () => 4,
  getDirectDamage: () => 8
};
