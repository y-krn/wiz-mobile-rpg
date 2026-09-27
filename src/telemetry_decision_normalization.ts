export type TelemetryDecisionAction =
  | "attack"
  | "spell"
  | "item"
  | "defend"
  | "flee"
  | "heal"
  | "cure"
  | "return"
  | "continue"
  | "descend"
  | "compare"
  | "commit"
  | "cancel"
  | "equip"
  | "trial"
  | "unequip"
  | "discard"
  | "identify"
  | "investigate"
  | "other";

const DECISION_ACTION_ALIASES: Readonly<Record<string, TelemetryDecisionAction>> = {
  fight: "attack",
  attack: "attack",
  spell: "spell",
  item: "item",
  defend: "defend",
  run: "flee",
  flee: "flee",
  heal: "heal",
  cure: "cure",
  rest: "heal",
  drink: "heal",
  return: "return",
  continue: "continue",
  descend: "descend",
  compare: "compare",
  commit: "commit",
  cancel: "cancel",
  equip: "equip",
  trial: "trial",
  unequip: "unequip",
  discard: "discard",
  identify: "identify",
  investigate: "investigate"
};

export function normalizeDecisionAction(action: unknown): TelemetryDecisionAction {
  if (typeof action !== "string" || !Object.hasOwn(DECISION_ACTION_ALIASES, action)) return "other";
  return DECISION_ACTION_ALIASES[action];
}

export function normalizeTargetIndex(value: unknown, partySize: unknown): number | null {
  const boundedPartySize = Math.min(8, Math.max(0, Number(partySize) || 0));
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < boundedPartySize
    ? value
    : null;
}

export function normalizeCombatIndex(
  value: unknown,
  collectionSize: unknown,
  allowAllTarget: unknown = false
): number | null {
  if (allowAllTarget === true && value === -1) return -1;
  return normalizeTargetIndex(value, collectionSize);
}

export function normalizeDirection(
  value: unknown,
  safeDirections: ReadonlySet<number>
): number | null {
  return typeof value === "number" && Number.isInteger(value) && safeDirections.has(value)
    ? value
    : null;
}
