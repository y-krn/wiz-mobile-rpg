import fs from "node:fs";

const load = path => JSON.parse(fs.readFileSync(path, "utf8"));
const noFlee = load("/tmp/issue329-portal-ev-noflee-core-v5.json");
const noFleeObservation = load("/tmp/issue329-portal-ev-noflee-observe-v5.json");
const actual = load("/tmp/issue329-portal-ev-threshold-core-v5.json");
const actualSweep = load("/tmp/issue329-portal-ev-threshold-portal-v5.json");
const actualPotionSweep = load("/tmp/issue329-portal-ev-threshold-potion-v5.json");
const noFleeSweep = load("/tmp/issue329-portal-ev-noflee-portal-v5.json");

const lines = [];
const pct = value => value === null || value === undefined || !Number.isFinite(Number(value))
  ? "未確定"
  : `${(Number(value) * 100).toFixed(1)}%`;
const ciPct = value => value && value.length === 2
  ? `[${pct(value[0])}, ${pct(value[1])}]`
  : "—";
const num = (value, digits = 2) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? "—"
  : Number(value).toFixed(digits);
const ciNum = (value, digits = 2) => value && value.length === 2
  ? `[${num(value[0], digits)}, ${num(value[1], digits)}]`
  : "—";
const json = value => JSON.stringify(value);

function metricRow(label, result) {
  const terminations = Object.entries(result.terminationByReason || {})
    .map(([reason, count]) => `${reason}=${count}`)
    .join(", ");
  return `| ${label} | ${result.n} | ${num(result.averageDepth, 3)} ${ciNum(result.averageDepthCi, 3)} | ${pct(result.survivalRate)} ${ciPct(result.survivalCi)} | ${num(result.evPerTime, 4)} ${ciNum(result.evPerTimeCi, 4)} | ${pct(result.b5EntrantRate)} ${ciPct(result.b5EntrantCi)} | ${pct(result.b10EntrantRate)} ${ciPct(result.b10EntrantCi)} | ${pct(result.wingUseRate)} ${ciPct(result.wingUseCi)} | ${pct(result.wingAcquisitionRate)} ${ciPct(result.wingAcquisitionCi)} | ${terminations} |`;
}

function deltaRow(floor, entry) {
  if (!entry || !entry.n) return null;
  return `| B${floor} | ${entry.n} | ${num(entry.m, 2)} ${ciNum(entry.mCi, 2)} | ${num(entry.delta, 2)} ${ciNum(entry.deltaCi, 2)} | ${pct(entry.breakEven)} ${ciPct(entry.breakEvenCi)} |`;
}

function stateCell(cell) {
  return `hp${(cell.hpBand / 10).toFixed(1)}/p${cell.potionBand}: d=${pct(cell.hazard)} ${ciPct(cell.hazardCi)}, BE=${pct(cell.breakEven)}, n=${cell.n},runs=${cell.runs}`;
}

function mergedHazardTable() {
  const result = {};
  Object.entries(noFlee.hazards).forEach(([key, cell]) => {
    result[key] = cell;
  });
  Object.entries(noFleeObservation.observation.hazards).forEach(([key, cell]) => {
    if (cell.floor <= 2) result[key] = cell;
  });
  return result;
}

function stateHazardLines() {
  const hazards = mergedHazardTable();
  const output = [];
  for (let floor = 1; floor <= 15; floor++) {
    const cells = Object.values(hazards)
      .filter(cell => cell.floor === floor)
      .sort((left, right) => left.hpBand - right.hpBand || String(left.potionBand).localeCompare(String(right.potionBand)));
    if (!cells.length) continue;
    const determined = cells.filter(cell => cell.n >= noFlee.hazardMinN && cell.determined);
    const underN = cells.filter(cell => cell.n < noFlee.hazardMinN || !cell.determined);
    const unobserved = Math.max(0, 40 - cells.length);
    const states = determined.length ? determined.map(stateCell).join("; ") : "なし";
    output.push(`- B${floor}: 観測${cells.length}/40、確定${determined.length}、N<${noFlee.hazardMinN}等で未確定${underN.length + unobserved}（観測済み未確定${underN.length}、未観測${unobserved}）。${states}`);
  }
  return output;
}

