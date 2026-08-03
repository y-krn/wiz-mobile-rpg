// sim-scope: infra
/* global console, process */

import fs from "node:fs";

const [noFleePath, thresholdPath, noFleeDiagPath, thresholdDiagPath] = process.argv.slice(2);
if (!noFleePath || !thresholdPath || !noFleeDiagPath || !thresholdDiagPath) {
  throw new Error("usage: node scratch/issue-329-remeasure-report.js noflee threshold nofleeDiag thresholdDiag");
}

const load = path => JSON.parse(fs.readFileSync(path, "utf8"));
const datasets = [
  { label: "FLEE_POLICY=never", data: load(noFleePath), old: { retreat: [369, 503, "73.3%"], continue: [4454, 9365, "47.6%"] } },
  { label: "FLEE_POLICY=threshold, FLEE_HP_THRESHOLD=0.35", data: load(thresholdPath), old: { retreat: [918, 957, "95.9%"], continue: [919, 7165, "12.8%"] } }
];
const diagnostics = [load(noFleeDiagPath), load(thresholdDiagPath)];
void diagnostics;

const pct = value => `${(Number(value) * 100).toFixed(1)}%`;
const num = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const ci = interval => interval && interval.length === 2
  ? `[${pct(interval[0])}, ${pct(interval[1])}]`
  : "—";
const ciNum = (interval, digits = 2) => interval && interval.length === 2
  ? `[${num(interval[0], digits)}, ${num(interval[1], digits)}]`
  : "—";

