import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimScopeDeclaration } from "../../measurements/measurement_env_signature.js";

// 各 sim は先頭 20 行以内に `// sim-scope: <scope>` を宣言する。宣言を必須にすることで
// 新規 sim にも判断を強制し、レガシー生成器の直叩き（深層を無音で誤測定する）を
// 機械的に検出できる。scope ごとの制約は SCOPE_RULES を参照。
const SCOPE_RULES = {
  // ラン単位の経済・到達性を測る。フロア配置に依存するため generateRunFloor 経由が必須。
  run: { requiresRunFloor: true, allowsLegacyMap: false },
  // 式・遭遇率・回復量など、フロア配置に依存しない検証。
  formula: { requiresRunFloor: false, allowsLegacyMap: false },
  // マップ生成器そのものを測る。理由の併記が必須。
  map: { requiresRunFloor: false, allowsLegacyMap: true, requiresReason: true },
  // sim 実行ハーネス。測定を行わないため全チェックを免除する。
  infra: { requiresRunFloor: false, allowsLegacyMap: true, exempt: true }
};

const simulationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../simulations");
const simulationFiles = fs.readdirSync(simulationsDir)
  .filter(name => /^sim_.*\.js$/.test(name));
const failures = [];

const depthSimulationName = "sim_depth_material_ev.js";
const depthSimulationSource = fs.readFileSync(
  path.join(simulationsDir, depthSimulationName),
  "utf8"
);
const detectRateCalls = [...depthSimulationSource.matchAll(
  /calculateDetectRate\s*\(\s*\)/g
)];
if (detectRateCalls.length === 0) {
  failures.push(`${depthSimulationName}: calculateDetectRate call is missing`);
} else {
  if (!/getSimulationTrapBonus\s*\(\s*character[\s\S]*?getCharTrapBonus\s*\(\s*character\s*\)/.test(depthSimulationSource)) {
    failures.push(
      `${depthSimulationName}: trapBonus conversion must read the simulated party`
    );
  }
  if (
    depthSimulationSource.includes(["trap", "Sense"].join("")) ||
    depthSimulationSource.includes(["trap", "_sense"].join(""))
  ) {
    failures.push(`${depthSimulationName}: retired trap affix identifiers must not remain in the canonical sim`);
  }
  if (!/calculateFloorTrapSuccessRate\s*\(/.test(depthSimulationSource)) {
    failures.push(`${depthSimulationName}: flame trap success rate must use the src floor-trap helper`);
  }
  if (!/resolveTrapAction\s*\(/.test(depthSimulationSource)) {
    failures.push(`${depthSimulationName}: flame trap outcome must use the src trap roll helper`);
  }
  if (!/resolveFloorTrapEffect\s*\(/.test(depthSimulationSource)) {
    failures.push(`${depthSimulationName}: flame trap damage must use the src floor-trap effect helper`);
  }
  if (/FLAME_TRAP_(TRAP_GUARD_OVERRIDE|WARNING_AVOIDANCE_CHANCE|DAMAGE_MULTIPLIER)/.test(depthSimulationSource)) {
    failures.push(`${depthSimulationName}: removed flame-trap what-if overrides must not bypass src behavior`);
  }
}

for (const name of simulationFiles) {
  const source = fs.readFileSync(path.join(simulationsDir, name), "utf8");

  // 報酬・レベルアップの直呼びは scope を問わず禁止。ラウンド解決を通さないと
  // 報酬が二重適用される（#281）。
  if (/applyCombatRewards\s*\(/.test(source)) {
    failures.push(`${name}: applyCombatRewards must be reached through round resolution`);
  }
  if (/checkCharLevelUp\s*\(/.test(source)) {
    failures.push(`${name}: checkCharLevelUp must not be repeated after round rewards`);
  }

  // 宝箱の抽選を sim 内に写経すると src/rules/chest_rules.js の変更に追随せず、
  // 供給の測定だけが静かに古くなる（#273）。定義を持たせず import させる。
  for (const symbol of ["rollChestTrap", "rollChestAccessory", "rollChestReward", "CHEST_ITEM_CANDIDATES_BY_FLOOR"]) {
    const definition = new RegExp(`(?:function|const|let|var)\\s+${symbol}\\b`);
    if (definition.test(source)) {
      failures.push(`${name}: ${symbol} must be imported from src/rules/chest_rules.js, not redefined`);
    }
  }

  const scope = parseSimScopeDeclaration(source);
  if (!scope) {
    failures.push(
      `${name}: missing "// sim-scope: <${Object.keys(SCOPE_RULES).join("|")}>" declaration in the first 20 lines`
    );
    continue;
  }
  const rule = SCOPE_RULES[scope.name];
  if (!rule) {
    failures.push(`${name}: unknown sim-scope "${scope.name}" (expected ${Object.keys(SCOPE_RULES).join(", ")})`);
    continue;
  }
  if (rule.exempt) continue;

  if (rule.requiresReason && !scope.reason) {
    failures.push(`${name}: sim-scope "${scope.name}" requires a reason, e.g. "// sim-scope: ${scope.name} — <理由>"`);
  }

  if (rule.requiresRunFloor) {
    const usesGeneratedRun = source.includes("generateRunFloor(")
      || source.includes('from "./sim_depth_material_ev.js"')
      || source.includes('import("./sim_depth_material_ev.js")');
    if (!usesGeneratedRun) {
      failures.push(`${name}: sim-scope "run" must use the generateRunFloor-backed path`);
    }
  }

  if (!rule.allowsLegacyMap && /generateRandomMap\s*\(/.test(source)) {
    failures.push(
      `${name}: sim-scope "${scope.name}" must not call the legacy generateRandomMap (use generateRunFloor, or declare sim-scope: map with a reason)`
    );
  }
}

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(`[PASS] ${simulationFiles.length} sim files declare a sim-scope and use a single source reward/level path`);
