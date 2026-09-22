import { getCharAffixSum, getPartyMaxAffix } from "../data.js";
import {
  CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP,
  getChestItemWeightsBySource,
  rollChestAccessory,
  rollChestReward,
  rollChestSpecialReward,
  rollChestTrap
} from "../rules/chest_rules.js";
import { getChestMaterialPool } from "../rules/material_rules.js";
import { createRng } from "../seed_rng.js";

// Chest formulas remain owned by the existing chest/rule balance mapping;
// this module exposes them through explicit inputs without changing values.
export const CHEST_PHASES = Object.freeze({
  MENU: "menu",
  DISARM_SELECT: "disarm_select",
  OPEN_SELECT: "open_select",
  RESOLVING: "resolving",
  REWARD: "reward",
  TERMINAL: "terminal"
} as const);

export type ChestPhase = typeof CHEST_PHASES[keyof typeof CHEST_PHASES];
export type ChestRng = () => number;

const chestPhaseTransitions: Record<string, readonly string[]> = {
  [CHEST_PHASES.MENU]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING, CHEST_PHASES.TERMINAL],
  // Kept for compatibility with stale in-memory states from the former
  // party-selection flow. New chest actions never enter these phases.
  [CHEST_PHASES.DISARM_SELECT]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING],
  [CHEST_PHASES.OPEN_SELECT]: [CHEST_PHASES.MENU, CHEST_PHASES.RESOLVING],
  [CHEST_PHASES.RESOLVING]: [CHEST_PHASES.REWARD, CHEST_PHASES.MENU, CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.REWARD]: [CHEST_PHASES.TERMINAL],
  [CHEST_PHASES.TERMINAL]: []
};

export const CHEST_PHASE_TRANSITIONS = Object.freeze(chestPhaseTransitions);

const ELIGIBLE_STATUSES: ReadonlySet<string> = new Set(["ok", "poisoned", "blind"]);
const FALSE_TRAPS = ["poison needle", "gas bomb", "teleporter", "flash bomb", "none"] as const;
const CHEST_TAG_LABELS: Readonly<Record<string, string>> = Object.freeze({
  followUp: "連撃",
  spellPower: "術力",
  arcane: "秘術",
  devotion: "神聖",
  guardian: "守護",
  treasureSense: "宝探",
  trapBonus: "技巧",
  trapGuard: "罠守",
  antiUndead: "不死祓い",
  antiDragon: "竜殺し",
  spellGuard: "魔除け",
  poisonWard: "毒避け",
  firstStrike: "先制"
});

export interface ChestCharacterLike {
  readonly status?: string;
  readonly [key: string]: unknown;
}

export type ChestParty = readonly ChestCharacterLike[];

export interface ChestAffixLike {
  readonly type?: string;
}

export interface ChestItemLike {
  readonly kind?: string;
  readonly rarity?: string;
  readonly affixes?: readonly ChestAffixLike[];
  readonly [key: string]: unknown;
}

export type ChestLootItem = string | ChestItemLike;

export interface ChestStateLike {
  readonly phase?: string;
  readonly trap?: string;
  readonly item?: ChestLootItem | null;
  readonly specialItem?: ChestLootItem | null;
  readonly accessoryItem?: ChestLootItem | null;
}

export interface ChestRunLike {
  readonly [key: string]: unknown;
}

export interface ChestRewardEntry {
  readonly role: "main" | "special" | "accessory";
  readonly item: ChestLootItem | null | undefined;
}

export interface ChestInspectionInput {
  readonly chest?: ChestStateLike | null;
  readonly party?: ChestParty;
  readonly lightPower?: string;
  readonly lightTurns?: number;
  readonly rng?: ChestRng;
}

export interface ChestInspectionChanceResult {
  readonly chance: number;
  readonly lightBonus: number;
}

export interface ChestInspectionResult extends ChestInspectionChanceResult {
  readonly identifiedTrap: string | undefined;
}

export interface ChestLootHintInput {
  readonly item?: ChestLootItem | null;
  readonly accessoryItem?: ChestLootItem | null;
  readonly party?: ChestParty;
  readonly rng?: ChestRng;
}

export interface ChestLootHintResult {
  readonly hasEquipmentSignal: boolean;
  readonly aura: "weak" | "medium" | "strong";
  readonly label: string;
}

export interface ChestEncounterInput {
  readonly floor?: number;
  readonly x?: number;
  readonly y?: number;
  readonly seed?: string | number | null;
  readonly party?: ChestParty;
  readonly currentRun?: ChestRunLike | null;
  readonly firstChestGuaranteed?: boolean;
  readonly forcedTrap?: string | null;
  readonly forcedItem?: ChestLootItem | null;
  readonly customRng?: ChestRng | null;
  readonly fromDrop?: boolean;
}