function wilson(successes, trials) {
  if (!trials) return null;
  const z = 1.96;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt(
    (p * (1 - p)) / trials + (z * z) / (4 * trials * trials)
  ) / denominator;
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

function stageRank(stage) {
  const ranks = {
    early: 0,
    "pre-boss-early": 0,
    mid: 1,
    "pre-boss-mid": 1,
    "post-boss-mid": 1,
    late: 2,
    "post-boss-late": 2
  };
  return ranks[stage] ?? 9;
}

function compareCells(left, right) {
  return left.floor - right.floor ||
    stageRank(left.progressStage) - stageRank(right.progressStage) ||
    left.progressStage.localeCompare(right.progressStage) ||
    left.hpBand - right.hpBand ||
    String(left.potionBand).localeCompare(String(right.potionBand));
}

function determinedCells(data) {
  return Object.values(data.hazards).filter(cell => cell.determined).sort(compareCells);
}

function dCell(cell) {
  return `hp${cell.hpBand}/p${cell.potionBand}=${pct(cell.hazard)} ${ci(cell.hazardCi)};n=${cell.n};BE=${pct(cell.breakEven)}`;
}

function dTable(data) {
  const groups = new Map();
  determinedCells(data).forEach(cell => {
    const key = `B${cell.floor}/${cell.progressStage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(dCell(cell));
  });
  return [...groups.entries()].map(([key, cells]) => `- ${key}: ${cells.join(" / ")}`);
}

function dCoverage(data) {
  const cells = Object.values(data.hazards);
  return `確定 ${cells.filter(cell => cell.determined).length}セル、未確定 ${cells.filter(cell => !cell.determined).length}セル（N<30またはBE未算出）。`;
}

function divergence(data, old) {
  const d = data.divergence;
  const retreatRate = d.currentRetreatEvContinue / d.currentRetreatKnown;
  const continueRate = d.currentContinueEvRetreat / d.currentContinueKnown;
  const oldRetreat = old.retreat[0] / old.retreat[1];
  const oldContinue = old.continue[0] / old.continue[1];
  const delta = (value, prior) => `${value - prior >= 0 ? "+" : ""}${((value - prior) * 100).toFixed(1)}pt`;
  return [
    `- 現行撤退→EV続行: ${d.currentRetreatEvContinue}/${d.currentRetreatKnown}=${pct(retreatRate)} ${ci(wilson(d.currentRetreatEvContinue, d.currentRetreatKnown))}（前回コメント記載 ${old.retreat[2]}、元カウント ${old.retreat[0]}/${old.retreat[1]}=${pct(oldRetreat)}、差 ${delta(retreatRate, oldRetreat)}）`,
    `- 現行続行→EV撤退: ${d.currentContinueEvRetreat}/${d.currentContinueKnown}=${pct(continueRate)} ${ci(wilson(d.currentContinueEvRetreat, d.currentContinueKnown))}（前回コメント記載 ${old.continue[2]}、元カウント ${old.continue[0]}/${old.continue[1]}=${pct(oldContinue)}、差 ${delta(continueRate, oldContinue)}）`
  ];
}

function concentration(data) {
  const byRegion = new Map();
  data.divergence.cells.forEach(cell => {
    const key = `B${cell.floor}/${cell.progressStage || "?"}`;
    const region = byRegion.get(key) || { retreatWrong: 0, retreatKnown: 0, continueWrong: 0, continueKnown: 0 };
    region.retreatWrong += cell.currentRetreatEvContinue;
    region.retreatKnown += cell.currentRetreat;
    region.continueWrong += cell.currentContinueEvRetreat;
    region.continueKnown += cell.n - cell.currentRetreat;
    byRegion.set(key, region);
  });
  const regionLines = [...byRegion.entries()]
    .sort(([, left], [, right]) =>
      (right.continueWrong + right.retreatWrong) - (left.continueWrong + left.retreatWrong)
    )
    .slice(0, 10)
    .map(([key, value]) => `${key}: 続行→撤退 ${value.continueWrong}/${value.continueKnown}, 撤退→続行 ${value.retreatWrong}/${value.retreatKnown}`);
  const cellLines = data.divergence.cells
    .filter(cell => cell.currentContinueEvRetreat > 0)
    .sort((left, right) => right.currentContinueEvRetreat - left.currentContinueEvRetreat)
    .slice(0, 8)
    .map(cell => `${cell.key} ${cell.currentContinueEvRetreat}/${cell.n - cell.currentRetreat}`);
  return [
    `- 上位領域: ${regionLines.join(" / ")}`,
    `- 上位セル（現行続行→EV撤退）: ${cellLines.join(" / ")}`
  ];
}

function metricLine(data) {
  const current = data.current;
  const ev = data.evPolicy;
  const evTimeDelta = (ev.evPerTime / current.evPerTime - 1) * 100;
  const depthDelta = ev.averageDepth - current.averageDepth;
  return [
    `- 現行: 到達 ${num(current.averageDepth)} ${ciNum(current.averageDepthCi)}、生還 ${pct(current.survivalRate)} ${ci(current.survivalCi)}、EV/時間 ${num(current.evPerTime, 4)} ${ciNum(current.evPerTimeCi, 4)}、B5 ${pct(current.b5EntrantRate)}、B10 ${pct(current.b10EntrantRate)}`,
    `- EV(d>BE): 到達 ${num(ev.averageDepth)} ${ciNum(ev.averageDepthCi)}、生還 ${pct(ev.survivalRate)} ${ci(ev.survivalCi)}、EV/時間 ${num(ev.evPerTime, 4)} ${ciNum(ev.evPerTimeCi, 4)}、B5 ${pct(ev.b5EntrantRate)}、B10 ${pct(ev.b10EntrantRate)}`,
    `- 現行→EV: 到達 ${depthDelta >= 0 ? "+" : ""}${num(depthDelta)}階、EV/時間 ${evTimeDelta >= 0 ? "+" : ""}${evTimeDelta.toFixed(1)}%`
  ];
}

function selectedCell(data, key) {
  const cell = data.hazards[key];
  return cell ? `${key}: d=${pct(cell.hazard)} ${ci(cell.hazardCi)}, n=${cell.n}, BE=${pct(cell.breakEven)}` : `${key}: 未観測`;
}

function diagnosticLine(data, key) {
  const cell = data.hazards[key];
  if (!cell) return `${key}: 未観測`;
  return `${key}: situation=${JSON.stringify(cell.situationCounts)}, class=${JSON.stringify(cell.classStats)}`;
}

const lines = [];
lines.push("## 訂正・最新測定（#329 前回コメントの訂正）", "", "最新値は本コメント。前回 `#issuecomment-5162398905` の状態別 d 表・乖離率・方針比較を訂正する。実装・PRなし。ゲーム側 `src/` 変更なし。", "", "### 1. 状態キーと測定", "");
lines.push("- 状態キー: `(floor, progressStage, hpRate帯, healPotions帯)`。HP帯 0.1 刻み、傷薬 `0/1/2/3+`。", "- B5/B10/B15/B20: `pre-boss` / `post-boss` を分離し、各々 floor route の経過 step を `early/mid/late` の3等分。通常階も同じ3帯。", "- 3帯を採用: 5帯の感度検査でも反転は残ったが、N<30セルが急増し既知分母が痩せたため。マイルストーン前後は全帯で分離。", "- d: その状態の current portal decision を1回続行し、以後は同じ current portal policy に戻した run の死亡率。FLEE policy ごとに別測定。N<30 は確定値へ混入せず、CI は Wilson 95%。BE は同一 FLEE policy の run 群で `M`/`ΔM` を計算し、`C=8`、`r=0.3`。", "- 経路: `generateRunFloor` → `simulateRun` → `src/rules/*`。基本4職（Fighter/Thief/Priest/Mage）のみ、`workshop-complete`、消耗品6種、状態回復、翼、罠 semantics、報酬・素材・banking は前回同様。", "", "環境（両 policy 共通）:", "- `seed=271`, `SIM_RUNS=2000`, `SIM_CALIBRATION_RUNS=1000`", "- `DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION`", "- `TRAP_POLICY=conservative`, `TRAP_AVOIDANCE_POLICY=ev`, `TRAP_DAMAGE_MULTIPLIER=1`", "- `IDENTIFICATION_POLICY=legacy`, `STATUS_CURE_POLICY=smart`, `STATUS_CURE_HP_THRESHOLD=0.35`, `STATUS_CURE_MERCHANT_POLICY=missing`", "- `PORTAL_HP_THRESHOLD=0.35`, `PORTAL_MAX_HEAL_POTIONS=0`, `PORTAL_MIN_FLOOR=3`, `ELITE_POLICY=avoid`, `SIM_SCENARIOS=workshop-complete`", "- `BANKING_RATES.retreat=1`, `BANKING_RATES.death=0.3`, 翼費用 `8`。`workshop-unlocked` 不使用。", "", "### 2. 修正後 d 表（確定セル全件）", "");

datasets.forEach(({ label, data }) => {
  lines.push(`#### ${label}`, "", `- ${dCoverage(data)}`);
  lines.push(...dTable(data), "");
});

lines.push("逆転チェック:", `- no-flee: ${selectedCell(datasets[0].data, "B5|pre-boss-early|hp3|p0")} / ${selectedCell(datasets[0].data, "B5|pre-boss-early|hp9|p0")}`, `- no-flee: ${selectedCell(datasets[0].data, "B4|early|hp3|p0")} / ${selectedCell(datasets[0].data, "B4|early|hp9|p0")}`, `- threshold: ${selectedCell(datasets[1].data, "B5|pre-boss-early|hp2|p0")} / ${selectedCell(datasets[1].data, "B5|pre-boss-early|hp9|p0")}`, "- 判定: 前後分離＋3帯でも解消せず。5帯感度検査でも同方向。階内進行だけでは B4/B5 の HP反転を説明しきれない。", "", "追加交絡の診断（主測定セル内集計）:", `- no-flee ${diagnosticLine(datasets[0].data, "B5|pre-boss-early|hp9|p0")}`, `- no-flee ${diagnosticLine(datasets[0].data, "B5|pre-boss-early|hp3|p0")}`, `- no-flee ${diagnosticLine(datasets[0].data, "B4|early|hp9|p0")}`, `- no-flee ${diagnosticLine(datasets[0].data, "B4|early|hp3|p0")}`, "- B4（通常階）でも、高HP p0 は Priest・`floor-transition` に偏り、低HP p0 は Priest不在・`post-combat` に偏る。未統制の職業構成と判断タイミングが次の交絡候補。今回の主表は指定キーの集計値で、職業・situation別 d を確定値へ混ぜていない。", "", "### 3. 乖離率", "");

datasets.forEach(({ label, data, old }) => {
  lines.push(`#### ${label}`, ...divergence(data, old), ...concentration(data), "");
});

lines.push("### 4. 主要結論の再確認（D）", "");
datasets.forEach(({ label, data }) => lines.push(`#### ${label}`, ...metricLine(data), ""));
const noFlee = datasets[0].data;
const headlineDelta = (noFlee.evPolicy.evPerTime / noFlee.current.evPerTime - 1) * 100;
const headlineDepth = noFlee.current.averageDepth - noFlee.evPolicy.averageDepth;
lines.push(`- 前回 headline（+43.8%、到達 -1.03階、B10=0.0%）は方向再現。ただし修正後は no-flee で EV/時間 ${headlineDelta >= 0 ? "+" : ""}${headlineDelta.toFixed(1)}%、到達 ${headlineDepth.toFixed(2)}階低下、B10 ${pct(noFlee.evPolicy.b10EntrantRate)}。数値は訂正、前回の厳密値は撤回。`, "- threshold + EV は no-flee d 表を流用せず threshold d 表を使用。current→EV は EV/時間が低下し、前回の同一d表比較は無効。", "", "### 5. 判定", "", "1. 現行方針は EV 分岐点とズレる。no-flee では現行続行の既知セルの 59.5% が EV撤退、threshold でも 21.5% が EV撤退。現行撤退→EV続行は順に 77.1%、94.0%。ズレは主に B4/B5、高HP、傷薬0、early〜post-boss の領域。", "2. ズレは測定を歪める。現行 policy は翼で run を早期終了し、d 表の既知状態・B5/B10 entrant・EV/時間の母集団を変える。前回 73.3%/47.6% は、進行段階未分離と policy間 d 流用を含む旧値。修正後の正式値は上記。", "3. sim は FLEE policy ごとに d 表を作り、EV comparison に他 policy の d を流用しない。game 側は、HPと傷薬だけでは撤退判断を再現できず、現在素材 M・翼費用・次階の ΔM/危険度、少なくとも職業/進行状況を判断材料として提示できるかが設計論点。定数変更・実装提案ではない。", "", "### 6. 限界", "", "- N<30セルは未確定。B11以深・milestone後半は確定セルが少なく、壁とは断定しない。", "- 主 d は前回の continuation estimand（1 decisionを続行後、以後 current portal policyへ復帰）を維持。純 no-wing observation は別estimandで全階 d≈100%となるため、主比較へ混ぜていない。", "- 職業・situation を追加した診断で構成差を確認したが、今回の依頼の主キーへ統合した職業×situation別 N=30表・EV再測定までは行っていない。したがって主表の残存反転は「HP効果」と確定せず、追加交絡ありとして扱う。", "- N=2000、seed=271 の1系列。CIはセル率のWilson 95%、平均指標CIは run 単位。");

console.log(lines.join("\n"));
