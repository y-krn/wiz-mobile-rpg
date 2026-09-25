// Diagnostic-only B candidate ownership across production combat lifecycle changes.

const IDENTITY_FIELDS = Object.freeze([
  "name", "role", "spriteType", "isRare", "treasureRare", "isBoss", "isMidboss",
  "isSummoned", "traits", "split", "summon"
]);

function identityOf(monster) {
  if (!monster || typeof monster !== "object" || typeof monster.name !== "string") {
    throw new Error("candidate lifecycle encountered an invalid initial monster identity");
  }
  return JSON.stringify(IDENTITY_FIELDS.map(field => monster[field] ?? null));
}

export function createCandidateExpLifecycle(initialMonsters, allocations) {
  if (!Array.isArray(initialMonsters) || initialMonsters.length === 0 ||
      !Array.isArray(allocations) || allocations.length !== initialMonsters.length ||
      allocations.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("candidate lifecycle requires one non-negative budget per initial monster");
  }
  const identities = initialMonsters.map(identityOf);
  if (new Set(identities).size !== identities.length) {
    throw new Error("candidate lifecycle requires distinguishable initial monster identities");
  }
  return Object.freeze({
    initialCount: initialMonsters.length,
    identities: Object.freeze(identities),
    allocations: Object.freeze([...allocations])
  });
}

export function reconcileCandidateExpLifecycle(monsters, lifecycle) {
  if (!Array.isArray(monsters) || !lifecycle || monsters.length < lifecycle.initialCount) {
    throw new Error("candidate lifecycle lost an initial monster index");
  }
  for (let index = 0; index < lifecycle.initialCount; index++) {
    if (identityOf(monsters[index]) !== lifecycle.identities[index]) {
      throw new Error(`candidate lifecycle initial identity/order drift at index ${index}`);
    }
  }
  for (let index = lifecycle.initialCount; index < monsters.length; index++) {
    if (!monsters[index] || typeof monsters[index] !== "object") {
      throw new Error(`candidate lifecycle found an invalid descendant at index ${index}`);
    }
    monsters[index].exp = 0;
  }
  return candidateSettlementBudget(monsters, lifecycle);
}

export function candidateSettlementBudget(monsters, lifecycle) {
  if (!Array.isArray(monsters) || !lifecycle || monsters.length < lifecycle.initialCount) {
    throw new Error("candidate lifecycle lost an initial monster index");
  }
  for (let index = 0; index < lifecycle.initialCount; index++) {
    if (identityOf(monsters[index]) !== lifecycle.identities[index]) {
      throw new Error(`candidate lifecycle initial identity/order drift at index ${index}`);
    }
  }
  return lifecycle.allocations.reduce((sum, budget, index) =>
    sum + (monsters[index].fled === true ? 0 : budget), 0);
}