export interface ChestEncounterResult {
  readonly trap: string;
  readonly item: ChestLootItem | null;
  readonly specialItem: ChestLootItem | null;
  readonly accessoryItem: ChestLootItem | null;
  readonly consumedFirstChestGuarantee: boolean;
  readonly lootHint: ChestLootHintResult;
}

export interface ChestMaterialOptions {
  readonly materialPoolProfile?: string;
}

interface ChestMaterialPoolOptions {
  readonly profile?: string;
}

interface ChestRewardRollInput {
  readonly floor?: number;
  readonly rng: ChestRng;
  readonly party: ChestParty;
  readonly currentRun: ChestRunLike | null;
  readonly trap: string;
  readonly firstChestGuaranteed: boolean;
  readonly includeRunes: boolean;
  readonly itemCandidates: readonly string[] | null;
  readonly itemWeights: Readonly<Record<string, number>> | null;
}

interface ChestRewardRollResult {
  readonly item: ChestLootItem | null;
  readonly consumedFirstChestGuarantee: boolean;
}

// These JS rule modules are existing runtime owners. Keep their formulas and
// call boundaries intact while giving this TS owner bounded interop types.
const getPartyMaxAffixAtBoundary = getPartyMaxAffix as unknown as (
  party: ChestParty,
  affixType: string
) => number;
const getCharAffixSumAtBoundary = getCharAffixSum as unknown as (
  character: ChestCharacterLike,
  affixType: string
) => number;
const rollChestRewardAtBoundary = rollChestReward as unknown as (
  input: ChestRewardRollInput
) => ChestRewardRollResult;
const getChestMaterialPoolAtBoundary = getChestMaterialPool as unknown as (
  floor: number,
  options?: ChestMaterialPoolOptions
) => readonly string[];

export function getChestPhase(chest: ChestStateLike | null | undefined): string {
  return chest?.phase || CHEST_PHASES.MENU;
}

export function canTransitionChestPhase(
  chest: ChestStateLike | null | undefined,
  nextPhase: string
): boolean {
  return Boolean(CHEST_PHASE_TRANSITIONS[getChestPhase(chest)]?.includes(nextPhase));
}

export function isChestActionAllowed(
  chest: ChestStateLike | null | undefined,
  phases: readonly string[],
  transitioning = false,
  { allowTransition = false }: { readonly allowTransition?: boolean } = {}
): boolean {
  if (!chest || (transitioning && !allowTransition)) return false;
  return phases.includes(getChestPhase(chest));
}

export function isEligibleChestCharacter(
  char: ChestCharacterLike | null | undefined,
  party: ChestParty = []
): boolean {
  if (!char) return false;
  return party.includes(char) && ELIGIBLE_STATUSES.has(char.status ?? "");
}

export function getActiveChestCharacter(party: ChestParty = []): ChestCharacterLike | null {
  return party.find(char => isEligibleChestCharacter(char, party)) || null;
}

export function getChestRewardEntries(
  chest: ChestStateLike | null | undefined
): ChestRewardEntry[] {
  return [
    { role: "main", item: chest?.item },
    { role: "special", item: chest?.specialItem },
    { role: "accessory", item: chest?.accessoryItem }
  ];
}

// treasureSense is information-only: it improves trap inspection reliability
// and can reveal an affix signal in the loot hint. Reward candidates, item
// chances, replacement weights, and Medium/Rune pairing remain build-blind.
export function calculateChestInspectionChance({
  party = [],
  lightPower = "",
  lightTurns = 0
}: Pick<ChestInspectionInput, "party" | "lightPower" | "lightTurns"> = {}): ChestInspectionChanceResult {
  const inspector = getActiveChestCharacter(party);
  const partyAffix = getPartyMaxAffixAtBoundary(party, "treasureSense");
  let chance = 0.30 + partyAffix / 100;
  if (inspector?.status === "blind") chance /= 2;
  const lightBonus = lightPower === "lomilwa" ? 0.25 : (lightTurns > 0 ? 0.15 : 0);
  return {
    chance: Math.min(0.95, chance + lightBonus),
    lightBonus
  };
}

export function resolveChestInspection({
  chest,
  party = [],
  lightPower = "",
  lightTurns = 0,
  rng = Math.random
}: ChestInspectionInput = {}): ChestInspectionResult {
  const { chance, lightBonus } = calculateChestInspectionChance({ party, lightPower, lightTurns });
  const identifiedTrap = rng() < chance
    ? chest?.trap
    : FALSE_TRAPS[Math.floor(rng() * FALSE_TRAPS.length)];
  return { chance, lightBonus, identifiedTrap };
}

