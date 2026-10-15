/**
 * 阅卷公平性模型（纯函数，无 IO、无随机，服务端与客户端共用）。
 *
 * 规范见 `docs/GRADING_FAIRNESS_MODEL.md`：
 *   r = μ + α(考生) + β(题目) + γ(讲师) + ε        ← 三因子加法固定效应
 * 关键约束：
 *   - 只在关联图连通分量内拟合（不同分量各有截距，不可互比）；
 *   - 秩亏 ⇒ 一律不校正（γ := 0、可信度 0、verdict "unknown"），只给有界解画残差图；
 *   - 讲师宽严按观测数加权居中，于是 Σ n_j·bias_j = 0；
 *   - 校正按 λ·m_j·bias_j 施加，并补一个统一偏移使整届均分守恒。
 */

import { factorize, matrixRank, maxDiagonal, type LinearSolver } from "./matrix";
import type {
  FairnessAdjustmentOptions,
  GradingLeaderboardRow,
  GradingModelFit,
  GradingObservation,
  JudgerEstimate,
  JudgerVerdict,
} from "./types";

/** 95% 双侧区间临界值 */
const CRITICAL_Z = 1.96;
/** 秩亏时加到正规方程对角线上的岭强度（相对 Gram 最大对角元素） */
const RIDGE_SCALE = 1e-6;
/** 人工权重上限 */
const MAX_MANUAL_WEIGHT = 2;
/** 名次并列判定容差 */
const RANK_TOLERANCE = 1e-9;
/**
 * 残差尺度下限（得分率单位）：低于它视为「模型完美拟合」。
 * 真实阅卷数据不可能出现零残差，此时不做统计推断（标准误 null、不校正），
 * 而不是报出一个无限置信度的结论。
 */
const RESIDUAL_SD_FLOOR = 1e-9;

export const clampRatio = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const clampPoints = (points: number, maxPoints: number): number =>
  Number.isFinite(points) ? Math.min(maxPoints, Math.max(0, points)) : 0;

const clampLambda = (lambda: number): number =>
  Number.isFinite(lambda) ? Math.min(1, Math.max(0, lambda)) : 0;

const uniqueSorted = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

const effectOf = (effects: Record<string, number>, id: number): number =>
  effects[String(id)] ?? 0;

/** 得分率；满分非正时返回 null（该观测不参与模型） */
const ratioOf = (observation: GradingObservation): number | null =>
  observation.maxPoints > 0 ? clampRatio(observation.points / observation.maxPoints) : null;

type PreparedObservation = GradingObservation & { ratio: number };

/** 并查集：把每条观测的考生 / 题目 / 讲师三个节点连起来 */
class DisjointSet {
  private readonly parents = new Map<string, string>();

