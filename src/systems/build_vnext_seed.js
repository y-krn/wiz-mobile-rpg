// Build seed offer (Build vNext, #1801). The first ordinary chest of a trial
// run offers three identified, rule-changing directions and the player keeps
// one. The offer is build-blind: it never reads the current loadout, kit or
// shortage; each direction is drawn from a fixed authored table with the run
// RNG, so every direction stays possible in every run.
//
// Since #2061 the three directions are Core families: two from the run's
// likely families and one from outside them, so one offer is never what the
// plan expected. A run saved before then keeps the weapon/defense/accessory
// table below.
import { generateRandomAccessory, generateRandomEquipment, getGeneratableCoreIds } from "./equipment_generation.js";
import { getAvailableCoreFamilyIds, getCoreFamily, pickSeedFamilies } from "../rules/core_families.js";
import { KNOWLEDGE_STAGES, setKnowledgeStage } from "../rules/identification_rules.js";
import { CURSE_EFFECTS, ITEMS } from "../data/items.js";

export const BUILD_SEED_CHOICE_ROLE = "seed";

// Each direction pairs a base with the Core that changes how it is played.
export const BUILD_SEED_DIRECTIONS = Object.freeze([
  Object.freeze({
    id: "weapon",
    options: Object.freeze([
      Object.freeze({ baseId: "DAGGER", coreId: "CORE_TECH_HONE" }),
      Object.freeze({ baseId: "SHORT_SWORD", coreId: "CORE_TECH_CHAIN" }),
      Object.freeze({ baseId: "MACE", coreId: "CORE_TECH_CHAIN" }),
      Object.freeze({ baseId: "CLAYMORE", coreId: "CORE_TECH_HONE" }),
      Object.freeze({ baseId: "SAGE_STAFF", coreId: "CORE_BLOOD_WAND" })
    ])
  }),
  Object.freeze({
    id: "defense",
    options: Object.freeze([
      Object.freeze({ baseId: "BUCKLER", coreId: "CORE_GUARD_RIPOSTE" }),
      Object.freeze({ baseId: "LARGE_SHIELD", coreId: "CORE_GUARD_RIPOSTE" }),
      Object.freeze({ baseId: "LEATHER_ARMOR", coreId: "CORE_BLOOD_TECH" }),
      Object.freeze({ baseId: "PLATE_MAIL", coreId: "CORE_BLOOD_TECH" })
    ])
  }),
  Object.freeze({
    id: "accessory",
    options: Object.freeze([
      Object.freeze({ baseId: "VNEXT_RING", coreId: "CORE_TRAP_EATER" }),
      Object.freeze({ baseId: "VNEXT_AMULET", coreId: "CORE_TRAP_EATER" })
    ])
  })
]);

export function shouldOfferBuildSeed(stateLike, { fromDrop = false } = {}) {
  const run = stateLike?.currentRun;
  return Boolean(run) && !fromDrop && run.buildSeedOffered !== true;
}

function makeLegible(item) {
  if (!item) return null;
  if (item.curseEffectId) {
    const curseTags = new Set(["curse", ...(CURSE_EFFECTS[item.curseEffectId]?.tags || [])]);
    item.tags = (item.tags || []).filter(tag => !curseTags.has(tag));
    item.curseEffectId = null;
    item.curseSuspected = false;
  }
  setKnowledgeStage(item, KNOWLEDGE_STAGES.FULL);
  return item;
}

// The (base, Core) pairs the seed offer would make, one per direction.
function chooseSeedPairs(stateLike, rng) {
  const character = stateLike?.party?.[0];
  const likely = character?.likelyCoreFamilies;
  if (!Array.isArray(likely) || likely.length === 0) {
    return BUILD_SEED_DIRECTIONS.map(direction => direction.options[Math.floor(rng() * direction.options.length)]);
  }
  const generatable = new Set(getGeneratableCoreIds(character?.unlockedAffixIds ?? null));
  const families = pickSeedFamilies(likely, getAvailableCoreFamilyIds([...generatable]), rng);
  return families.map(familyId => {
    const options = getCoreFamily(familyId).seedOptions.filter(option => generatable.has(option.coreId));
    const choice = options[Math.floor(rng() * options.length)];
    return choice ? { ...choice, familyId } : null;
  }).filter(Boolean);
}

export function generateBuildSeedOffer(stateLike, rng = Math.random) {
  const floor = stateLike?.floor || 1;
  return chooseSeedPairs(stateLike, rng).map(choice => {
    const options = {
      forceRarity: "magic",
      rng,
      party: stateLike.party,
      forceBaseId: choice.baseId,
      forceCoreId: choice.coreId
    };
    const item = ITEMS[choice.baseId]?.type === "accessory"
      ? generateRandomAccessory(floor, options)
      : generateRandomEquipment(floor, options);
    return makeLegible(item);
  }).filter(Boolean);
}
