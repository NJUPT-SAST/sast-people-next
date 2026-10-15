/**
 * 阅卷公平性模型（纯函数，无 IO、无随机，服务端与客户端共用）。
 *
 * 规范见 `docs/GRADING_FAIRNESS_MODEL.md`：
 *   r = μ + α(考生) + β(题目) + γ(讲师) + ε        ← 三因子加法固定效应
 * 关键约束：
 *   - 只在关联图连通分量内拟合（不同分量各有截距，不可互比）；
 *   - 可辨识性按**讲师**判定（设计矩阵零空间）：只有与其他讲师两两可比的讲师才给宽严估计，
 *     孤立的讲师报「不可判定」而**不牵连**同分量的其他讲师；
 *   - 可比的讲师按「两两可比」分成若干**可比簇**，只在簇内居中（不同簇之间不可比）；
 *   - 不可辨识 ⇒ 不校正（bias := 0、可信度 0、verdict "unknown"），岭解只用于重建残差图；
 *   - 校正按 λ·m_j·bias_j 施加，并按**题目满分**加权补一个统一偏移，使整届原始总分守恒。
 */

import { factorize, nullSpaceBasis, maxDiagonal, type LinearSolver } from "./matrix";
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
/**
 * 「对比可估」判定的容差：对比向量与正交归一零空间基的点积低于它即视为 0。
 * 真实数据里这个点积要么是消元噪声（≲1e-12），要么是 O(0.1~1)，中间地带不存在。
 */
const CONTRAST_TOLERANCE = 1e-7;

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

/** 分量内的一簇「两两可比」讲师：只有簇内才允许相互比较与居中 */
type ComparableCluster = {
  judgerIds: number[];
  /** 簇内观测数之和（簇内居中的权重分母） */
  observationCount: number;
  /** 讲师 → 对比向量 c_j = e_j − Σ_{k∈簇} (n_k/N_簇) e_k（已投影到可估子空间） */
  contrasts: Map<number, Float64Array>;
  /** 讲师 → 簇内居中后的宽严估计（收缩前） */
  biases: Map<number, number>;
};

