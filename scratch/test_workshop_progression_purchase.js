/* global console, process */

const failures = [];

function check(label, condition, detail = "") {
  if (condition) return;
  failures.push(detail ? `${label}: ${detail}` : label);
}

const originalArgv1 = process.argv[1];
process.argv[1] = "/tmp/workshop-progression-purchase-test.js";
try {
  const { purchaseCraftFromBank } = await import("../scratch/sim_workshop_progression.js");
  const { getDepartureCraftCost } = await import("../src/systems/workshop.js");

  const scenario = {
    recipeIds: ["TOWN_PORTAL", "HEAL_POTION", "ANTIDOTE", "TRAP_KIT"],
    slotLimit: 4
  };
  const partial = purchaseCraftFromBank({ "毒腺": 1 }, scenario, "wing-first");
  check("partial purchase succeeds when one recipe is affordable", partial.purchased);
  check(
    "partial purchase skips unaffordable recipes and keeps scanning",
    JSON.stringify(partial.recipeIds) === JSON.stringify(["ANTIDOTE"]),
    JSON.stringify(partial.recipeIds)
  );
  check("partial purchase spends only the purchased recipe", partial.cost["毒腺"] === 1, JSON.stringify(partial.cost));

  const priorityScenario = {
    recipeIds: ["TOWN_PORTAL", "HEAL_POTION", "ANTIDOTE"],
    slotLimit: 1
  };
  const bank = { ...getDepartureCraftCost(["TOWN_PORTAL"]), "毒腺": 1 };
  const wingFirst = purchaseCraftFromBank(bank, priorityScenario, "wing-first");
  const cheapFirst = purchaseCraftFromBank(bank, priorityScenario, "cheap-first");
  check("wing-first can choose the wing", wingFirst.recipeIds[0] === "TOWN_PORTAL", JSON.stringify(wingFirst));
  check("cheap-first can choose the antidote instead", cheapFirst.recipeIds[0] === "ANTIDOTE", JSON.stringify(cheapFirst));

  const allRecipesScenario = {
    recipeIds: [
      "TOWN_PORTAL", "HEAL_POTION", "ANTIDOTE", "TRAP_KIT", "IDENTIFY_POWDER",
      "GUARD_POTION", "HOLY_WATER", "MANA_POTION", "GREATER_HEAL"
    ],
    slotLimit: 1
  };
  const guardOnly = purchaseCraftFromBank(
    { "竜鱗": 1, "鉄片": 2 },
    allRecipesScenario,
    "cheap-first"
  );
  check("slot limit does not truncate the candidate recipe set", guardOnly.recipeIds[0] === "GUARD_POTION", JSON.stringify(guardOnly));
} catch (error) {
  failures.push(`test setup threw: ${error.stack || error.message}`);
} finally {
  process.argv[1] = originalArgv1;
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}
console.log("[PASS] workshop progression uses partial purchases and explicit priorities");
