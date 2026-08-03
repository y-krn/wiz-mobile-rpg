// sim-scope: infra
/* global console, process */

import fs from "node:fs";

const [neverPath, thresholdPath] = process.argv.slice(2);
if (!neverPath || !thresholdPath) {
  throw new Error("usage: node scratch/issue-329-one-floor-report.js never.json threshold.json");
}

const datasets = [
  {
    label: "FLEE_POLICY=never",
    data: JSON.parse(fs.readFileSync(neverPath, "utf8")),
    old: {
      retreat: [185, 240, "77.1%"],
      continue: [5751, 9673, "59.5%"],
      depth: 4.0085,
      evTime: 0.115367,
      evDepth: 2.943,
      evEvTime: 0.1664812,
      evTimeDelta: 44.3,
      depthDelta: -1.07
    }
  },
  {
    label: "FLEE_POLICY=threshold, FLEE_HP_THRESHOLD=0.35",
    data: JSON.parse(fs.readFileSync(thresholdPath, "utf8")),
    old: {
      retreat: [764, 813, "94.0%"],
      continue: [1408, 6552, "21.5%"],
      depth: 3.4505,
      evTime: 0.1498454,
      evDepth: 3.275,
      evEvTime: 0.1299865,
      evTimeDelta: -13.3,
      depthDelta: -0.18
    }
  }
];

const pct = value => Number.isFinite(Number(value))
  ? `${(Number(value) * 100).toFixed(1)}%`
  : "—";
const num = (value, digits = 2) => Number.isFinite(Number(value))
  ? Number(value).toFixed(digits)
  : "—";
const ci = interval => interval?.length === 2
  ? `[${pct(interval[0])}, ${pct(interval[1])}]`
  : "—";
const rate = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;

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
  return {
    early: 0,
    "pre-boss-early": 0,
    mid: 1,
    "pre-boss-mid": 1,
    "post-boss-mid": 1,
    late: 2,
    "post-boss-late": 2
  }[stage] ?? 9;
}

function hazardEntries(data) {
  return Object.entries(data.hazards)
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) =>
      left.floor - right.floor ||
      stageRank(left.progressStage) - stageRank(right.progressStage) ||
      left.progressStage.localeCompare(right.progressStage) ||
      left.hpBand - right.hpBand ||
      String(left.potionBand).localeCompare(String(right.potionBand))
    );
}

