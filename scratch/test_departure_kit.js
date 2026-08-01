// 出発準備（反復シンク, #234）の支払い・支給・撤去ノード返還を固定する。
const failures = [];

function check(label, condition, detail = "") {
  if (condition) return;
  failures.push(detail ? `${label}: ${detail}` : label);
}

const {
  getTotalMaterialCount,
  spendAnyMaterials
} = await import("../src/rules/material_rules.js");
const { DEPARTURE_KIT, RETIRED_WORKSHOP_NODES, WORKSHOP_NODES } = await import("../src/data/workshop.js");
const {
  canAffordDepartureKit,
  getDepartureKitGrants,
  getWorkshopGrants,
  purchaseDepartureKit
} = await import("../src/systems/workshop.js");
const { normalizeSavePayload } = await import("../src/state/save_migrations.js");

console.log("=== DEPARTURE KIT (#234) ===");

// 1. 総量支払いは在庫の多い素材から削る
const stock = { "霊粉": 30, "魔石片": 10, "骨片": 5 };
const paid = spendAnyMaterials(stock, 32);
check("spendAnyMaterials returns a result", paid !== null);
check(
  "spendAnyMaterials spends the requested total",
  paid && getTotalMaterialCount(paid.spent) === 32,
  `spent=${paid && getTotalMaterialCount(paid.spent)}`
);
check(
  "spendAnyMaterials drains the largest stock first",
  paid && paid.spent["霊粉"] === 30 && paid.balance["霊粉"] === 0,
  `霊粉 spent=${paid?.spent["霊粉"]}, left=${paid?.balance["霊粉"]}`
);
check(
  "spendAnyMaterials keeps the remaining balance consistent",
  paid && getTotalMaterialCount(paid.balance) === 45 - 32,
  `left=${paid && getTotalMaterialCount(paid.balance)}`
);
check("spendAnyMaterials rejects an unaffordable total", spendAnyMaterials(stock, 46) === null);

// 2. 出発準備の購入は合計コストちょうどを引く
const bank = { "霊粉": 40, "魔石片": 40 };
check("kit is affordable with 80 materials", canAffordDepartureKit(bank));
const purchase = purchaseDepartureKit(bank);
check("kit purchase succeeds", purchase.ok);
check(
  "kit purchase costs exactly materialCost",
  purchase.ok && getTotalMaterialCount(purchase.metaMaterials) === 80 - DEPARTURE_KIT.materialCost,
  `left=${purchase.ok && getTotalMaterialCount(purchase.metaMaterials)}`
);
const poor = purchaseDepartureKit({ "霊粉": DEPARTURE_KIT.materialCost - 1 });
check("kit purchase fails when short by one", !poor.ok && poor.reason === "insufficient_materials");
check("canAffordDepartureKit is false when short by one", !canAffordDepartureKit({ "霊粉": DEPARTURE_KIT.materialCost - 1 }));

// 3. 支給は支払った run だけに乗る
const paidGrants = getDepartureKitGrants(true);
check("paid kit grants a town portal", paidGrants.returnItems.includes("TOWN_PORTAL"));
check("paid kit grants identify powder", paidGrants.identifyPowder === 1);
const unpaidGrants = getDepartureKitGrants(false);
check("unpaid kit grants nothing", unpaidGrants.returnItems.length === 0 && unpaidGrants.identifyPowder === 0);

// 4. 買い切りノードからは翼・鑑定粉が出ない（出発準備へ移管済み）
const fullWorkshop = { ranks: Object.fromEntries(WORKSHOP_NODES.map(node => [node.id, node.maxRank || 1])) };
const workshopGrants = getWorkshopGrants(fullWorkshop);
check(
  "workshop nodes no longer grant return items",
  workshopGrants.returnItems.length === 0,
  `returnItems=${JSON.stringify(workshopGrants.returnItems)}`
);
check(
  "workshop nodes no longer grant identify powder",
  workshopGrants.identifyPowder === 0,
  `identifyPowder=${workshopGrants.identifyPowder}`
);

// 5. 撤去ノードのランクは消え、支払い済み素材が返る
const retiredRanks = Object.fromEntries(RETIRED_WORKSHOP_NODES.map(node => [node.id, 1]));
const restored = normalizeSavePayload({
  version: 12,
  workshop: { ranks: { ...retiredRanks, stat_str: 2 } },
  metaMaterials: { "霊粉": 1 }
});
RETIRED_WORKSHOP_NODES.forEach(node => {
  check(
    `retired node ${node.id} is removed from save`,
    restored.workshop.ranks[node.id] === undefined,
    `rank=${restored.workshop.ranks[node.id]}`
  );
});
check("surviving node ranks are untouched", restored.workshop.ranks.stat_str === 2);
// 霊粉5+呪布2 と 黒角4+竜鱗1 が返る
check(
  "retired node costs are refunded",
  restored.metaMaterials["霊粉"] === 6
    && restored.metaMaterials["呪布"] === 2
    && restored.metaMaterials["黒角"] === 4
    && restored.metaMaterials["竜鱗"] === 1,
  JSON.stringify({
    霊粉: restored.metaMaterials["霊粉"],
    呪布: restored.metaMaterials["呪布"],
    黒角: restored.metaMaterials["黒角"],
    竜鱗: restored.metaMaterials["竜鱗"]
  })
);
const untouched = normalizeSavePayload({
  version: 12,
  workshop: { ranks: { stat_str: 1 } },
  metaMaterials: { "霊粉": 3 }
});
check("saves without retired ranks are not refunded", untouched.metaMaterials["霊粉"] === 3);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}
console.log(`[PASS] departure kit: ${DEPARTURE_KIT.materialCost} materials per run, retired nodes refunded`);
