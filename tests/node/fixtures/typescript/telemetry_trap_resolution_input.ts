import {
  buildTrapResolutionPayload,
  type TrapResolutionPayload,
  type TrapResolutionPayloadInput
} from "../../../../src/telemetry_trap_resolution.js";

export const trapResolutionPayloadInputFixture: TrapResolutionPayloadInput = {
  runId: "run-fixture",
  context: { contextOnly: "kept", floor: 99, trapBonus: "context build" },
  floor: 3,
  source: "floor",
  trapType: "damage",
  outcome: "triggered",
  x: 7,
  y: 8,
  details: {
    action: "disarm",
    successRate: "55.5",
    trap: { difficulty: "42" },
    partialSuccess: true,
    identified: false,
    toolId: "TRAP_KIT",
    toolUsed: true
  },
  safeActions: new Set(["disarm", "inspect"]),
  safeToolIds: new Set(["TRAP_KIT", "TRAP_SENSE_STONE"]),
  build: {
    trapBonus: 11,
    trapGuard: 12,
    detectionSupport: 13,
    treasureSense: 14,
    hearRange: 15,
    traceRead: 16,
    trapKitCount: 2,
    availableToolIds: ["TRAP_KIT"],
    coreIds: ["CORE_TRAP_EATER"],
    coreTrapEater: true,
    coreTombRaider: false
  }
};

export const trapResolutionPayloadFixture: TrapResolutionPayload =
  buildTrapResolutionPayload(trapResolutionPayloadInputFixture);