function isChestItemRecord(item: ChestLootItem | null | undefined): item is ChestItemLike {
  return Boolean(item) && typeof item === "object";
}

function getChestAffixHints(item: ChestLootItem | null | undefined): readonly ChestAffixLike[] | undefined {
  return isChestItemRecord(item) ? item.affixes : undefined;
}

export function createChestLootHint({
  item,
  accessoryItem,
  party = [],
  rng = Math.random
}: ChestLootHintInput = {}): ChestLootHintResult {
  let aura: ChestLootHintResult["aura"] = "weak";
  let hasEquipmentSignal = false;
  if (isChestItemRecord(item) && item.kind === "equipment") {
    hasEquipmentSignal = true;
    if (item.rarity === "epic") aura = "strong";
    else if (item.rarity === "rare") aura = "medium";
  }
  if (accessoryItem) {
    hasEquipmentSignal = true;
    if (isChestItemRecord(accessoryItem) && accessoryItem.rarity === "epic") aura = "strong";
    else if (isChestItemRecord(accessoryItem) && accessoryItem.rarity === "rare" && aura !== "strong") aura = "medium";
  }

  let label = hasEquipmentSignal ? "装備品の反応あり" : "消耗品または反応なし";
  if (hasEquipmentSignal) {
    const senseSum = party.reduce((sum, char) => (
      char.status === "dead" ? sum : sum + getCharAffixSumAtBoundary(char, "treasureSense")
    ), 0);
    const shouldRevealTag = senseSum >= 5 || rng() < 0.20;
    const hintedAffix = getChestAffixHints(item)?.find(affix => Boolean(affix.type && CHEST_TAG_LABELS[affix.type]));
    const hintedAccessoryAffix = getChestAffixHints(accessoryItem)?.find(affix => Boolean(affix.type && CHEST_TAG_LABELS[affix.type]));
    if (shouldRevealTag && (hintedAffix || hintedAccessoryAffix)) {
      const affixType = hintedAffix?.type || hintedAccessoryAffix?.type;
      if (affixType) label = `${label} / 気配:${CHEST_TAG_LABELS[affixType]}`;
    }
  }
  return { hasEquipmentSignal, aura, label };
}

export function rollChestEncounter({
  floor,
  x,
  y,
  seed,
  party = [],
  currentRun = null,
  firstChestGuaranteed = false,
  forcedTrap = null,
  forcedItem = null,
  customRng = null,
  fromDrop = false
}: ChestEncounterInput = {}): ChestEncounterResult {
  const chestSeed = `${seed}:chest:B${floor}:${x},${y}`;
  const rng: ChestRng = customRng || (seed ? createRng(chestSeed) : Math.random);
  const trap: string = forcedTrap !== null ? forcedTrap : rollChestTrap(floor, rng);
  let item: ChestLootItem | null;
  let consumedFirstChestGuarantee = false;
  if (forcedItem !== null) {
    item = forcedItem;
  } else {
    const candidateFloor = Math.max(1, Math.min(30, Math.floor(Number(floor)) || 1));
    const dropCandidates: readonly string[] | null = fromDrop
      ? (CHEST_ITEM_CANDIDATES_BY_FLOOR_FROM_DROP as Record<number, readonly string[]>)[candidateFloor]
      : null;
    const reward: ChestRewardRollResult = rollChestRewardAtBoundary({
      floor,
      rng,
      party,
      currentRun,
      trap,
      firstChestGuaranteed,
      includeRunes: !fromDrop,
      itemCandidates: dropCandidates,
      itemWeights: getChestItemWeightsBySource(floor, { fromDrop })
    });
    item = reward.item;
    consumedFirstChestGuarantee = reward.consumedFirstChestGuarantee;
  }
  const specialItem: ChestLootItem | null = forcedItem === null && !fromDrop
    ? rollChestSpecialReward(floor, rng)
    : null;
  const accessoryItem: ChestLootItem | null = forcedItem === null ? rollChestAccessory(floor, rng, party) : null;
  return {
    trap,
    item,
    specialItem,
    accessoryItem,
    consumedFirstChestGuarantee,
    lootHint: createChestLootHint({ item, accessoryItem, party, rng })
  };
}

export function generateChestMaterials(
  floor: number,
  rng: ChestRng = Math.random,
  bonus = 0,
  { materialPoolProfile }: ChestMaterialOptions = {}
): Record<string, number> {
  const mats: Record<string, number> = {};
  const qty = Math.floor(rng() * 3) + 1 + bonus;
  const pool: readonly string[] = getChestMaterialPoolAtBoundary(floor, { profile: materialPoolProfile });
  for (let i = 0; i < qty; i++) {
    const mat = pool[Math.floor(rng() * pool.length)];
    mats[mat] = (mats[mat] || 0) + 1;
  }
  return mats;
}
