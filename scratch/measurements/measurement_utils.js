const R95 = 1.959963984540054;

export const MIN_CONFIDENT_N = 30;
export const DIAGNOSTIC_MODES = Object.freeze(["off", "compact", "full"]);

export function resolveDiagnosticMode(value, fallback = "off") {
  const requested = String(value ?? fallback).trim().toLowerCase();
  if (!DIAGNOSTIC_MODES.includes(requested)) {
    throw new Error(
      `SIM_DIAGNOSTICS must be ${DIAGNOSTIC_MODES.join("|")}: ${requested}`
    );
  }
  return requested;
}

export function getBuildSnapshots(result) {
  return result?.diagnostics?.buildSnapshots || result?.buildSnapshots || [];
}

export function getBuildSnapshot(result, floor, point = "floor-start") {
  return getBuildSnapshots(result).find(snapshot =>
    snapshot.floor === floor && snapshot.point === point
  ) || null;
}

function isTrajectoryChangingOverride(condition) {
  return Boolean(
    condition?.raceBiasOverride ||
    condition?.statusScalingOverride ||
    condition?.threatOverride ||
    condition?.countermeasureOverride ||
    condition?.trapOverride ||
    condition?.mode === "attack" ||
    condition?.mode === "defense" ||
    condition?.mode === "trapBonus" ||
    condition?.mode === "combined"
  );
}

function inferTransformation(condition) {
  if (condition?.affixVolume === "increased-composition") {
    return {
      stage: "generation",
      randomConsumption: "changed",
      trajectory: "diverges",
      reason: "生成構成・候補数を変更するため乱数消費順が変わる"
    };
  }
  if (condition?.slotMode === "unlimited") {
    return {
      stage: "post-generation",
      randomConsumption: "preserved",
      trajectory: "diverges",
      reason: "生成後でも装備枠・素の装備値が変わり後続軌跡が分岐する"
    };
  }
  if (condition?.slotMode === "affixless-duplicates") {
    return {
      stage: "post-generation",
      randomConsumption: "preserved",
      trajectory: "diverges",
      reason: "duplicate は affixless でも元装備の素の stats を保持し後続軌跡が分岐する"
    };
  }
  if (isTrajectoryChangingOverride(condition)) {
    return {
      stage: "post-generation",
      randomConsumption: "preserved",
      trajectory: "diverges",
      reason: "override は生成後の遭遇・戦闘・罠へ適用されるため生成乱数は共通だが後続軌跡が分岐する"
    };
  }
  return {
    stage: "unknown",
    randomConsumption: "not-provable",
    trajectory: "not-provable",
    reason: "生成後変換・乱数消費不変・軌跡不変をコードから証明できない"
  };
}

export function inferPairingEligibility(condition) {
  const transformation = inferTransformation(condition);
  // A branched path is still one deterministic outcome per independent seed;
  // pair the run-level outcomes, but never assume post-intervention draws match.
  const eligible = transformation.stage === "post-generation" &&
    transformation.randomConsumption === "preserved" &&
    ["unchanged", "diverges"].includes(transformation.trajectory);
  return {
    eligible,
    method: eligible ? "paired" : "independent",
    ...transformation,
    rule: "post-generation + random consumption preserved + trajectory known + complete pair keys",
    trajectoryCaveat: transformation.trajectory === "diverges"
      ? "対応は生成run単位。介入後の戦闘・探索軌跡は同一とは扱わない"
      : null
  };
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
}

function interval(estimate, variance, n) {
  if (estimate === null || n <= 0) {
    return { estimate: null, low: null, high: null };
  }
  const standardError = Math.sqrt(Math.max(0, variance) / n);
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError
  };
}

export function independentDifference(leftValues, rightValues) {
  const left = leftValues.filter(Number.isFinite);
  const right = rightValues.filter(Number.isFinite);
  if (!left.length || !right.length) {
    return {
      method: "independent",
      n: 0,
      leftN: left.length,
      rightN: right.length,
      estimate: null,
      low: null,
      high: null,
      variancePerObservation: null
    };
  }
  const estimate = mean(left) - mean(right);
  const leftVariance = sampleVariance(left);
  const rightVariance = sampleVariance(right);
  const variancePerObservation = leftVariance + rightVariance;
  const variance = leftVariance / left.length + rightVariance / right.length;
  return {
    method: "independent",
    n: Math.min(left.length, right.length),
    leftN: left.length,
    rightN: right.length,
    leftVariance,
    rightVariance,
    variancePerObservation,
    ...interval(estimate, variance, 1)
  };
}

