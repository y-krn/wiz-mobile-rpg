// balance-impact: none — persisted facility purchases only (#2009).
//
// Which facility nodes have been bought. Whether a facility is open is not
// stored here: it follows from the rescue feat (`src/state/feats_state.ts`).

export interface NormalizedFacilitiesState {
  nodes: string[];
}

const NODE_LIMIT = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createDefaultFacilitiesState(): NormalizedFacilitiesState {
  return { nodes: [] };
}

export function isNormalizedFacilitiesState(value: unknown): value is NormalizedFacilitiesState {
  return isRecord(value) && Array.isArray(value.nodes) && value.nodes.length <= NODE_LIMIT &&
    value.nodes.every(nodeId => typeof nodeId === "string" && nodeId.length > 0) &&
    new Set(value.nodes).size === value.nodes.length;
}

/** A save from before facilities loads with nothing bought. */
export function normalizeFacilitiesState(value: unknown): NormalizedFacilitiesState {
  const source = isRecord(value) && Array.isArray(value.nodes) ? value.nodes : [];
  return {
    nodes: [...new Set(source.filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeId.length > 0))]
      .slice(0, NODE_LIMIT)
  };
}

/** People who can be led out of the dungeon. */
export const COMPANION_IDS = Object.freeze(["foreman"] as const);
export type CompanionId = typeof COMPANION_IDS[number];
export type NormalizedCompanion = CompanionId | null;

export function isNormalizedCompanion(value: unknown): value is NormalizedCompanion {
  return value === null || (typeof value === "string" && COMPANION_IDS.includes(value as CompanionId));
}

export function normalizeCompanion(value: unknown): NormalizedCompanion {
  return isNormalizedCompanion(value) ? value : null;
}
