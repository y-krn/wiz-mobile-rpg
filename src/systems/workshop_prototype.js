// The workshop's prototypes (#2109). Before each departure the workshop
// offers three prototypes, one per Core family: a plain base carrying a Core
// and nothing else. The player may take one into the run for a few early
// materials. It is paid at every departure, used up by the run, and never
// kept: what is brought home stays terminal evidence like any equipment.
//
// The offer is build-blind: it reads the save seed and the number of runs,
// never the loadout or the kit, so it is a possibility, not a target. Cores
// the workshop's memories open join the offer.
import { createRng } from "../seed_rng.js";
import { CURSE_EFFECTS, ITEMS } from "../data/items.js";
import { getCoreFamily } from "../rules/core_families.js";
import { KNOWLEDGE_STAGES, setKnowledgeStage } from "../rules/identification_rules.js";
import { generateRandomAccessory, generateRandomEquipment, getGeneratableCoreIds } from "./equipment_generation.js";
import { getDrawableCoreFamilyIds } from "./core_families.js";
import { getWorkshopGrants } from "./workshop.js";

export const PROTOTYPE_OFFER_COUNT = 3;

// What a prototype of each family costs, in materials found on the first
// three floors of the mine.
export const PROTOTYPE_COSTS = Object.freeze({
  technique: Object.freeze({ "獣の牙": 2, "骨片": 2 }),
  guard: Object.freeze({ "硬い皮": 3, "獣の牙": 1 }),
  blood: Object.freeze({ "毒腺": 2, "骨片": 2 }),
  curse: Object.freeze({ "呪布": 2, "霊粉": 2 }),
  trap: Object.freeze({ "硬い皮": 2, "毒腺": 2 }),
  stealth: Object.freeze({ "霊粉": 2, "硬い皮": 2 }),
  blight: Object.freeze({ "毒腺": 3, "霊粉": 1 }),
  arcane: Object.freeze({ "霊粉": 2, "骨片": 2 })
});

function shuffled(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** The three prototypes on offer before the next departure. */
export function getPrototypeOffers(stateLike) {
  const runNumber = Math.max(0, Math.floor(Number(stateLike?.records?.totalRuns) || 0));
  const rng = createRng(`${stateLike?.seed || "workshop"}:prototype:${runNumber}`);
  const generatable = new Set(getGeneratableCoreIds(getWorkshopGrants(stateLike?.workshop).affixIds));
  const offers = [];
  for (const familyId of shuffled(getDrawableCoreFamilyIds(stateLike), rng)) {
    if (offers.length >= PROTOTYPE_OFFER_COUNT) break;
    const family = getCoreFamily(familyId);
    const options = (family?.seedOptions || []).filter(option => generatable.has(option.coreId) && ITEMS[option.baseId]);
    if (options.length === 0) continue;
    const option = options[Math.floor(rng() * options.length)];
    offers.push(Object.freeze({
      familyId,
      familyName: family.name,
      baseId: option.baseId,
      coreId: option.coreId,
      cost: PROTOTYPE_COSTS[familyId] || Object.freeze({ "獣の牙": 2, "硬い皮": 2 })
    }));
  }
  return offers;
}

export function canAffordPrototype(metaMaterials, offer) {
  if (!offer) return false;
  return Object.entries(offer.cost).every(([name, quantity]) => (Number(metaMaterials?.[name]) || 0) >= quantity);
}

/** The materials left after paying for `offer`, or null when they fall short. */
export function payForPrototype(metaMaterials, offer) {
  if (!canAffordPrototype(metaMaterials, offer)) return null;
  const next = { ...metaMaterials };
  Object.entries(offer.cost).forEach(([name, quantity]) => { next[name] = (Number(next[name]) || 0) - quantity; });
  return next;
}

/**
 * Make the prototype: its base with its Core and no Support, identified and
 * free of curses, marked as the workshop's.
 */
export function createPrototypeItem(offer, { party = null, rng = Math.random } = {}) {
  if (!offer || !ITEMS[offer.baseId]) return null;
  const options = { forceRarity: "magic", rng, party, forceBaseId: offer.baseId, forceCoreId: offer.coreId };
  const item = ITEMS[offer.baseId].type === "accessory"
    ? generateRandomAccessory(1, options)
    : generateRandomEquipment(1, options);
  if (!item) return null;
  item.affixes = (item.affixes || []).filter(affix => affix?.kind === "core");
  if (item.curseEffectId) {
    const curseTags = new Set(["curse", ...(CURSE_EFFECTS[item.curseEffectId]?.tags || [])]);
    item.tags = (item.tags || []).filter(tag => !curseTags.has(tag));
  }
  item.curseEffectId = null;
  item.curseSuspected = false;
  item.workshopPrototype = true;
  setKnowledgeStage(item, KNOWLEDGE_STAGES.FULL);
  return item;
}
