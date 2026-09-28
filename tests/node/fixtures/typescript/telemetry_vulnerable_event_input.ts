import type { VulnerableEventInput } from "../../../../src/telemetry_vulnerable_event.js";

export const vulnerableEventInputFixture: VulnerableEventInput = {
  event: "consumed",
  safeEvents: new Set(["attempt", "applied", "refresh", "consumed", "expired", "cleared"]),
  safeReasons: new Set(["duration", "defeat", "flee", "self-destruct", "counterattack", "death", "spell"]),
  safeSources: new Set(["VULNERA"]),
  safeHitTypes: new Set(["physical", "spell"]),
  getFloor: () => 2,
  getCharacter: () => null,
  getBuildSnapshotFields: () => ({}),
  getEnemyId: () => "いにしえの竜",
  getIsBoss: () => false,
  getIsMidboss: () => false,
  getRemainingTurns: () => 1.5,
  getMultiplier: () => 2.5,
  getReason: () => "duration",
  getSource: () => "VULNERA",
  getBuildKey: () => "VULNERA",
  getQualifyingHitType: () => "spell",
  getLatencyTurns: () => 2.5,
  getDamageContribution: () => 4,
  getDirectDamage: () => 8
};