  find(key: string): string {
    const parent = this.parents.get(key);
    if (parent === undefined) {
      this.parents.set(key, key);
      return key;
    }
    if (parent === key) return key;
    const root = this.find(parent);
    this.parents.set(key, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents.set(leftRoot, rightRoot);
  }
}

/** 各因子的第一个水平作参照（无独立列），其余水平映射到全局列号 */
function buildColumnMap(ids: number[], offset: number): Map<number, number> {
  const columns = new Map<number, number>();
  for (let index = 1; index < ids.length; index += 1) {
    columns.set(ids[index], offset + index - 1);
  }
  return columns;
}

type ComponentFit = {
  identifiable: boolean;
  rank: number;
  observationCount: number;
  residualSumOfSquares: number;
  candidateEffects: Map<number, number>;
  problemEffects: Map<number, number>;
  judgerEffects: Map<number, number>;
  /** 讲师 → 居中后的宽严估计（收缩前）；不可辨识时为空 */
  judgerBiases: Map<number, number>;
  /** 讲师 → 对比向量 c_j = e_j − Σ_k (n_k/N) e_k */
  judgerContrasts: Map<number, Float64Array>;
  solver: LinearSolver;
  parameterCount: number;
};

/** 在一个连通分量内做最小二乘拟合（规范 §3–§4） */
function fitComponent(observations: PreparedObservation[]): ComponentFit {
  const candidateIds = uniqueSorted(observations.map((row) => row.userFlowId));
  const problemIds = uniqueSorted(observations.map((row) => row.problemId));
  const judgerIds = uniqueSorted(observations.map((row) => row.judgerId));

  const candidateColumns = buildColumnMap(candidateIds, 1);
  const problemColumns = buildColumnMap(problemIds, 1 + (candidateIds.length - 1));
  const judgerColumns = buildColumnMap(
    judgerIds,
    1 + (candidateIds.length - 1) + (problemIds.length - 1),
  );
  const parameterCount =
    1 + (candidateIds.length - 1) + (problemIds.length - 1) + (judgerIds.length - 1);

  const gram = new Float64Array(parameterCount * parameterCount);
  const rhs = new Float64Array(parameterCount);
  const row = [0];

  for (const observation of observations) {
    row.length = 1;
    const candidateColumn = candidateColumns.get(observation.userFlowId);
    if (candidateColumn !== undefined) row.push(candidateColumn);
    const problemColumn = problemColumns.get(observation.problemId);
    if (problemColumn !== undefined) row.push(problemColumn);
    const judgerColumn = judgerColumns.get(observation.judgerId);
    if (judgerColumn !== undefined) row.push(judgerColumn);

    for (const left of row) {
      rhs[left] += observation.ratio;
      for (const right of row) gram[left * parameterCount + right] += 1;
    }
  }

  /* 讲师之间必须至少有一对可比（否则 γ 根本不存在），再加满秩条件 */
  const rank = matrixRank(gram, parameterCount);
  const fullRank = rank === parameterCount;
  const identifiable = fullRank && judgerIds.length >= 2;

  /* 满秩就精确求解（哪怕只有 1 名讲师：拟合值仍要准）；秩亏才走岭回退 */
  let solver = fullRank ? factorize(gram, parameterCount) : null;
  if (!solver) {
    /* 秩亏：加岭求一个有界解，仅供重建拟合值 / 残差图，统计量一律不输出 */
    const ridge = Math.max(maxDiagonal(gram, parameterCount), 1) * RIDGE_SCALE;
    const ridged = Float64Array.from(gram);
    for (let index = 0; index < parameterCount; index += 1) {
      ridged[index * parameterCount + index] += ridge;
    }
    solver = factorize(ridged, parameterCount);
  }
  if (!solver) {
    /* 岭保证正定，理论上不可达；兜底为「全零效应」而不是抛错 */
    return {
      identifiable: false,
      rank,
      observationCount: observations.length,
      residualSumOfSquares: Number.NaN,
      candidateEffects: new Map(candidateIds.map((id) => [id, 0])),
      problemEffects: new Map(problemIds.map((id) => [id, 0])),
      judgerEffects: new Map(judgerIds.map((id) => [id, 0])),
      judgerBiases: new Map(),
      judgerContrasts: new Map(),
      solver: { solve: (vector: Float64Array) => Float64Array.from(vector) },
      parameterCount,
    };
  }

  const coefficients = solver.solve(rhs);
  const intercept = coefficients[0];

  const candidateEffects = new Map<number, number>();
  for (const id of candidateIds) {
    const column = candidateColumns.get(id);
    /* 截距折进考生效应，于是 fitted = candidate + problem + judger（多分量时各自截距不同） */
    candidateEffects.set(id, intercept + (column === undefined ? 0 : coefficients[column]));
  }

  const problemEffects = new Map<number, number>();
  for (const id of problemIds) {
    const column = problemColumns.get(id);
    problemEffects.set(id, column === undefined ? 0 : coefficients[column]);
  }

  const judgerEffects = new Map<number, number>();
  for (const id of judgerIds) {
    const column = judgerColumns.get(id);
    judgerEffects.set(id, column === undefined ? 0 : coefficients[column]);
  }

  /* 残差：fitted = candidate + problem + judger（截距已折入考生效应） */
  let residualSumOfSquares = 0;
  for (const observation of observations) {
    const fitted =
      (candidateEffects.get(observation.userFlowId) ?? 0) +
      (problemEffects.get(observation.problemId) ?? 0) +
      (judgerEffects.get(observation.judgerId) ?? 0);
    const residual = observation.ratio - fitted;
    residualSumOfSquares += residual * residual;
  }

  /* 对比向量：δ_j = γ_j − Σ_k (n_k/N)·γ_k（n 加权居中 ⇒ Σ n_j δ_j = 0） */
  const observationCounts = new Map<number, number>();
  for (const observation of observations) {
    observationCounts.set(
      observation.judgerId,
      (observationCounts.get(observation.judgerId) ?? 0) + 1,
    );
  }
  const total = observations.length;
  const judgerContrasts = new Map<number, Float64Array>();
  const judgerBiases = new Map<number, number>();
  for (const judgerId of judgerIds) {
    const contrast = new Float64Array(parameterCount);
    const ownColumn = judgerColumns.get(judgerId);
    if (ownColumn !== undefined) contrast[ownColumn] += 1;
    for (const other of judgerIds) {
      const column = judgerColumns.get(other);
      if (column === undefined) continue;
      contrast[column] -= (observationCounts.get(other) ?? 0) / total;
    }
    judgerContrasts.set(judgerId, contrast);

    if (identifiable) {
      let value = 0;
      for (let index = 0; index < parameterCount; index += 1) {
        value += contrast[index] * coefficients[index];
      }
      judgerBiases.set(judgerId, value);
    }
  }

  return {
    identifiable,
    rank,
    observationCount: observations.length,
    residualSumOfSquares,
    candidateEffects,
    problemEffects,
    judgerEffects,
    judgerBiases,
    judgerContrasts,
    solver,
    parameterCount,
  };
}

/** DerSimonian–Laird 矩估计：讲师之间真实差异的标准差平方（规范 §5） */
function estimateBetweenJudgerVariance(
  biases: number[],
  standardErrors: Array<number | null>,
): number {
  const usable = biases
    .map((bias, index) => ({ bias, standardError: standardErrors[index] }))
    .filter(
      (entry): entry is { bias: number; standardError: number } =>
        entry.standardError !== null && entry.standardError > 0,
    );

  if (usable.length < 2) return 0;

  const weights = usable.map((entry) => 1 / (entry.standardError * entry.standardError));
  const sumWeights = weights.reduce((total, weight) => total + weight, 0);
  if (!(sumWeights > 0)) return 0;

  const weightedMean =
    usable.reduce((total, entry, index) => total + weights[index] * entry.bias, 0) / sumWeights;
  const q = usable.reduce(
    (total, entry, index) => total + weights[index] * (entry.bias - weightedMean) ** 2,
    0,
  );
  const denominator = sumWeights - weights.reduce((total, weight) => total + weight * weight, 0) / sumWeights;
  if (!(denominator > 0)) return 0;

  return Math.max(0, (q - (usable.length - 1)) / denominator);
}

/** 判定：δ_j ∓ 1.96·s_j 是否跨越 0（规范 §6，不做多重比较校正） */
function verdictOf(
  rawBias: number,
  standardError: number | null,
  identifiable: boolean,
): JudgerVerdict {
  if (!identifiable || standardError === null || !(standardError > 0)) return "unknown";
  const halfWidth = CRITICAL_Z * standardError;
  if (rawBias - halfWidth > 0) return "lenient";
  if (rawBias + halfWidth < 0) return "strict";
  return "fair";
}

function emptyFit(skippedObservationCount: number, clampedObservationCount: number): GradingModelFit {
  return {
    observationCount: 0,
    skippedObservationCount,
    clampedObservationCount,
    candidateCount: 0,
    problemCount: 0,
    judgerCount: 0,
    residualSd: null,
    betweenJudgerSd: 0,
    identifiable: false,
    componentCount: 0,
    identifiableComponentCount: 0,
    candidateEffects: {},
    problemEffects: {},
    judgerEffects: {},
    judgers: [],
  };
}

export function fitGradingModel(observations: GradingObservation[]): GradingModelFit {
  const prepared: PreparedObservation[] = [];
  let skippedObservationCount = 0;
  let clampedObservationCount = 0;

  for (const observation of observations) {
    const ratio = ratioOf(observation);
    if (ratio === null || !Number.isFinite(observation.judgerId) || observation.judgerId <= 0) {
      skippedObservationCount += 1;
      continue;
    }
    if (observation.points > observation.maxPoints || observation.points < 0) {
      clampedObservationCount += 1;
    }
    prepared.push({ ...observation, ratio });
  }

  if (prepared.length === 0) return emptyFit(skippedObservationCount, clampedObservationCount);

  /* 关联图连通分量：分量之间不可互比，各自拟合 */
  const disjointSet = new DisjointSet();
  for (const observation of prepared) {
    disjointSet.union(`c:${observation.userFlowId}`, `p:${observation.problemId}`);
    disjointSet.union(`p:${observation.problemId}`, `j:${observation.judgerId}`);
  }
  const buckets = new Map<string, PreparedObservation[]>();
  for (const observation of prepared) {
    const root = disjointSet.find(`c:${observation.userFlowId}`);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(observation);
    else buckets.set(root, [observation]);
  }
  const components = Array.from(buckets.values()).map(fitComponent);

  const observationCount = prepared.length;
  const rank = components.reduce((total, component) => total + component.rank, 0);
  const residualSumOfSquares = components.reduce(
    (total, component) => total + component.residualSumOfSquares,
    0,
  );
  const degreesOfFreedom = observationCount - rank;
  const rawResidualSd =
    degreesOfFreedom > 0 ? Math.sqrt(Math.max(residualSumOfSquares, 0) / degreesOfFreedom) : null;
  /* 完美拟合（残差低到不可能出现在真实数据里）⇒ 不做统计推断 */
  const residualSd =
    rawResidualSd !== null && rawResidualSd > RESIDUAL_SD_FLOOR ? rawResidualSd : null;

  /* 标准误：s_j = σ̂·sqrt(c_jᵀ(XᵀX)⁻¹c_j)，一次分解、每名讲师一次回代 */
  const standardErrors = new Map<number, number | null>();
  for (const component of components) {
    for (const [judgerId, contrast] of component.judgerContrasts) {
      if (!component.identifiable || residualSd === null) {
        standardErrors.set(judgerId, null);
        continue;
      }
      const solved = component.solver.solve(contrast);
      let quadratic = 0;
      for (let index = 0; index < component.parameterCount; index += 1) {
        quadratic += contrast[index] * solved[index];
      }
      standardErrors.set(judgerId, residualSd * Math.sqrt(Math.max(quadratic, 0)));
    }
  }

  const rawBiases = new Map<number, number>();
  for (const component of components) {
    for (const [judgerId, bias] of component.judgerBiases) rawBiases.set(judgerId, bias);
  }

  const judgerIds = Array.from(standardErrors.keys());
  const betweenJudgerVariance = estimateBetweenJudgerVariance(
    judgerIds.map((judgerId) => rawBiases.get(judgerId) ?? 0),
    judgerIds.map((judgerId) => standardErrors.get(judgerId) ?? null),
  );

  const observationCounts = new Map<number, number>();
  const candidateCounts = new Map<number, Map<number, number>>();
  const ratioSums = new Map<number, number>();
  for (const observation of prepared) {
    observationCounts.set(
      observation.judgerId,
      (observationCounts.get(observation.judgerId) ?? 0) + 1,
    );
    ratioSums.set(
      observation.judgerId,
      (ratioSums.get(observation.judgerId) ?? 0) + observation.ratio,
    );
    const candidates = candidateCounts.get(observation.judgerId) ?? new Map<number, number>();
    candidates.set(observation.userFlowId, (candidates.get(observation.userFlowId) ?? 0) + 1);
    candidateCounts.set(observation.judgerId, candidates);
  }

  const judgerEstimates: JudgerEstimate[] = judgerIds.map((judgerId) => {
    const component = components.find((candidate) =>
      candidate.judgerContrasts.has(judgerId),
    );
    /* 「可辨识」= 设计矩阵满秩且讲师之间可比；残差尺度缺失只影响统计推断（标准误/判定），
       不影响点估计：规范 §8 要求此时仍如实输出 δ_j，只是不做校正。 */
    const identifiable = component?.identifiable ?? false;
    const rawBias = identifiable ? rawBiases.get(judgerId) ?? 0 : 0;
    const standardError = identifiable ? standardErrors.get(judgerId) ?? null : null;
    const credibility =
      standardError !== null && standardError > 0 && betweenJudgerVariance > 0
        ? betweenJudgerVariance / (betweenJudgerVariance + standardError * standardError)
        : 0;

    return {
      judgerId,
      observationCount: observationCounts.get(judgerId) ?? 0,
      candidateCount: candidateCounts.get(judgerId)?.size ?? 0,
      rawMeanRatio:
        (ratioSums.get(judgerId) ?? 0) / Math.max(observationCounts.get(judgerId) ?? 0, 1),
      adjustedMeanRatio: 0,
      rawBias,
      bias: credibility === 0 ? 0 : credibility * rawBias,
      standardError,
      credibility,
      identifiable,
      verdict: verdictOf(rawBias, standardError, identifiable),
    };
  });

  /* 展示顺序：可判定的在前（按偏松→偏严），不可判定的排最后 */
  judgerEstimates.sort(
    (left, right) =>
      Number(right.identifiable) - Number(left.identifiable) ||
      right.bias - left.bias ||
      left.judgerId - right.judgerId,
  );

  const fit: GradingModelFit = {
    observationCount,
    skippedObservationCount,
    clampedObservationCount,
    candidateCount: new Set(prepared.map((row) => row.userFlowId)).size,
    problemCount: new Set(prepared.map((row) => row.problemId)).size,
    judgerCount: judgerIds.length,
    residualSd,
    betweenJudgerSd: Math.sqrt(betweenJudgerVariance),
    identifiable: components.every((component) => component.identifiable),
    componentCount: components.length,
    identifiableComponentCount: components.filter((component) => component.identifiable).length,
    candidateEffects: Object.fromEntries(
      components.flatMap((component) => Array.from(component.candidateEffects.entries())),
    ),
    problemEffects: Object.fromEntries(
      components.flatMap((component) => Array.from(component.problemEffects.entries())),
    ),
    judgerEffects: Object.fromEntries(
      components.flatMap((component) => Array.from(component.judgerEffects.entries())),
    ),
    judgers: judgerEstimates,
  };

  /* 第二遍：λ=1、m=1、保持整体均分时的校正后平均得分率（供哑铃图） */
  for (const estimate of fit.judgers) {
    const rows = prepared.filter((row) => row.judgerId === estimate.judgerId);
    estimate.adjustedMeanRatio =
      rows.reduce((total, row) => total + adjustedRatio(row, fit, { lambda: 1 }), 0) /
      Math.max(rows.length, 1);
  }

  return fit;
}

/** 拟合值（得分率）。截距已折入考生效应，故这里是三项之和。 */
export function fittedRatio(observation: GradingObservation, fit: GradingModelFit): number {
  return (
    effectOf(fit.candidateEffects, observation.userFlowId) +
    effectOf(fit.problemEffects, observation.problemId) +
    effectOf(fit.judgerEffects, observation.judgerId)
  );
}

/** 标准化残差 z = (r − fitted) / σ̂；自由度不足或无残差尺度时为 null */
export function standardizedResidual(
  observation: GradingObservation,
  fit: GradingModelFit,
): number | null {
  const ratio = ratioOf(observation);
  if (ratio === null || fit.residualSd === null || !(fit.residualSd > 0)) return null;
  return (ratio - fittedRatio(observation, fit)) / fit.residualSd;
}

/** 人工权重 m_j：未设置按 1，非法值按 1，范围收敛到 0..2 */
export function judgerManualWeight(
  options: FairnessAdjustmentOptions,
  judgerId: number,
): number {
  const raw = options.judgerWeights?.[String(judgerId)];
  if (raw === undefined || !Number.isFinite(raw)) return 1;
  return Math.min(MAX_MANUAL_WEIGHT, Math.max(0, raw));
}

/** 该讲师的收缩后宽严估计（不可判定时为 0） */
export function judgerBiasOf(fit: GradingModelFit, judgerId: number): number {
  const estimate = fit.judgers.find((candidate) => candidate.judgerId === judgerId);
  return estimate ? estimate.bias : 0;
}

/** 施加在该讲师观测上的校正量 λ·m_j·bias(j)（未含统一偏移） */
export function correctionFor(
  fit: GradingModelFit,
  judgerId: number,
  options: FairnessAdjustmentOptions,
): number {
  const lambda = clampLambda(options.lambda);
  if (lambda <= 0) return 0;
  return lambda * judgerManualWeight(options, judgerId) * judgerBiasOf(fit, judgerId);
}

/**
 * 统一偏移 O = λ·Σ n_k m_k bias(k) / N。
 * 补回它之后校正只重新分配分数、不改变整届均分（`preserveTotal = false` 时不做）。
 */
export function cohortOffset(fit: GradingModelFit, options: FairnessAdjustmentOptions): number {
  const lambda = clampLambda(options.lambda);
  if (lambda <= 0 || options.preserveTotal === false || fit.observationCount <= 0) return 0;
  let weighted = 0;
  for (const estimate of fit.judgers) {
    weighted +=
      estimate.observationCount * judgerManualWeight(options, estimate.judgerId) * estimate.bias;
  }
  return (lambda * weighted) / fit.observationCount;
}

/** 校正后的得分率（截断到 [0,1]；满分非正的观测返回 0） */
export function adjustedRatio(
  observation: GradingObservation,
  fit: GradingModelFit,
  options: FairnessAdjustmentOptions,
): number {
  const ratio = ratioOf(observation);
  if (ratio === null) return 0;
  const correction = correctionFor(fit, observation.judgerId, options) - cohortOffset(fit, options);
  return clampRatio(ratio - correction);
}

function rankBy(
  rows: GradingLeaderboardRow[],
  selectRatio: (row: GradingLeaderboardRow) => number,
  assignRank: (row: GradingLeaderboardRow, rank: number) => void,
): void {
  const sorted = [...rows].sort(
    (left, right) => selectRatio(right) - selectRatio(left) || left.userFlowId - right.userFlowId,
  );
  let rank = 0;
  let previous = Number.NaN;
  sorted.forEach((row, index) => {
    const value = selectRatio(row);
    if (index === 0 || Math.abs(value - previous) > RANK_TOLERANCE) rank = index + 1;
    assignRank(row, rank);
    previous = value;
  });
}

/**
 * 考生名次表：原始分 / 校正分 / 名次变化。
 * 名次用并列同名次的竞赛排名（1,2,2,4）。
 */
export function buildLeaderboard(
  observations: GradingObservation[],
  fit: GradingModelFit,
  options: FairnessAdjustmentOptions,
): GradingLeaderboardRow[] {
  const grouped = new Map<
    number,
    { count: number; rawPoints: number; maxPoints: number; adjustedPoints: number }
  >();

  for (const observation of observations) {
    if (!(observation.maxPoints > 0)) continue;
    const entry = grouped.get(observation.userFlowId) ?? {
      count: 0,
      rawPoints: 0,
      maxPoints: 0,
      adjustedPoints: 0,
    };
    entry.count += 1;
    entry.maxPoints += observation.maxPoints;
    entry.rawPoints += clampPoints(observation.points, observation.maxPoints);
    entry.adjustedPoints += Math.round(
      clampRatio(adjustedRatio(observation, fit, options)) * observation.maxPoints,
    );
    grouped.set(observation.userFlowId, entry);
  }

  const rows: GradingLeaderboardRow[] = Array.from(grouped.entries()).map(
    ([userFlowId, entry]) => ({
      userFlowId,
      observationCount: entry.count,
      rawPoints: entry.rawPoints,
      maxPoints: entry.maxPoints,
      adjustedPoints: entry.adjustedPoints,
      rawRatio: entry.maxPoints > 0 ? entry.rawPoints / entry.maxPoints : 0,
      adjustedRatio: entry.maxPoints > 0 ? entry.adjustedPoints / entry.maxPoints : 0,
      rawRank: 0,
      adjustedRank: 0,
      rankDelta: 0,
    }),
  );

  rankBy(
    rows,
    (row) => row.rawRatio,
    (row, rank) => {
      row.rawRank = rank;
    },
  );
  rankBy(
    rows,
    (row) => row.adjustedRatio,
    (row, rank) => {
      row.adjustedRank = rank;
    },
  );
  for (const row of rows) row.rankDelta = row.rawRank - row.adjustedRank;

  return rows.sort(
    (left, right) =>
      right.adjustedRatio - left.adjustedRatio ||
      right.rawRatio - left.rawRatio ||
      left.userFlowId - right.userFlowId,
  );
}