type ComponentFit = {
  /** 分量内全部讲师落在同一个可比簇里（且 ≥2 名） */
  fullyComparable: boolean;
  rank: number;
  observationCount: number;
  residualSumOfSquares: number;
  candidateEffects: Map<number, number>;
  problemEffects: Map<number, number>;
  judgerEffects: Map<number, number>;
  /** 可比簇（每簇 ≥2 名讲师） */
  clusters: ComparableCluster[];
  /** 没有可比对象的讲师：不给任何估计，也不牵连别人 */
  isolatedJudgerIds: number[];
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

  /* 秩与零空间由同一次消元给出（零空间维数 = 参数数 − 秩） */
  const nullBasis = nullSpaceBasis(gram, parameterCount);
  const rank = parameterCount - nullBasis.length;
  const fullRank = nullBasis.length === 0;

  /* 满秩就精确求解（哪怕只有 1 名讲师：拟合值仍要准）；秩亏才走岭回退 */
  let solver = fullRank ? factorize(gram, parameterCount) : null;
  if (!solver) {
    /* 秩亏：加岭求一个有界解，仅供重建拟合值与残差图（拟合值在零方向下不变） */
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
      fullyComparable: false,
      rank,
      observationCount: observations.length,
      residualSumOfSquares: Number.NaN,
      candidateEffects: new Map(candidateIds.map((id) => [id, 0])),
      problemEffects: new Map(problemIds.map((id) => [id, 0])),
      judgerEffects: new Map(judgerIds.map((id) => [id, 0])),
      clusters: [],
      isolatedJudgerIds: judgerIds,
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

  const observationCounts = new Map<number, number>();
  for (const observation of observations) {
    observationCounts.set(
      observation.judgerId,
      (observationCounts.get(observation.judgerId) ?? 0) + 1,
    );
  }

  /* 讲师的效应列：参照讲师没有独立列，其向量为零向量（γ_ref ≡ 0） */
  const judgerVectors = judgerIds.map((judgerId) => {
    const vector = new Float64Array(parameterCount);
    const column = judgerColumns.get(judgerId);
    if (column !== undefined) vector[column] = 1;
    return vector;
  });
  /** 该对比是否可估：与零空间正交 ⟺ 落在设计矩阵的行空间里 */
  const isEstimable = (contrast: Float64Array): boolean =>
    nullBasis.every((basis) => {
      let dot = 0;
      for (let index = 0; index < parameterCount; index += 1) dot += contrast[index] * basis[index];
      return Math.abs(dot) <= CONTRAST_TOLERANCE;
    });
  /** 投影到可估子空间：抹掉浮点噪声残留的零空间分量（否则岭解会把它放大成天文数字） */
  const projectOut = (contrast: Float64Array): Float64Array => {
    const projected = Float64Array.from(contrast);
    for (const basis of nullBasis) {
      let dot = 0;
      for (let index = 0; index < parameterCount; index += 1) dot += projected[index] * basis[index];
      for (let index = 0; index < parameterCount; index += 1) projected[index] -= dot * basis[index];
    }
    return projected;
  };

  /*
   * 讲师级可辨识：γ_j − γ_k 可估 ⟺ 两列之差与零空间正交。
   * 该关系可传递（d_jk + d_kl = d_jl），所以等价类就是最小可比单元（可比簇）：
   * 一个「考生没人评过」的孤立讲师只会让他自己不可判定，不再拖垮整个分量。
   */
  const comparability = new DisjointSet();
  for (let left = 0; left < judgerIds.length; left += 1) {
    comparability.find(`j:${judgerIds[left]}`);
    for (let right = left + 1; right < judgerIds.length; right += 1) {
      const difference = new Float64Array(parameterCount);
      for (let index = 0; index < parameterCount; index += 1) {
        difference[index] = judgerVectors[left][index] - judgerVectors[right][index];
      }
      if (isEstimable(difference)) {
        comparability.union(`j:${judgerIds[left]}`, `j:${judgerIds[right]}`);
      }
    }
  }
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < judgerIds.length; index += 1) {
    const root = comparability.find(`j:${judgerIds[index]}`);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(index);
    else buckets.set(root, [index]);
  }

  /* 簇内居中：δ_j = γ_j − Σ_{k∈簇} (n_k/N_簇)·γ_k（n 加权 ⇒ Σ_{k∈簇} n_k·δ_k = 0） */
  const clusters: ComparableCluster[] = [];
  const isolatedJudgerIds: number[] = [];
  for (const positions of buckets.values()) {
    if (positions.length < 2) {
      isolatedJudgerIds.push(...positions.map((position) => judgerIds[position]));
      continue;
    }
    const total = positions.reduce(
      (sum, position) => sum + (observationCounts.get(judgerIds[position]) ?? 0),
      0,
    );
    const contrasts = new Map<number, Float64Array>();
    const biases = new Map<number, number>();
    for (const position of positions) {
      const contrast = Float64Array.from(judgerVectors[position]);
      for (const other of positions) {
        const weight = (observationCounts.get(judgerIds[other]) ?? 0) / total;
        for (let index = 0; index < parameterCount; index += 1) {
          contrast[index] -= weight * judgerVectors[other][index];
        }
      }
      const projected = projectOut(contrast);
      let value = 0;
      for (let index = 0; index < parameterCount; index += 1) {
        value += projected[index] * coefficients[index];
      }
      contrasts.set(judgerIds[position], projected);
      biases.set(judgerIds[position], value);
    }
    clusters.push({
      judgerIds: positions.map((position) => judgerIds[position]),
      observationCount: total,
      contrasts,
      biases,
    });
  }

  return {
    fullyComparable: clusters.length === 1 && isolatedJudgerIds.length === 0,
    rank,
    observationCount: observations.length,
    residualSumOfSquares,
    candidateEffects,
    problemEffects,
    judgerEffects,
    clusters,
    isolatedJudgerIds,
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
    clusterCount: 0,
    comparableJudgerCount: 0,
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

  /* 可比簇：大的簇排前面（页面按簇分组展示，簇间不可比） */
  const comparableClusters = components
    .flatMap((component) => component.clusters)
    .sort(
      (left, right) =>
        right.judgerIds.length - left.judgerIds.length ||
        (left.judgerIds[0] ?? 0) - (right.judgerIds[0] ?? 0),
    );
  const clusterIndexByJudger = new Map<number, number>();
  comparableClusters.forEach((cluster, index) => {
    for (const judgerId of cluster.judgerIds) clusterIndexByJudger.set(judgerId, index);
  });
  const isolatedJudgerIds = components.flatMap((component) => component.isolatedJudgerIds);
  const judgerIds = [
    ...comparableClusters.flatMap((cluster) => cluster.judgerIds),
    ...isolatedJudgerIds,
  ];

  /* 标准误：s_j = σ̂·sqrt(c_jᵀ(XᵀX)⁻¹c_j)，一次分解、每名讲师一次回代 */
  const standardErrors = new Map<number, number | null>();
  const rawBiases = new Map<number, number>();
  for (const component of components) {
    for (const cluster of component.clusters) {
      for (const [judgerId, contrast] of cluster.contrasts) {
        rawBiases.set(judgerId, cluster.biases.get(judgerId) ?? 0);
        if (residualSd === null) {
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
  }

  /*
   * 讲师间异质性 τ² 在**全部可比讲师**上合并估计（各簇内部已各自居中，
   * 量纲一致；簇内往往只有 2~3 名讲师，逐簇估 τ² 的矩估计噪声过大）。
   */
  const betweenJudgerVariance = estimateBetweenJudgerVariance(
    judgerIds.map((judgerId) => rawBiases.get(judgerId) ?? 0),
    judgerIds.map((judgerId) => standardErrors.get(judgerId) ?? null),
  );

  const observationCounts = new Map<number, number>();
  const candidateCounts = new Map<number, Map<number, number>>();
  const ratioSums = new Map<number, number>();
  const maxPointsSums = new Map<number, number>();
  for (const observation of prepared) {
    observationCounts.set(
      observation.judgerId,
      (observationCounts.get(observation.judgerId) ?? 0) + 1,
    );
    ratioSums.set(
      observation.judgerId,
      (ratioSums.get(observation.judgerId) ?? 0) + observation.ratio,
    );
    maxPointsSums.set(
      observation.judgerId,
      (maxPointsSums.get(observation.judgerId) ?? 0) + observation.maxPoints,
    );
    const candidates = candidateCounts.get(observation.judgerId) ?? new Map<number, number>();
    candidates.set(observation.userFlowId, (candidates.get(observation.userFlowId) ?? 0) + 1);
    candidateCounts.set(observation.judgerId, candidates);
  }

  const judgerEstimates: JudgerEstimate[] = judgerIds.map((judgerId) => {
    /* 「可辨识」= 该讲师落在某个可比簇里（≥2 名两两可比的讲师）；孤立的讲师不牵连别人。
       残差尺度缺失只影响统计推断（标准误 / 判定），不影响点估计：规范 §8 要求此时
       仍如实输出 δ_j，只是不做校正。 */
    const clusterIndex = clusterIndexByJudger.get(judgerId) ?? -1;
    const identifiable = clusterIndex >= 0;
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
      maxPointsSum: maxPointsSums.get(judgerId) ?? 0,
      rawMeanRatio:
        (ratioSums.get(judgerId) ?? 0) / Math.max(observationCounts.get(judgerId) ?? 0, 1),
      adjustedMeanRatio: 0,
      rawBias,
      bias: credibility === 0 ? 0 : credibility * rawBias,
      standardError,
      credibility,
      identifiable,
      clusterIndex,
      verdict: verdictOf(rawBias, standardError, identifiable),
    };
  });

  /* 展示顺序：可判定的在前，按可比簇分组（簇内偏松→偏严），不可判定的排最后 */
  judgerEstimates.sort(
    (left, right) =>
      Number(right.identifiable) - Number(left.identifiable) ||
      left.clusterIndex - right.clusterIndex ||
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
    identifiable: judgerEstimates.length > 0 && judgerEstimates.every((estimate) => estimate.identifiable),
    componentCount: components.length,
    identifiableComponentCount: components.filter((component) => component.fullyComparable).length,
    clusterCount: comparableClusters.length,
    comparableJudgerCount: comparableClusters.reduce(
      (total, cluster) => total + cluster.judgerIds.length,
      0,
    ),
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

  /* 第二遍：λ=1、m=1、保持整体总分时的校正后平均得分率（供哑铃图） */
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
 * 统一偏移 O = λ·Σ_j (m_j·bias(j)·M_j) / Σ_j M_j，M_j 为该讲师观测的题目满分之和。
 *
 * **按题目满分加权**（不是按观测条数）：原始分数是 y = M·r，所以只有按 M 加权才能让
 * Σ M_i·(r′_i − r_i) = 0 —— 即校正只重新分配**正式原始总分**，不抬高或压低整届总分。
 * 按条数加权只保证「得分率之和」不变，各题满分不同时总分照样会漂（实测可差出 20+ 分）。
 * 截断与整数舍入仍会留下 ≤ 半分的逐条误差，界面显示实际偏差。
 */
export function cohortOffset(fit: GradingModelFit, options: FairnessAdjustmentOptions): number {
  const lambda = clampLambda(options.lambda);
  if (lambda <= 0 || options.preserveTotal === false) return 0;
  let weighted = 0;
  let totalMaxPoints = 0;
  for (const estimate of fit.judgers) {
    weighted +=
      estimate.maxPointsSum * judgerManualWeight(options, estimate.judgerId) * estimate.bias;
    totalMaxPoints += estimate.maxPointsSum;
  }
  if (!(totalMaxPoints > 0)) return 0;
  return (lambda * weighted) / totalMaxPoints;
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