function dTable(data) {
  const groups = new Map();
  hazardEntries(data).filter(cell => cell.determined).forEach(cell => {
    const group = `B${cell.floor}/${cell.progressStage}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(
      `hp${cell.hpBand}/p${cell.potionBand}=${pct(cell.hazard)} ${ci(cell.hazardCi)};n=${cell.n};BE=${pct(cell.breakEven)}`
    );
  });
  return [...groups.entries()].map(([group, cells]) => `- ${group}: ${cells.join(" / ")}`);
}

function coverage(data) {
  const cells = hazardEntries(data);
  return `確定 ${cells.filter(cell => cell.determined).length}セル、未確定 ${cells.filter(cell => !cell.determined).length}セル（N<30またはBE未算出）。`;
}

function selected(data, key) {
  const cell = data.hazards[key];
  if (!cell) return `${key}: 未観測`;
  return `${key}: d=${pct(cell.hazard)} ${ci(cell.hazardCi)}, n=${cell.n}, BE=${pct(cell.breakEven)}`;
}

function divergenceLines(data, old) {
  const d = data.divergence;
  const currentRetreatRate = rate(d.currentRetreatEvContinue, d.currentRetreatKnown);
  const currentContinueRate = rate(d.currentContinueEvRetreat, d.currentContinueKnown);
  const delta = (value, prior) => `${value >= prior ? "+" : ""}${((value - prior) * 100).toFixed(1)}pt`;
  return [
    `- 現行撤退→EV続行: ${d.currentRetreatEvContinue}/${d.currentRetreatKnown}=${pct(currentRetreatRate)} ${ci(wilson(d.currentRetreatEvContinue, d.currentRetreatKnown))}（前回 ${old.retreat[2]}、差 ${delta(currentRetreatRate, old.retreat[0] / old.retreat[1])}）`,
    `- 現行続行→EV撤退: ${d.currentContinueEvRetreat}/${d.currentContinueKnown}=${pct(currentContinueRate)} ${ci(wilson(d.currentContinueEvRetreat, d.currentContinueKnown))}（前回 ${old.continue[2]}、差 ${delta(currentContinueRate, old.continue[0] / old.continue[1])}）`
  ];
}

function regionSummary(data) {
  const regions = new Map();
  data.divergence.cells.forEach(cell => {
    const key = `B${cell.floor}/${cell.progressStage}`;
    const region = regions.get(key) || {
      mismatch: 0,
      retreatToContinue: 0,
      continueToRetreat: 0,
      known: 0
    };
    region.mismatch += cell.currentRetreatEvContinue + cell.currentContinueEvRetreat;
    region.retreatToContinue += cell.currentRetreatEvContinue;
    region.continueToRetreat += cell.currentContinueEvRetreat;
    region.known += cell.n;
    regions.set(key, region);
  });
  return [...regions.entries()]
    .sort((left, right) => right[1].mismatch - left[1].mismatch)
    .slice(0, 8)
    .map(([key, value]) => `${key}: mismatch=${value.mismatch}/${value.known}（撤退→続行 ${value.retreatToContinue}、続行→撤退 ${value.continueToRetreat}）`);
}

function cellMismatchSummary(data, direction) {
  return data.divergence.cells
    .filter(cell => cell[direction] > 0)
    .sort((left, right) => right[direction] - left[direction])
    .slice(0, 8)
    .map(cell => `${cell.key} ${cell[direction]}/${cell.n}`)
    .join(" / ") || "なし";
}

function diagnostic(data, key) {
  const cell = data.hazards[key];
  if (!cell) return `${key}: 未観測`;
  return `${key}: situation=${JSON.stringify(cell.situationCounts)}, class=${JSON.stringify(cell.classStats)}`;
}

function metricLines(data, old) {
  const current = data.current;
  const ev = data.evPolicy;
  const evTimeDelta = (ev.evPerTime / current.evPerTime - 1) * 100;
  const depthDelta = ev.averageDepth - current.averageDepth;
  return [
    `- 現行: 到達 ${num(current.averageDepth)} ${num(current.averageDepthCi?.[0])}〜${num(current.averageDepthCi?.[1])}階、生還 ${pct(current.survivalRate)} ${ci(current.survivalCi)}、EV/時間 ${num(current.evPerTime, 4)} ${num(current.evPerTimeCi?.[0], 4)}〜${num(current.evPerTimeCi?.[1], 4)}、B5 ${pct(current.b5EntrantRate)}、B10 ${pct(current.b10EntrantRate)}`,
    `- EV(d>BE): 到達 ${num(ev.averageDepth)} ${num(ev.averageDepthCi?.[0])}〜${num(ev.averageDepthCi?.[1])}階、生還 ${pct(ev.survivalRate)} ${ci(ev.survivalCi)}、EV/時間 ${num(ev.evPerTime, 4)} ${num(ev.evPerTimeCi?.[0], 4)}〜${num(ev.evPerTimeCi?.[1], 4)}、B5 ${pct(ev.b5EntrantRate)}、B10 ${pct(ev.b10EntrantRate)}`,
    `- 現行→EV: 到達 ${depthDelta >= 0 ? "+" : ""}${num(depthDelta)}階、EV/時間 ${evTimeDelta >= 0 ? "+" : ""}${evTimeDelta.toFixed(1)}%（前回 ${old.evTimeDelta >= 0 ? "+" : ""}${old.evTimeDelta.toFixed(1)}%、到達 ${old.depthDelta.toFixed(2)}階）`
  ];
}

function environmentLines(data) {
  const env = data.environment;
  return [
    `- seed=${env.seed}、d observation N=${env.PORTAL_D_RUNS}、方針比較 N=${env.PORTAL_COMPARE_RUNS}、calibration=${env.SIM_CALIBRATION_RUNS}`,
    `- DEPARTURE_CRAFT_IDS=${env.DEPARTURE_CRAFT_IDS}（開始傷薬4、翼1。追加加算なし）`,
    `- TRAP_POLICY=${env.TRAP_POLICY}、TRAP_AVOIDANCE_POLICY=${env.TRAP_AVOIDANCE_POLICY}、TRAP_DAMAGE_MULTIPLIER=${env.TRAP_DAMAGE_MULTIPLIER}`,
    `- IDENTIFICATION_POLICY=${env.IDENTIFICATION_POLICY}、STATUS_CURE_POLICY=${env.STATUS_CURE_POLICY}、STATUS_CURE_HP_THRESHOLD=${env.STATUS_CURE_HP_THRESHOLD}、STATUS_CURE_MERCHANT_POLICY=${env.STATUS_CURE_MERCHANT_POLICY}`,
    `- PORTAL_HP_THRESHOLD=${env.PORTAL_HP_THRESHOLD}、PORTAL_MAX_HEAL_POTIONS=${env.PORTAL_MAX_HEAL_POTIONS}、PORTAL_MIN_FLOOR=${env.PORTAL_MIN_FLOOR}`,
    "- FLEE policyは別測定: `FLEE_POLICY=never` と `FLEE_POLICY=threshold` / `FLEE_HP_THRESHOLD=0.35`。cross-policy d流用なし。",
    `- ELITE_POLICY=${env.ELITE_POLICY}、SIM_SCENARIOS=${env.SIM_SCENARIOS}（workshop-completeのみ。workshop-unlocked不使用）`,
    "- 基本4職のみ: Fighter / Thief / Priest / Mage。上級職なし。消耗品6種・状態回復・翼をモデル化。",
    `- BANKING_RATES.retreat=${env.BANKING_RATES.retreat}、death=${env.BANKING_RATES.death}、翼費用 C=${env.wingCost}。Mは同一 observation run 群の階開始値。`,
    "- 経路: generateRunFloor → simulateRun → src/rules/*。報酬・素材・banking・TRAP_POLICY semantics変更なし。"
  ];
}

const lines = [
  "## 訂正・最新測定（#329 前回コメントの再訂正）",
  "",
  "最新値は本コメント。前回 `#issuecomment-5163963889` の continuation d、乖離率、方針比較を撤回し、1階地平線で再測定した。実装・PRなし。ゲーム側 `src/`変更なし。",
  "",
  "### 1. d の新定義と状態キー",
  "",
  "- d = その状態から、同じ階の残りを翼なしで進み、次階開始（`descendToNextFloor`直後・次のbank機会）へ到達する前に死亡する確率。状態イベント後、同階内のportal判定は記録だけし、翼使用を抑止。次階の`floor-transition`判定は地平線外。",
  "- 1階の素材増分 ΔM、階開始素材 M、BEを同じ observation run 群から算出。`BE=(ΔM+C)/((1-r)*(M+ΔM))`、C=8、r=0.3。N<30は未確定。CIはWilson 95%。",
  "- 状態キー: `(floor, progressStage, hpRate帯, healPotions帯)`。HP 0.1刻み、傷薬 `0/1/2/3+`。B5/B10/B15/B20は `pre-boss` / `post-boss` × `early/mid/late`、通常階も `early/mid/late` の経過step 3帯。",
  "- この地平線は「1階進んでもう一度判断」のmyopic比較。現行policyによる将来の救済をd定義へ混ぜない。",
  "",
  "環境（両 policy 共通）:",
  ...environmentLines(datasets[0].data),
  "",
  "### 2. 修正後 d 表（policy別・確定セル全件）",
  "",
  `#### ${datasets[0].label}`,
  `- observation horizon events=${datasets[0].data.observation.horizonEvents}、未解決=${datasets[0].data.observation.unresolvedHorizonEvents}。`,
  `- ${coverage(datasets[0].data)}`,
  ...dTable(datasets[0].data),
  "",
  `#### ${datasets[1].label}`,
  `- observation horizon events=${datasets[1].data.observation.horizonEvents}、未解決=${datasets[1].data.observation.unresolvedHorizonEvents}。`,
  `- ${coverage(datasets[1].data)}`,
  ...dTable(datasets[1].data),
  "",
  "逆転チェック:",
  `- no-flee: ${selected(datasets[0].data, "B5|pre-boss-early|hp3|p0")} / ${selected(datasets[0].data, "B5|pre-boss-early|hp9|p0")}`,
  `- no-flee: ${selected(datasets[0].data, "B4|early|hp3|p0")} / ${selected(datasets[0].data, "B4|early|hp9|p0")}`,
  `- threshold: ${selected(datasets[1].data, "B5|pre-boss-early|hp3|p0")} / ${selected(datasets[1].data, "B5|pre-boss-early|hp9|p0")}`,
  `- 判定: 旧逆転は解消。no-fleeは低HP d > 高HP d が明瞭。thresholdのB5はdが天井近く差が小さいが、旧方向（高HPほど高d）は消失。B4通常階も低HPほど高d。`,
  "",
  "職業・situation診断（主キーへ未統合）:",
  `- no-flee ${diagnostic(datasets[0].data, "B5|pre-boss-early|hp9|p0")}`,
  `- no-flee ${diagnostic(datasets[0].data, "B5|pre-boss-early|hp3|p0")}`,
  `- threshold ${diagnostic(datasets[1].data, "B5|pre-boss-early|hp9|p0")}`,
  "- 1階地平線では逆転が消えたため、職業構成は残存逆転の説明として採用しない。ただしセル内構成差は限界として残る。",
  "",
  "### 3. 乖離率（policy別）",
  "",
  `#### ${datasets[0].label}`,
  ...divergenceLines(datasets[0].data, datasets[0].old),
  `- 上位領域: ${regionSummary(datasets[0].data).join(" / ")}`,
  `- 上位セル（現行撤退→EV続行）: ${cellMismatchSummary(datasets[0].data, "currentRetreatEvContinue")}`,
  `- 上位セル（現行続行→EV撤退）: ${cellMismatchSummary(datasets[0].data, "currentContinueEvRetreat")}`,
  "",
  `#### ${datasets[1].label}`,
  ...divergenceLines(datasets[1].data, datasets[1].old),
  `- 上位領域: ${regionSummary(datasets[1].data).join(" / ")}`,
  `- 上位セル（現行撤退→EV続行）: ${cellMismatchSummary(datasets[1].data, "currentRetreatEvContinue")}`,
  `- 上位セル（現行続行→EV撤退）: ${cellMismatchSummary(datasets[1].data, "currentContinueEvRetreat")}`,
  "",
  "### 4. 方針比較（修正d使用、比較N=1000）",
  "",
  `#### ${datasets[0].label}`,
  ...metricLines(datasets[0].data, datasets[0].old),
  "",
  `#### ${datasets[1].label}（実プレイ寄り主軸）`,
  ...metricLines(datasets[1].data, datasets[1].old),
  "",
  "- policy間で符号反転は今回なし。no-flee EV/時間 +48.1%、threshold EV/時間 +30.5%。ただし旧threshold比較は -13.3%だったため、結論は頑健な単一方向ではなく、d estimand修正で大きく変わったと扱う。",
  "- 実プレイ寄りthresholdでは、EV方針はEV/時間を上げ、到達は +0.06階。B5 entrant 24.7%→0.0%、B10 0.5%→0.0%。#264への含意は「合理的判断でもB5以深へ行かない」方向は残るが、旧 no-flee の到達-1.03階という主張は撤回。",
  "",
  "### 5. 判定",
  "",
  "1. 現行方針はEV分岐点と一致しない。主軸thresholdで、現行撤退→EV続行 37.3%、現行続行→EV撤退 29.2%。両方向の不一致があり、「現行は一方向に続行しすぎ」とは断定しない。no-fleeでは10.2% / 10.6%まで縮小。",
  "2. 前回の77.1% / 59.5% / 94.0% / 21.5%は、自己参照continuation dとrun全体死亡地平線を含むため撤回。新値は1階地平線で、乖離も大幅変化。",
  "3. simはpolicy別d表を使う。current policyをd定義へ混ぜない。game側は、HP・傷薬だけでなく M・翼費用・次階ΔM・危険度・進行段階を撤退判断材料として提示できるかが設計論点。",
  "",
  "### 6. myopic近似と限界",
  "",
  "- 1階地平線はΔMとリスク地平線を一致させるmyopic近似。本来の最適停止問題が持つ「1階進んで再判断できる」オプション価値を捨てるため、真の最適より撤退寄りに出る。",
  "- それでも主軸thresholdで現行との不一致は残るが、撤退過多・続行過多が併存。最適policyの証明ではない。no-fleeで不一致が小さいため、旧の一方向結論はpolicy横断で頑健でない。",
  "- observation N=2000、比較N=1000、seed=271の1系列。N<30セルは未確定。B11以深・milestone後半は確定セルが少ない。",
  "- 3段階帯・pre/post分離。職業×situation別のN≥30表、複数seed、真の最適停止計算は未実施。純no-wing run全体d≈100%は長期地平線の別estimandであり、今回dへ混入させていない。"
];

console.log(lines.join("\n"));