function wilson(successes, trials) {
  if (!trials) return null;
  const z = 1.96;
  const p = successes / trials;
  const denominator = 1 + z * z / trials;
  const center = (p + z * z / (2 * trials)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function divergenceLines(dataset, label) {
  const summary = dataset.current;
  const divergence = dataset.divergence;
  const retreatTotal = summary.thresholdRetreatEvents;
  const continueTotal = summary.decisionEvents - retreatTotal;
  const retreatKnown = divergence.currentRetreatKnown;
  const continueKnown = divergence.currentContinueKnown;
  const retreatWrong = divergence.currentRetreatEvContinue;
  const continueWrong = divergence.currentContinueEvRetreat;
  const retreatUnknown = retreatTotal - retreatKnown;
  const continueUnknown = continueTotal - continueKnown;
  const rows = [`${label}: 判定イベント=${summary.decisionEvents}、現行撤退=${retreatTotal}、続行=${continueTotal}`];
  rows.push(`- 現行が撤退した既知状態: EV続行 ${retreatWrong}/${retreatKnown}=${pct(retreatKnown ? retreatWrong / retreatKnown : null)} ${ciPct(wilson(retreatWrong, retreatKnown))}。未確定状態${retreatUnknown}。`);
  rows.push(`- 現行が続行した既知状態: EV撤退 ${continueWrong}/${continueKnown}=${pct(continueKnown ? continueWrong / continueKnown : null)} ${ciPct(wilson(continueWrong, continueKnown))}。未確定状態${continueUnknown}。`);
  const hazardMap = dataset === noFlee ? mergedHazardTable() : Object.fromEntries(Object.entries(dataset.hazards));
  const cells = divergence.cells || [];
  const retreatExamples = cells
    .filter(cell => cell.currentRetreatEvContinue > 0)
    .sort((left, right) => right.currentRetreatEvContinue - left.currentRetreatEvContinue)
    .slice(0, 4);
  const continueExamples = cells
    .filter(cell => cell.currentContinueEvRetreat > 0)
    .sort((left, right) => right.currentContinueEvRetreat - left.currentContinueEvRetreat)
    .slice(0, 4);
  rows.push(`- 現行撤退→EV続行の上位: ${retreatExamples.map(cell => `${cell.key} ${cell.currentRetreatEvContinue}/${cell.currentRetreat}（d=${pct(hazardMap[cell.key]?.hazard)}, BE=${pct(hazardMap[cell.key]?.breakEven)}）`).join(" / ") || "なし"}`);
  rows.push(`- 現行続行→EV撤退の上位: ${continueExamples.map(cell => `${cell.key} ${cell.currentContinueEvRetreat}/${cell.n - cell.currentRetreat}（d=${pct(hazardMap[cell.key]?.hazard)}, BE=${pct(hazardMap[cell.key]?.breakEven)}）`).join(" / ") || "なし"}`);
  return rows;
}

function sweepRow(row) {
  const config = row.config || {};
  return `| ${Number(config.hpThreshold).toFixed(2)} | ${config.minFloor} | ${config.maxHealPotions} | ${row.n} | ${num(row.averageDepth, 3)} ${ciNum(row.averageDepthCi, 3)} | ${pct(row.survivalRate)} ${ciPct(row.survivalCi)} | ${num(row.evPerTime, 4)} ${ciNum(row.evPerTimeCi, 4)} | ${pct(row.b5EntrantRate)} ${ciPct(row.b5EntrantCi)} | ${pct(row.b10EntrantRate)} ${ciPct(row.b10EntrantCi)} | ${pct(row.wingUseRate)} ${ciPct(row.wingUseCi)} | ${pct(row.wingAcquisitionRate)} ${ciPct(row.wingAcquisitionCi)} |`;
}

function potionRow(row) {
  const config = row.config || {};
  return `| ${config.startingHealPotions} | ${row.n} | ${num(row.averageDepth, 3)} ${ciNum(row.averageDepthCi, 3)} | ${pct(row.survivalRate)} ${ciPct(row.survivalCi)} | ${num(row.evPerTime, 4)} ${ciNum(row.evPerTimeCi, 4)} | ${pct(row.b5EntrantRate)} ${ciPct(row.b5EntrantCi)} | ${pct(row.b10EntrantRate)} ${ciPct(row.b10EntrantCi)} | ${pct(row.wingUseRate)} ${ciPct(row.wingUseCi)} | ${pct(row.wingAcquisitionRate)} ${ciPct(row.wingAcquisitionCi)} |`;
}

lines.push("## 測定結果（#329追記、測定・判定のみ）");
lines.push("");
lines.push("**判定:** 現行の帰還の翼方針は EV 分岐点と整合していない。現行は一方向ではなく、低HP・傷薬枯渇の一部を早く撤退させる一方、B4/B5/B10 の高HP・傷薬0を続行させている。これにより、B3以降の翼撤退を含む深度・B5/B10 entrant の測定値を方針依存にしている。" );
lines.push("実装・PRは作成していない。以下の EV 方針は sim 内の感度分析だけで、ゲーム側の定数・ルールは変更していない。");
lines.push("");
lines.push("### 1. 前提と測定経路");
lines.push("");
lines.push("#275/#271 の同一 run 群比較を踏襲し、状態から先を `skipRetreats=1` の前向き測定で取った。状態セルは同一 run の同一階・同一セルを1回に dedupe し、N<30 は確定扱いしない。ハザードの95% CIはWilson、平均値と EV/時間比の95% CIは run 単位の正規近似。死亡損失有価値率は使っていない。");
lines.push("経路は `generateRunFloor` → `simulateRun` → `src/rules/*`。罠の selection/avoidance semantics は変更していない。報酬・素材・banking は変更していない。");
lines.push("消耗品6種、状態回復、帰還の翼は既存モデルのまま。BANKING_RATESと翼費用は純関数/既存定数から取得し、ゲーム側の式・ルールを写経していない。");
lines.push("");
lines.push("環境（共通）:");
lines.push(`- seed=${noFlee.environment.seed}、SIM_RUNS=${noFlee.environment.SIM_RUNS}、SIM_CALIBRATION_RUNS=${noFlee.environment.SIM_CALIBRATION_RUNS}`);
lines.push(`- DEPARTURE_CRAFT_IDS=${noFlee.environment.DEPARTURE_CRAFT_IDS}（TOWN_PORTAL=1、開始傷薬4。開始傷薬を別途加算していない）`);
lines.push(`- TRAP_POLICY=${noFlee.environment.TRAP_POLICY}、TRAP_AVOIDANCE_POLICY=${noFlee.environment.TRAP_AVOIDANCE_POLICY}、TRAP_DAMAGE_MULTIPLIER=${noFlee.environment.TRAP_DAMAGE_MULTIPLIER}`);
lines.push(`- IDENTIFICATION_POLICY=${noFlee.environment.IDENTIFICATION_POLICY}、STATUS_CURE_POLICY=${noFlee.environment.STATUS_CURE_POLICY}、STATUS_CURE_HP_THRESHOLD=${noFlee.environment.STATUS_CURE_HP_THRESHOLD}、STATUS_CURE_MERCHANT_POLICY=${noFlee.environment.STATUS_CURE_MERCHANT_POLICY}`);
lines.push(`- PORTAL_HP_THRESHOLD=${noFlee.environment.PORTAL_HP_THRESHOLD}、PORTAL_MAX_HEAL_POTIONS=${noFlee.environment.PORTAL_MAX_HEAL_POTIONS}、PORTAL_MIN_FLOOR=${noFlee.environment.PORTAL_MIN_FLOOR}`);
lines.push(`- ELITE_POLICY=${noFlee.environment.ELITE_POLICY}、SIM_SCENARIOS=${noFlee.environment.SIM_SCENARIOS}（workshop-complete。workshop-unlockedは使っていない）`);
lines.push(`- 職業=${noFlee.environment.classes.join(" / ")}のみ、上級職なし。BANKING_RATES.retreat=${noFlee.environment.BANKING_RATES.retreat}、death=${noFlee.environment.BANKING_RATES.death}。翼費用=${noFlee.environment.wingCost}素材（` + "`getDepartureCraftCost([\"TOWN_PORTAL\"]).any`" + "）。");
lines.push("- 主軸はFLEE_POLICY=never（FLEE_HP_THRESHOLDは非適用）。現行実プレイ寄りと掃引はFLEE_POLICY=threshold、FLEE_HP_THRESHOLD=0.35。同一 seed/series（issue271-revalidation）で比較した。");
lines.push("");
lines.push("### 2. 翼撤退の EV 分岐点");
lines.push("");
lines.push("翼費用 C=8 を入れると、現時点の累積素材 M、次階へ進む増分 ΔM、先の死亡ハザード d、死亡時 bank 率 r=0.3 は次になる。");
lines.push("- 撤退: `E_retreat = M - C`（翼を使って100% bank、素材8を失う）");
lines.push("- 続行: `E_continue = [1 - d*(1-r)] * (M + ΔM)`");
lines.push("- `BE(d) = (ΔM + C) / ((1-r)*(M+ΔM))`。`d > BE` のときだけ撤退、`d <= BE` は続行。");
lines.push("");
lines.push("no-flee主軸で測った階開始コホート（M/ΔM/BEの95% CI）:");
lines.push("| 階 | N | M | ΔM | BE |");
lines.push("| --- | ---: | ---: | ---: | ---: |");
for (let floor = 1; floor <= 20; floor++) {
  const entry = noFlee.floorEconomics[String(floor)];
  const row = entry && entry.n >= noFlee.hazardMinN ? deltaRow(floor, entry) : null;
  if (row) lines.push(row);
}
lines.push("");
lines.push("B1/B2は翼を使える階の前に近く、BE>100%。B3=約70.8%、B4=55.5%、B5=59.9%、B6以降はおおむね15〜33%まで下がる。翼費用を無視した#275型のBEより、全階で撤退側が不利になる。");
lines.push("");
lines.push("### 3. 状態別の前向き死亡ハザード");
lines.push("");
lines.push(`HP帯は0.1刻み（hp0.0〜0.9）、傷薬は0/1/2/3+。dは「その状態で翼を使わず先へ進んだ場合に、そのrunが死亡で終わる確率」。確定基準はN>=${noFlee.hazardMinN}、括弧内は95% CI、BEは同じ状態イベントの平均BE。未確定セル（N<${noFlee.hazardMinN}または未観測）は表の確定値に混ぜていない。`);
stateHazardLines().forEach(line => lines.push(line));
lines.push("");
lines.push("形状の要点: B3/B4では低HP・傷薬0でもdは概ねBE未満のセルがある一方、B4/B5のhp0.7〜0.9・p0はdが約76〜92%でBE約51〜59%を上回る。B5 hp0.2/p0はd=17.9% [10.0,29.8]、BE=53.4%で撤退条件に達しない。B10 hp0.9/p0はd=93.3% [87.4,96.6]、BE=33.5%で、現行の続行は明確にEV逆方向。B14/B15等の少数セルは壁とは呼ばず未確定とした（#271差し戻し前例に合わせた）。");
lines.push("");
lines.push("### 4. 現行方針とEV判定の乖離");
lines.push("");
lines.push("既知状態だけを分母にし、未知状態は別掲した。代表セルは no-flee 主軸の d/BE である。");
divergenceLines(noFlee, "FLEE_POLICY=never の current portal threshold").forEach(line => lines.push(line));
divergenceLines(actual, "FLEE_POLICY=threshold、FLEE_HP_THRESHOLD=0.35 の現行実プレイ寄り").forEach(line => lines.push(line));
lines.push("");
lines.push("no-flee主軸では、現行撤退の既知503件中369件（73.3% [69.3,77.0]）がEVなら続行、現行続行の既知9365件中4454件（47.6% [46.5,48.6]）がEVなら撤退。現行thresholdでは前者918/957=95.7% [94.5,97.0]、後者919/7165=12.8% [12.1,13.6]。後者の領域は特にB4/B5/B10、高HP、傷薬0に集中する。");
lines.push("");
lines.push("### 5. 現行方針の実行結果とEV方針の感度");
lines.push("");
lines.push("B5/B10 entrantは「その階のfloor snapshotが存在するrun」の割合（階へ入った割合）で、B5を抜けた割合とは別。N=2000。EV方針はno-fleeの前向き状態ハザード表を固定し、各状態でd>BEだけ撤退するsim側感度分析。");
lines.push("| 条件 | N | 平均到達 [95% CI] | 生還率 [95% CI] | EV/時間 [95% CI] | B5 entrant [95% CI] | B10 entrant [95% CI] | 翼使用率 [95% CI] | 翼入手率 [95% CI] | 終了理由 |");
lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
lines.push(metricRow("no-flee + 現行threshold", noFlee.current));
lines.push(metricRow("no-flee + EV (d>BE)", noFlee.evPolicy));
lines.push(metricRow("FLEE threshold + 現行threshold", actual.current));
lines.push(metricRow("FLEE threshold + EV (同じd表を固定)", actual.evPolicy));
lines.push("");
lines.push(`no-fleeで現行→EVは、平均到達 ${num(noFlee.current.averageDepth, 3)}→${num(noFlee.evPolicy.averageDepth, 3)}（${num(noFlee.evPolicy.averageDepth - noFlee.current.averageDepth, 3)}階）、生還率 ${pct(noFlee.current.survivalRate)}→${pct(noFlee.evPolicy.survivalRate)}、EV/時間 ${num(noFlee.current.evPerTime, 4)}→${num(noFlee.evPolicy.evPerTime, 4)}、B5 ${pct(noFlee.current.b5EntrantRate)}→${pct(noFlee.evPolicy.b5EntrantRate)}、B10 ${pct(noFlee.current.b10EntrantRate)}→${pct(noFlee.evPolicy.b10EntrantRate)}。EV方針は安全側に寄り、測定対象をB5/B10まで運ぶことはできないが、現行の閾値がEVに合わせていることを意味しない。`);
lines.push(`現行実プレイ寄りでは、currentの終了は翼${actual.current.terminationByReason["wing-retreat"] || 0}/死亡${actual.current.terminationByReason.death || 0}。翼使用が多いから生還率やEV/時間が良いという単純比較はせず、翼費用8をEV/時間に差し引いている。`);
lines.push("");
lines.push("### 6. 方針定数の掃引（FLEE_POLICY=threshold、各N=500、同一seed）");
lines.push("");
lines.push("HP threshold / min floor / max heal potions の36条件。値は `平均到達[CI] / 生還率[CI] / EV時間[CI] / B5[CI] / B10[CI] / 翼使用率 / 翼入手率`。翼入手は全条件でdeparture craft由来100%（CI下限はNによる）。");
lines.push("| HP | min | pmax | N | 到達 | 生還 | EV/時間 | B5 | B10 | 翼使用 | 翼入手 |");
lines.push("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
actualSweep.sweep.forEach(row => lines.push(sweepRow(row)));
lines.push("");
lines.push("掃引判定: min=5は生還・EV/時間・翼使用が明確に落ちる。HP=0.35ではpmax=0/1/2がほぼ同じ。HP=0.50ではpmax増で生還/翼使用が上がるがEV/時間CIは重なる。min=2/3/4も一意のkneeはなく、CIが重なる領域が多い。したがって単発の最大値で定数を決める根拠はなく、この掃引からは「有意差のある唯一のkneeなし」と判定する。");
lines.push("");
const noFleeSpot = noFleeSweep.sweep.find(row => row.config.hpThreshold === 0.35 && row.config.minFloor === 3 && row.config.maxHealPotions === 0);
const noFleeLow = noFleeSweep.sweep.find(row => row.config.hpThreshold === 0.2 && row.config.minFloor === 3 && row.config.maxHealPotions === 0);
const noFleeHigh = noFleeSweep.sweep.find(row => row.config.hpThreshold === 0.5 && row.config.minFloor === 3 && row.config.maxHealPotions === 0);
lines.push(`no-fleeのspot check（各N=${noFleeSweep.sweepRuns}）でも、現行hp=.35/min3/p0は到達${num(noFleeSpot.averageDepth, 3)}、生還${pct(noFleeSpot.survivalRate)}、EV/時間${num(noFleeSpot.evPerTime, 4)}、B5${pct(noFleeSpot.b5EntrantRate)}、B10${pct(noFleeSpot.b10EntrantRate)}。hp=.20では到達${num(noFleeLow.averageDepth, 3)}/生還${pct(noFleeLow.survivalRate)}、hp=.50では到達${num(noFleeHigh.averageDepth, 3)}/生還${pct(noFleeHigh.survivalRate)}で、翼を使わない測定対象の深さと翼使用率のトレードオフが確認できる。`);
lines.push("");
lines.push("### 7. 開始傷薬の掃引とbinding");
lines.push("");
lines.push("現行threshold、各N=1000。開始傷薬はdeparture craftのHEAL_POTION個数を2/3/4/5に置換して測定した。");
lines.push("| 開始傷薬 | N | 到達 | 生還 | EV/時間 | B5 | B10 | 翼使用 | 翼入手 |");
lines.push("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
actualPotionSweep.potionSweep.forEach(row => lines.push(potionRow(row)));
lines.push("");
lines.push(`開始傷薬4の現行coreでは、decision events=${actual.current.decisionEvents}、HP条件=${actual.current.hpConditionEvents}、傷薬条件=${actual.current.potionConditionEvents}、両方=${actual.current.bothConditionEvents}。HP-lowのうち傷薬条件も成立=${pct(actual.current.potionBindingAmongHpLow)} ${ciPct(actual.current.potionBindingAmongHpLowCi)}、傷薬-lowのうちHP条件も成立=${pct(actual.current.hpBindingAmongPotionLow)} ${ciPct(actual.current.hpBindingAmongPotionLowCi)}。したがってbindingは傷薬枯渇側で、現行のトリガーは「HP<=0.35」より「傷薬<=0」が支配的。`);
lines.push("開始傷薬2→4では到達・B5が増えるが、4→5は到達/B5が増えてもEV/時間CIが重なり、B10は増えない。2/3/4/5に統計的に孤立したkneeはない。4個は現行でも妥当なcoverage/コストの妥協点だが、EV最適と断定する結果ではなく、変更を要求する測定結果ではない。");
lines.push("");
lines.push("### 8. 最終判定と責務");
lines.push("");
lines.push("1. **EVとのズレ:** あり。翼費用8を含めるとB3〜B5のBEは約55〜71%、B6〜B12は約15〜33%。現行は階・M・ΔM・dに依存せず hp<=35% かつ傷薬0でのみ撤退するため、状態別に方向が反転する。");
lines.push("2. **測定結果への影響:** あり。no-fleeの既知状態で現行撤退の73.3%はEV続行、現行続行の47.6%はEV撤退。現行thresholdではB3〜B4の損耗で翼撤退がrunを止め、深層のd/B5/B10 entrantを選択してしまう。現行threshold N=2000は翼1029/死亡971、no-fleeは翼678/死亡1322で、同じゲーム状態でも観測母集団が変わる。");
lines.push("3. **simかgameか:** sim側では、今回のように現行thresholdを「標準結果」として単独で解釈せず、no-flee/EV方針を併記するのが是正。EV方針は深層へ行く目的なら合理的とは限らず、早期撤退が増えるため、測定用ポリシーとして採用する場合も結果の目的（安全なbankか深層到達か）を明記する必要がある。ゲーム側では、プレイヤーがM・次階のΔM・先のdを直接知らないため、現行の二値UIだけでは合理的判断を再現しにくい。撤退判断をゲーム設計論点にするなら、少なくとも素材損失8、現在の傷薬数、HP危険度、次階の危険情報を提示できるかを別途検討する。これは今回の定数変更・実装を提案するものではない。");
lines.push("");
lines.push("結論として、現行方針は測定対象を抑制しており、#392のB5改善効果を実プレイ寄りの深度指標だけで評価すると翼撤退の影響が混ざる。開始傷薬4や閾値の単発置換を決めるだけの有意なkneeは確認できない。次のゲーム側判断は、方針定数の数字合わせではなく、撤退EVに必要な情報をプレイヤーへ与えるかどうかの設計論点として扱うべきである。");

process.stdout.write(lines.join("\n") + "\n");