function defaultPairKey(row) {
  return row.pairId || [row.scenarioId, row.className, row.runIndex].join(":");
}

function randomSequenceMismatch(leftRows, rightRows, pairKey) {
  const right = new Map(rightRows.map(row => [pairKey(row), row]));
  return leftRows.some(row => {
    const paired = right.get(pairKey(row));
    return paired && (row.randomSequenceId ?? null) !== (paired.randomSequenceId ?? null);
  });
}

export function pairedDifference(leftRows, rightRows, selector, pairKey = defaultPairKey) {
  const left = new Map();
  const right = new Map();
  let duplicateLeft = 0;
  let duplicateRight = 0;
  leftRows.forEach(row => {
    const key = pairKey(row);
    if (left.has(key)) duplicateLeft++;
    left.set(key, row);
  });
  rightRows.forEach(row => {
    const key = pairKey(row);
    if (right.has(key)) duplicateRight++;
    right.set(key, row);
  });
  const keys = [...left.keys()].filter(key => right.has(key));
  const differences = keys
    .map(key => Number(selector(left.get(key)) - selector(right.get(key))))
    .filter(Number.isFinite);
  const estimate = mean(differences);
  const variancePerObservation = sampleVariance(differences);
  return {
    method: "paired",
    n: differences.length,
    leftN: leftRows.length,
    rightN: rightRows.length,
    pairN: keys.length,
    missingLeft: [...right.keys()].filter(key => !left.has(key)).length,
    missingRight: [...left.keys()].filter(key => !right.has(key)).length,
    duplicateLeft,
    duplicateRight,
    variancePerObservation,
    ...interval(estimate, variancePerObservation / Math.max(1, differences.length), 1)
  };
}

export function compareConditionRows({
  leftRows,
  rightRows,
  selector,
  condition,
  pairKey = defaultPairKey
}) {
  const pairing = inferPairingEligibility(condition);
  if (pairing.eligible) {
    if (randomSequenceMismatch(leftRows, rightRows, pairKey)) {
      return {
        ...independentDifference(
          leftRows.map(row => Number(selector(row))),
          rightRows.map(row => Number(selector(row)))
        ),
        pairing: {
          ...pairing,
          eligible: false,
          method: "independent",
          reason: "対応 run の randomSequenceId が一致しないため paired 不可"
        }
      };
    }
    const result = pairedDifference(leftRows, rightRows, selector, pairKey);
    if (
      result.missingLeft === 0 &&
      result.missingRight === 0 &&
      result.duplicateLeft === 0 &&
      result.duplicateRight === 0
    ) {
      return { ...result, pairing };
    }
    return {
      ...independentDifference(
        leftRows.map(row => Number(selector(row))),
        rightRows.map(row => Number(selector(row)))
      ),
      pairing: {
        ...pairing,
        eligible: false,
        method: "independent",
        reason: "対応 run の集合が完全一致しないため paired 不可"
      },
      pairedAudit: result
    };
  }
  return {
    ...independentDifference(
      leftRows.map(row => Number(selector(row))),
      rightRows.map(row => Number(selector(row)))
    ),
    pairing
  };
}

export function confidenceStatus(result, minN = MIN_CONFIDENT_N) {
  const leftN = result.leftN ?? result.n;
  const rightN = result.rightN ?? result.n;
  const n = result.method === "paired" ? result.n : Math.min(leftN, rightN);
  if (n < minN) return "未確定（N<30）";
  return "確定";
}

export function directionalStatus(result, direction, minN = MIN_CONFIDENT_N) {
  if (confidenceStatus(result, minN) !== "確定") return "未確定（N<30）";
  if (result.estimate === null) return "未観測";
  const separated = direction > 0
    ? result.low > 0
    : result.high < 0;
  return separated ? "成立" : "未観測";
}

export function samePairKey(left, right) {
  return defaultPairKey(left) === defaultPairKey(right);
}
